import type { ChatProvider } from "../../../packages/ai/src/index.ts";
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
import type { AutomaticReplyTrace } from "./auto-reply.ts";
import * as worlds from "./use-cases/worlds.ts";
import * as characters from "./use-cases/characters.ts";
import * as relationships from "./use-cases/relationships.ts";
import * as worldEvents from "./use-cases/world-events.ts";
import * as conversationUc from "./use-cases/conversations.ts";
import * as momentUc from "./use-cases/moments.ts";
import * as imageJobs from "./use-cases/image-jobs.ts";
import * as workflowUc from "./use-cases/workflows.ts";
import * as stickerPacks from "./use-cases/sticker-packs.ts";
import * as settingsUc from "./use-cases/settings.ts";
import * as creatorUc from "./use-cases/creator-dispatch.ts";
import { requestConversationImage, requireConversationImageStore } from "./use-cases/request-conversation-image.ts";
import {
  parseCreateConversationRequest,
  parseSendMessageRequest,
  parseSwitchRequest,
  parseCreateMomentInteractionRequest,
  parseCreateStickerPackRequest,
  parseCreateStoryWorldRequest,
  parseUpdateStoryWorldRequest,
  parseCreateCharacterRequest,
  parseUpdateCharacterRequest,
  parseCreateRelationshipEdgeRequest,
  parseUpdateRelationshipEdgeRequest,
  parseCreateWorldEventDefinitionRequest,
  parseUpdateWorldEventDefinitionRequest,
  parseImportImageWorkflowRequest,
  parseRequestConversationImageRequest,
  parseUpdateAppearanceSettingsRequest,
  parseSaveLlmProviderProfileRequest,
  parseUpdateComfyUiSettingsRequest,
  parseCreateWorldLoreEntryRequest,
  parseUpdateWorldLoreEntryRequest,
} from "./parsers.ts";
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

  // --- Delegate methods call use-cases directly ---

  public async listConversations(characterId: string) {
    return conversationUc.listConversations(this.ctx.store, characterId);
  }

  public async createConversation(input: unknown) {
    return conversationUc.createConversation(this.ctx.store, parseCreateConversationRequest(input));
  }

  public async sendMessage(conversationId: string, authorCharacterId: string | undefined, input: unknown, trace?: { correlationId?: string; requestId?: string }) {
    const parsed = parseSendMessageRequest(input);
    const effectiveAuthorId = authorCharacterId ?? parsed.authorCharacterId;
    const autoTrace: AutomaticReplyTrace = {
      correlationId: trace?.correlationId ?? crypto.randomUUID(),
      conversationId,
      ...(effectiveAuthorId !== undefined ? { actorId: effectiveAuthorId } : {}),
      ...(trace?.requestId !== undefined ? { requestId: trace.requestId } : {}),
    };
    return conversationUc.sendMessage(this.ctx, conversationId, effectiveAuthorId, parsed, autoTrace);
  }

  public async streamConversation(conversationId: string, characterId: string) {
    const url = new URL(`http://localhost/v1/conversations/${encodeURIComponent(conversationId)}/stream?characterId=${encodeURIComponent(characterId)}`);
    const correlationId = crypto.randomUUID();
    const request = new Request(url, { method: "GET", headers: { "x-correlation-id": correlationId } });
    const result = await handleConversations(this.ctx, request, url, correlationId);
    if (result === undefined) throw new ApiError(404, "NOT_FOUND", "Route not found");
    return result;
  }

  public async switchActorCharacter(input: unknown) {
    return conversationUc.switchActorCharacter(this.ctx.store, parseSwitchRequest(input));
  }

  public async listMoments(storyWorldId: string, readerCharacterId: string, limit = 20) {
    return momentUc.listMoments(this.ctx.store, storyWorldId, readerCharacterId, limit);
  }

  public async listMomentInteractions(momentId: string, readerCharacterId: string) {
    return momentUc.listMomentInteractions(this.ctx.store, momentId, readerCharacterId);
  }

  public async createMomentInteraction(momentId: string, input: unknown) {
    return momentUc.createMomentInteraction(this.ctx.store, momentId, parseCreateMomentInteractionRequest(input));
  }

  public async getImageJob(jobId: string) {
    return imageJobs.getImageJob(this.ctx.store, jobId);
  }

  public async listImageWorkflowTemplates() {
    return workflowUc.listImageWorkflowTemplates(this.ctx.store);
  }

  public validateImageWorkflow(input: { id: string; version: string; workflow: unknown; positivePromptPath?: string[]; negativePromptPath?: string[]; seedPath?: string[] }) {
    return workflowUc.validateImageWorkflow(input as import("../../../packages/contracts/src/index.ts").ValidateImageWorkflowRequest);
  }

  public async listStickerPacks(storyWorldId: string) {
    return stickerPacks.listStickerPacks(this.ctx.store, storyWorldId);
  }

  public async importStickerPack(input: unknown) {
    return stickerPacks.importStickerPack(this.ctx.store, parseCreateStickerPackRequest(input));
  }

  public async getWorldCalendar(storyWorldId: string, startsAt: string, endsAt: string, limit = 200) {
    return worlds.getWorldCalendar(this.ctx.store, storyWorldId, startsAt, endsAt, limit);
  }

  public async retryAutomaticReply(conversationId: string, readerCharacterId: string, sourceMessageId: string | undefined, trace: { correlationId: string; requestId?: string }) {
    const autoTrace: AutomaticReplyTrace = {
      correlationId: trace.correlationId,
      conversationId,
      actorId: readerCharacterId,
      ...(trace.requestId !== undefined ? { requestId: trace.requestId } : {}),
    };
    return conversationUc.retryAutomaticReply(this.ctx, conversationId, readerCharacterId, sourceMessageId, autoTrace);
  }

  public async listMessages(conversationId: string, characterId: string) {
    return conversationUc.listMessages(this.ctx.store, conversationId, characterId);
  }

  public async listCharacters(storyWorldId?: string) {
    return characters.listCharacters(this.ctx.store, storyWorldId);
  }

  public async listWorlds() {
    return worlds.listWorlds(this.ctx.store);
  }

  public async createStoryWorld(input: unknown) {
    return worlds.createWorld(this.ctx.store, parseCreateStoryWorldRequest(input));
  }

  public async updateStoryWorld(id: string, input: unknown) {
    return worlds.updateWorld(this.ctx.store, id, parseUpdateStoryWorldRequest(input));
  }

  public async createCharacter(input: unknown) {
    return characters.createCharacter(this.ctx.store, parseCreateCharacterRequest(input));
  }

  public async updateCharacter(id: string, input: unknown) {
    return characters.updateCharacter(this.ctx.store, id, parseUpdateCharacterRequest(input));
  }

  public async listRelationships(storyWorldId: string) {
    return relationships.listRelationships(this.ctx.store, storyWorldId);
  }

  public async createRelationship(input: unknown) {
    return relationships.createRelationship(this.ctx.store, parseCreateRelationshipEdgeRequest(input));
  }

  public async updateRelationship(id: string, input: unknown) {
    return relationships.updateRelationship(this.ctx.store, id, parseUpdateRelationshipEdgeRequest(input));
  }

  public async createWorldEvent(input: unknown) {
    return worldEvents.createWorldEvent(this.ctx.store, parseCreateWorldEventDefinitionRequest(input));
  }

  public async updateWorldEvent(id: string, input: unknown) {
    return worldEvents.updateWorldEvent(this.ctx.store, id, parseUpdateWorldEventDefinitionRequest(input));
  }

  public async getCharacterVisualIdentity(characterId: string) {
    return characters.getCharacterVisualIdentity(this.ctx.store, characterId);
  }

  public async importImageWorkflow(input: unknown) {
    return workflowUc.importImageWorkflow(this.ctx.store, parseImportImageWorkflowRequest(input) as import("../../../packages/domain/src/index.ts").JsonObject & { id: string; version: string });
  }

  public async requestConversationImage(conversationId: string, input: unknown) {
    return requestConversationImage(requireConversationImageStore(this.ctx.store), conversationId, parseRequestConversationImageRequest(input));
  }

  public async listStickers(packId: string) {
    return stickerPacks.listStickers(this.ctx.store, packId);
  }

  public async getAppearanceSettings(ownerKey: string) {
    return settingsUc.getAppearanceSettings(this.ctx.store, ownerKey);
  }

  public async saveAppearanceSettings(ownerKey: string, input: unknown) {
    return settingsUc.saveAppearanceSettings(this.ctx.store, ownerKey, parseUpdateAppearanceSettingsRequest(input));
  }

  public async listLlmProviderProfiles() {
    return settingsUc.listLlmProviderProfiles(this.ctx.store);
  }

  public async saveLlmProviderProfile(input: unknown) {
    return settingsUc.saveLlmProviderProfile(this.ctx.store, parseSaveLlmProviderProfileRequest(input), this.ctx.secretCipher);
  }

  public async deleteLlmProviderProfile(id: string) {
    return settingsUc.deleteLlmProviderProfile(this.ctx.store, id);
  }

  public async getComfyUiSettings() {
    return settingsUc.getComfyUiSettings(this.ctx.store);
  }

  public async saveComfyUiSettings(input: unknown) {
    return settingsUc.saveComfyUiSettings(this.ctx.store, parseUpdateComfyUiSettingsRequest(input));
  }

  public async listImageAssets(storyWorldId: string) {
    return imageJobs.listImageAssets(this.ctx.store, storyWorldId);
  }

  public async listWorldLoreEntries(storyWorldId: string, query?: string) {
    return worlds.listWorldLoreEntries(this.ctx.store, storyWorldId, query);
  }

  public async createWorldLoreEntry(input: unknown) {
    return worlds.createWorldLoreEntry(this.ctx.store, parseCreateWorldLoreEntryRequest(input));
  }

  public async updateWorldLoreEntry(id: string, input: unknown) {
    return worlds.updateWorldLoreEntry(this.ctx.store, id, parseUpdateWorldLoreEntryRequest(input));
  }

  public async deleteWorldLoreEntry(id: string) {
    return worlds.deleteWorldLoreEntry(this.ctx.store, id);
  }

  public async listCreatorEventCandidates(worldId: string, horizonDays = 7) {
    return creatorUc.listCreatorEventCandidates(this.ctx, worldId, horizonDays);
  }

  public async previewCreatorEventDispatch(worldId: string, selections: unknown) {
    return creatorUc.previewDispatch(this.ctx, worldId, selections as import("../../../packages/contracts/src/index.ts").EventDispatchSelectionDto[]);
  }

  public async createCreatorEventDispatch(worldId: string, input: unknown) {
    return creatorUc.createCreatorEventDispatch(this.ctx, worldId, input as import("../../../packages/contracts/src/index.ts").CreateEventDispatchBatchRequest);
  }

  public async getCreatorEventDispatchBatch(batchId: string) {
    return creatorUc.getCreatorEventDispatchBatch(this.ctx, batchId);
  }
}
