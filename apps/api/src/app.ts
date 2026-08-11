import type { ChatProvider } from "../../../packages/ai/src/index.ts";
import { SecretCipher } from "../../../packages/ai/src/index.ts";
import type { InteractionLogDto } from "../../../packages/contracts/src/index.ts";
import {
  createInMemoryRepositories,
  type DomainRepositories,
  type InMemoryRepositorySeed,
} from "../../../packages/database/src/index.ts";
import {
  InMemoryInteractionLogRepository,
  type InteractionLogRepository,
} from "../../../packages/database/src/interaction-log.ts";
import type {
  ConversationOrchestratorOptions,
  ConversationReply,
  ResolvedMessageMedia,
} from "./conversation-orchestrator.ts";
import { ApiError, errorResponse, jsonResponse, withHeaders, type ApiErrorCode } from "./helpers.ts";
import type { HandlerContext } from "./context.ts";
import type { AutomaticReplyState } from "./auto-reply.ts";
import { InteractionLogging } from "./interaction-logging.ts";
import { ApiMediaStore } from "./media-store.ts";
import type {
  CreateConversationRequest,
  SendMessageRequest,
  ActorSessionSwitchRequest,
  ConversationDetailDto,
  MessageDto,
  ActorSessionDto,
  WorldCalendarDto,
  ImageWorkflowTemplateDto,
  ImageJobDto,
  MomentDto,
  StickerPackDto,
  CreateStickerPackRequest,
  StickerPackImportResultDto,
  StoryWorldDto,
  CreateStoryWorldRequest,
  UpdateStoryWorldRequest,
  CharacterDto,
  CreateCharacterRequest,
  UpdateCharacterRequest,
  RelationshipEdgeDto,
  CreateRelationshipEdgeRequest,
  UpdateRelationshipEdgeRequest,
  WorldEventDefinitionDto,
  CreateWorldEventDefinitionRequest,
  UpdateWorldEventDefinitionRequest,
  WorldLoreEntryDto,
  CreateWorldLoreEntryRequest,
  UpdateWorldLoreEntryRequest,
  CharacterVisualIdentityDto,
  ImageAssetDto,
  StickerDto,
  AppearanceSettingsDto,
  UpdateAppearanceSettingsRequest,
  LlmProviderProfileDto,
  SaveLlmProviderProfileRequest,
  ComfyUiSettingsDto,
  UpdateComfyUiSettingsRequest,
  EventDispatchBatchDto,
  CreateEventDispatchBatchRequest,
  EventDispatchPreviewDto,
  EventDispatchSelectionDto,
  MomentInteractionDto,
  CreateMomentInteractionRequest,
  MomentInteractionWriteResultDto,
  CreateStickerInput,
} from "../../../packages/contracts/src/index.ts";
import type { AutomaticReplyTrace } from "./auto-reply.ts";
import { createSseResponse } from "./helpers.ts";
import * as conversationsUc from "./use-cases/conversations.ts";
import * as worldsUc from "./use-cases/worlds.ts";
import * as workflowUc from "./use-cases/workflows.ts";
import * as imageJobsUc from "./use-cases/image-jobs.ts";
import * as momentsUc from "./use-cases/moments.ts";
import * as stickerPacksUc from "./use-cases/sticker-packs.ts";
import { ConversationOrchestrator } from "./conversation-orchestrator.ts";
import type { ConversationReplyContext } from "./conversation-orchestrator.ts";
import { promptForExplicitChatImageIntent } from "./auto-image-intent.ts";
import { requestConversationImage as requestConversationImageUseCase, requireConversationImageStore } from "./use-cases/request-conversation-image.ts";
import { handleConversations } from "./routes/conversations.ts";
import { handleWorldContent } from "./routes/world-content.ts";
import { handleVisualAssets } from "./routes/visual-assets.ts";
import { handleMedia } from "./routes/media.ts";
import { handleMoments } from "./routes/moments.ts";
import { handleCreatorDispatch } from "./routes/creator-dispatch.ts";
import { handleSettings } from "./routes/settings.ts";

