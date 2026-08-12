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

export class ApiClient {
  public constructor(baseUrl: string, actorCharacterId?: string);
  public setActorCharacterId(actorCharacterId: string): void;
  public getWorlds(): Promise<ApiResponse<StoryWorldDto[]>>;
  public getCharacters(storyWorldId: string): Promise<ApiResponse<ApiCharacter[]>>;
  public getRelationships(storyWorldId: string): Promise<ApiResponse<ApiRelationship[]>>;
  public createRelationship(input: CreateRelationshipEdgeRequest): Promise<ApiResponse<RelationshipEdgeDto>>;
  public updateRelationship(id: string, input: UpdateRelationshipEdgeRequest): Promise<ApiResponse<RelationshipEdgeDto>>;
  public createWorldEvent(input: CreateWorldEventDefinitionRequest): Promise<ApiResponse<ApiEvent>>;
  public getWorldEvents(storyWorldId: string): Promise<ApiResponse<ApiEvent[]>>;
  public updateWorldEvent(id: string, input: UpdateWorldEventDefinitionRequest): Promise<ApiResponse<ApiEvent>>;
  public getWorldLore(storyWorldId: string, query?: string): Promise<ApiResponse<WorldLoreEntryDto[]>>;
  public createWorldLore(input: SaveWorldLoreEntryRequest): Promise<ApiResponse<WorldLoreEntryDto>>;
  public updateWorldLore(id: string, input: UpdateWorldLoreEntryRequest): Promise<ApiResponse<WorldLoreEntryDto>>;
  public deleteWorldLore(id: string): Promise<ApiResponse<unknown>>;
  public getWorldCalendar(storyWorldId: string, startsAt: string, endsAt: string, limit?: number): Promise<ApiResponse<WorldCalendarDto>>;
  public getCharacterVisualIdentity(characterId: string): Promise<ApiResponse<CharacterVisualIdentityDto>>;
  public getWorkflows(): Promise<ApiResponse<ImageWorkflowTemplateDto[]>>;
  public validateWorkflow(workflow: unknown): Promise<ApiResponse<ValidateImageWorkflowResultDto>>;
  public importWorkflow(input: { id: string; version: string; workflow: Record<string, unknown>; positivePromptPath?: string[]; negativePromptPath?: string[]; seedPath?: string[] }): Promise<ApiResponse<ImageWorkflowTemplateDto>>;
  public switchCharacter(actorSessionId: string, nextCharacterId: string): Promise<ApiResponse<unknown>>;
  public getMoments(storyWorldId: string, readerCharacterId: string, limit?: number): Promise<ApiResponse<MomentDto[]>>;
  public createMomentInteraction(momentId: string, input: unknown): Promise<ApiResponse<MomentInteractionWriteResultDto>>;
  public getStickerPacks(storyWorldId: string): Promise<ApiResponse<StickerPackDto[]>>;
  public getImageAssets(storyWorldId: string): Promise<ApiResponse<ImageAssetDto[]>>;
  public getStickers(packId: string): Promise<ApiResponse<StickerDto[]>>;
  public importStickerPack(input: CreateStickerPackRequest): Promise<ApiResponse<StickerPackImportResultDto>>;
  public importStickersToPack(packId: string, stickers: readonly CreateStickerInput[]): Promise<ApiResponse<StickerPackImportResultDto>>;
  public getConversations(characterId: string): Promise<ApiResponse<ConversationDetailDto[]>>;
  public getMessages(conversationId: string, characterId: string, signal?: AbortSignal): Promise<ApiResponse<MessageDto[]>>;
  public uploadImage(file: Blob): Promise<ApiResponse<UploadedMediaDto>>;
  public uploadChatImage(file: Blob): Promise<ApiResponse<UploadedMediaDto>>;
  public mediaUrl(mediaRef: string): string;
  public requestConversationImage(conversationId: string, input: RequestConversationImageRequest): Promise<ApiResponse<ImageJobDto>>;
  public getImageJob(jobId: string, signal?: AbortSignal): Promise<ApiResponse<ImageJobDto>>;
  public sendMessage(conversationId: string, input: SendMessageRequest, signal?: AbortSignal): Promise<ApiResponse<{ autoReply?: AutoReplyState }>>;
  public retryAutoReply(conversationId: string, input: { readerCharacterId: string; sourceMessageId?: string }): Promise<ApiResponse<unknown>>;
  public getInteractionLogs(query?: Record<string, string | number>): Promise<ApiResponse<unknown>>;
  public subscribeInteractionLogs(handlers?: { onOpen?: () => void; onEvent?: (event: SseEvent) => void; onError?: (error: unknown) => void; onClose?: () => void }, options?: { cursor?: string; lastEventId?: string }): () => void;
  public streamConversation(conversationId: string, characterId: string, handlers?: SseHandlers): Promise<void>;
  public createStoryWorld(input: CreateStoryWorldRequest): Promise<ApiResponse<ApiWorld>>;
  public updateStoryWorld(id: string, input: UpdateStoryWorldRequest): Promise<ApiResponse<ApiWorld>>;
  public createCharacter(input: CreateCharacterRequest): Promise<ApiResponse<ApiCharacter>>;
  public updateCharacter(id: string, input: UpdateCharacterRequest): Promise<ApiResponse<ApiCharacter>>;
  public getAppearanceSettings(ownerKey?: string): Promise<ApiResponse<AppearanceSettingsDto>>;
  public updateAppearanceSettings(input: UpdateAppearanceSettingsRequest, ownerKey?: string): Promise<ApiResponse<AppearanceSettingsDto>>;
  public getLlmProviderProfiles(): Promise<ApiResponse<LlmProviderProfileDto[]>>;
  public saveLlmProviderProfile(input: SaveLlmProviderProfileRequest): Promise<ApiResponse<LlmProviderProfileDto>>;
  public deleteLlmProviderProfile(id: string): Promise<ApiResponse<unknown>>;
  public testLlmProfile(id: string): Promise<ApiResponse<unknown>>;
  public getComfyUiSettings(): Promise<ApiResponse<ComfyUiSettingsDto>>;
  public updateComfyUiSettings(input: UpdateComfyUiSettingsRequest): Promise<ApiResponse<ComfyUiSettingsDto>>;
  public getCreatorEventCandidates(
    worldId: string,
    horizonDays?: number,
  ): Promise<ApiResponse<CreatorEventCandidatesDto | CreatorEventCandidateDto[]>>;
  public previewCreatorDispatch(
    worldId: string,
    input: { selections: CreatorDispatchSelectionDto[] },
  ): Promise<ApiResponse<EventDispatchPreviewDto>>;
  public createCreatorDispatch(
    worldId: string,
    input: { selections: CreatorDispatchSelectionDto[]; idempotencyKey?: string },
  ): Promise<ApiResponse<EventDispatchBatchDto>>;
  public getCreatorDispatch(batchId: string): Promise<ApiResponse<EventDispatchBatchDto>>;
  public getStoryArcs(storyWorldId: string): Promise<ApiResponse<StoryArcDto[]>>;
  public createStoryArc(input: CreateStoryArcRequest): Promise<ApiResponse<StoryArcDto>>;
  public updateStoryArc(id: string, input: UpdateStoryArcRequest): Promise<ApiResponse<StoryArcDto>>;
  public deleteStoryArc(id: string): Promise<ApiResponse<unknown>>;
  public getStoryNodes(storyWorldId: string, arcId?: string): Promise<ApiResponse<StoryNodeDto[]>>;
  public createStoryNode(input: CreateStoryNodeRequest): Promise<ApiResponse<StoryNodeDto>>;
  public updateStoryNode(id: string, input: UpdateStoryNodeRequest): Promise<ApiResponse<StoryNodeDto>>;
  public deleteStoryNode(id: string): Promise<ApiResponse<unknown>>;
  public getStoryEdges(arcId: string): Promise<ApiResponse<StoryEdgeDto[]>>;
  public createStoryEdge(input: CreateStoryEdgeRequest): Promise<ApiResponse<StoryEdgeDto>>;
  public updateStoryEdge(id: string, input: UpdateStoryEdgeRequest): Promise<ApiResponse<StoryEdgeDto>>;
  public deleteStoryEdge(id: string): Promise<ApiResponse<unknown>>;
  public getPromptTemplates(storyWorldId: string): Promise<ApiResponse<PromptTemplateDto[]>>;
  public createPromptTemplate(input: CreatePromptTemplateRequest): Promise<ApiResponse<PromptTemplateDto>>;
  public updatePromptTemplate(id: string, input: UpdatePromptTemplateRequest): Promise<ApiResponse<PromptTemplateDto>>;
  public deletePromptTemplate(id: string): Promise<ApiResponse<unknown>>;
  public getPromptPreview(storyWorldId: string, arcId?: string, nodeId?: string): Promise<ApiResponse<PromptPreviewDto>>;
  public getMemoryCandidates(storyWorldId: string): Promise<ApiResponse<MemoryCandidateDto[]>>;
  public createMemoryCandidate(input: CreateMemoryCandidateRequest): Promise<ApiResponse<MemoryCandidateDto>>;
  public reviewMemoryCandidate(id: string, input: ReviewMemoryCandidateRequest): Promise<ApiResponse<MemoryCandidateDto>>;
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

export function parseSseBlock(block: string): unknown;
