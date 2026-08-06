import type {
  CharacterDto,
  ConversationDetailDto,
  ImageWorkflowTemplateDto,
  MomentDto,
  RelationshipEdgeDto,
  StickerDto,
  StickerPackDto,
  StoryWorldDto,
  WorldCalendarDto,
  WorldEventDefinitionDto,
} from "../../../packages/contracts/src/index.ts";

export type ApiWorld = StoryWorldDto;
export type ApiCharacter = CharacterDto;
export type ApiRelationship = RelationshipEdgeDto;
export type ApiMoment = MomentDto;
export type ApiConversation = ConversationDetailDto;
export type ApiCalendar = WorldCalendarDto;
export type ApiEvent = WorldEventDefinitionDto;
export type ApiWorkflow = ImageWorkflowTemplateDto;

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