// --- Re-exports for backward compatibility ---
export { ApiError } from "./helpers.ts";
export type { ApiErrorCode } from "./helpers.ts";
export type { ApiStore } from "./context.ts";

export type ApiSeed = InMemoryRepositorySeed;

export interface SendMessageWithAutoReplyResult {
  readonly message: import("../../../packages/contracts/src/index.ts").MessageDto;
  readonly inserted: boolean;
  readonly autoReply: AutomaticReplyState;
}

export interface CreatorEventCandidatesResponse {
  candidates: readonly import("../../../packages/contracts/src/index.ts").CreatorEventCandidateDto[];
  dispatchAvailable: boolean;
  workerStatus: { available: boolean; idle: boolean; busy: boolean };
}

export function createApiStore(seed: ApiSeed = {}): DomainRepositories {
  return createInMemoryRepositories(seed);
}

export class ApiApplication {
  public readonly store: DomainRepositories;
  public readonly provider: ChatProvider | undefined;
  private readonly conversationOptions: ConversationOrchestratorOptions;
  private readonly requireTrustedActor: boolean;
  private readonly readiness: (() => Promise<void>) | undefined;
  private readonly secretCipher: SecretCipher | undefined;
  private readonly creatorDispatchEnabled: boolean;
  private readonly creatorClock: () => Date;
  private readonly interactionLogs: InteractionLogRepository;
  private readonly logging: InteractionLogging;
  private readonly replyFlights = new Map<string, Promise<ConversationReply>>();
  private readonly media: ApiMediaStore;

  public constructor(
    store: DomainRepositories,
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
    this.requireTrustedActor = securityOptions.requireTrustedActor ?? false;
    this.readiness = operationalOptions.readiness;
    this.secretCipher = operationalOptions.secretCipher;
    this.creatorDispatchEnabled = operationalOptions.creatorDispatchEnabled ?? false;
    this.creatorClock = operationalOptions.creatorClock ?? (() => new Date());
    this.interactionLogs = operationalOptions.interactionLogs ?? new InMemoryInteractionLogRepository();
    this.logging = operationalOptions.interactionLogging ?? new InteractionLogging({
      repository: this.interactionLogs,
      ...(operationalOptions.loggingCleanupEnabled === undefined ? {} : { cleanupEnabled: operationalOptions.loggingCleanupEnabled }),
      ...(operationalOptions.loggingCleanupIntervalMs === undefined ? {} : { cleanupIntervalMs: operationalOptions.loggingCleanupIntervalMs }),
    });
    this.media = new ApiMediaStore(operationalOptions.mediaRoot ?? "./data/media");
    this.conversationOptions = {
      ...conversationOptions,
      mediaResolver: conversationOptions.mediaResolver ?? ((message) => this.resolveMessageMedia(message)),
    };
  }

  private async resolveMessageMedia(message: import("../../../packages/domain/src/index.ts").Message): Promise<ResolvedMessageMedia | undefined> {
    const { MessageKind } = await import("../../../packages/domain/src/index.ts");
    let mediaRef: string | undefined;
    let label: string | undefined;
    if (message.kind === MessageKind.IMAGE) {
      mediaRef = message.mediaRef;
    } else if (message.kind === MessageKind.STICKER && message.stickerId && this.store.stickers) {
      const sticker = await this.store.stickers.getById(message.stickerId);
      mediaRef = sticker?.mediaRef;
      label = sticker?.label;
    }
    if (!mediaRef?.startsWith("media://local/")) return undefined;
    const media = await this.media.get(mediaRef);
    return {
      mediaType: media.contentType,
      dataBase64: Buffer.from(media.bytes).toString("base64"),
      ...(label === undefined ? {} : { label }),
    };
  }

  private getHandlerContext(): HandlerContext {
    return {
      store: this.store,
      provider: this.provider,
      conversationOptions: this.conversationOptions,
      requireTrustedActor: this.requireTrustedActor,
      readiness: this.readiness,
      secretCipher: this.secretCipher,
      creatorDispatchEnabled: this.creatorDispatchEnabled,
      creatorClock: this.creatorClock,
      interactionLogs: this.interactionLogs,
      logging: this.logging,
      replyFlights: this.replyFlights,
      media: this.media,
    };
  }

