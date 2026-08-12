import type {
  ApiCharacter,
  ApiEvent,
  ApiRelationship,
  ApiWorld,
  CreatorDispatchSelectionDto,
  CreatorEventCandidateDto,
  CreatorEventCandidatesDto,
  EventDispatchBatchDto,
  EventDispatchPreviewDto,
} from "./types";
import type {
  AppearanceSettingsDto,
  ComfyUiSettingsDto,
  CharacterVisualIdentityDto,
  CreateCharacterRequest,
  CreateRelationshipEdgeRequest,
  CreateStoryWorldRequest,
  CreateWorldEventDefinitionRequest,
  ConversationDetailDto,
  ImageWorkflowTemplateDto,
  ImageJobDto,
  ImageAssetDto,
  MessageDto,
  MomentDto,
  MomentInteractionWriteResultDto,
  RelationshipEdgeDto,
  SendMessageRequest,
  RequestConversationImageRequest,
  CreateStickerInput,
  CreateStickerPackRequest,
  StickerPackImportResultDto,
  StickerDto,
  StickerPackDto,
  StoryWorldDto,
  UpdateCharacterRequest,
  UpdateRelationshipEdgeRequest,
  UpdateAppearanceSettingsRequest,
  UpdateComfyUiSettingsRequest,
  UpdateStoryWorldRequest,
  UpdateWorldEventDefinitionRequest,
  ValidateImageWorkflowResultDto,
  WorldLoreEntryDto,
  WorldCalendarDto,
  LlmProviderProfileDto,
  SaveLlmProviderProfileRequest,
  CreateMemoryCandidateRequest,
  CreatePromptTemplateRequest,
  CreateStoryArcRequest,
  CreateStoryEdgeRequest,
  CreateStoryNodeRequest,
  MemoryCandidateDto,
  PromptPreviewDto,
  PromptTemplateDto,
  ReviewMemoryCandidateRequest,
  StoryArcDto,
  StoryEdgeDto,
  StoryNodeDto,
  UpdatePromptTemplateRequest,
  UpdateStoryArcRequest,
  UpdateStoryEdgeRequest,
  UpdateStoryNodeRequest,
} from "@living-network/contracts";

export interface AutoReplyState { status: "QUEUED" | "NOT_APPLICABLE" | "ALREADY_EXISTS" | "COMPLETED" | "FAILED"; correlationId?: string; sourceMessageId?: string; messageId?: string; }
export interface SseEvent<T = unknown> { event: string; id?: string; done: boolean; data?: T; }
export interface ApiResponse<T> {
  data: T;
}

export interface UploadedMediaDto {
  mediaRef: string;
  contentType: string;
  byteLength: number;
  sha256: string;
}

export interface SseHandlers {
  onDelta?: (delta: { content?: string }) => void;
  onError?: (error: unknown) => void;
  onDone?: () => void;
}

export interface SaveWorldLoreEntryRequest {
  id: string;
  storyWorldId: string;
  category: string;
  title: string;
  content: string;
  tags?: string[];
  isEnabled?: boolean;
}

export interface UpdateWorldLoreEntryRequest {
  category?: string;
  title?: string;
  content?: string;
  tags?: string[];
  isEnabled?: boolean;
}

export class ApiClient {
  public baseUrl: string;
  public actorCharacterId: string;

