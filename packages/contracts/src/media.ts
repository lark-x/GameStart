import type { CharacterId, StickerId, StickerPackId, StoryWorldId, VisualIdentityId, WorkflowTemplateId } from "./ids.ts";

export interface CharacterVisualIdentityDto {
  id: VisualIdentityId;
  characterId: CharacterId;
  storyWorldId: StoryWorldId;
  positivePrompt: string;
  negativePrompt?: string;
  styleTags: readonly string[];
  referenceImageRefs: readonly string[];
  revision: number;
  updatedAt: string;
}

export interface ImageWorkflowTemplateDto {
  id: WorkflowTemplateId;
  version: string;
  workflow: Record<string, unknown>;
  positivePromptPath: readonly string[];
  negativePromptPath?: readonly string[];
  seedPath?: readonly string[];
}

export interface CompiledImageWorkflowDto {
  workflowVersion: string;
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  workflow: Record<string, unknown>;
}

export type ValidateImageWorkflowRequest = ImageWorkflowTemplateDto;

export interface ValidateImageWorkflowResultDto {
  valid: true;
  id: WorkflowTemplateId;
  version: string;
  checkedBindings: readonly string[];
}

export interface StickerPackDto {
  id: StickerPackId;
  storyWorldId: StoryWorldId;
  name: string;
  sourceRef?: string;
  createdAt: string;
}

export interface StickerDto {
  id: StickerId;
  packId: StickerPackId;
  storyWorldId: StoryWorldId;
  label: string;
  mediaRef: string;
  tags: readonly string[];
  createdAt: string;
}

export interface CreateStickerInput {
  id: StickerId;
  label: string;
  mediaRef: string;
  tags?: readonly string[];
}

export interface CreateStickerPackRequest {
  id: StickerPackId;
  storyWorldId: StoryWorldId;
  name: string;
  sourceRef?: string;
  createdAt: string;
  stickers: readonly CreateStickerInput[];
}

export interface StickerPackImportResultDto {
  pack: StickerPackDto;
  stickers: readonly StickerDto[];
}
