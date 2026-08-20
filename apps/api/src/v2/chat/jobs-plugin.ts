import type {
  V2ChatMaintenanceJob,
} from "@living-network/domain/v2";
import type {
  V2IsoDateTime,
  V2JobDetailDto,
  V2JobListDto,
  V2JobPayloadSummaryDto,
  V2JobQuery,
  V2MaintenanceJobStatus,
  V2MaintenanceJobType,
  V2RetryJobResponse,
} from "@living-network/contracts/v2";
import type { V2SqliteChatMaintenanceJobRepository } from "@living-network/database/v2";
import type { FastifyPluginAsync, FastifyReply } from "fastify";

export interface V2JobsPluginDependencies {
  readonly maintenanceJobRepository: V2SqliteChatMaintenanceJobRepository;
  readonly now?: () => Date;
}

const iso = (value: string): V2IsoDateTime => value as V2IsoDateTime;

const JOB_TYPES: readonly V2MaintenanceJobType[] = [
  "memory_extract",
  "conversation_summary",
  "memory_consolidate",
  "story_analyze",
  "memory_engine_consume",
];

const JOB_STATUSES: readonly V2MaintenanceJobStatus[] = [
  "pending",
  "claimed",
  "running",
  "completed",
  "failed",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Extract only non-sensitive fields from a job payload for display. */
function payloadSummary(payload: unknown): V2JobPayloadSummaryDto {
  if (!isRecord(payload)) return {};
  const summary: { conversationId?: string; characterId?: string; sourceMessageCount?: number } = {};
  if (typeof payload.conversationId === "string" && payload.conversationId.length > 0) {
    summary.conversationId = payload.conversationId;
  }
  if (typeof payload.characterId === "string" && payload.characterId.length > 0) {
    summary.characterId = payload.characterId;
  }
  if (Array.isArray(payload.sourceMessageIds)) {
    summary.sourceMessageCount = payload.sourceMessageIds.length;
  }
  return summary;
}

function toSummary(job: V2ChatMaintenanceJob) {
  return {
    jobId: job.jobId,
    jobType: job.jobType,
    status: job.status,
    createdAt: iso(job.createdAt ?? ""),
    updatedAt: iso(job.updatedAt ?? ""),
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    ...(job.lastError === undefined ? {} : { lastError: job.lastError }),
  };
}

function toDetail(job: V2ChatMaintenanceJob): V2JobDetailDto {
  return {
    ...toSummary(job),
    ...(job.lastStartedAt === undefined ? {} : { startedAt: iso(job.lastStartedAt) }),
    payloadSummary: payloadSummary(job.payload),
  };
}

function decodeCursor(value: string): { readonly createdAt: string; readonly jobId: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new TypeError("Invalid job cursor");
  }
  if (!isRecord(parsed) || typeof parsed.createdAt !== "string" || typeof parsed.jobId !== "string") {
    throw new TypeError("Invalid job cursor");
  }
  return { createdAt: parsed.createdAt, jobId: parsed.jobId };
}

function encodeCursor(cursor: { readonly createdAt: string; readonly jobId: string }): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function parseJobQuery(query: Record<string, unknown>): V2JobQuery {
  const result: { status?: V2MaintenanceJobStatus; type?: V2MaintenanceJobType; limit?: number; cursor?: string } = {};
  const rawStatus = query.status;
  if (typeof rawStatus === "string" && rawStatus.length > 0) {
    if (!JOB_STATUSES.includes(rawStatus as V2MaintenanceJobStatus)) {
      throw new TypeError("status is invalid");
    }
    result.status = rawStatus as V2MaintenanceJobStatus;
  }
  const rawType = query.type;
  if (typeof rawType === "string" && rawType.length > 0) {
    if (!JOB_TYPES.includes(rawType as V2MaintenanceJobType)) {
      throw new TypeError("type is invalid");
    }
    result.type = rawType as V2MaintenanceJobType;
  }
  if (query.limit !== undefined) {
    const limit = Number(query.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new TypeError("limit must be between 1 and 100");
    }
    result.limit = limit;
  }
  if (query.cursor !== undefined) {
    if (typeof query.cursor !== "string") throw new TypeError("cursor must be a string");
    result.cursor = query.cursor;
  }
  return result;
}

export function createV2JobsPlugin(dependencies: V2JobsPluginDependencies): FastifyPluginAsync {
  const now = dependencies.now ?? (() => new Date());
  return async (app) => {
    app.get("/", async (request): Promise<V2JobListDto> => {
      const query = parseJobQuery(request.query as Record<string, unknown>);
      const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
      const result = dependencies.maintenanceJobRepository.listJobs({
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.type === undefined ? {} : { type: query.type }),
        limit: query.limit ?? 50,
        ...(cursor === undefined ? {} : { cursor }),
      });
      return {
        items: result.items.map(toSummary),
        ...(result.nextCursor === undefined ? {} : { nextCursor: encodeCursor(result.nextCursor) }),
      };
    });

    app.get("/:jobId", async (request, reply): Promise<V2JobDetailDto | ReturnType<FastifyReply["send"]>> => {
      const jobId = (request.params as { jobId?: unknown }).jobId;
      if (typeof jobId !== "string" || jobId.length === 0) {
        return reply.code(422).send({ error: { code: "VALIDATION_FAILED", message: "jobId must be a non-empty string" } });
      }
      const job = await dependencies.maintenanceJobRepository.get(jobId);
      if (job === undefined) {
        return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Job not found" } });
      }
      return toDetail(job);
    });

    app.post("/:jobId/retry", async (request, reply): Promise<V2RetryJobResponse | ReturnType<FastifyReply["send"]>> => {
      const jobId = (request.params as { jobId?: unknown }).jobId;
      if (typeof jobId !== "string" || jobId.length === 0) {
        return reply.code(422).send({ error: { code: "VALIDATION_FAILED", message: "jobId must be a non-empty string" } });
      }
      // Re-read the job so a double-click cannot requeue an already-requeued job.
      const current = await dependencies.maintenanceJobRepository.get(jobId);
      if (current === undefined) {
        return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Job not found" } });
      }
      if (current.status !== "failed") {
        return reply.code(409).send({ error: { code: "CONFLICT", message: "Only failed jobs can be retried" } });
      }
      const retried = dependencies.maintenanceJobRepository.retryFailed({ jobId, now: now().toISOString() });
      if (retried === undefined) {
        return reply.code(409).send({ error: { code: "CONFLICT", message: "Job could not be retried" } });
      }
      return { jobId: retried.jobId, status: retried.status };
    });
  };
}
