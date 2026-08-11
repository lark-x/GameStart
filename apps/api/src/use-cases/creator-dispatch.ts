import {
  canConsumeProactiveMessages,
  createScheduledOccurrence,
  ScheduledOccurrenceStatus,
  type ConversationAggregate,
} from "@living-network/domain";
import type { HandlerContext, ApiStore } from "../context.ts";
import { ApiError } from "../helpers.ts";
import { toWorldEventDefinitionDto, toScheduledOccurrenceDto } from "../mappers.ts";
import { parseDispatchAction } from "../parsers.ts";
import {
  previewCreatorEventDispatch,
  scanCreatorEventCandidates,
} from "../creator-events.ts";
import type {
  CreatorEventCandidateDto,
  EventDispatchBatchDto,
  EventDispatchBatchItemDto,
  EventDispatchBatchStatus,
  EventDispatchItemStatus,
  EventDispatchSelectionDto,
  CreateEventDispatchBatchRequest,
} from "@living-network/contracts";
import type { ExecutionDispatchRequest } from "@living-network/database";

// --- Store types ---

type CreatorScanStore = ApiStore & {
  worldEventDefinitions: NonNullable<ApiStore["worldEventDefinitions"]>;
  scheduledOccurrences: NonNullable<ApiStore["scheduledOccurrences"]>;
  eventExecutions: NonNullable<ApiStore["eventExecutions"]>;
};

type CreatorDispatchStore = CreatorScanStore & {
  dispatchRequests: NonNullable<ApiStore["dispatchRequests"]>;
  transaction<T>(operation: (store: CreatorDispatchStore) => Promise<T>): Promise<T>;
};

interface CreatorDispatchPayload extends Record<string, unknown> {
  occurrenceId: string;
  execution: { ruleVersion: string; inputSnapshot: Record<string, unknown> };
  previousAttempt: number;
}

// --- Internal helpers ---

function requireCreatorScanStore(store: ApiStore): CreatorScanStore {
  if (!store.worldEventDefinitions || !store.scheduledOccurrences || !store.eventExecutions) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Creator event repositories are not configured");
  }
  return store as CreatorScanStore;
}

function creatorBatchId(idempotencyKey: string): string {
  return `creator-batch:${encodeURIComponent(idempotencyKey)}`;
}

function creatorDispatchId(batchId: string, candidateId: string): string {
  return `creator-dispatch:${encodeURIComponent(batchId)}:${encodeURIComponent(candidateId)}`;
}

async function enrichCreatorCandidateRisks(
  _ctx: HandlerContext,
  candidates: readonly CreatorEventCandidateDto[],
  store: ApiStore,
): Promise<CreatorEventCandidateDto[]> {
  const conversationCache = new Map<string, Promise<readonly ConversationAggregate[]>>();
  const imageRisk = async (): Promise<string | undefined> => {
    const settings = await store.comfyUiSettings?.get();
    const version = settings?.defaultWorkflowVersion;
    if (!version) return "未配置默认图片工作流";
    const templates = await store.imageWorkflowTemplates?.list();
    if (!templates?.some((t) => t.version === version)) return "默认图片工作流版本不存在";
    return undefined;
  };
  const resolvedImageRisk = candidates.some((c) => c.definition.outputs.generateImage) ? await imageRisk() : undefined;

  return Promise.all(candidates.map(async (candidate) => {
    const risks = candidate.risks.filter((r) => r !== "需要已配置的图片工作流");
    if (candidate.definition.outputs.sendMessage && candidate.recipientCharacterIds.length > 0) {
      if (!store.conversations) {
        risks.push("会话仓储不可用");
      } else {
        for (const recipientId of candidate.recipientCharacterIds) {
          let pending = conversationCache.get(recipientId);
          if (!pending) { pending = store.conversations.listByCharacter(recipientId); conversationCache.set(recipientId, pending); }
          const conversations = await pending;
          const hasActive = conversations.some((conv) => {
            if (conv.conversation.storyWorldId !== candidate.worldId) return false;
            const activeIds = new Set(conv.members.filter((m) => m.leftAt === undefined).map((m) => m.characterId));
            return activeIds.has(recipientId) && candidate.targetCharacterIds.some((aid) => activeIds.has(aid));
          });
          if (!hasActive) risks.push(`接收者 ${recipientId} 没有可用会话`);
        }
      }
      if (store.proactiveMessageBudgets) {
        await Promise.all(candidate.targetCharacterIds.map(async (actorId) => {
          const budget = await store.proactiveMessageBudgets!.getActive(candidate.worldId, actorId, candidate.scheduledFor);
          if (budget && !canConsumeProactiveMessages(budget, 1)) risks.push(`角色 ${actorId} 主动消息预算不足`);
        }));
      }
    }
    if (candidate.definition.outputs.generateImage && resolvedImageRisk !== undefined) risks.push(resolvedImageRisk);
    return { ...candidate, risks: [...new Set(risks)] };
  }));
}

