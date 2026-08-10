import type {
  ChatProvider,
} from "../../../packages/ai/src/index.ts";
import { SecretCipher } from "../../../packages/ai/src/index.ts";
import {
  createInMemoryRepositories,
  type InMemoryRepositorySeed,
} from "../../../packages/database/src/index.ts";
import { InMemoryInteractionLogRepository } from "../../../packages/database/src/interaction-log.ts";
import { InteractionLogging } from "./interaction-logging.ts";
import type { ConversationOrchestratorOptions, ConversationReply } from "./conversation-orchestrator.ts";
import type { InteractionLogRepository } from "../../../packages/database/src/interaction-log.ts";
import { ApiMediaStore } from "./media-store.ts";
import type { HandlerContext, ApiStore } from "./context.ts";
import { createImageWorkflowTemplate, assertImageWorkflowTemplateBindings } from "../../../packages/domain/src/index.ts";
import { ApiError, jsonResponse, errorResponse, withHeaders } from "./helpers.ts";
import { handleWorldContent } from "./routes/world-content.ts";
import { handleVisualAssets } from "./routes/visual-assets.ts";
import { handleSettings } from "./routes/settings.ts";
import { handleConversations } from "./routes/conversations.ts";
import { handleMoments } from "./routes/moments.ts";
import { handleCreatorDispatch } from "./routes/creator-dispatch.ts";
import { handleMedia } from "./routes/media.ts";

export type { ApiStore } from "./context.ts";
export { ApiError } from "./helpers.ts";
export type { ApiErrorCode } from "./helpers.ts";

export type ApiSeed = InMemoryRepositorySeed;

export interface SendMessageWithAutoReplyResult {
  readonly message: import("../../../packages/contracts/src/index.ts").MessageDto;
  readonly inserted: boolean;
  readonly autoReply: import("./auto-reply.ts").AutomaticReplyState;
}

export type CreatorWorkerStatus = "NOT_STARTED" | "STOPPED" | "STALE" | "RUNNING";

export interface CreatorEventCandidatesResponse {
  candidates: readonly import("../../../packages/contracts/src/index.ts").CreatorEventCandidateDto[];
  dispatchAvailable: boolean;
  workerStatus: CreatorWorkerStatus;
}

export function createApiStore(seed: ApiSeed = {}): ApiStore {
  return createInMemoryRepositories(seed);
}

