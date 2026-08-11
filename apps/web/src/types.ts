import type {
  AppearanceSettingsDto,
  CharacterDto,
  ComfyUiSettingsDto,
  ConversationDetailDto,
  CreatorEventCandidateDto as ContractCreatorEventCandidateDto,
  EventDispatchAction,
  EventDispatchBatchDto as ContractEventDispatchBatchDto,
  EventDispatchPreviewDto as ContractEventDispatchPreviewDto,
  EventDispatchSelectionDto,
  ImageJobDto,
  ImageAssetDto,
  ImageWorkflowTemplateDto,
  LlmProviderProfileDto,
  MomentDto,
  RelationshipEdgeDto,
  StickerDto,
  StickerPackDto,
  StoryWorldDto,
  WorldCalendarDto,
  WorldEventDefinitionDto,
  InteractionLogDto, InteractionLogPageDto, ProviderConnectionTestResultDto,
  WorldLoreEntryDto,
} from "@living-network/contracts";

export type ApiWorld = StoryWorldDto;
export type ApiAppearanceSettings = AppearanceSettingsDto;
export type ApiCharacter = CharacterDto;
export type ApiRelationship = RelationshipEdgeDto;
export type ApiMoment = MomentDto;
export type ApiConversation = ConversationDetailDto;
export type ApiCalendar = WorldCalendarDto;
export type ApiEvent = WorldEventDefinitionDto;
export type ApiWorldLore = WorldLoreEntryDto;
export type ApiWorkflow = ImageWorkflowTemplateDto;
export type ApiImageJob = ImageJobDto;
export type ApiImageAsset = ImageAssetDto;
export type ApiLlmProviderProfile = LlmProviderProfileDto;
export type ApiComfyUiSettings = ComfyUiSettingsDto;
export type ApiInteractionLog = InteractionLogDto;
export type ApiInteractionLogPage = InteractionLogPageDto;
export type ApiProviderTest = ProviderConnectionTestResultDto;

export type CreatorDispatchAction = EventDispatchAction;
export type CreatorEventCandidateDto = ContractCreatorEventCandidateDto;
export type CreatorDispatchSelectionDto = EventDispatchSelectionDto;
export type EventDispatchPreviewDto = ContractEventDispatchPreviewDto;
export type EventDispatchBatchDto = ContractEventDispatchBatchDto;

export interface CreatorEventCandidatesDto {
  candidates: readonly CreatorEventCandidateDto[];
  dispatchAvailable?: boolean;
  workerStatus?: string;
}

export interface ApiStickerPack extends StickerPackDto {
  _stickers?: StickerDto[];
}

export interface ApiMessage {
  id: string;
  authorCharacterId?: string;
  kind: string;
  text?: string;
  mediaRef?: string;
  stickerId?: string;
  createdAt: string;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