function requireCreatorDispatchStore(ctx: HandlerContext): CreatorDispatchStore {
  const store = ctx.store as ApiStore & { transaction?: CreatorDispatchStore["transaction"] };
  if (!ctx.creatorDispatchEnabled || !store.dispatchRequests || typeof store.transaction !== "function") {
    throw new ApiError(503, "SERVICE_UNAVAILABLE", "Creator dispatch requires PostgreSQL, Redis, and Worker");
  }
  requireCreatorScanStore(store);
  return store as CreatorDispatchStore;
}

async function creatorWorkerStatus(ctx: HandlerContext): Promise<string> {
  const heartbeat = await ctx.store.dispatchRequests?.getHeartbeat("living-network-worker");
  if (!heartbeat) return "NOT_STARTED";
  if (heartbeat.status === "STOPPED") return "STOPPED";
  if (ctx.creatorClock().getTime() - Date.parse(heartbeat.heartbeatAt) > 60_000) return "STALE";
  return "RUNNING";
}

function creatorDispatchAvailable(store: ApiStore, enabled: boolean): boolean {
  const s = store as ApiStore & { transaction?: unknown };
  return enabled && s.dispatchRequests !== undefined && typeof s.transaction === "function";
}

async function aggregateCreatorDispatchBatch(
  _ctx: HandlerContext,
  store: CreatorScanStore & { dispatchRequests: NonNullable<ApiStore["dispatchRequests"]> },
  batchId: string,
): Promise<EventDispatchBatchDto> {
  const requests = await store.dispatchRequests.listByBatch(batchId);
  if (requests.length === 0) throw new ApiError(404, "NOT_FOUND", "Creator dispatch batch not found");
  const items: EventDispatchBatchItemDto[] = [];
  for (const req of requests) {
    const payload = req.payload as Partial<CreatorDispatchPayload>;
    const previousAttempt = typeof payload.previousAttempt === "number" ? payload.previousAttempt : 0;
    const [occurrence, latest] = await Promise.all([
      store.scheduledOccurrences.getById(req.occurrenceId),
      store.eventExecutions.getLatestByOccurrence(req.occurrenceId),
    ]);
    const freshExecution = latest !== undefined && latest.attempt > previousAttempt ? latest : undefined;
    let status: EventDispatchItemStatus = req.status === "PENDING" ? "PENDING_DISPATCH" : "DISPATCHED";
    if (freshExecution?.status === "RUNNING") status = "RUNNING";
    if (freshExecution?.status === "COMPLETED") status = "COMPLETED";
    if (freshExecution?.status === "FAILED") status = "FAILED";
    if (freshExecution?.status === "CANCELLED") status = "CANCELLED";
    if (!freshExecution && occurrence?.status === "CANCELLED") status = "CANCELLED";
    items.push({
      id: req.id, candidateId: req.candidateId, action: parseDispatchAction(req.action), status,
      occurrenceId: req.occurrenceId,
      ...(freshExecution === undefined ? {} : { executionId: freshExecution.id }),
      ...(freshExecution?.outputSnapshot === undefined ? {} : { outputSnapshot: { ...freshExecution.outputSnapshot } }),
      ...(freshExecution?.failureReason === undefined ? {} : { failureReason: freshExecution.failureReason }),
      ...(freshExecution === undefined && req.lastError !== undefined ? { failureReason: req.lastError } : {}),
    });
  }
  const statuses = items.map((i) => i.status);
  let batchStatus: EventDispatchBatchStatus;
  if (statuses.includes("FAILED")) batchStatus = "FAILED";
  else if (statuses.includes("RUNNING")) batchStatus = "RUNNING";
  else if (statuses.includes("PENDING_DISPATCH")) batchStatus = "PENDING_DISPATCH";
  else if (statuses.includes("DISPATCHED")) batchStatus = "DISPATCHED";
  else if (statuses.every((i) => i === "COMPLETED")) batchStatus = "COMPLETED";
  else batchStatus = "CANCELLED";
  return {
    id: batchId, worldId: requests[0]!.storyWorldId, status: batchStatus,
    idempotencyKey: decodeURIComponent(batchId.slice("creator-batch:".length)),
    items, createdAt: requests.map((r) => r.requestedAt).sort()[0]!,
    updatedAt: requests.map((r) => r.enqueuedAt ?? r.requestedAt).sort().at(-1)!,
  };
}