  public constructor(baseUrl: string, actorCharacterId = "") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.actorCharacterId = actorCharacterId;
  }

  public setActorCharacterId(actorCharacterId: string): void {
    this.actorCharacterId = actorCharacterId;
  }

  public async request<T = unknown>(path: string, options: RequestInit & { correlationId?: string } = {}): Promise<ApiResponse<T> & { correlationId: string }> {
    const correlationId = options.correlationId || crypto.randomUUID();
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        accept: "application/json",
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        ...(this.actorCharacterId ? { "x-actor-character-id": this.actorCharacterId } : {}),
        ...(options.headers ?? {}),
      },
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
    });
    const payload: Record<string, unknown> = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errPayload = payload as Record<string, unknown>;
      const errObj = errPayload?.error as Record<string, unknown> | undefined;
      const message = errObj?.message ?? `API request failed (${response.status})`;
      const error = new Error(typeof message === "string" ? message : String(message)) as Error & { correlationId?: string; code?: string; status?: number };
      error.correlationId = response.headers?.get("x-correlation-id") ?? correlationId ?? undefined;
      const correlation = response.headers?.get("x-correlation-id") ?? undefined;
      error.correlationId = correlation ?? correlationId;
      error.status = response.status;
      throw error;
    }
    return { ...(payload as unknown as ApiResponse<T>), correlationId: response.headers?.get("x-correlation-id") ?? correlationId };
  }

  public async uploadRawImage(path: string, file: Blob): Promise<ApiResponse<UploadedMediaDto>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      body: file,
      headers: {
        accept: "application/json",
        "content-type": file.type || "application/octet-stream",
        ...(this.actorCharacterId ? { "x-actor-character-id": this.actorCharacterId } : {}),
      },
    });
    const payload: Record<string, unknown> = await response.json().catch(() => ({}));
    if (!response.ok) { const msg = typeof payload.error === "object" && payload.error !== null && "message" in payload.error ? String((payload.error as Record<string, unknown>).message) : "Image upload failed (" + response.status + ")"; throw new Error(msg); }
    return payload as unknown as ApiResponse<UploadedMediaDto>;
  }

  public uploadImage(file: Blob): Promise<ApiResponse<UploadedMediaDto>> {
    return this.uploadRawImage("/v1/media/images", file);
  }

  public uploadChatImage(file: Blob): Promise<ApiResponse<UploadedMediaDto>> {
    return this.uploadRawImage("/v1/media/chat-images", file);
  }

  public mediaUrl(mediaRef: string): string {
    if (!mediaRef) return "";
    if (mediaRef.startsWith("media://local/")) {
      return `${this.baseUrl}/v1/media/local/${encodeURIComponent(mediaRef.slice("media://local/".length))}`;
    }
    return mediaRef;
  }

  public getWorlds(): Promise<ApiResponse<StoryWorldDto[]>> {
    return this.request("/v1/worlds");
  }

  public getCharacters(storyWorldId: string): Promise<ApiResponse<ApiCharacter[]>> {
    return this.request(`/v1/characters?storyWorldId=${encodeURIComponent(storyWorldId)}`);
  }

  public getRelationships(storyWorldId: string): Promise<ApiResponse<ApiRelationship[]>> {
    return this.request(`/v1/relationships?storyWorldId=${encodeURIComponent(storyWorldId)}`);
  }

  public createRelationship(input: CreateRelationshipEdgeRequest): Promise<ApiResponse<RelationshipEdgeDto>> {
    return this.request("/v1/relationships", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  public updateRelationship(id: string, input: UpdateRelationshipEdgeRequest): Promise<ApiResponse<RelationshipEdgeDto>> {
    return this.request(`/v1/relationships/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  public createWorldEvent(input: CreateWorldEventDefinitionRequest): Promise<ApiResponse<ApiEvent>> {
    return this.request("/v1/world-events", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  public getWorldEvents(storyWorldId: string): Promise<ApiResponse<ApiEvent[]>> {
    return this.request(`/v1/world-events?storyWorldId=${encodeURIComponent(storyWorldId)}`);
  }

  public getWorldLore(storyWorldId: string, query = ""): Promise<ApiResponse<WorldLoreEntryDto[]>> {
    const params = new URLSearchParams({ storyWorldId });
    if (query.trim()) params.set("q", query.trim());
    return this.request(`/v1/world-lore?${params}`);
  }

  public createWorldLore(input: SaveWorldLoreEntryRequest): Promise<ApiResponse<WorldLoreEntryDto>> {
    return this.request("/v1/world-lore", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  public updateWorldLore(id: string, input: UpdateWorldLoreEntryRequest): Promise<ApiResponse<WorldLoreEntryDto>> {
    return this.request(`/v1/world-lore/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  public deleteWorldLore(id: string): Promise<ApiResponse<unknown>> {
    return this.request(`/v1/world-lore/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  public updateWorldEvent(id: string, input: UpdateWorldEventDefinitionRequest): Promise<ApiResponse<ApiEvent>> {
    return this.request(`/v1/world-events/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  public getWorldCalendar(storyWorldId: string, startsAt: string, endsAt: string, limit = 200): Promise<ApiResponse<WorldCalendarDto>> {
    const query = new URLSearchParams({ startsAt, endsAt, limit: String(limit) });
    return this.request(`/v1/worlds/${encodeURIComponent(storyWorldId)}/calendar?${query}`);
  }

  public getCharacterVisualIdentity(characterId: string): Promise<ApiResponse<CharacterVisualIdentityDto>> {
    return this.request(`/v1/characters/${encodeURIComponent(characterId)}/visual-identity`);
  }

  public getWorkflows(): Promise<ApiResponse<ImageWorkflowTemplateDto[]>> {
    return this.request("/v1/comfyui/workflows");
  }

  public validateWorkflow(workflow: unknown): Promise<ApiResponse<ValidateImageWorkflowResultDto>> {
    return this.request("/v1/comfyui/workflows", {
      method: "POST",
      body: JSON.stringify(workflow),
    });
  }

  public switchCharacter(actorSessionId: string, nextCharacterId: string): Promise<ApiResponse<unknown>> {
    return this.request("/v1/actor-sessions/switch", {
      method: "POST",
      body: JSON.stringify({ actorSessionId, nextCharacterId }),
    });
  }

  public getMoments(storyWorldId: string, readerCharacterId: string, limit = 30): Promise<ApiResponse<MomentDto[]>> {
    const query = new URLSearchParams({ storyWorldId, readerCharacterId, limit: String(limit) });
    return this.request(`/v1/moments?${query}`);
  }

  public getMomentInteractions(momentId: string, readerCharacterId: string): Promise<ApiResponse<unknown>> {
    const query = new URLSearchParams({ readerCharacterId });
    return this.request(`/v1/moments/${encodeURIComponent(momentId)}/interactions?${query}`);
  }

  public createMomentInteraction(momentId: string, input: unknown): Promise<ApiResponse<MomentInteractionWriteResultDto>> {
    return this.request(`/v1/moments/${encodeURIComponent(momentId)}/interactions`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  public likeMoment(momentId: string, actorCharacterId: string, idempotencyKey: string): Promise<ApiResponse<{ interactionId: string; inserted: boolean }>> {
    return this.request(`/v1/moments/${encodeURIComponent(momentId)}/like`, {
      method: "PUT",
      body: JSON.stringify({ actorCharacterId, idempotencyKey }),
    });
  }

  public unlikeMoment(momentId: string, actorCharacterId: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.request(`/v1/moments/${encodeURIComponent(momentId)}/like?actorCharacterId=${encodeURIComponent(actorCharacterId)}`, {
      method: "DELETE",
    });
  }

  public getStickerPacks(storyWorldId: string): Promise<ApiResponse<StickerPackDto[]>> {
    return this.request(`/v1/sticker-packs?storyWorldId=${encodeURIComponent(storyWorldId)}`);
  }

  public getImageAssets(storyWorldId: string): Promise<ApiResponse<ImageAssetDto[]>> {
    return this.request(`/v1/image-assets?storyWorldId=${encodeURIComponent(storyWorldId)}`);
  }

  public getConversations(characterId: string): Promise<ApiResponse<ConversationDetailDto[]>> {
    return this.request(`/v1/conversations?characterId=${encodeURIComponent(characterId)}`);
  }

  public getMessages(conversationId: string, characterId: string, signal?: AbortSignal): Promise<ApiResponse<MessageDto[]>> {
    return this.request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages?characterId=${encodeURIComponent(characterId)}`, { ...(signal !== undefined ? { signal } : {}) });
  }

  public importWorkflow(input: { id: string; version: string; workflow: Record<string, unknown>; positivePromptPath?: string[]; negativePromptPath?: string[]; seedPath?: string[] }): Promise<ApiResponse<ImageWorkflowTemplateDto>> {
    return this.request("/v1/comfyui/workflows/import", { method: "POST", body: JSON.stringify(input) });
  }

  public requestConversationImage(conversationId: string, input: RequestConversationImageRequest): Promise<ApiResponse<ImageJobDto>> {
    return this.request(`/v1/conversations/${encodeURIComponent(conversationId)}/image-jobs`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  public getImageJob(jobId: string, signal?: AbortSignal): Promise<ApiResponse<ImageJobDto>> {
    return this.request(`/v1/image-jobs/${encodeURIComponent(jobId)}`, { ...(signal !== undefined ? { signal } : {}) });
  }

  public sendMessage(conversationId: string, input: SendMessageRequest, signal?: AbortSignal): Promise<ApiResponse<{ autoReply?: AutoReplyState }>> {
    return this.request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST",
      body: JSON.stringify(input),
      ...(signal !== undefined ? { signal } : {}),
    });
  }

  public retryAutoReply(conversationId: string, input: { readerCharacterId: string; sourceMessageId?: string }): Promise<ApiResponse<unknown>> {
    return this.request(`/v1/conversations/${encodeURIComponent(conversationId)}/auto-reply/retry`, { method: "POST", body: JSON.stringify(input) });
  }

  public getInteractionLogs(query: Record<string, string | number> = {}): Promise<ApiResponse<unknown>> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") params.set(key, String(value));
    return this.request(`/v1/interaction-logs?${params}`);
  }

  public subscribeInteractionLogs(handlers: { onOpen?: () => void; onEvent?: (event: SseEvent) => void; onError?: (error: unknown) => void; onClose?: () => void } = {}, options: { cursor?: string; lastEventId?: string } = {}): () => void {
    const controller = new AbortController();
    const cursor = options.lastEventId || options.cursor;
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const run = async () => {
      const response = await fetch(`${this.baseUrl}/v1/interaction-logs/stream${query}`, { signal: controller.signal, headers: { accept: "text/event-stream", ...(this.actorCharacterId ? { "x-actor-character-id": this.actorCharacterId } : {}) } });
      if (!response.ok || !response.body) throw new Error(`Log stream failed (${response.status})`);
      handlers.onOpen?.();
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (!controller.signal.aborted) { const { value, done } = await reader.read(); buffer += decoder.decode(value || new Uint8Array(), { stream: !done }); const blocks = buffer.split(/\r?\n\r?\n/); buffer = blocks.pop() || ""; for (const block of blocks) { const event = parseSseBlock(block); if (event) handlers.onEvent?.(event as SseEvent); } if (done) break; }
      if (!controller.signal.aborted) throw new Error("Log stream disconnected");
    };
    void run().catch((error) => { if (!controller.signal.aborted) handlers.onError?.(error); }).finally(() => handlers.onClose?.());
    return () => controller.abort();
  }

  public async streamConversation(conversationId: string, characterId: string, handlers: SseHandlers = {}): Promise<void> {
    const query = new URLSearchParams({ characterId });
    const response = await fetch(
      `${this.baseUrl}/v1/conversations/${encodeURIComponent(conversationId)}/stream?${query}`,
      { headers: {
        accept: "text/event-stream",
        ...(this.actorCharacterId ? { "x-actor-character-id": this.actorCharacterId } : {}),
      } },
    );
    if (!response.ok) {
      const payload: Record<string, unknown> = await response.json().catch(() => ({}));
      const msg = typeof payload.error === "object" && payload.error !== null && "message" in payload.error ? String((payload.error as Record<string, unknown>).message) : "Chat stream failed (" + response.status + ")"; throw new Error(msg);
    }
    if (!response.body) throw new Error("Chat stream response has no body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const event = parseSseBlock(block);
        if (!event) continue;
        if (event.done) handlers.onDone?.();
        else if (event.event === "error") handlers.onError?.(event.data);
        else handlers.onDelta?.(event.data as { content?: string });
      }
      if (done) break;
    }
  }

  public createStoryWorld(input: CreateStoryWorldRequest): Promise<ApiResponse<ApiWorld>> {
    return this.request("/v1/worlds", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  public updateStoryWorld(id: string, input: UpdateStoryWorldRequest): Promise<ApiResponse<ApiWorld>> {
    return this.request(`/v1/worlds/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  public createCharacter(input: CreateCharacterRequest): Promise<ApiResponse<ApiCharacter>> {
    return this.request("/v1/characters", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  public updateCharacter(id: string, input: UpdateCharacterRequest): Promise<ApiResponse<ApiCharacter>> {
    return this.request(`/v1/characters/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  public getStickers(packId: string): Promise<ApiResponse<StickerDto[]>> {
    return this.request(`/v1/sticker-packs/${encodeURIComponent(packId)}/stickers`);
  }

  public importStickerPack(input: CreateStickerPackRequest): Promise<ApiResponse<StickerPackImportResultDto>> {
    return this.request("/v1/sticker-packs", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  public importStickersToPack(packId: string, stickers: readonly CreateStickerInput[]): Promise<ApiResponse<StickerPackImportResultDto>> {
    return this.request(`/v1/sticker-packs/${encodeURIComponent(packId)}/stickers`, {
      method: "POST",
      body: JSON.stringify({ stickers }),
    });
  }

  public getAppearanceSettings(ownerKey = "local-user"): Promise<ApiResponse<AppearanceSettingsDto>> {
    return this.request(`/v1/appearance-settings?ownerKey=${encodeURIComponent(ownerKey)}`);
  }

  public updateAppearanceSettings(input: UpdateAppearanceSettingsRequest, ownerKey = "local-user"): Promise<ApiResponse<AppearanceSettingsDto>> {
    return this.request(`/v1/appearance-settings?ownerKey=${encodeURIComponent(ownerKey)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  public getLlmProviderProfiles(): Promise<ApiResponse<LlmProviderProfileDto[]>> {
    return this.request("/v1/llm-provider-profiles");
  }

  public saveLlmProviderProfile(input: SaveLlmProviderProfileRequest): Promise<ApiResponse<LlmProviderProfileDto>> {
    return this.request("/v1/llm-provider-profiles", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  public testLlmProfile(id: string): Promise<ApiResponse<unknown>> {
    return this.request(`/v1/llm-provider-profiles/${encodeURIComponent(id)}/test`, { method: "POST", body: JSON.stringify({}) });
  }

  public deleteLlmProviderProfile(id: string): Promise<ApiResponse<unknown>> {
    return this.request(`/v1/llm-provider-profiles/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  public getComfyUiSettings(): Promise<ApiResponse<ComfyUiSettingsDto>> {
    return this.request("/v1/comfyui/settings");
  }

  public updateComfyUiSettings(input: UpdateComfyUiSettingsRequest): Promise<ApiResponse<ComfyUiSettingsDto>> {
    return this.request("/v1/comfyui/settings", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  public getCreatorEventCandidates(worldId: string, horizonDays = 7): Promise<ApiResponse<CreatorEventCandidatesDto | CreatorEventCandidateDto[]>> {
    return this.request(`/v1/creator/worlds/${encodeURIComponent(worldId)}/event-candidates?horizonDays=${encodeURIComponent(horizonDays)}`);
  }

  public previewCreatorDispatch(worldId: string, input: { selections: CreatorDispatchSelectionDto[] }): Promise<ApiResponse<EventDispatchPreviewDto>> {
    return this.request(`/v1/creator/worlds/${encodeURIComponent(worldId)}/event-dispatches/preview`, { method: "POST", body: JSON.stringify(input) });
  }

  public createCreatorDispatch(worldId: string, input: { selections: CreatorDispatchSelectionDto[]; idempotencyKey?: string }): Promise<ApiResponse<EventDispatchBatchDto>> {
    return this.request(`/v1/creator/worlds/${encodeURIComponent(worldId)}/event-dispatches`, { method: "POST", body: JSON.stringify(input) });
  }

  public getCreatorDispatch(batchId: string): Promise<ApiResponse<EventDispatchBatchDto>> {
    return this.request(`/v1/creator/event-dispatches/${encodeURIComponent(batchId)}`);
  }

  public getStoryArcs(storyWorldId: string): Promise<ApiResponse<StoryArcDto[]>> {
    return this.request(`/v1/story-arcs?storyWorldId=${encodeURIComponent(storyWorldId)}`);
  }

  public createStoryArc(input: CreateStoryArcRequest): Promise<ApiResponse<StoryArcDto>> {
    return this.request("/v1/story-arcs", { method: "POST", body: JSON.stringify(input) });
  }

  public updateStoryArc(id: string, input: UpdateStoryArcRequest): Promise<ApiResponse<StoryArcDto>> {
    return this.request(`/v1/story-arcs/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) });
  }

  public deleteStoryArc(id: string): Promise<ApiResponse<unknown>> {
    return this.request(`/v1/story-arcs/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  public getStoryNodes(storyWorldId: string, arcId = ""): Promise<ApiResponse<StoryNodeDto[]>> {
    const params = new URLSearchParams({ storyWorldId });
    if (arcId) params.set("arcId", arcId);
    return this.request(`/v1/story-nodes?${params}`);
  }

  public createStoryNode(input: CreateStoryNodeRequest): Promise<ApiResponse<StoryNodeDto>> {
    return this.request("/v1/story-nodes", { method: "POST", body: JSON.stringify(input) });
  }

  public updateStoryNode(id: string, input: UpdateStoryNodeRequest): Promise<ApiResponse<StoryNodeDto>> {
    return this.request(`/v1/story-nodes/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) });
  }

  public deleteStoryNode(id: string): Promise<ApiResponse<unknown>> {
    return this.request(`/v1/story-nodes/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  public getStoryEdges(arcId: string): Promise<ApiResponse<StoryEdgeDto[]>> {
    return this.request(`/v1/story-edges?arcId=${encodeURIComponent(arcId)}`);
  }

  public createStoryEdge(input: CreateStoryEdgeRequest): Promise<ApiResponse<StoryEdgeDto>> {
    return this.request("/v1/story-edges", { method: "POST", body: JSON.stringify(input) });
  }

  public updateStoryEdge(id: string, input: UpdateStoryEdgeRequest): Promise<ApiResponse<StoryEdgeDto>> {
    return this.request(`/v1/story-edges/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) });
  }

  public deleteStoryEdge(id: string): Promise<ApiResponse<unknown>> {
    return this.request(`/v1/story-edges/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  public getPromptTemplates(storyWorldId: string): Promise<ApiResponse<PromptTemplateDto[]>> {
    return this.request(`/v1/prompt-templates?storyWorldId=${encodeURIComponent(storyWorldId)}`);
  }

  public createPromptTemplate(input: CreatePromptTemplateRequest): Promise<ApiResponse<PromptTemplateDto>> {
    return this.request("/v1/prompt-templates", { method: "POST", body: JSON.stringify(input) });
  }

  public updatePromptTemplate(id: string, input: UpdatePromptTemplateRequest): Promise<ApiResponse<PromptTemplateDto>> {
    return this.request(`/v1/prompt-templates/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) });
  }

  public deletePromptTemplate(id: string): Promise<ApiResponse<unknown>> {
    return this.request(`/v1/prompt-templates/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  public getPromptPreview(storyWorldId: string, arcId = "", nodeId = ""): Promise<ApiResponse<PromptPreviewDto>> {
    const params = new URLSearchParams({ storyWorldId });
    if (arcId) params.set("arcId", arcId);
    if (nodeId) params.set("nodeId", nodeId);
    return this.request(`/v1/prompt-preview?${params}`);
  }

  public getMemoryCandidates(storyWorldId: string): Promise<ApiResponse<MemoryCandidateDto[]>> {
    return this.request(`/v1/memory-candidates?storyWorldId=${encodeURIComponent(storyWorldId)}`);
  }

  public createMemoryCandidate(input: CreateMemoryCandidateRequest): Promise<ApiResponse<MemoryCandidateDto>> {
    return this.request("/v1/memory-candidates", { method: "POST", body: JSON.stringify(input) });
  }

  public reviewMemoryCandidate(id: string, input: ReviewMemoryCandidateRequest): Promise<ApiResponse<MemoryCandidateDto>> {
    return this.request(`/v1/memory-candidates/${encodeURIComponent(id)}/review`, { method: "POST", body: JSON.stringify(input) });
  }
}

export function parseSseBlock(block: string): SseEvent | undefined {
  let event = "message"; let id: string | undefined; const data: string[] = [];
  for (const line of block.split(/\r?\n/)) { if (line.startsWith("event:")) event = line.slice(6).trim(); else if (line.startsWith("id:")) id = line.slice(3).trim(); else if (line.startsWith("data:")) data.push(line.slice(5).trimStart()); }
  if (data.length === 0) return undefined; const payload = data.join("\n"); if (payload === "[DONE]") return { event, ...(id ? { id } : {}), done: true };
  try { return { event, ...(id ? { id } : {}), done: false, data: JSON.parse(payload) }; } catch { return { event: "error", ...(id ? { id } : {}), done: false, data: { code: "INVALID_SSE", message: "Invalid SSE payload" } }; }
}