  // --- Public delegate methods (called directly by tests and runtime) ---
  public async listConversations(characterId: string): Promise<ConversationDetailDto[]> {
    return conversationsUc.listConversations(this.store, characterId);
  }

  public async createConversation(input: CreateConversationRequest): Promise<ConversationDetailDto> {
    return conversationsUc.createConversation(this.store, input);
  }

  public async sendMessage(
    conversationId: string,
    authorCharacterId: string | undefined,
    input: SendMessageRequest,
    trace: AutomaticReplyTrace = { correlationId: crypto.randomUUID(), conversationId },
  ): Promise<SendMessageWithAutoReplyResult> {
    return conversationsUc.sendMessage(this.getHandlerContext(), conversationId, authorCharacterId, input, trace);
  }

  public async switchActorCharacter(input: ActorSessionSwitchRequest): Promise<ActorSessionDto> {
    return conversationsUc.switchActorCharacter(this.store, input);
  }

  public async streamConversation(conversationId: string, characterId: string): Promise<Response> {
    const ctx = this.getHandlerContext();
    if (!ctx.provider) throw new ApiError(501, "NOT_IMPLEMENTED", "Chat provider is not configured");
    try {
    const orchestrator = new ConversationOrchestrator(ctx.store, ctx.provider, {
      ...ctx.conversationOptions,
      afterReplySaved: async (context: ConversationReplyContext) => {
        if (!context.reply.inserted || context.conversation.conversation.type !== "PRIVATE") return;
        const settings = ctx.store.comfyUiSettings === undefined ? undefined : await ctx.store.comfyUiSettings.get();
        if (!settings?.autoImageIntentEnabled || !settings.defaultWorkflowVersion) return;
        const userContent = context.latestUserMessage?.text;
        const prompt = promptForExplicitChatImageIntent(userContent, context.reply.message.text ?? "");
        if (!prompt) return;
        const userId = context.latestUserMessage?.authorCharacterId;
        if (!userId || userId === context.ai.id) return;
        try {
          const imgStore = requireConversationImageStore(ctx.store);
          await requestConversationImageUseCase(imgStore, context.conversation.conversation.id, {
            actorCharacterId: context.ai.id, recipientCharacterId: userId, prompt,
            workflowVersion: settings.defaultWorkflowVersion,
            createdAt: context.reply.message.createdAt,
            idempotencyKey: `auto-image:${context.reply.message.id}`,
          });
        } catch { /* best-effort */ }
      },
    });
    return createSseResponse(orchestrator.streamReply(conversationId, characterId));
    } catch (error) {
      if (error instanceof TypeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  public async getWorldCalendar(worldId: string, startsAt: string, endsAt: string, limit?: number): Promise<WorldCalendarDto> {
    return worldsUc.getWorldCalendar(this.store, worldId, startsAt, endsAt, limit ?? 200);
  }

  public async listImageWorkflowTemplates(): Promise<ImageWorkflowTemplateDto[]> {
    return workflowUc.listImageWorkflowTemplates(this.store);
  }

  public async getImageJob(jobId: string): Promise<ImageJobDto> {
    return imageJobsUc.getImageJob(this.store, jobId);
  }

  public async listMoments(storyWorldId: string, readerCharacterId: string, limit?: number): Promise<MomentDto[]> {
    return momentsUc.listMoments(this.store, storyWorldId, readerCharacterId, limit ?? 20);
  }

  public async listStickerPacks(storyWorldId: string): Promise<StickerPackDto[]> {
    return stickerPacksUc.listStickerPacks(this.store, storyWorldId);
  }

  public async importStickerPack(input: CreateStickerPackRequest): Promise<StickerPackImportResultDto> {
    return stickerPacksUc.importStickerPack(this.store, input);
  }

  public async listMomentInteractions(momentId: string, readerCharacterId: string): Promise<import("../../../packages/contracts/src/index.ts").MomentInteractionDto[]> {
    return momentsUc.listMomentInteractions(this.store, momentId, readerCharacterId);
  }

  public async createMomentInteraction(momentId: string, input: import("../../../packages/contracts/src/index.ts").CreateMomentInteractionRequest): Promise<import("../../../packages/contracts/src/index.ts").MomentInteractionWriteResultDto> {
    return momentsUc.createMomentInteraction(this.store, momentId, input);
  }

  public validateImageWorkflow(
    input: import("../../../packages/contracts/src/index.ts").ValidateImageWorkflowRequest,
  ): import("../../../packages/contracts/src/index.ts").ValidateImageWorkflowResultDto {
    return workflowUc.validateImageWorkflow(input);
  }

  public stop(): void {
    this.logging.stop();
  }

  public recordHttpCompletion(input: {
    method: string;
    pathname: string;
    status: number;
    durationMs: number;
    requestId?: string;
    correlationId: string;
  }): void {
    if (input.pathname === "/health" || input.pathname === "/ready" || input.pathname.startsWith("/v1/interaction-logs")) return;
    void this.logging.append({
      level: input.status >= 400 ? "ERROR" : "INFO",
      source: "API",
      category: "HTTP",
      action: `${input.method} ${input.pathname}`,
      outcome: input.status >= 400 ? "FAILURE" : "SUCCESS",
      durationMs: input.durationMs,
      correlationId: input.correlationId,
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
      details: { method: input.method, pathname: input.pathname, status: input.status },
      id: "",
      createdAt: new Date().toISOString(),
    }).catch(() => undefined);
  }



  // --- Worlds ---
  public async listWorlds(): Promise<StoryWorldDto[]> {
    return worldsUc.listWorlds(this.store as never);
  }

  public async createStoryWorld(input: CreateStoryWorldRequest): Promise<StoryWorldDto> {
    return worldsUc.createWorld(this.store as never, input);
  }

  public async updateStoryWorld(id: string, input: UpdateStoryWorldRequest): Promise<StoryWorldDto> {
    return worldsUc.updateWorld(this.store as never, id, input);
  }

  // --- Characters ---
  public async listCharacters(storyWorldId?: string): Promise<CharacterDto[]> {
    return charactersUc.listCharacters(this.store as never, storyWorldId);
  }

  public async createCharacter(input: CreateCharacterRequest): Promise<CharacterDto> {
    return charactersUc.createCharacter(this.store as never, input);
  }

  public async updateCharacter(id: string, input: UpdateCharacterRequest): Promise<CharacterDto> {
    return charactersUc.updateCharacter(this.store as never, id, input);
  }

  public async getCharacterVisualIdentity(characterId: string): Promise<CharacterVisualIdentityDto> {
    return charactersUc.getCharacterVisualIdentity(this.store as never, characterId);
  }

  // --- Relationships ---
  public async listRelationships(storyWorldId: string): Promise<RelationshipEdgeDto[]> {
    return relationshipsUc.listRelationships(this.store as never, storyWorldId);
  }

  public async createRelationship(input: CreateRelationshipEdgeRequest): Promise<RelationshipEdgeDto> {
    return relationshipsUc.createRelationship(this.store as never, input);
  }

  public async updateRelationship(id: string, input: UpdateRelationshipEdgeRequest): Promise<RelationshipEdgeDto> {
    return relationshipsUc.updateRelationship(this.store as never, id, input);
  }

  // --- World Events ---
  public async createWorldEvent(input: CreateWorldEventDefinitionRequest): Promise<WorldEventDefinitionDto> {
    return worldEventsUc.createWorldEvent(this.store as never, input);
  }

  public async updateWorldEvent(id: string, input: UpdateWorldEventDefinitionRequest): Promise<WorldEventDefinitionDto> {
    return worldEventsUc.updateWorldEvent(this.store as never, id, input);
  }

  // --- World Lore ---
  public async listWorldLoreEntries(storyWorldId: string, query?: string): Promise<WorldLoreEntryDto[]> {
    return worldsUc.listWorldLoreEntries(this.store as never, storyWorldId, query);
  }

  public async createWorldLoreEntry(input: CreateWorldLoreEntryRequest): Promise<WorldLoreEntryDto> {
    return worldsUc.createWorldLoreEntry(this.store as never, input);
  }

  public async updateWorldLoreEntry(id: string, input: UpdateWorldLoreEntryRequest): Promise<WorldLoreEntryDto> {
    return worldsUc.updateWorldLoreEntry(this.store as never, id, input);
  }

  public async deleteWorldLoreEntry(id: string): Promise<void> {
    return worldsUc.deleteWorldLoreEntry(this.store as never, id);
  }

  // --- Image Assets & Workflows ---
  public async listImageAssets(storyWorldId: string): Promise<ImageAssetDto[]> {
    return imageJobsUc.listImageAssets(this.store as never, storyWorldId);
  }

  public async importImageWorkflow(input: { id: string; version: string; workflow: import("../../../packages/domain/src/index.ts").JsonObject; positivePromptPath?: string[]; negativePromptPath?: string[]; seedPath?: string[] }): Promise<ImageWorkflowTemplateDto> {
    return workflowUc.importImageWorkflow(this.store as never, input);
  }

  public async requestConversationImage(conversationId: string, input: import("../../../packages/contracts/src/index.ts").RequestConversationImageRequest): Promise<ImageJobDto> {
    return requestConversationImageUseCase(this.store as never, conversationId, input);
  }

  // --- Stickers ---
  public async listStickers(packId: string): Promise<StickerDto[]> {
    return stickerPacksUc.listStickers(this.store as never, packId);
  }

  public async appendStickersToPack(packId: string, inputs: readonly CreateStickerInput[]): Promise<StickerPackImportResultDto> {
    const ctx = this.getHandlerContext();
    const pack = await ctx.store.stickerPacks?.getById(packId);
    if (!pack) throw new ApiError(404, "NOT_FOUND", "Sticker pack not found");
    const stickers = inputs.map((sticker) => ({
      id: sticker.id,
      label: sticker.label,
      mediaRef: sticker.mediaRef,
      createdAt: new Date().toISOString(),
      ...(sticker.tags === undefined ? {} : { tags: sticker.tags }),
    }));
    return stickerPacksUc.importStickerPack(ctx.store as never, {
      id: packId,
      storyWorldId: pack.storyWorldId,
      name: pack.name,
      createdAt: new Date().toISOString(),
      
      stickers,
    });
  }

  // --- Appearance Settings ---
  public async getAppearanceSettings(ownerKey: string): Promise<AppearanceSettingsDto> {
    return settingsUc.getAppearanceSettings(this.store as never, ownerKey);
  }

  public async saveAppearanceSettings(ownerKey: string, input: UpdateAppearanceSettingsRequest): Promise<AppearanceSettingsDto> {
    return settingsUc.saveAppearanceSettings(this.store as never, ownerKey, input);
  }

  // --- LLM Provider Profiles ---
  public async listLlmProviderProfiles(): Promise<LlmProviderProfileDto[]> {
    return settingsUc.listLlmProviderProfiles(this.store as never);
  }

  public async saveLlmProviderProfile(input: SaveLlmProviderProfileRequest): Promise<LlmProviderProfileDto> {
    return settingsUc.saveLlmProviderProfile(this.store as never, input, this.secretCipher);
  }

  public async deleteLlmProviderProfile(id: string): Promise<void> {
    return settingsUc.deleteLlmProviderProfile(this.store as never, id);
  }

  // --- ComfyUI Settings ---
  public async getComfyUiSettings(): Promise<ComfyUiSettingsDto> {
    return settingsUc.getComfyUiSettings(this.store as never);
  }

  public async saveComfyUiSettings(input: UpdateComfyUiSettingsRequest): Promise<ComfyUiSettingsDto> {
    return settingsUc.saveComfyUiSettings(this.store as never, input);
  }

  // --- Messages ---
  public async listMessages(conversationId: string, characterId: string): Promise<MessageDto[]> {
    return conversationsUc.listMessages(this.store as never, conversationId, characterId);
  }

  public async retryAutomaticReply(conversationId: string, readerCharacterId: string, sourceMessageId: string | undefined, trace: AutomaticReplyTrace): Promise<AutomaticReplyState> {
    return conversationsUc.retryAutomaticReply(this.getHandlerContext(), conversationId, readerCharacterId, sourceMessageId, trace) as Promise<AutomaticReplyState>;
  }

  // --- Creator Dispatch ---
  public async listCreatorEventCandidates(worldId: string, horizonDays = 7) {
    return creatorDispatchUc.listCreatorEventCandidates(this.getHandlerContext(), worldId, horizonDays);
  }

  public async previewCreatorEventDispatch(worldId: string, selections: readonly EventDispatchSelectionDto[]): Promise<EventDispatchPreviewDto> {
    return creatorDispatchUc.previewDispatch(this.getHandlerContext(), worldId, selections as EventDispatchSelectionDto[]);
  }

  public async createCreatorEventDispatch(worldId: string, input: CreateEventDispatchBatchRequest): Promise<EventDispatchBatchDto> {
    return creatorDispatchUc.createCreatorEventDispatch(this.getHandlerContext(), worldId, input);
  }

  public async getCreatorEventDispatchBatch(batchId: string): Promise<EventDispatchBatchDto> {
    return creatorDispatchUc.getCreatorEventDispatchBatch(this.getHandlerContext(), batchId);
  }


  public async handle(request: Request): Promise<Response> {
    const requestId = request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
    const supplied = request.headers.get("x-correlation-id")?.trim();
    const correlationId = supplied && supplied.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(supplied) ? supplied : crypto.randomUUID();
    const headers: Record<string, string> = { "x-request-id": requestId, "x-correlation-id": correlationId };
    const requestHeaders = new Headers(request.headers);
    for (const [key, value] of Object.entries(headers)) requestHeaders.set(key, value);
    const response = await this.handleInternal(new Request(request, { headers: requestHeaders }));
    return withHeaders(response, headers);
  }

  private async handleInternal(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const correlationId = (() => {
        const value = request.headers.get("x-correlation-id")?.trim();
        return value && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value) ? value : crypto.randomUUID();
      })();
      const ctx = this.getHandlerContext();

      // --- Health ---
      if (request.method === "GET" && url.pathname === "/health") {
        return jsonResponse({ status: "ok" });
      }

      // --- Readiness ---
      if (request.method === "GET" && url.pathname === "/ready") {
        try {
          await this.readiness?.();
        } catch {
          throw new ApiError(503, "SERVICE_UNAVAILABLE", "Service is not ready");
        }
        return jsonResponse({ status: "ready" });
      }

      // --- Delegate to modular route handlers ---
      for (const handler of [
        handleConversations,
        handleWorldContent,
        handleVisualAssets,
        handleMedia,
        handleMoments,
        handleCreatorDispatch,
        handleSettings,
      ]) {
        const result = await handler(ctx, request, url, correlationId);
          if (result !== undefined) return result;
      }

      // --- 405 fallback for known paths ---
      const knownBasePaths = [
        "/health",
        "/ready",
        "/v1/media",
        "/v1/worlds",
        "/v1/world-lore",
        "/v1/characters",
        "/v1/relationships",
        "/v1/comfyui/workflows",
        "/v1/image-assets",
        "/v1/sticker-packs",
        "/v1/moments",
        "/v1/conversations",
        "/v1/appearance-settings",
        "/v1/llm-provider-profiles",
        "/v1/comfyui/settings",
        "/v1/actor-sessions/switch",
      ];
      if (knownBasePaths.some((base) => url.pathname === base || url.pathname.startsWith(base + "/"))) {
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
      }
      throw new ApiError(404, "NOT_FOUND", "Route not found");
    } catch (error) {
      return errorResponse(error);
    }
  }
}
import * as charactersUc from "./use-cases/characters.ts";
import * as relationshipsUc from "./use-cases/relationships.ts";
import * as worldEventsUc from "./use-cases/world-events.ts";
import * as settingsUc from "./use-cases/settings.ts";
import * as creatorDispatchUc from "./use-cases/creator-dispatch.ts";
