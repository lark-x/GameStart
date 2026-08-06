import type {
  ApiCharacter,
  ApiEvent,
  ApiRelationship,
  ApiWorld,
} from "./types";
import type {
  CharacterVisualIdentityDto,
  CreateCharacterRequest,
  CreateRelationshipEdgeRequest,
  CreateStoryWorldRequest,
  CreateWorldEventDefinitionRequest,
  ConversationDetailDto,
  ImageWorkflowTemplateDto,
  MessageDto,
  MomentDto,
  MomentInteractionWriteResultDto,
  RelationshipEdgeDto,
  SendMessageRequest,
  StickerDto,
  StickerPackDto,
  StoryWorldDto,
  UpdateCharacterRequest,
  UpdateRelationshipEdgeRequest,
  UpdateStoryWorldRequest,
  UpdateWorldEventDefinitionRequest,
  ValidateImageWorkflowResultDto,
  WorldCalendarDto,
} from "../../../packages/contracts/src/index.ts";

export interface ApiResponse<T> {
  data: T;
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
  public getWorldCalendar(storyWorldId: string, startsAt: string, endsAt: string, limit?: number): Promise<ApiResponse<WorldCalendarDto>>;
  public getCharacterVisualIdentity(characterId: string): Promise<ApiResponse<CharacterVisualIdentityDto>>;
  public getWorkflows(): Promise<ApiResponse<ImageWorkflowTemplateDto[]>>;
  public validateWorkflow(workflow: unknown): Promise<ApiResponse<ValidateImageWorkflowResultDto>>;
  public switchCharacter(actorSessionId: string, nextCharacterId: string): Promise<ApiResponse<unknown>>;
  public getMoments(storyWorldId: string, readerCharacterId: string, limit?: number): Promise<ApiResponse<MomentDto[]>>;
  public createMomentInteraction(momentId: string, input: unknown): Promise<ApiResponse<MomentInteractionWriteResultDto>>;
  public getStickerPacks(storyWorldId: string): Promise<ApiResponse<StickerPackDto[]>>;
  public getStickers(packId: string): Promise<ApiResponse<StickerDto[]>>;
  public getConversations(characterId: string): Promise<ApiResponse<ConversationDetailDto[]>>;
  public getMessages(conversationId: string, characterId: string): Promise<ApiResponse<MessageDto[]>>;
  public sendMessage(conversationId: string, input: SendMessageRequest): Promise<ApiResponse<unknown>>;
  public streamConversation(conversationId: string, characterId: string, handlers?: SseHandlers): Promise<void>;
  public createStoryWorld(input: CreateStoryWorldRequest): Promise<ApiResponse<ApiWorld>>;
  public updateStoryWorld(id: string, input: UpdateStoryWorldRequest): Promise<ApiResponse<ApiWorld>>;
  public createCharacter(input: CreateCharacterRequest): Promise<ApiResponse<ApiCharacter>>;
  public updateCharacter(id: string, input: UpdateCharacterRequest): Promise<ApiResponse<ApiCharacter>>;
}

export function parseSseBlock(block: string): unknown;