function routeRequest(ctx: HandlerContext, method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<Response> {
  const correlationId = extraHeaders?.["x-correlation-id"] ?? crypto.randomUUID();
  const url = new URL(`http://localhost${path}`);
  const h = new Headers({ "x-correlation-id": correlationId });
  if (extraHeaders) { for (const [k, v] of Object.entries(extraHeaders)) { if (k !== "x-correlation-id" && v) h.set(k, v); } }
  if (body !== undefined) h.set("content-type", "application/json");
  const req = new Request(url, { method, headers: h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const handlers = [handleCreatorDispatch, handleWorldContent, handleVisualAssets, handleConversations, handleMoments, handleMedia, handleSettings];
  return (async () => {
    for (const handler of handlers) {
      const result = await handler(ctx, req, url, correlationId);
      if (result !== undefined) return result;
    }
    throw new ApiError(404, "NOT_FOUND", "Route not found");
  })();
}

async function routeJson<T>(ctx: HandlerContext, method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  const resp = await routeRequest(ctx, method, path, body, headers);
  const json = await resp.json() as { data?: T; error?: { code: string; message: string } };
  if (resp.status >= 400) throw new ApiError(resp.status as number, (json.error?.code ?? "BAD_REQUEST") as import("./helpers.ts").ApiErrorCode, json.error?.message ?? "Error");
  return json.data as T;
}

export class ApiApplication {
  public readonly store: ApiStore;
  public readonly provider: ChatProvider | undefined;
  private readonly ctx: HandlerContext;

  public constructor(
    store: ApiStore,
    provider?: ChatProvider,
    conversationOptions: ConversationOrchestratorOptions = {},
    securityOptions: { requireTrustedActor?: boolean } = {},
    operationalOptions: {
      readiness?: () => Promise<void>;
      secretCipher?: SecretCipher;
      creatorDispatchEnabled?: boolean;
      creatorClock?: () => Date;
      interactionLogs?: InteractionLogRepository;
      interactionLogging?: InteractionLogging;
      loggingCleanupEnabled?: boolean;
      loggingCleanupIntervalMs?: number;
      mediaRoot?: string;
    } = {},
  ) {
    this.store = store;
    this.provider = provider;
    const sharedInteractionLogs = operationalOptions.interactionLogs ?? new InMemoryInteractionLogRepository();
    this.ctx = {
      store, provider, conversationOptions,
      requireTrustedActor: securityOptions.requireTrustedActor ?? false,
      readiness: operationalOptions.readiness,
      secretCipher: operationalOptions.secretCipher,
      creatorDispatchEnabled: operationalOptions.creatorDispatchEnabled ?? false,
      creatorClock: operationalOptions.creatorClock ?? (() => new Date()),
      interactionLogs: sharedInteractionLogs,
      logging: operationalOptions.interactionLogging ?? new InteractionLogging({
        repository: sharedInteractionLogs,
        ...(operationalOptions.loggingCleanupEnabled === undefined ? {} : { cleanupEnabled: operationalOptions.loggingCleanupEnabled }),
        ...(operationalOptions.loggingCleanupIntervalMs === undefined ? {} : { cleanupIntervalMs: operationalOptions.loggingCleanupIntervalMs }),
      }),
      replyFlights: new Map<string, Promise<ConversationReply>>(),
      media: new ApiMediaStore(operationalOptions.mediaRoot ?? "./data/media"),
    };
  }

  public stop(): void { this.ctx.logging.stop(); }

  public recordHttpCompletion(input: { method: string; pathname: string; status: number; durationMs: number; requestId?: string; correlationId: string }): void {
    if (input.pathname === "/health" || input.pathname === "/ready" || input.pathname.startsWith("/v1/interaction-logs")) return;
    void this.ctx.logging.append({ level: input.status >= 400 ? "ERROR" : "INFO", source: "API", category: "HTTP", action: `${input.method} ${input.pathname}`, outcome: input.status >= 400 ? "FAILURE" : "SUCCESS", durationMs: input.durationMs, correlationId: input.correlationId, ...(input.requestId === undefined ? {} : { requestId: input.requestId }), details: { method: input.method, pathname: input.pathname, status: input.status }, id: "", createdAt: new Date().toISOString() }).catch(() => undefined);
  }

  public async handle(request: Request): Promise<Response> {
    const requestId = request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
    const supplied = request.headers.get("x-correlation-id")?.trim();
    const correlationId = supplied && supplied.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(supplied) ? supplied : crypto.randomUUID();
    const headers = { "x-request-id": requestId, "x-correlation-id": correlationId };
    const requestHeaders = new Headers(request.headers);
    for (const [key, value] of Object.entries(headers)) requestHeaders.set(key, value);
    const response = await this.handleInternal(new Request(request, { headers: requestHeaders }));
    return withHeaders(response, headers);
  }

  private async handleInternal(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const correlationId = (() => { const v = request.headers.get("x-correlation-id")?.trim(); return v && v.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(v) ? v : crypto.randomUUID(); })();
      if (request.method === "GET" && url.pathname === "/health") return jsonResponse({ status: "ok" });
      if (request.method === "GET" && url.pathname === "/ready") {
        try { await this.ctx.readiness?.(); } catch { throw new ApiError(503, "SERVICE_UNAVAILABLE", "Service is not ready"); }
        return jsonResponse({ status: "ready" });
      }
      const handlers = [handleCreatorDispatch, handleWorldContent, handleVisualAssets, handleConversations, handleMoments, handleMedia, handleSettings];
      for (const handler of handlers) {
        const result = await handler(this.ctx, request, url, correlationId);
        if (result !== undefined) return result;
      }
      const knownPath = url.pathname === "/health" || url.pathname === "/v1/worlds" || url.pathname === "/v1/world-lore" || url.pathname === "/v1/characters" || url.pathname === "/v1/relationships" || url.pathname === "/v1/comfyui/workflows" || url.pathname === "/v1/image-assets" || url.pathname === "/v1/sticker-packs" || url.pathname === "/v1/moments" || url.pathname === "/v1/conversations" || url.pathname === "/v1/appearance-settings" || url.pathname === "/v1/llm-provider-profiles" || url.pathname === "/v1/comfyui/settings" || url.pathname === "/v1/actor-sessions/switch";
      if (knownPath) throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
      throw new ApiError(404, "NOT_FOUND", "Route not found");
    } catch (error) { return errorResponse(error); }
  }

  // --- Delegate methods for backward compatibility with tests ---

  public async listConversations(characterId: string) {
    return routeJson(this.ctx, "GET", `/v1/conversations?characterId=${encodeURIComponent(characterId)}`);
  }

  public async createConversation(input: unknown) {
    return routeJson(this.ctx, "POST", "/v1/conversations", input);
  }

  public async sendMessage(conversationId: string, authorCharacterId: string | undefined, input: unknown, trace?: { correlationId?: string; requestId?: string }) {
    const body = typeof input === "object" && input !== null
      ? { ...(input as Record<string, unknown>), ...(authorCharacterId !== undefined ? { authorCharacterId } : {}) }
      : input;
    const headers: Record<string, string> = {};
    if (trace?.correlationId) headers["x-correlation-id"] = trace.correlationId;
    if (trace?.requestId) headers["x-request-id"] = trace.requestId;
    return routeJson(this.ctx, "POST", `/v1/conversations/${encodeURIComponent(conversationId)}/messages`, body, headers);
  }

  public async streamConversation(conversationId: string, characterId: string) {
    return routeRequest(this.ctx, "GET", `/v1/conversations/${encodeURIComponent(conversationId)}/stream?characterId=${encodeURIComponent(characterId)}`);
  }

  public async switchActorCharacter(input: unknown) {
    return routeJson(this.ctx, "POST", "/v1/actor-sessions/switch", input);
  }

  public async listMoments(storyWorldId: string, readerCharacterId: string, limit = 20) {
    return routeJson(this.ctx, "GET", `/v1/moments?storyWorldId=${encodeURIComponent(storyWorldId)}&readerCharacterId=${encodeURIComponent(readerCharacterId)}&limit=${limit}`);
  }

  public async listMomentInteractions(momentId: string, readerCharacterId: string) {
    return routeJson(this.ctx, "GET", `/v1/moments/${encodeURIComponent(momentId)}/interactions?readerCharacterId=${encodeURIComponent(readerCharacterId)}`);
  }

  public async createMomentInteraction(momentId: string, input: unknown) {
    return routeJson(this.ctx, "POST", `/v1/moments/${encodeURIComponent(momentId)}/interactions`, input);
  }

  public async getImageJob(jobId: string) {
    return routeJson(this.ctx, "GET", `/v1/image-jobs/${encodeURIComponent(jobId)}`);
  }

  public async listImageWorkflowTemplates() {
    return routeJson(this.ctx, "GET", "/v1/comfyui/workflows");
  }

  public validateImageWorkflow(input: { id: string; version: string; workflow: unknown; positivePromptPath?: string[]; negativePromptPath?: string[]; seedPath?: string[] }) {
    
    try {
      const template = createImageWorkflowTemplate({ id: input.id, version: input.version, workflow: input.workflow as import("../../../packages/domain/src/index.ts").JsonObject, positivePromptPath: input.positivePromptPath ?? [], ...(input.negativePromptPath === undefined ? {} : { negativePromptPath: input.negativePromptPath }), ...(input.seedPath === undefined ? {} : { seedPath: input.seedPath }) });
      assertImageWorkflowTemplateBindings(template);
      return { valid: true, id: template.id, version: template.version, checkedBindings: ["positivePromptPath", ...(template.negativePromptPath === undefined ? [] : ["negativePromptPath"]), ...(template.seedPath === undefined ? [] : ["seedPath"])] };
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  public async listStickerPacks(storyWorldId: string) {
    return routeJson(this.ctx, "GET", `/v1/sticker-packs?storyWorldId=${encodeURIComponent(storyWorldId)}`);
  }

  public async importStickerPack(input: unknown) {
    return routeJson(this.ctx, "POST", "/v1/sticker-packs", input);
  }

  public async getWorldCalendar(storyWorldId: string, startsAt: string, endsAt: string, limit = 200) {
    return routeJson(this.ctx, "GET", `/v1/worlds/${encodeURIComponent(storyWorldId)}/calendar?startsAt=${encodeURIComponent(startsAt)}&endsAt=${encodeURIComponent(endsAt)}&limit=${limit}`);
  }

  public async retryAutomaticReply(conversationId: string, readerCharacterId: string, sourceMessageId: string | undefined, trace: { correlationId: string; requestId?: string }) {
    const headers: Record<string, string> = { "x-correlation-id": trace.correlationId };
    if (trace.requestId) headers["x-request-id"] = trace.requestId;
    return routeJson(this.ctx, "POST", `/v1/conversations/${encodeURIComponent(conversationId)}/auto-reply/retry`, { readerCharacterId, sourceMessageId }, headers);
  }

  public async listMessages(conversationId: string, characterId: string) {
    return routeJson(this.ctx, "GET", `/v1/conversations/${encodeURIComponent(conversationId)}/messages?characterId=${encodeURIComponent(characterId)}`);
  }

  public async listCharacters(storyWorldId?: string) {
    return routeJson(this.ctx, "GET", `/v1/characters${storyWorldId ? `?storyWorldId=${encodeURIComponent(storyWorldId)}` : ""}`);
  }

  public async listWorlds() {
    return routeJson(this.ctx, "GET", "/v1/worlds");
  }

  public async createStoryWorld(input: unknown) {
    return routeJson(this.ctx, "POST", "/v1/worlds", input);
  }

  public async updateStoryWorld(id: string, input: unknown) {
    return routeJson(this.ctx, "PUT", `/v1/worlds/${encodeURIComponent(id)}`, input);
  }

  public async createCharacter(input: unknown) {
    return routeJson(this.ctx, "POST", "/v1/characters", input);
  }

  public async updateCharacter(id: string, input: unknown) {
    return routeJson(this.ctx, "PUT", `/v1/characters/${encodeURIComponent(id)}`, input);
  }

  public async listRelationships(storyWorldId: string) {
    return routeJson(this.ctx, "GET", `/v1/relationships?storyWorldId=${encodeURIComponent(storyWorldId)}`);
  }

  public async createRelationship(input: unknown) {
    return routeJson(this.ctx, "POST", "/v1/relationships", input);
  }

  public async updateRelationship(id: string, input: unknown) {
    return routeJson(this.ctx, "PUT", `/v1/relationships/${encodeURIComponent(id)}`, input);
  }

  public async createWorldEvent(input: unknown) {
    return routeJson(this.ctx, "POST", "/v1/world-events", input);
  }

  public async updateWorldEvent(id: string, input: unknown) {
    return routeJson(this.ctx, "PUT", `/v1/world-events/${encodeURIComponent(id)}`, input);
  }

  public async getCharacterVisualIdentity(characterId: string) {
    return routeJson(this.ctx, "GET", `/v1/characters/${encodeURIComponent(characterId)}/visual-identity`);
  }

  public async importImageWorkflow(input: unknown) {
    return routeJson(this.ctx, "POST", "/v1/comfyui/workflows/import", input);
  }

  public async requestConversationImage(conversationId: string, input: unknown) {
    return routeJson(this.ctx, "POST", `/v1/conversations/${encodeURIComponent(conversationId)}/image-jobs`, input);
  }

  public async listStickers(packId: string) {
    return routeJson(this.ctx, "GET", `/v1/sticker-packs/${encodeURIComponent(packId)}/stickers`);
  }

  public async getAppearanceSettings(ownerKey: string) {
    return routeJson(this.ctx, "GET", `/v1/appearance-settings?ownerKey=${encodeURIComponent(ownerKey)}`);
  }

  public async saveAppearanceSettings(ownerKey: string, input: unknown) {
    return routeJson(this.ctx, "PUT", `/v1/appearance-settings?ownerKey=${encodeURIComponent(ownerKey)}`, input);
  }

  public async listLlmProviderProfiles() {
    return routeJson(this.ctx, "GET", "/v1/llm-provider-profiles");
  }

  public async saveLlmProviderProfile(input: unknown) {
    return routeJson(this.ctx, "PUT", "/v1/llm-provider-profiles", input);
  }

  public async deleteLlmProviderProfile(id: string) {
    await routeRequest(this.ctx, "DELETE", `/v1/llm-provider-profiles/${encodeURIComponent(id)}`);
  }

  public async getComfyUiSettings() {
    return routeJson(this.ctx, "GET", "/v1/comfyui/settings");
  }

  public async saveComfyUiSettings(input: unknown) {
    return routeJson(this.ctx, "PUT", "/v1/comfyui/settings", input);
  }

  public async listImageAssets(storyWorldId: string) {
    return routeJson(this.ctx, "GET", `/v1/image-assets?storyWorldId=${encodeURIComponent(storyWorldId)}`);
  }

  public async listWorldLoreEntries(storyWorldId: string, query?: string) {
    return routeJson(this.ctx, "GET", `/v1/world-lore?storyWorldId=${encodeURIComponent(storyWorldId)}${query ? `&q=${encodeURIComponent(query)}` : ""}`);
  }

  public async createWorldLoreEntry(input: unknown) {
    return routeJson(this.ctx, "POST", "/v1/world-lore", input);
  }

  public async updateWorldLoreEntry(id: string, input: unknown) {
    return routeJson(this.ctx, "PUT", `/v1/world-lore/${encodeURIComponent(id)}`, input);
  }

  public async deleteWorldLoreEntry(id: string) {
    await routeRequest(this.ctx, "DELETE", `/v1/world-lore/${encodeURIComponent(id)}`);
  }

  public async listCreatorEventCandidates(worldId: string, horizonDays = 7) {
    return routeJson(this.ctx, "GET", `/v1/creator/worlds/${encodeURIComponent(worldId)}/event-candidates?horizonDays=${horizonDays}`);
  }

  public async previewCreatorEventDispatch(worldId: string, selections: unknown) {
    return routeJson(this.ctx, "POST", `/v1/creator/worlds/${encodeURIComponent(worldId)}/event-dispatches/preview`, { selections });
  }

  public async createCreatorEventDispatch(worldId: string, input: unknown) {
    return routeJson(this.ctx, "POST", `/v1/creator/worlds/${encodeURIComponent(worldId)}/event-dispatches`, input);
  }

  public async getCreatorEventDispatchBatch(batchId: string) {
    return routeJson(this.ctx, "GET", `/v1/creator/event-dispatches/${encodeURIComponent(batchId)}`);
  }
}