// --- Public use-case functions ---

export async function scanCreatorCandidates(
  ctx: HandlerContext,
  worldId: string,
  horizonDays = 7,
  repositories: ApiStore = ctx.store,
  clock = ctx.creatorClock(),
): Promise<CreatorEventCandidateDto[]> {
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 31) {
    throw new ApiError(400, "BAD_REQUEST", "horizonDays must be an integer from 1 to 31");
  }
  const store = requireCreatorScanStore(repositories);
  const world = await store.storyWorlds.getById(worldId);
  if (!world) throw new ApiError(404, "NOT_FOUND", "Story world not found");
  const now = clock.toISOString();
  const horizonEnd = new Date(clock.getTime() + horizonDays * 86_400_000).toISOString();
  const [definitions, occurrences] = await Promise.all([
    store.worldEventDefinitions.listByStoryWorld(worldId),
    store.scheduledOccurrences.listForCreatorScan(worldId, horizonEnd, 2_000),
  ]);
  const executions = (await Promise.all(occurrences.map((o) => store.eventExecutions.getLatestByOccurrence(o.id)))).filter((e) => e !== undefined);
  const candidates = scanCreatorEventCandidates({
    worldId, worldTimezone: world.timezone,
    definitions: definitions.map(toWorldEventDefinitionDto),
    occurrences: occurrences.map(toScheduledOccurrenceDto),
    executions: executions.map((e) => ({ ...e, targetCharacterIds: [...e.targetCharacterIds], inputSnapshot: { ...e.inputSnapshot }, ...(e.outputSnapshot === undefined ? {} : { outputSnapshot: { ...e.outputSnapshot } }) })),
    now, horizonDays,
  });
  const result: CreatorEventCandidateDto[] = [];
  for (const candidate of candidates) {
    if (candidate.projected && candidate.occurrence && await store.scheduledOccurrences.getByOccurrenceKey(worldId, candidate.occurrence.occurrenceKey)) continue;
    result.push(candidate);
  }
  return enrichCreatorCandidateRisks(ctx, result, repositories);
}

export async function listCreatorEventCandidates(ctx: HandlerContext, worldId: string, horizonDays = 7) {
  const [candidates, workerStatus] = await Promise.all([
    scanCreatorCandidates(ctx, worldId, horizonDays),
    creatorWorkerStatus(ctx),
  ]);
  return { candidates, dispatchAvailable: creatorDispatchAvailable(ctx.store, ctx.creatorDispatchEnabled), workerStatus };
}

export async function previewDispatch(ctx: HandlerContext, worldId: string, selections: EventDispatchSelectionDto[]) {
  const candidates = await scanCreatorCandidates(ctx, worldId);
  return previewCreatorEventDispatch({ worldId, candidates, selections });
}

