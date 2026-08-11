import {
  cloneJsonObject,
  type AppearanceSettings,
  type Character,
  type CharacterVisualIdentity,
  type ComfyUiSettings,
  type ConversationAggregate,
  type ImageJob,
  type ImageWorkflowTemplate,
  type LlmProviderProfile,
  type Message,
  type Moment,
  type MomentInteraction,
  type RelationshipEdge,
  type ScheduledOccurrence,
  type Sticker,
  type StickerPack,
  type StoryWorld,
  type WorldEventDefinition,
  type WorldLoreEntry,
  type BehaviorAction,
  type ActorSession,
} from "@living-network/domain";
import { ImageAssetCategory } from "@living-network/contracts";
import type {
  ActorSessionDto,
  AppearanceSettingsDto,
  CharacterDto,
  CharacterVisualIdentityDto,
  ComfyUiSettingsDto,
  ConversationDetailDto,
  ImageAssetDto,
  ImageJobDto,
  ImageWorkflowTemplateDto,
  LlmProviderProfileDto,
  MessageDto,
  MomentDto,
  MomentInteractionDto,
  RelationshipEdgeDto,
  ScheduledOccurrenceDto,
  StickerDto,
  StickerPackDto,
  StickerPackImportResultDto,
  StoryWorldDto,
  WorldEventDefinitionDto,
  WorldLoreEntryDto,
} from "@living-network/contracts";
import { ApiError } from "./helpers.ts";

const SECRET_MASK = "********";

export function toWorldDto(world: StoryWorld): StoryWorldDto {
  return { ...world };
}

export function toCharacterDto(character: Character): CharacterDto {
  return { ...character };
}

export function toRelationshipEdgeDto(edge: RelationshipEdge): RelationshipEdgeDto {
  return { ...edge, initialState: { ...edge.initialState } };
}

export function toWorldEventDefinitionDto(definition: WorldEventDefinition): WorldEventDefinitionDto {
  return {
    ...definition,
    recurrence: { ...definition.recurrence },
    targetCharacterIds: [...definition.targetCharacterIds],
    recipientCharacterIds: [...definition.recipientCharacterIds],
    outputs: { ...definition.outputs },
  };
}

export function toScheduledOccurrenceDto(occurrence: ScheduledOccurrence): ScheduledOccurrenceDto {
  return { ...occurrence };
}

export function toSessionDto(session: ActorSession): ActorSessionDto {
  return { ...session };
}

export function toConversationDto(aggregate: ConversationAggregate): ConversationDetailDto {
  return {
    conversation: { ...aggregate.conversation },
    members: aggregate.members.map((member) => ({ ...member })),
  };
}

export function toMessageDto(message: Message): MessageDto {
  return { ...message };
}

export function toMomentDto(moment: Moment): MomentDto {
  return {
    ...moment,
    audienceCharacterIds: [...moment.audienceCharacterIds],
  };
}

export function toMomentInteractionDto(interaction: MomentInteraction): MomentInteractionDto {
  return { ...interaction };
}

export function toCharacterVisualIdentityDto(
  identity: CharacterVisualIdentity,
): CharacterVisualIdentityDto {
  return {
    ...identity,
    styleTags: [...identity.styleTags],
    referenceImageRefs: [...identity.referenceImageRefs],
  };
}

export function toImageWorkflowTemplateDto(
  template: ImageWorkflowTemplate,
): ImageWorkflowTemplateDto {
  return {
    id: template.id,
    version: template.version,
    workflow: cloneJsonObject(template.workflow) as Record<string, unknown>,
    positivePromptPath: [...template.positivePromptPath],
    ...(template.negativePromptPath === undefined
      ? {}
      : { negativePromptPath: [...template.negativePromptPath] }),
    ...(template.seedPath === undefined ? {} : { seedPath: [...template.seedPath] }),
  };
}

export function toImageJobDto(job: ImageJob): ImageJobDto {
  return { ...job };
}

export function toImageAssetDto(
  job: ImageJob,
  action: BehaviorAction,
): ImageAssetDto {
  if (job.mediaRef === undefined) {
    throw new ApiError(500, "INTERNAL_ERROR", "Completed image job is missing media");
  }
  const conversationId =
    typeof action.payload.conversationId === "string" &&
    action.payload.conversationId.trim()
      ? action.payload.conversationId
      : undefined;
  const recipientCharacterId =
    typeof action.payload.recipientCharacterId === "string" &&
    action.payload.recipientCharacterId.trim()
      ? action.payload.recipientCharacterId
      : undefined;
  const category =
    conversationId !== undefined
      ? ImageAssetCategory.CHAT
      : job.momentDraftId !== undefined
        ? ImageAssetCategory.MOMENT
        : ImageAssetCategory.EVENT;
  return {
    id: job.id,
    category,
    storyWorldId: job.storyWorldId,
    ownerCharacterId: job.ownerCharacterId,
    subjectCharacterId: recipientCharacterId ?? job.ownerCharacterId,
    ...(conversationId === undefined ? {} : { conversationId }),
    ...(job.momentDraftId === undefined ? {} : { momentDraftId: job.momentDraftId }),
    workflowVersion: job.workflowVersion,
    prompt: job.prompt,
    ...(job.negativePrompt === undefined ? {} : { negativePrompt: job.negativePrompt }),
    ...(job.seed === undefined ? {} : { seed: job.seed }),
    mediaRef: job.mediaRef,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export function toStickerPackDto(pack: StickerPack): StickerPackDto {
  return { ...pack };
}

export function toStickerDto(sticker: Sticker): StickerDto {
  return { ...sticker, tags: [...sticker.tags] };
}

export function toStickerPackImportResult(
  pack: StickerPack,
  stickers: readonly Sticker[],
): StickerPackImportResultDto {
  return { pack: toStickerPackDto(pack), stickers: stickers.map(toStickerDto) };
}

export function toAppearanceSettingsDto(
  settings: AppearanceSettings,
): AppearanceSettingsDto {
  return { ...settings, chatBackground: { ...settings.chatBackground } };
}

export function toWorldLoreEntryDto(entry: WorldLoreEntry): WorldLoreEntryDto {
  return { ...entry, tags: [...entry.tags] };
}

export function toLlmProviderProfileDto(
  profile: LlmProviderProfile,
  source: LlmProviderProfileDto["source"] = "database",
): LlmProviderProfileDto {
  const hasApiKey =
    profile.encryptedApiKey !== undefined && profile.encryptionIv !== undefined;
  return {
    id: profile.id,
    name: profile.name,
    protocol: profile.protocol,
    baseUrl: profile.baseUrl,
    model: profile.model,
    timeoutMs: profile.timeoutMs,
    maxTokens: profile.maxTokens,
    temperature: profile.temperature,
    isActive: profile.isActive,
    hasApiKey,
    ...(hasApiKey ? { apiKeyMask: SECRET_MASK } : {}),
    source,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export function toComfyUiSettingsDto(settings: ComfyUiSettings): ComfyUiSettingsDto {
  return {
    id: "default",
    baseUrl: settings.baseUrl,
    timeoutMs: settings.timeoutMs,
    ...(settings.defaultWorkflowVersion === undefined
      ? {}
      : { defaultWorkflowVersion: settings.defaultWorkflowVersion }),
    autoImageIntentEnabled: settings.autoImageIntentEnabled,
    updatedAt: settings.updatedAt,
  };
}
