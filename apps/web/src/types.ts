import type {
  AppearanceSettingsDto,
  ComfyUiSettingsDto,
  CharacterDto,
  ConversationDetailDto,
  ImageWorkflowTemplateDto,
  ImageJobDto,
  MomentDto,
  RelationshipEdgeDto,
  StickerDto,
  StickerPackDto,
  StoryWorldDto,
  WorldCalendarDto,
  WorldEventDefinitionDto,
  WorldLoreEntryDto,
  LlmProviderProfileDto,
} from "../../../packages/contracts/src/index.ts";

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
export type ApiLlmProviderProfile = LlmProviderProfileDto;
export type ApiComfyUiSettings = ComfyUiSettingsDto;

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