export async function createCreatorEventDispatch(ctx: HandlerContext, worldId: string, input: CreateEventDispatchBatchRequest) {
  const store = requireCreatorDispatchStore(ctx);
  const batchId = creatorBatchId(input.idempotencyKey);
  const now = ctx.creatorClock();
  try {
    return await store.transaction(async (tx) => {
      const existing = await tx.dispatchRequests.listByBatch(batchId);
      if (existing.length > 0) {
        const storedSel = new Set(existing.map((r) => `${r.candidateId}\u0000${r.action}`));
        const reqSel = new Set(input.selections.map((s) => `${s.candidateId}\u0000${s.action}`));
        if (storedSel.size !== reqSel.size || [...storedSel].some((s) => !reqSel.has(s))) {
          throw new ApiError(409, "CONFLICT", "Dispatch idempotency key was already used with different selections");
        }
        return aggregateCreatorDispatchBatch(ctx, tx, batchId);
      }
      const candidates = await scanCreatorCandidates(ctx, worldId, 7, tx, now);
      const preview = previewCreatorEventDispatch({ worldId, candidates, selections: input.selections });
      if (!preview.canDispatch) throw new ApiError(409, "CONFLICT", "One or more creator event candidates changed before dispatch");
      const candidateById = new Map(candidates.map((c) => [c.id, c]));
      for (const selection of input.selections) {
        const candidate = candidateById.get(selection.candidateId)!;
        const definition = await tx.worldEventDefinitions.getById(candidate.definition.id);
        if (!definition) throw new ApiError(409, "CONFLICT", "Event definition changed before dispatch");
        let occurrence;
        if (selection.action === "RUN_TRIAL") {
          const occId = `creator-trial:${encodeURIComponent(batchId)}:${encodeURIComponent(candidate.id)}`;
          const stored = await tx.scheduledOccurrences.save(createScheduledOccurrence({ id: occId, definition, scheduledFor: now.toISOString(), occurrenceKey: occId, status: ScheduledOccurrenceStatus.PENDING, createdAt: now.toISOString() }));
          occurrence = stored.occurrence;
        } else if (candidate.projected && candidate.occurrence) {
          const stored = await tx.scheduledOccurrences.save(createScheduledOccurrence({ id: candidate.occurrence.id, definition, scheduledFor: candidate.occurrence.scheduledFor, occurrenceKey: candidate.occurrence.occurrenceKey, status: ScheduledOccurrenceStatus.PENDING, createdAt: now.toISOString() }));
          occurrence = stored.occurrence;
        } else {
          const occId = candidate.occurrence?.id;
          if (occId === undefined) throw new ApiError(409, "CONFLICT", "Occurrence changed before dispatch");
          const storedOcc = await tx.scheduledOccurrences.getById(occId);
          if (!storedOcc) throw new ApiError(409, "CONFLICT", "Occurrence changed before dispatch");
          occurrence = storedOcc;
        }
        const latest = await tx.eventExecutions.getLatestByOccurrence(occurrence.id);
        const dispatchId = creatorDispatchId(batchId, candidate.id);
        const payload: CreatorDispatchPayload = { occurrenceId: occurrence.id, execution: { ruleVersion: "creator-dispatch-v1", inputSnapshot: { batchId, candidateId: candidate.id, action: selection.action } }, previousAttempt: latest?.attempt ?? 0 };
        const req: ExecutionDispatchRequest<CreatorDispatchPayload> = {
          id: dispatchId, batchId, candidateId: candidate.id, action: selection.action,
          idempotencyKey: `${batchId}:${candidate.id}:${selection.action}`,
          storyWorldId: worldId, occurrenceId: occurrence.id, payload, status: "PENDING", attempts: 0, requestedAt: now.toISOString(),
        };
        await tx.dispatchRequests.save(req);
      }
      return aggregateCreatorDispatchBatch(ctx, tx, batchId);
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.message.includes("idempotency")) throw new ApiError(409, "CONFLICT", error.message);
    throw error;
  }
}

export async function getCreatorEventDispatchBatch(ctx: HandlerContext, batchId: string) {
  const store = requireCreatorDispatchStore(ctx);
  return aggregateCreatorDispatchBatch(ctx, store, batchId);
}
