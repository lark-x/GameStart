import {
  createMomentInteraction as createMomentInteractionDomain,
  createConversation as createConversationDomain,
  createMessage as createMessageDomain,
  createAppearanceSettings as createAppearanceSettingsDomain,
  createDefaultAppearanceSettings,
  createLlmProviderProfile as createLlmProviderProfileDomain,
  createComfyUiSettings as createComfyUiSettingsDomain,
  createWorldLoreEntry as createWorldLoreEntryDomain,
  ChatBackgroundKind,
  LlmProviderProtocol,
  DEFAULT_APPEARANCE_OWNER_KEY,
  switchActorCharacter as applyActorCharacterSwitch,
  type ActorSession,
  type AppearanceSettings,
  type ComfyUiSettings,
  type LlmProviderProfile,
  type Character,
  type ConversationAggregate,
  type Message,
  type Moment,
  type MomentInteraction,
  type RelationshipEdge,
  type ScheduledOccurrence,
  type WorldEventDefinition,
  type WorldLoreEntry,
  isMomentVisibleTo,
  cloneJsonObject,
  createSticker as createStickerDomain,
  createStickerPack as createStickerPackDomain,
  createImageWorkflowTemplate,
  importImageWorkflow,
  createRelationshipEdge as createRelationshipEdgeDomain,
  createWorldEventDefinition as createWorldEventDefinitionDomain,
  createScheduledOccurrence,
  createEventExecution,
  createBehaviorAction,
  createImageJob,
  canConsumeProactiveMessages,
  ActionKind,
  EventRecurrenceKind,
  ScheduledOccurrenceStatus,
  TriggerSource,
  createStoryWorld as createStoryWorldDomain,
  createCharacter as createCharacterDomain,
  assertImageWorkflowTemplateBindings,
  type JsonObject,
  type StoryWorld,
  CharacterRole,
  MessageKind,
} from "@living-network/domain";
import {
  ProviderError,
  SecretCipher,
  type ChatDelta,
  type ChatProvider,
} from "@living-network/ai";
import { ImageAssetCategory } from "@living-network/contracts";
import type {
  ActorSessionDto,
  ActorSessionSwitchRequest,
  CharacterDto,
  CharacterId,
  ConversationDetailDto,
  CreateConversationRequest,
  MessageDto,
  SendMessageRequest,
  SendMessageResultDto,
  RequestConversationImageRequest,
  StoryWorldDto,
  CreateMomentInteractionRequest,
  MomentDto,
  MomentInteractionDto,
  MomentInteractionWriteResultDto,
  CharacterVisualIdentityDto,
  ImageWorkflowTemplateDto,
  ImageJobDto,
  ImageAssetDto,
  StickerPackDto,
  StickerDto,
  CreateStickerPackRequest,
  CreateStickerInput,
  StickerPackImportResultDto,
  RelationshipEdgeDto,
  WorldCalendarDto,
  ScheduledOccurrenceDto,
  WorldEventDefinitionDto,
  ValidateImageWorkflowRequest,
  ValidateImageWorkflowResultDto,
  AppearanceSettingsDto,
  ChatBackgroundSettingsDto,
  UpdateAppearanceSettingsRequest,
  LlmProviderProfileDto,
  SaveLlmProviderProfileRequest,
  ComfyUiSettingsDto,
  UpdateComfyUiSettingsRequest,
  WorldLoreEntryDto,
  CreateWorldLoreEntryRequest,
  UpdateWorldLoreEntryRequest,
  CreateStoryWorldRequest,
  UpdateStoryWorldRequest,
  CreateCharacterRequest,
  UpdateCharacterRequest,
  CreateRelationshipEdgeRequest,
  UpdateRelationshipEdgeRequest,
  CreateWorldEventDefinitionRequest,
  UpdateWorldEventDefinitionRequest,
  EventRecurrenceDto,
  CreatorEventCandidateDto,
  EventDispatchPreviewDto,
  EventDispatchBatchDto,
  EventDispatchBatchItemDto,
  EventDispatchBatchStatus,
  EventDispatchItemStatus,
  EventDispatchSelectionDto,
  CreateEventDispatchBatchRequest,
  InteractionLogDto,
  InteractionLogQuery,
  ProviderConnectionTestResultDto,
} from "@living-network/contracts";
import { ApiMediaStore, type StoredMedia } from "./media-store.ts";
import {
  createInMemoryRepositories,
  type DomainRepositories,
  type InMemoryRepositorySeed,
  type ExecutionDispatchRequest,
} from "@living-network/database";
import { InMemoryInteractionLogRepository, previewMessage, type InteractionLogRepository } from "@living-network/database";
import { createProviderFromProfile } from "@living-network/ai";
import { InteractionLogging } from "./interaction-logging.ts";
import { encodeInteractionLogCursor } from "@living-network/database";
import { ConversationOrchestrator } from "./conversation-orchestrator.ts";
import type { ConversationOrchestratorOptions, ConversationReply, ConversationReplyContext, ResolvedMessageMedia } from "./conversation-orchestrator.ts";
import { assistantReplyId, automaticReplyFlightKey, findEligibleAi, isEligibleSource, type AutomaticReplyState, type AutomaticReplyTrace, type RetryAutomaticReplyState } from "./auto-reply.ts";
import { promptForExplicitChatImageIntent } from "./auto-image-intent.ts";
import {
  previewCreatorEventDispatch,
  scanCreatorEventCandidates,
} from "./creator-events.ts";

export type ApiSeed = InMemoryRepositorySeed;

export type ApiStore = DomainRepositories;
export interface SendMessageWithAutoReplyResult extends SendMessageResultDto {
  readonly autoReply: AutomaticReplyState;
}

interface ScheduledAutomaticReply {
  readonly state: AutomaticReplyState;
  readonly completion?: Promise<ConversationReply>;
}

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "SERVICE_UNAVAILABLE"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "NOT_IMPLEMENTED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ApiErrorCode;

  public constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function createApiStore(seed: ApiSeed = {}): ApiStore {
  return createInMemoryRepositories(seed);
}

function toWorldDto(world: StoryWorld): StoryWorldDto {
  return { ...world };
}

function toCharacterDto(character: Character): CharacterDto {
  return { ...character };
}

function toRelationshipEdgeDto(edge: RelationshipEdge): RelationshipEdgeDto {
  return { ...edge, initialState: { ...edge.initialState } };
}

function toWorldEventDefinitionDto(definition: WorldEventDefinition): WorldEventDefinitionDto {
  return {
    ...definition,
    recurrence: { ...definition.recurrence },
    targetCharacterIds: [...definition.targetCharacterIds],
    recipientCharacterIds: [...definition.recipientCharacterIds],
    outputs: { ...definition.outputs },
  };
}

function toScheduledOccurrenceDto(occurrence: ScheduledOccurrence): ScheduledOccurrenceDto {
  return { ...occurrence };
}

function toSessionDto(session: ActorSession): ActorSessionDto {
  return { ...session };
}

function toConversationDto(aggregate: ConversationAggregate): ConversationDetailDto {
  return {
    conversation: { ...aggregate.conversation },
    members: aggregate.members.map((member) => ({ ...member })),
  };
}

function toMessageDto(message: Message): MessageDto {
  return { ...message };
}

function toMomentDto(moment: Moment): MomentDto {
  return {
    ...moment,
    audienceCharacterIds: [...moment.audienceCharacterIds],
  };
}

function toMomentInteractionDto(interaction: MomentInteraction): MomentInteractionDto {
  return { ...interaction };
}

function toCharacterVisualIdentityDto(
  identity: import("@living-network/domain").CharacterVisualIdentity,
): CharacterVisualIdentityDto {
  return {
    ...identity,
    styleTags: [...identity.styleTags],
    referenceImageRefs: [...identity.referenceImageRefs],
  };
}

function toImageWorkflowTemplateDto(
  template: import("@living-network/domain").ImageWorkflowTemplate,
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

function toImageJobDto(
  job: import("@living-network/domain").ImageJob,
): ImageJobDto {
  return { ...job };
}

function toImageAssetDto(
  job: import("@living-network/domain").ImageJob,
  action: import("@living-network/domain").BehaviorAction,
): ImageAssetDto {
  if (job.mediaRef === undefined) {
    throw new ApiError(500, "INTERNAL_ERROR", "Completed image job is missing media");
  }
  const conversationId = typeof action.payload.conversationId === "string" && action.payload.conversationId.trim()
    ? action.payload.conversationId
    : undefined;
  const recipientCharacterId = typeof action.payload.recipientCharacterId === "string" && action.payload.recipientCharacterId.trim()
    ? action.payload.recipientCharacterId
    : undefined;
  const category = conversationId !== undefined
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

function toStickerPackDto(
  pack: import("@living-network/domain").StickerPack,
): StickerPackDto {
  return { ...pack };
}

function toStickerDto(
  sticker: import("@living-network/domain").Sticker,
): StickerDto {
  return { ...sticker, tags: [...sticker.tags] };
}

function toStickerPackImportResult(
pack: import("@living-network/domain").StickerPack,
stickers: readonly import("@living-network/domain").Sticker[],
): StickerPackImportResultDto {
return { pack: toStickerPackDto(pack), stickers: stickers.map(toStickerDto) };
}

function toAppearanceSettingsDto(settings: AppearanceSettings): AppearanceSettingsDto {
const chatBackground: ChatBackgroundSettingsDto = { ...settings.chatBackground };
if (settings.chatBackground.items !== undefined) {
chatBackground.items = settings.chatBackground.items.map((item) => ({ ...item }));
}
return { ...settings, chatBackground };
}

function toWorldLoreEntryDto(entry: WorldLoreEntry): WorldLoreEntryDto {
  return { ...entry, tags: [...entry.tags] };
}

const SECRET_MASK = "********";

function toLlmProviderProfileDto(
  profile: LlmProviderProfile,
  source: LlmProviderProfileDto["source"] = "database",
): LlmProviderProfileDto {
  const hasApiKey = profile.encryptedApiKey !== undefined && profile.encryptionIv !== undefined;
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

function toComfyUiSettingsDto(settings: ComfyUiSettings): ComfyUiSettingsDto {
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

type ChatStore = ApiStore & {
  conversations: NonNullable<ApiStore["conversations"]>;
  messages: NonNullable<ApiStore["messages"]>;
};

function requireChatStore(store: ApiStore): ChatStore {
  if (!store.conversations || !store.messages) {
    throw new ApiError(
      501,
      "NOT_IMPLEMENTED",
      "Chat repositories are not configured",
    );
  }
  return store as ChatStore;
}

type MomentStore = ApiStore & {
  moments: NonNullable<ApiStore["moments"]>;
  momentInteractions: NonNullable<ApiStore["momentInteractions"]>;
};

function requireMomentStore(store: ApiStore): MomentStore {
  if (!store.moments || !store.momentInteractions) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Moment repositories are not configured");
  }
  return store as MomentStore;
}

type VisualWorkflowStore = ApiStore & {
  characterVisualIdentities: NonNullable<ApiStore["characterVisualIdentities"]>;
  imageWorkflowTemplates: NonNullable<ApiStore["imageWorkflowTemplates"]>;
};

type ImageJobStore = ApiStore & {
  imageJobs: NonNullable<ApiStore["imageJobs"]>;
};

function requireImageJobStore(store: ApiStore): ImageJobStore {
  if (!store.imageJobs) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Image job repository is not configured");
  }
  return store as ImageJobStore;
}

type ImageAssetStore = ApiStore & {
  imageJobs: NonNullable<ApiStore["imageJobs"]>;
  behaviorActions: NonNullable<ApiStore["behaviorActions"]>;
};

function requireImageAssetStore(store: ApiStore): ImageAssetStore {
  if (!store.imageJobs || !store.behaviorActions) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Image album repositories are not configured");
  }
  return store as ImageAssetStore;
}

type StickerStore = ApiStore & {
  stickerPacks: NonNullable<ApiStore["stickerPacks"]>;
  stickers: NonNullable<ApiStore["stickers"]>;
};

function requireStickerStore(store: ApiStore): StickerStore {
if (!store.stickerPacks || !store.stickers) {
throw new ApiError(501, "NOT_IMPLEMENTED", "Sticker repositories are not configured");
}
return store as StickerStore;
}

type AppearanceStore = ApiStore & {
appearanceSettings: NonNullable<ApiStore["appearanceSettings"]>;
};

function requireAppearanceStore(store: ApiStore): AppearanceStore {
if (!store.appearanceSettings) {
throw new ApiError(501, "NOT_IMPLEMENTED", "Appearance repository is not configured");
}
return store as AppearanceStore;
}

type WorldLoreStore = ApiStore & {
  worldLoreEntries: NonNullable<ApiStore["worldLoreEntries"]>;
};

function requireWorldLoreStore(store: ApiStore): WorldLoreStore {
  if (!store.worldLoreEntries) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "World lore repository is not configured");
  }
  return store as WorldLoreStore;
}

type LlmProviderProfileStore = ApiStore & {
  llmProviderProfiles: NonNullable<ApiStore["llmProviderProfiles"]>;
};

function requireLlmProviderProfileStore(store: ApiStore): LlmProviderProfileStore {
  if (!store.llmProviderProfiles) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "LLM provider profile repository is not configured");
  }
  return store as LlmProviderProfileStore;
}

type ComfyUiSettingsStore = ApiStore & {
  comfyUiSettings: NonNullable<ApiStore["comfyUiSettings"]>;
};

function requireComfyUiSettingsStore(store: ApiStore): ComfyUiSettingsStore {
  if (!store.comfyUiSettings) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "ComfyUI settings repository is not configured");
  }
  return store as ComfyUiSettingsStore;
}

type EventCalendarStore = ApiStore & {
  worldEventDefinitions: NonNullable<ApiStore["worldEventDefinitions"]>;
  scheduledOccurrences: NonNullable<ApiStore["scheduledOccurrences"]>;
};

function requireEventCalendarStore(store: ApiStore): EventCalendarStore {
  if (!store.worldEventDefinitions || !store.scheduledOccurrences) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Event repositories are not configured");
  }
  return store as EventCalendarStore;
}

function requireVisualWorkflowStore(store: ApiStore): VisualWorkflowStore {
  if (!store.characterVisualIdentities || !store.imageWorkflowTemplates) {
    throw new ApiError(
      501,
      "NOT_IMPLEMENTED",
      "Visual identity/workflow repositories are not configured",
    );
  }
  return store as VisualWorkflowStore;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSwitchRequest(value: unknown): ActorSessionSwitchRequest {
  if (!isRecord(value)) {
    throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  }

  const allowedKeys = new Set(["actorSessionId", "nextCharacterId"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new ApiError(400, "BAD_REQUEST", "Request body contains unknown fields");
  }

  if (
    typeof value.actorSessionId !== "string" ||
    value.actorSessionId.trim().length === 0 ||
    typeof value.nextCharacterId !== "string" ||
    value.nextCharacterId.trim().length === 0
  ) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "actorSessionId and nextCharacterId must be non-empty strings",
    );
  }

  return {
    actorSessionId: value.actorSessionId as ActorSessionSwitchRequest["actorSessionId"],
    nextCharacterId: value.nextCharacterId as CharacterId,
  };
}

function bodyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, "BAD_REQUEST", `${field} must be a non-empty string`);
  }
  return value;
}

function parseStickerInputs(value: unknown): CreateStickerInput[] {
  if (!Array.isArray(value)) {
    throw new ApiError(400, "BAD_REQUEST", "stickers must be an array");
  }
  return value.map((item, index) => {
    if (!isRecord(item)) throw new ApiError(400, "BAD_REQUEST", `stickers[${index}] must be an object`);
    assertAllowedBodyKeys(item, ["id", "label", "mediaRef", "tags"]);
    const parsed: CreateStickerInput = {
      id: bodyString(item.id, `stickers[${index}].id`),
      label: bodyString(item.label, `stickers[${index}].label`),
      mediaRef: bodyString(item.mediaRef, `stickers[${index}].mediaRef`),
    };
    if (item.tags !== undefined) {
      if (!Array.isArray(item.tags)) throw new ApiError(400, "BAD_REQUEST", `stickers[${index}].tags must be an array`);
      parsed.tags = item.tags.map((tag, tagIndex) => bodyString(tag, `stickers[${index}].tags[${tagIndex}]`));
    }
    return parsed;
  });
}

function parseAppendStickersRequest(value: unknown): CreateStickerInput[] {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["stickers"]);
  return parseStickerInputs(value.stickers);
}

function parseCreateStickerPackRequest(value: unknown): CreateStickerPackRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["id", "storyWorldId", "name", "sourceRef", "createdAt", "stickers"]);
  const stickers = parseStickerInputs(value.stickers);
  const result: CreateStickerPackRequest = {
    id: bodyString(value.id, "id"),
    storyWorldId: bodyString(value.storyWorldId, "storyWorldId"),
    name: bodyString(value.name, "name"),
    createdAt: bodyString(value.createdAt, "createdAt"),
    stickers,
  };
  if (value.sourceRef !== undefined) result.sourceRef = bodyString(value.sourceRef, "sourceRef");
  return result;
}

function assertAllowedBodyKeys(value: Record<string, unknown>, keys: readonly string[]): void {
const allowed = new Set(keys);
if (Object.keys(value).some((key) => !allowed.has(key))) {
throw new ApiError(400, "BAD_REQUEST", "Request body contains unknown fields");
}
}

function bodyNumber(value: unknown, field: string): number {
if (typeof value !== "number" || Number.isNaN(value)) {
throw new ApiError(400, "BAD_REQUEST", `${field} must be a number`);
}
return value;
}

function parseChatBackgroundItems(value: unknown): NonNullable<ChatBackgroundSettingsDto["items"]> | undefined {
if (value === undefined) return undefined;
if (!Array.isArray(value)) {
throw new ApiError(400, "BAD_REQUEST", "chatBackground.items must be an array");
}
if (value.length > 12) {
throw new ApiError(400, "BAD_REQUEST", "chatBackground.items cannot contain more than 12 items");
}
return value.map((item, index) => {
if (!isRecord(item)) {
throw new ApiError(400, "BAD_REQUEST", `chatBackground.items[${index}] must be an object`);
}
assertAllowedBodyKeys(item, ["id", "label", "kind", "imageRef", "createdAt"]);
const kind = bodyString(item.kind, `chatBackground.items[${index}].kind`);
if (kind !== ChatBackgroundKind.CUSTOM) {
throw new ApiError(400, "BAD_REQUEST", `chatBackground.items[${index}].kind must be custom`);
}
return {
id: bodyString(item.id, `chatBackground.items[${index}].id`),
label: bodyString(item.label, `chatBackground.items[${index}].label`),
kind,
imageRef: bodyString(item.imageRef, `chatBackground.items[${index}].imageRef`),
createdAt: bodyString(item.createdAt, `chatBackground.items[${index}].createdAt`),
};
});
}

function parseChatBackgroundSettings(value: unknown): ChatBackgroundSettingsDto {
if (!isRecord(value)) {
throw new ApiError(400, "BAD_REQUEST", "chatBackground must be an object");
}
assertAllowedBodyKeys(value, ["kind", "imageRef", "opacity", "blur", "items"]);
const kind = bodyString(value.kind, "chatBackground.kind");
if (kind !== ChatBackgroundKind.THEME && kind !== ChatBackgroundKind.CUSTOM) {
throw new ApiError(400, "BAD_REQUEST", "chatBackground.kind must be theme or custom");
}
const background: ChatBackgroundSettingsDto = {
kind,
opacity: bodyNumber(value.opacity, "chatBackground.opacity"),
blur: bodyNumber(value.blur, "chatBackground.blur"),
};
if (value.imageRef !== undefined) {
background.imageRef = bodyString(value.imageRef, "chatBackground.imageRef");
}
const items = parseChatBackgroundItems(value.items);
if (items !== undefined) background.items = items;
return background;
}

function parseUpdateAppearanceSettingsRequest(value: unknown): UpdateAppearanceSettingsRequest {
if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
assertAllowedBodyKeys(value, ["themeId", "chatBackground"]);
return {
themeId: bodyString(value.themeId, "themeId"),
chatBackground: parseChatBackgroundSettings(value.chatBackground),
};
}

type ConversationImageStore = ChatStore & EventCalendarStore & ImageJobStore & {
  eventExecutions: NonNullable<ApiStore["eventExecutions"]>;
  behaviorActions: NonNullable<ApiStore["behaviorActions"]>;
};

function requireConversationImageStore(store: ApiStore): ConversationImageStore {
  if (!store.eventExecutions || !store.behaviorActions) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Image request repositories are not configured");
  }
  requireEventCalendarStore(store);
  requireImageJobStore(store);
  requireChatStore(store);
  return store as ConversationImageStore;
}

function optionalBodyNumber(value: unknown, field: string): number | undefined {
  return value === undefined ? undefined : bodyNumber(value, field);
}

function optionalBodyBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new ApiError(400, "BAD_REQUEST", `${field} must be a boolean`);
  }
  return value;
}

function parseSaveLlmProviderProfileRequest(value: unknown): SaveLlmProviderProfileRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, [
    "id", "name", "protocol", "baseUrl", "model", "timeoutMs", "maxTokens",
    "temperature", "apiKey", "isActive",
  ]);
  if (
    value.protocol !== LlmProviderProtocol.OPENAI_COMPATIBLE &&
    value.protocol !== LlmProviderProtocol.ANTHROPIC
  ) {
    throw new ApiError(400, "BAD_REQUEST", "protocol must be OPENAI_COMPATIBLE or ANTHROPIC");
  }
  const result: SaveLlmProviderProfileRequest = {
    id: bodyString(value.id, "id"),
    name: bodyString(value.name, "name"),
    protocol: value.protocol,
    baseUrl: bodyString(value.baseUrl, "baseUrl"),
    model: bodyString(value.model, "model"),
  };
  const timeoutMs = optionalBodyNumber(value.timeoutMs, "timeoutMs");
  const maxTokens = optionalBodyNumber(value.maxTokens, "maxTokens");
  const temperature = optionalBodyNumber(value.temperature, "temperature");
  const isActive = optionalBodyBoolean(value.isActive, "isActive");
  if (timeoutMs !== undefined) result.timeoutMs = timeoutMs;
  if (maxTokens !== undefined) result.maxTokens = maxTokens;
  if (temperature !== undefined) result.temperature = temperature;
  if (isActive !== undefined) result.isActive = isActive;
  if (value.apiKey !== undefined) result.apiKey = bodyString(value.apiKey, "apiKey");
  return result;
}

function parseUpdateComfyUiSettingsRequest(value: unknown): UpdateComfyUiSettingsRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, [
    "baseUrl", "timeoutMs", "defaultWorkflowVersion", "autoImageIntentEnabled",
  ]);
  const result: UpdateComfyUiSettingsRequest = {
    baseUrl: bodyString(value.baseUrl, "baseUrl"),
  };
  const timeoutMs = optionalBodyNumber(value.timeoutMs, "timeoutMs");
  const autoImageIntentEnabled = optionalBodyBoolean(
    value.autoImageIntentEnabled,
    "autoImageIntentEnabled",
  );
  if (timeoutMs !== undefined) result.timeoutMs = timeoutMs;
  if (autoImageIntentEnabled !== undefined) {
    result.autoImageIntentEnabled = autoImageIntentEnabled;
  }
  if (value.defaultWorkflowVersion !== undefined) {
    result.defaultWorkflowVersion = bodyString(
      value.defaultWorkflowVersion,
      "defaultWorkflowVersion",
    );
  }
  return result;
}

function bodyStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError(400, "BAD_REQUEST", `${field} must be a non-empty array`);
  }
  return value.map((item, index) => bodyString(item, `${field}[${index}]`));
}

function parseValidateImageWorkflowRequest(value: unknown): ValidateImageWorkflowRequest {
  if (!isRecord(value)) {
    throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  }
  assertAllowedBodyKeys(value, [
    "id",
    "version",
    "workflow",
    "positivePromptPath",
    "negativePromptPath",
    "seedPath",
  ]);
  if (!isRecord(value.workflow)) {
    throw new ApiError(400, "BAD_REQUEST", "workflow must be an object");
  }
  const result: ValidateImageWorkflowRequest = {
    id: bodyString(value.id, "id"),
    version: bodyString(value.version, "version"),
    workflow: value.workflow,
    positivePromptPath: bodyStringArray(value.positivePromptPath, "positivePromptPath"),
  };
  if (value.negativePromptPath !== undefined) {
    result.negativePromptPath = bodyStringArray(value.negativePromptPath, "negativePromptPath");
  }
  if (value.seedPath !== undefined) {
    result.seedPath = bodyStringArray(value.seedPath, "seedPath");
  }
  return result;
}

function parseCreateConversationRequest(value: unknown): CreateConversationRequest {
  if (!isRecord(value)) {
    throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  }
  assertAllowedBodyKeys(value, [
    "id",
    "storyWorldId",
    "type",
    "title",
    "createdAt",
    "memberCharacterIds",
  ]);
  if (value.type !== "PRIVATE" && value.type !== "GROUP") {
    throw new ApiError(400, "BAD_REQUEST", "type must be PRIVATE or GROUP");
  }
  if (!Array.isArray(value.memberCharacterIds)) {
    throw new ApiError(400, "BAD_REQUEST", "memberCharacterIds must be an array");
  }
  const memberCharacterIds = value.memberCharacterIds.map((member, index) =>
    bodyString(member, `memberCharacterIds[${index}]`),
  );
  const result: CreateConversationRequest = {
    id: bodyString(value.id, "id"),
    storyWorldId: bodyString(value.storyWorldId, "storyWorldId"),
    type: value.type,
    createdAt: bodyString(value.createdAt, "createdAt"),
    memberCharacterIds,
  };
  if (value.title !== undefined) result.title = bodyString(value.title, "title");
  return result;
}

function parseSendMessageRequest(value: unknown): SendMessageRequest {
  if (!isRecord(value)) {
    throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  }
  assertAllowedBodyKeys(value, [
    "id",
    "authorCharacterId",
    "kind",
    "text",
    "mediaRef",
    "stickerId",
    "createdAt",
    "suppressAutoReply",
    "idempotencyKey",
  ]);
  if (
    value.kind !== "TEXT" &&
    value.kind !== "IMAGE" &&
    value.kind !== "STICKER" &&
    value.kind !== "SYSTEM"
  ) {
    throw new ApiError(400, "BAD_REQUEST", "kind must be TEXT, IMAGE, STICKER, or SYSTEM");
  }
  const result: SendMessageRequest = {
    id: bodyString(value.id, "id"),
    kind: value.kind,
    createdAt: bodyString(value.createdAt, "createdAt"),
    idempotencyKey: bodyString(value.idempotencyKey, "idempotencyKey"),
  };
  if (value.authorCharacterId !== undefined) {
    result.authorCharacterId = bodyString(value.authorCharacterId, "authorCharacterId");
  }
  if (value.text !== undefined) result.text = bodyString(value.text, "text");
  if (value.mediaRef !== undefined) result.mediaRef = bodyString(value.mediaRef, "mediaRef");
  if (value.stickerId !== undefined) result.stickerId = bodyString(value.stickerId, "stickerId");
  if (value.suppressAutoReply !== undefined) {
    if (typeof value.suppressAutoReply !== "boolean") throw new ApiError(400, "BAD_REQUEST", "suppressAutoReply must be a boolean");
    result.suppressAutoReply = value.suppressAutoReply;
  }
  return result;
}

function parseCreateMomentInteractionRequest(value: unknown): CreateMomentInteractionRequest {
  if (!isRecord(value)) {
    throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  }
  assertAllowedBodyKeys(value, [
    "id",
    "actorCharacterId",
    "kind",
    "text",
    "createdAt",
    "idempotencyKey",
  ]);
  if (value.kind !== "LIKE" && value.kind !== "COMMENT") {
    throw new ApiError(400, "BAD_REQUEST", "kind must be LIKE or COMMENT");
  }
  const result: CreateMomentInteractionRequest = {
    id: bodyString(value.id, "id"),
    actorCharacterId: bodyString(value.actorCharacterId, "actorCharacterId"),
    kind: value.kind,
    createdAt: bodyString(value.createdAt, "createdAt"),
    idempotencyKey: bodyString(value.idempotencyKey, "idempotencyKey"),
  };
  if (value.text !== undefined) result.text = bodyString(value.text, "text");
  return result;
}


function parseCreateStoryWorldRequest(value: unknown): CreateStoryWorldRequest {
  if (!isRecord(value)) throw new ApiError(400, 'BAD_REQUEST', 'Request body must be an object');
  assertAllowedBodyKeys(value, ['id', 'name', 'timezone', 'storyMode', 'relationshipDynamicsEnabled']);
  if (value.storyMode !== 'STATIC' && value.storyMode !== 'DYNAMIC') {
    throw new ApiError(400, 'BAD_REQUEST', 'storyMode must be STATIC or DYNAMIC');
  }
  if (typeof value.relationshipDynamicsEnabled !== 'boolean') {
    throw new ApiError(400, 'BAD_REQUEST', 'relationshipDynamicsEnabled must be a boolean');
  }
  return {
    id: bodyString(value.id, 'id'),
    name: bodyString(value.name, 'name'),
    timezone: bodyString(value.timezone, 'timezone'),
    storyMode: value.storyMode,
    relationshipDynamicsEnabled: value.relationshipDynamicsEnabled,
  };
}

function parseUpdateStoryWorldRequest(value: unknown): UpdateStoryWorldRequest {
  if (!isRecord(value)) throw new ApiError(400, 'BAD_REQUEST', 'Request body must be an object');
  assertAllowedBodyKeys(value, ['name', 'timezone', 'storyMode', 'relationshipDynamicsEnabled']);
  const result: UpdateStoryWorldRequest = {};
  if (value.name !== undefined) result.name = bodyString(value.name, 'name');
  if (value.timezone !== undefined) result.timezone = bodyString(value.timezone, 'timezone');
  if (value.storyMode !== undefined) {
    if (value.storyMode !== 'STATIC' && value.storyMode !== 'DYNAMIC') {
      throw new ApiError(400, 'BAD_REQUEST', 'storyMode must be STATIC or DYNAMIC');
    }
    result.storyMode = value.storyMode;
  }
  if (value.relationshipDynamicsEnabled !== undefined) {
    if (typeof value.relationshipDynamicsEnabled !== 'boolean') {
      throw new ApiError(400, 'BAD_REQUEST', 'relationshipDynamicsEnabled must be a boolean');
    }
    result.relationshipDynamicsEnabled = value.relationshipDynamicsEnabled;
  }
  return result;
}

function parseImportImageWorkflowRequest(value: unknown): { id: string; version: string; workflow: JsonObject; positivePromptPath?: string[]; negativePromptPath?: string[]; seedPath?: string[] } {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["id", "version", "workflow", "positivePromptPath", "negativePromptPath", "seedPath"]);
  if (!isRecord(value.workflow)) throw new ApiError(400, "BAD_REQUEST", "workflow must be an object");
  return {
    id: bodyString(value.id, "id"),
    version: bodyString(value.version, "version"),
    workflow: value.workflow as JsonObject,
    ...(value.positivePromptPath === undefined ? {} : { positivePromptPath: bodyStringArray(value.positivePromptPath, "positivePromptPath") }),
    ...(value.negativePromptPath === undefined ? {} : { negativePromptPath: bodyStringArray(value.negativePromptPath, "negativePromptPath") }),
    ...(value.seedPath === undefined ? {} : { seedPath: bodyStringArray(value.seedPath, "seedPath") }),
  };
}

function parseRequestConversationImageRequest(value: unknown): RequestConversationImageRequest {
  if (!isRecord(value)) {
    throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  }
  assertAllowedBodyKeys(value, [
    "actorCharacterId", "recipientCharacterId", "prompt", "workflowVersion",
    "negativePrompt", "seed", "createdAt", "idempotencyKey",
  ]);
  const result: RequestConversationImageRequest = {
    actorCharacterId: bodyString(value.actorCharacterId, "actorCharacterId"),
    recipientCharacterId: bodyString(value.recipientCharacterId, "recipientCharacterId"),
    prompt: bodyString(value.prompt, "prompt"),
    workflowVersion: bodyString(value.workflowVersion, "workflowVersion"),
    createdAt: bodyString(value.createdAt, "createdAt"),
    idempotencyKey: bodyString(value.idempotencyKey, "idempotencyKey"),
  };
  if (value.negativePrompt !== undefined) {
    result.negativePrompt = bodyString(value.negativePrompt, "negativePrompt");
  }
  if (value.seed !== undefined) {
    const seed = bodyNumber(value.seed, "seed");
    if (!Number.isSafeInteger(seed) || seed < 0) {
      throw new ApiError(400, "BAD_REQUEST", "seed must be a non-negative integer");
    }
    result.seed = seed;
  }
  return result;
}

function parseWorldLoreTags(value: unknown, field = "tags"): string[] {
  if (!Array.isArray(value)) throw new ApiError(400, "BAD_REQUEST", `${field} must be an array`);
  return value.map((tag, index) => bodyString(tag, `${field}[${index}]`));
}

function parseCreateWorldLoreEntryRequest(value: unknown): CreateWorldLoreEntryRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["id", "storyWorldId", "category", "title", "content", "tags", "isEnabled"]);
  const result: CreateWorldLoreEntryRequest = {
    id: bodyString(value.id, "id"),
    storyWorldId: bodyString(value.storyWorldId, "storyWorldId"),
    category: bodyString(value.category, "category"),
    title: bodyString(value.title, "title"),
    content: bodyString(value.content, "content"),
  };
  if (value.tags !== undefined) result.tags = parseWorldLoreTags(value.tags);
  if (value.isEnabled !== undefined) {
    if (typeof value.isEnabled !== "boolean") throw new ApiError(400, "BAD_REQUEST", "isEnabled must be a boolean");
    result.isEnabled = value.isEnabled;
  }
  return result;
}

function parseUpdateWorldLoreEntryRequest(value: unknown): UpdateWorldLoreEntryRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["category", "title", "content", "tags", "isEnabled"]);
  const result: UpdateWorldLoreEntryRequest = {};
  if (value.category !== undefined) result.category = bodyString(value.category, "category");
  if (value.title !== undefined) result.title = bodyString(value.title, "title");
  if (value.content !== undefined) result.content = bodyString(value.content, "content");
  if (value.tags !== undefined) result.tags = parseWorldLoreTags(value.tags);
  if (value.isEnabled !== undefined) {
    if (typeof value.isEnabled !== "boolean") throw new ApiError(400, "BAD_REQUEST", "isEnabled must be a boolean");
    result.isEnabled = value.isEnabled;
  }
  return result;
}

function parseCreateCharacterRequest(value: unknown): CreateCharacterRequest {
  if (!isRecord(value)) throw new ApiError(400, 'BAD_REQUEST', 'Request body must be an object');
  assertAllowedBodyKeys(value, ['id', 'displayName', 'role', 'storyWorldId', 'timezone', 'birthDate', 'personaPrompt', 'personaPromptRef', 'visualPromptRef']);
  if (value.role !== 'AI' && value.role !== 'USER') {
    throw new ApiError(400, 'BAD_REQUEST', 'role must be AI or USER');
  }
  const result: CreateCharacterRequest = {
    id: bodyString(value.id, 'id'),
    displayName: bodyString(value.displayName, 'displayName'),
    role: value.role,
    storyWorldId: bodyString(value.storyWorldId, 'storyWorldId'),
    timezone: bodyString(value.timezone, 'timezone'),
  };
  if (value.birthDate !== undefined) result.birthDate = bodyString(value.birthDate, 'birthDate');
  if (value.personaPrompt !== undefined) result.personaPrompt = bodyString(value.personaPrompt, 'personaPrompt');
  if (value.personaPromptRef !== undefined) result.personaPromptRef = bodyString(value.personaPromptRef, 'personaPromptRef');
  if (value.visualPromptRef !== undefined) result.visualPromptRef = bodyString(value.visualPromptRef, 'visualPromptRef');
  return result;
}

function parseUpdateCharacterRequest(value: unknown): UpdateCharacterRequest {
  if (!isRecord(value)) throw new ApiError(400, 'BAD_REQUEST', 'Request body must be an object');
  assertAllowedBodyKeys(value, ['displayName', 'timezone', 'birthDate', 'personaPrompt', 'personaPromptRef', 'visualPromptRef']);
  const result: UpdateCharacterRequest = {};
  if (value.displayName !== undefined) result.displayName = bodyString(value.displayName, 'displayName');
  if (value.timezone !== undefined) result.timezone = bodyString(value.timezone, 'timezone');
  if (value.birthDate !== undefined) result.birthDate = bodyString(value.birthDate, 'birthDate');
  if (value.personaPrompt !== undefined) result.personaPrompt = bodyString(value.personaPrompt, 'personaPrompt');
  if (value.personaPromptRef !== undefined) result.personaPromptRef = bodyString(value.personaPromptRef, 'personaPromptRef');
  if (value.visualPromptRef !== undefined) result.visualPromptRef = bodyString(value.visualPromptRef, 'visualPromptRef');
  return result;
}

function parseRelationshipState(value: unknown): CreateRelationshipEdgeRequest["initialState"] {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "initialState must be an object");
  assertAllowedBodyKeys(value, ["affinity", "trust", "conflict", "dependency"]);
  const result = {
    affinity: value.affinity,
    trust: value.trust,
    conflict: value.conflict,
    dependency: value.dependency,
  };
  for (const [key, numberValue] of Object.entries(result)) {
    if (typeof numberValue !== "number" || !Number.isFinite(numberValue)) {
      throw new ApiError(400, "BAD_REQUEST", `initialState.${key} must be a finite number`);
    }
  }
  return result as CreateRelationshipEdgeRequest["initialState"];
}

function parseCreateRelationshipEdgeRequest(value: unknown): CreateRelationshipEdgeRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, [
    "id", "sourceCharacterId", "targetCharacterId", "storyWorldId", "relationshipType",
    "initialState", "isPublic", "isBidirectional",
  ]);
  if (typeof value.isPublic !== "boolean" || typeof value.isBidirectional !== "boolean") {
    throw new ApiError(400, "BAD_REQUEST", "isPublic and isBidirectional must be booleans");
  }
  return {
    id: bodyString(value.id, "id"),
    sourceCharacterId: bodyString(value.sourceCharacterId, "sourceCharacterId"),
    targetCharacterId: bodyString(value.targetCharacterId, "targetCharacterId"),
    storyWorldId: bodyString(value.storyWorldId, "storyWorldId"),
    relationshipType: bodyString(value.relationshipType, "relationshipType"),
    initialState: parseRelationshipState(value.initialState),
    isPublic: value.isPublic,
    isBidirectional: value.isBidirectional,
  };
}

function parseUpdateRelationshipEdgeRequest(value: unknown): UpdateRelationshipEdgeRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["relationshipType", "initialState", "isPublic", "isBidirectional"]);
  const result: UpdateRelationshipEdgeRequest = {};
  if (value.relationshipType !== undefined) result.relationshipType = bodyString(value.relationshipType, "relationshipType");
  if (value.initialState !== undefined) result.initialState = parseRelationshipState(value.initialState);
  if (value.isPublic !== undefined) {
    if (typeof value.isPublic !== "boolean") throw new ApiError(400, "BAD_REQUEST", "isPublic must be a boolean");
    result.isPublic = value.isPublic;
  }
  if (value.isBidirectional !== undefined) {
    if (typeof value.isBidirectional !== "boolean") throw new ApiError(400, "BAD_REQUEST", "isBidirectional must be a boolean");
    result.isBidirectional = value.isBidirectional;
  }
  return result;
}

function parseEventRecurrence(value: unknown): EventRecurrenceDto {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "recurrence must be an object");
  if (value.kind === EventRecurrenceKind.ONCE) {
    assertAllowedBodyKeys(value, ["kind", "runAt"]);
    return { kind: EventRecurrenceKind.ONCE, runAt: bodyString(value.runAt, "recurrence.runAt") };
  }
  if (value.kind === EventRecurrenceKind.ANNUAL) {
    assertAllowedBodyKeys(value, ["kind", "month", "day", "localTime"]);
    if (typeof value.month !== "number" || typeof value.day !== "number") {
      throw new ApiError(400, "BAD_REQUEST", "annual recurrence month and day must be numbers");
    }
    return {
      kind: EventRecurrenceKind.ANNUAL,
      month: value.month,
      day: value.day,
      localTime: bodyString(value.localTime, "recurrence.localTime"),
    };
  }
  throw new ApiError(400, "BAD_REQUEST", "recurrence.kind must be ONCE or ANNUAL");
}

function parseTargetCharacterIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new ApiError(400, "BAD_REQUEST", "targetCharacterIds must be an array");
  return value.map((item, index) => bodyString(item, `targetCharacterIds[${index}]`));
}

function parseEventOutputs(value: unknown): NonNullable<CreateWorldEventDefinitionRequest["outputs"]> {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "outputs must be an object");
  assertAllowedBodyKeys(value, ["sendMessage", "publishMoment", "generateImage"]);
  const result: NonNullable<CreateWorldEventDefinitionRequest["outputs"]> = {};
  for (const key of ["sendMessage", "publishMoment", "generateImage"] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "boolean") throw new ApiError(400, "BAD_REQUEST", `outputs.${key} must be a boolean`);
      result[key] = value[key];
    }
  }
  return result;
}

function parseTriggerSource(value: unknown): CreateWorldEventDefinitionRequest["triggerSource"] {
  if (typeof value !== "string" || !Object.values(TriggerSource).includes(value as TriggerSource)) {
    throw new ApiError(400, "BAD_REQUEST", "triggerSource is invalid");
  }
  return value as CreateWorldEventDefinitionRequest["triggerSource"];
}

function parseOptionalNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ApiError(400, "BAD_REQUEST", `${field} must be a non-negative integer`);
  }
  return value;
}

function parseCreateWorldEventDefinitionRequest(value: unknown): CreateWorldEventDefinitionRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, [
    "id", "storyWorldId", "eventKey", "name", "triggerSource", "timezone", "recurrence",
    "targetCharacterIds", "recipientCharacterIds", "outputs", "priority", "cooldownSeconds", "enabled", "createdAt",
  ]);
  const result: CreateWorldEventDefinitionRequest = {
    id: bodyString(value.id, "id"),
    storyWorldId: bodyString(value.storyWorldId, "storyWorldId"),
    eventKey: bodyString(value.eventKey, "eventKey"),
    name: bodyString(value.name, "name"),
    triggerSource: parseTriggerSource(value.triggerSource),
    recurrence: parseEventRecurrence(value.recurrence),
    targetCharacterIds: parseTargetCharacterIds(value.targetCharacterIds),
    createdAt: bodyString(value.createdAt, "createdAt"),
  };
  if (value.timezone !== undefined) result.timezone = bodyString(value.timezone, "timezone");
  if (value.recipientCharacterIds !== undefined) result.recipientCharacterIds = parseTargetCharacterIds(value.recipientCharacterIds);
  if (value.outputs !== undefined) result.outputs = parseEventOutputs(value.outputs);
  if (value.priority !== undefined) result.priority = parseOptionalNonNegativeInteger(value.priority, "priority");
  if (value.cooldownSeconds !== undefined) result.cooldownSeconds = parseOptionalNonNegativeInteger(value.cooldownSeconds, "cooldownSeconds");
  if (value.enabled !== undefined) {
    if (typeof value.enabled !== "boolean") throw new ApiError(400, "BAD_REQUEST", "enabled must be a boolean");
    result.enabled = value.enabled;
  }
  return result;
}

function parseUpdateWorldEventDefinitionRequest(value: unknown): UpdateWorldEventDefinitionRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, [
    "eventKey", "name", "triggerSource", "timezone", "recurrence", "targetCharacterIds", "recipientCharacterIds", "outputs",
    "priority", "cooldownSeconds", "enabled",
  ]);
  const result: UpdateWorldEventDefinitionRequest = {};
  if (value.eventKey !== undefined) result.eventKey = bodyString(value.eventKey, "eventKey");
  if (value.name !== undefined) result.name = bodyString(value.name, "name");
  if (value.triggerSource !== undefined) result.triggerSource = parseTriggerSource(value.triggerSource);
  if (value.timezone !== undefined) result.timezone = bodyString(value.timezone, "timezone");
  if (value.recurrence !== undefined) result.recurrence = parseEventRecurrence(value.recurrence);
  if (value.targetCharacterIds !== undefined) result.targetCharacterIds = parseTargetCharacterIds(value.targetCharacterIds);
  if (value.recipientCharacterIds !== undefined) result.recipientCharacterIds = parseTargetCharacterIds(value.recipientCharacterIds);
  if (value.outputs !== undefined) result.outputs = parseEventOutputs(value.outputs);
  if (value.priority !== undefined) result.priority = parseOptionalNonNegativeInteger(value.priority, "priority");
  if (value.cooldownSeconds !== undefined) result.cooldownSeconds = parseOptionalNonNegativeInteger(value.cooldownSeconds, "cooldownSeconds");
  if (value.enabled !== undefined) {
    if (typeof value.enabled !== "boolean") throw new ApiError(400, "BAD_REQUEST", "enabled must be a boolean");
    result.enabled = value.enabled;
  }
  return result;
}

function withHeaders(response: Response, headers: Record<string, string>): Response { for (const [key, value] of Object.entries(headers)) if (value) response.headers.set(key, value); return response; }

function jsonResponse(body: unknown, statusCode = 200): Response {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return jsonResponse(
      { error: { code: error.code, message: error.message } },
      error.statusCode,
    );
  }

  return jsonResponse(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    500,
  );
}

function sseData(value: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`);
}

function sseError(error: unknown): Uint8Array {
  const code = error instanceof ProviderError ? error.code : "STREAM_ERROR";
  const message = error instanceof ProviderError
    ? error.message
    : "Chat stream failed";
  return new TextEncoder().encode(
    `event: error\ndata: ${JSON.stringify({ code, message })}\n\n`,
  );
}

function sseDone(): Uint8Array {
  return new TextEncoder().encode("data: [DONE]\n\n");
}

function createSseResponse(source: AsyncIterable<ChatDelta>): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        try {
          for await (const delta of source) controller.enqueue(sseData(delta));
        } catch (error) {
          controller.enqueue(sseError(error));
        } finally {
          controller.enqueue(sseDone());
          controller.close();
        }
      })().catch(() => undefined);
    },
  });
  return new Response(stream, {
    headers: {
      "cache-control": "no-cache",
      "content-type": "text/event-stream; charset=utf-8",
      connection: "keep-alive",
    },
  });
}


type CreatorScanStore = ApiStore & {
  worldEventDefinitions: NonNullable<ApiStore["worldEventDefinitions"]>;
  scheduledOccurrences: NonNullable<ApiStore["scheduledOccurrences"]>;
  eventExecutions: NonNullable<ApiStore["eventExecutions"]>;
};

type CreatorDispatchStore = CreatorScanStore & {
  dispatchRequests: NonNullable<ApiStore["dispatchRequests"]>;
  transaction<T>(operation: (store: CreatorDispatchStore) => Promise<T>): Promise<T>;
};

interface CreatorDispatchPayload extends Record<string, unknown> {
  occurrenceId: string;
  execution: {
    ruleVersion: string;
    inputSnapshot: Record<string, unknown>;
  };
  previousAttempt: number;
}

function requireCreatorScanStore(store: ApiStore): CreatorScanStore {
  if (!store.worldEventDefinitions || !store.scheduledOccurrences || !store.eventExecutions) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Creator event repositories are not configured");
  }
  return store as CreatorScanStore;
}

function parseDispatchAction(value: unknown): EventDispatchSelectionDto["action"] {
  if (value !== "EXECUTE_EXISTING" && value !== "RETRY_FAILED" && value !== "RUN_TRIAL") {
    throw new ApiError(400, "BAD_REQUEST", "action is invalid");
  }
  return value;
}

function parseDispatchSelections(value: unknown): EventDispatchSelectionDto[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError(400, "BAD_REQUEST", "selections must be a non-empty array");
  }
  const selections = value.map((selection, index) => {
    if (!isRecord(selection)) {
      throw new ApiError(400, "BAD_REQUEST", `selections[${index}] must be an object`);
    }
    assertAllowedBodyKeys(selection, ["candidateId", "action"]);
    return {
      candidateId: bodyString(selection.candidateId, `selections[${index}].candidateId`),
      action: parseDispatchAction(selection.action),
    };
  });
  const candidateIds = new Set(selections.map((selection) => selection.candidateId));
  if (candidateIds.size !== selections.length) {
    throw new ApiError(400, "BAD_REQUEST", "selections must not repeat a candidate");
  }
  return selections;
}

function parseDispatchPreviewRequest(value: unknown): {
  selections: EventDispatchSelectionDto[];
} {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["selections"]);
  return { selections: parseDispatchSelections(value.selections) };
}

function parseCreateDispatchRequest(value: unknown): CreateEventDispatchBatchRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["idempotencyKey", "selections"]);
  return {
    idempotencyKey: bodyString(value.idempotencyKey, "idempotencyKey"),
    selections: parseDispatchSelections(value.selections),
  };
}

function creatorBatchId(idempotencyKey: string): string {
  return `creator-batch:${encodeURIComponent(idempotencyKey)}`;
}

function creatorDispatchId(batchId: string, candidateId: string): string {
  return `creator-dispatch:${encodeURIComponent(batchId)}:${encodeURIComponent(candidateId)}`;
}

export type CreatorWorkerStatus =
  | "NOT_STARTED"
  | "STOPPED"
  | "STALE"
  | "RUNNING";

export interface CreatorEventCandidatesResponse {
  candidates: readonly CreatorEventCandidateDto[];
  dispatchAvailable: boolean;
  workerStatus: CreatorWorkerStatus;
}

export class ApiApplication {
  public readonly store: ApiStore;
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
    this.requireTrustedActor = securityOptions.requireTrustedActor ?? false;
    this.readiness = operationalOptions.readiness;
    this.secretCipher = operationalOptions.secretCipher;
    this.creatorDispatchEnabled = operationalOptions.creatorDispatchEnabled ?? false;
    this.creatorClock = operationalOptions.creatorClock ?? (() => new Date());
    this.interactionLogs = operationalOptions.interactionLogs ?? new InMemoryInteractionLogRepository();
    this.logging = operationalOptions.interactionLogging ?? new InteractionLogging({ repository: this.interactionLogs, ...(operationalOptions.loggingCleanupEnabled === undefined ? {} : { cleanupEnabled: operationalOptions.loggingCleanupEnabled }), ...(operationalOptions.loggingCleanupIntervalMs === undefined ? {} : { cleanupIntervalMs: operationalOptions.loggingCleanupIntervalMs }) });
    this.media = new ApiMediaStore(operationalOptions.mediaRoot ?? "./data/media");
    this.conversationOptions = {
      ...conversationOptions,
      mediaResolver: conversationOptions.mediaResolver ?? ((message) => this.resolveMessageMedia(message)),
    };
  }


  private async resolveMessageMedia(message: Message): Promise<ResolvedMessageMedia | undefined> {
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
  private trustedActor(request: Request, requestedCharacterId?: string): string | undefined {
    if (!this.requireTrustedActor) return requestedCharacterId;
    const actor = request.headers.get("x-actor-character-id")?.trim();
    if (!actor) throw new ApiError(401, "UNAUTHORIZED", "Trusted actor context is required");
    if (requestedCharacterId !== undefined && actor !== requestedCharacterId) {
      throw new ApiError(403, "FORBIDDEN", "Trusted actor does not match requested character");
    }
    return actor;
  }


  private requireCreatorDispatchStore(): CreatorDispatchStore {
    const store = this.store as ApiStore & {
      transaction?: CreatorDispatchStore["transaction"];
    };
    if (
      !this.creatorDispatchEnabled ||
      !store.dispatchRequests ||
      typeof store.transaction !== "function"
    ) {
      throw new ApiError(
        503,
        "SERVICE_UNAVAILABLE",
        "Creator dispatch requires PostgreSQL, Redis, and Worker",
      );
    }
    requireCreatorScanStore(store);
    return store as CreatorDispatchStore;
  }


  private async enrichCreatorCandidateRisks(
    candidates: readonly CreatorEventCandidateDto[],
    store: ApiStore,
  ): Promise<CreatorEventCandidateDto[]> {
    const conversationCache = new Map<string, Promise<readonly ConversationAggregate[]>>();
    const imageRisk = async (): Promise<string | undefined> => {
      const settings = await store.comfyUiSettings?.get();
      const version = settings?.defaultWorkflowVersion;
      if (!version) return "未配置默认图片工作流";
      const templates = await store.imageWorkflowTemplates?.list();
      if (!templates?.some((template) => template.version === version)) {
        return "默认图片工作流版本不存在";
      }
      return undefined;
    };
    const resolvedImageRisk = candidates.some(
      (candidate) => candidate.definition.outputs.generateImage,
    ) ? await imageRisk() : undefined;

    return Promise.all(candidates.map(async (candidate) => {
      const candidateRisks = candidate.risks.filter(
        (risk) => risk !== "需要已配置的图片工作流",
      );
      if (
        candidate.definition.outputs.sendMessage &&
        candidate.recipientCharacterIds.length > 0
      ) {
        if (!store.conversations) {
          candidateRisks.push("会话仓储不可用");
        } else {
          for (const recipientId of candidate.recipientCharacterIds) {
            let pending = conversationCache.get(recipientId);
            if (!pending) {
              pending = store.conversations.listByCharacter(recipientId);
              conversationCache.set(recipientId, pending);
            }
            const conversations = await pending;
            const hasActiveConversation = conversations.some((conversation) => {
              if (conversation.conversation.storyWorldId !== candidate.worldId) return false;
              const activeMemberIds = new Set(conversation.members
                .filter((member) => member.leftAt === undefined)
                .map((member) => member.characterId));
              return activeMemberIds.has(recipientId) &&
                candidate.targetCharacterIds.some((actorId) => activeMemberIds.has(actorId));
            });
            if (!hasActiveConversation) {
              candidateRisks.push(`接收者 ${recipientId} 没有可用会话`);
            }
          }
        }
        if (store.proactiveMessageBudgets) {
          await Promise.all(candidate.targetCharacterIds.map(async (actorId) => {
            const budget = await store.proactiveMessageBudgets!.getActive(
              candidate.worldId,
              actorId,
              candidate.scheduledFor,
            );
            if (budget && !canConsumeProactiveMessages(budget, 1)) {
              candidateRisks.push(`角色 ${actorId} 主动消息预算不足`);
            }
          }));
        }
      }
      if (candidate.definition.outputs.generateImage && resolvedImageRisk !== undefined) {
        candidateRisks.push(resolvedImageRisk);
      }
      return { ...candidate, risks: [...new Set(candidateRisks)] };
    }));
  }

  private async scanCreatorCandidates(
    worldId: string,
    horizonDays = 7,
    repositories: ApiStore = this.store,
    clock = this.creatorClock(),
  ): Promise<CreatorEventCandidateDto[]> {
    if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 31) {
      throw new ApiError(400, "BAD_REQUEST", "horizonDays must be an integer from 1 to 31");
    }
    const store = requireCreatorScanStore(repositories);
    const world = await store.storyWorlds.getById(worldId);
    if (!world) throw new ApiError(404, "NOT_FOUND", "Story world not found");
    const now = clock.toISOString();
    const horizonEnd = new Date(clock.getTime() + horizonDays * 86_400_000).toISOString();
    const [definitions, occurrences] = await Promise.all([
      store.worldEventDefinitions.listByStoryWorld(worldId),
      store.scheduledOccurrences.listForCreatorScan(worldId, horizonEnd, 2_000),
    ]);
    const executions = (
      await Promise.all(
        occurrences.map((occurrence) =>
          store.eventExecutions.getLatestByOccurrence(occurrence.id),
        ),
      )
    ).filter((execution) => execution !== undefined);

    const candidates = scanCreatorEventCandidates({
      worldId,
      worldTimezone: world.timezone,
      definitions: definitions.map(toWorldEventDefinitionDto),
      occurrences: occurrences.map(toScheduledOccurrenceDto),
      executions: executions.map((execution) => ({
        ...execution,
        targetCharacterIds: [...execution.targetCharacterIds],
        inputSnapshot: { ...execution.inputSnapshot },
        ...(execution.outputSnapshot === undefined
          ? {}
          : { outputSnapshot: { ...execution.outputSnapshot } }),
      })),
      now,
      horizonDays,
    });

    const result: CreatorEventCandidateDto[] = [];
    for (const candidate of candidates) {
      if (
        candidate.projected &&
        candidate.occurrence &&
        await store.scheduledOccurrences.getByOccurrenceKey(
          worldId,
          candidate.occurrence.occurrenceKey,
        )
      ) {
        continue;
      }
      result.push(candidate);
    }
    return this.enrichCreatorCandidateRisks(result, repositories);
  }

  private creatorDispatchAvailable(): boolean {
    const store = this.store as ApiStore & { transaction?: unknown };
    return this.creatorDispatchEnabled &&
      store.dispatchRequests !== undefined &&
      typeof store.transaction === "function";
  }

  private async creatorWorkerStatus(): Promise<CreatorWorkerStatus> {
    const heartbeat = await this.store.dispatchRequests?.getHeartbeat(
      "living-network-worker",
    );
    if (!heartbeat) return "NOT_STARTED";
    if (heartbeat.status === "STOPPED") return "STOPPED";
    if (
      this.creatorClock().getTime() - Date.parse(heartbeat.heartbeatAt) >
      60_000
    ) {
      return "STALE";
    }
    return "RUNNING";
  }

  public async listCreatorEventCandidates(
    worldId: string,
    horizonDays = 7,
  ): Promise<CreatorEventCandidatesResponse> {
    const [candidates, workerStatus] = await Promise.all([
      this.scanCreatorCandidates(worldId, horizonDays),
      this.creatorWorkerStatus(),
    ]);
    return {
      candidates,
      dispatchAvailable: this.creatorDispatchAvailable(),
      workerStatus,
    };
  }

  public async previewCreatorEventDispatch(
    worldId: string,
    selections: readonly EventDispatchSelectionDto[],
  ): Promise<EventDispatchPreviewDto> {
    const candidates = await this.scanCreatorCandidates(worldId);
    return previewCreatorEventDispatch({ worldId, candidates, selections });
  }

  private async aggregateCreatorDispatchBatch(
    store: CreatorScanStore & {
      dispatchRequests: NonNullable<ApiStore["dispatchRequests"]>;
    },
    batchId: string,
  ): Promise<EventDispatchBatchDto> {
    const requests = await store.dispatchRequests.listByBatch(batchId);
    if (requests.length === 0) {
      throw new ApiError(404, "NOT_FOUND", "Creator dispatch batch not found");
    }

    const items: EventDispatchBatchItemDto[] = [];
    for (const request of requests) {
      const payload = request.payload as Partial<CreatorDispatchPayload>;
      const previousAttempt =
        typeof payload.previousAttempt === "number" ? payload.previousAttempt : 0;
      const [occurrence, latest] = await Promise.all([
        store.scheduledOccurrences.getById(request.occurrenceId),
        store.eventExecutions.getLatestByOccurrence(request.occurrenceId),
      ]);
      const freshExecution =
        latest !== undefined && latest.attempt > previousAttempt ? latest : undefined;
      let status: EventDispatchItemStatus =
        request.status === "PENDING" ? "PENDING_DISPATCH" : "DISPATCHED";
      if (freshExecution?.status === "RUNNING") status = "RUNNING";
      if (freshExecution?.status === "COMPLETED") status = "COMPLETED";
      if (freshExecution?.status === "FAILED") status = "FAILED";
      if (freshExecution?.status === "CANCELLED") status = "CANCELLED";
      if (!freshExecution && occurrence?.status === "CANCELLED") status = "CANCELLED";

      const action = parseDispatchAction(request.action);
      items.push({
        id: request.id,
        candidateId: request.candidateId,
        action,
        status,
        occurrenceId: request.occurrenceId,
        ...(freshExecution === undefined ? {} : { executionId: freshExecution.id }),
        ...(freshExecution?.outputSnapshot === undefined
          ? {}
          : { outputSnapshot: { ...freshExecution.outputSnapshot } }),
        ...(freshExecution?.failureReason === undefined
          ? {}
          : { failureReason: freshExecution.failureReason }),
        ...(freshExecution === undefined && request.lastError !== undefined
          ? { failureReason: request.lastError }
          : {}),
      });
    }

    const statuses = items.map((item) => item.status);
    let status: EventDispatchBatchStatus;
    if (statuses.includes("FAILED")) status = "FAILED";
    else if (statuses.includes("RUNNING")) status = "RUNNING";
    else if (statuses.includes("PENDING_DISPATCH")) status = "PENDING_DISPATCH";
    else if (statuses.includes("DISPATCHED")) status = "DISPATCHED";
    else if (statuses.every((item) => item === "COMPLETED")) status = "COMPLETED";
    else status = "CANCELLED";

    return {
      id: batchId,
      worldId: requests[0]!.storyWorldId,
      status,
      idempotencyKey: decodeURIComponent(batchId.slice("creator-batch:".length)),
      items,
      createdAt: requests.map((request) => request.requestedAt).sort()[0]!,
      updatedAt: requests
        .map((request) => request.enqueuedAt ?? request.requestedAt)
        .sort()
        .at(-1)!,
    };
  }

  public async createCreatorEventDispatch(
    worldId: string,
    input: CreateEventDispatchBatchRequest,
  ): Promise<EventDispatchBatchDto> {
    const store = this.requireCreatorDispatchStore();
    const batchId = creatorBatchId(input.idempotencyKey);
    const now = this.creatorClock();

    try {
      return await store.transaction(async (transaction) => {
        const existing = await transaction.dispatchRequests.listByBatch(batchId);
        if (existing.length > 0) {
          const storedSelections = new Set(
            existing.map((request) => `${request.candidateId}\u0000${request.action}`),
          );
          const requestedSelections = new Set(
            input.selections.map((selection) => `${selection.candidateId}\u0000${selection.action}`),
          );
          if (
            storedSelections.size !== requestedSelections.size ||
            [...storedSelections].some((selection) => !requestedSelections.has(selection))
          ) {
            throw new ApiError(
              409,
              "CONFLICT",
              "Dispatch idempotency key was already used with different selections",
            );
          }
          return this.aggregateCreatorDispatchBatch(transaction, batchId);
        }

        const candidates = await this.scanCreatorCandidates(
          worldId,
          7,
          transaction,
          now,
        );
        const preview = previewCreatorEventDispatch({
          worldId,
          candidates,
          selections: input.selections,
        });
        if (!preview.canDispatch) {
          throw new ApiError(
            409,
            "CONFLICT",
            "One or more creator event candidates changed before dispatch",
          );
        }
        const candidateById = new Map(
          candidates.map((candidate) => [candidate.id, candidate]),
        );

        for (const selection of input.selections) {
          const candidate = candidateById.get(selection.candidateId)!;
          const definition = await transaction.worldEventDefinitions.getById(
            candidate.definition.id,
          );
          if (!definition) {
            throw new ApiError(409, "CONFLICT", "Event definition changed before dispatch");
          }

          let occurrence: ScheduledOccurrence;
          if (selection.action === "RUN_TRIAL") {
            const occurrenceId = `creator-trial:${encodeURIComponent(batchId)}:${encodeURIComponent(candidate.id)}`;
            const stored = await transaction.scheduledOccurrences.save(
              createScheduledOccurrence({
                id: occurrenceId,
                definition,
                scheduledFor: now.toISOString(),
                occurrenceKey: occurrenceId,
                status: ScheduledOccurrenceStatus.PENDING,
                createdAt: now.toISOString(),
              }),
            );
            occurrence = stored.occurrence;
          } else if (candidate.projected && candidate.occurrence) {
            const stored = await transaction.scheduledOccurrences.save(
              createScheduledOccurrence({
                id: candidate.occurrence.id,
                definition,
                scheduledFor: candidate.occurrence.scheduledFor,
                occurrenceKey: candidate.occurrence.occurrenceKey,
                status: ScheduledOccurrenceStatus.PENDING,
                createdAt: now.toISOString(),
              }),
            );
            occurrence = stored.occurrence;
          } else {
            const occurrenceId = candidate.occurrence?.id;
            if (occurrenceId === undefined) {
              throw new ApiError(409, "CONFLICT", "Occurrence changed before dispatch");
            }
            const storedOccurrence =
              await transaction.scheduledOccurrences.getById(occurrenceId);
            if (!storedOccurrence) {
              throw new ApiError(409, "CONFLICT", "Occurrence changed before dispatch");
            }
            occurrence = storedOccurrence;
          }

          const latest = await transaction.eventExecutions.getLatestByOccurrence(
            occurrence.id,
          );
          const dispatchId = creatorDispatchId(batchId, candidate.id);
          const payload: CreatorDispatchPayload = {
            occurrenceId: occurrence.id,
            execution: {
              ruleVersion: "creator-dispatch-v1",
              inputSnapshot: {
                batchId,
                candidateId: candidate.id,
                action: selection.action,
              },
            },
            previousAttempt: latest?.attempt ?? 0,
          };
          const request: ExecutionDispatchRequest<CreatorDispatchPayload> = {
            id: dispatchId,
            batchId,
            candidateId: candidate.id,
            action: selection.action,
            idempotencyKey: `${batchId}:${candidate.id}:${selection.action}`,
            storyWorldId: worldId,
            occurrenceId: occurrence.id,
            payload,
            status: "PENDING",
            attempts: 0,
            requestedAt: now.toISOString(),
          };
          await transaction.dispatchRequests.save(request);
        }
        return this.aggregateCreatorDispatchBatch(transaction, batchId);
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Error && error.message.includes("idempotency")) {
        throw new ApiError(409, "CONFLICT", error.message);
      }
      throw error;
    }
  }

  public async getCreatorEventDispatchBatch(
    batchId: string,
  ): Promise<EventDispatchBatchDto> {
    const store = this.requireCreatorDispatchStore();
    return this.aggregateCreatorDispatchBatch(store, batchId);
  }

  public async listWorlds(): Promise<StoryWorldDto[]> {
    const worlds = await this.store.storyWorlds.list();
    return worlds.map(toWorldDto);
  }

  public async listCharacters(storyWorldId?: string): Promise<CharacterDto[]> {
    const characters = await this.store.characters.listByStoryWorld(storyWorldId);
    return characters.map(toCharacterDto);
  }

  public async listWorldLoreEntries(storyWorldId: string, query?: string): Promise<WorldLoreEntryDto[]> {
    const store = requireWorldLoreStore(this.store);
    if (!(await store.storyWorlds.getById(storyWorldId))) {
      throw new ApiError(404, "NOT_FOUND", "Story world not found");
    }
    const entries = query === undefined
      ? await store.worldLoreEntries.listByStoryWorld(storyWorldId)
      : await store.worldLoreEntries.search(storyWorldId, query);
    return entries.map(toWorldLoreEntryDto);
  }

  public async createWorldLoreEntry(input: CreateWorldLoreEntryRequest): Promise<WorldLoreEntryDto> {
    const store = requireWorldLoreStore(this.store);
    if (await store.worldLoreEntries.getById(input.id)) {
      throw new ApiError(409, "CONFLICT", "World lore entry already exists");
    }
    if (!(await store.storyWorlds.getById(input.storyWorldId))) {
      throw new ApiError(404, "NOT_FOUND", "Story world not found");
    }
    try {
      const now = new Date().toISOString();
      const entry = createWorldLoreEntryDomain({ ...input, createdAt: now, updatedAt: now });
      await store.worldLoreEntries.save(entry);
      return toWorldLoreEntryDto(entry);
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        throw new ApiError(400, "BAD_REQUEST", error.message);
      }
      throw error;
    }
  }

  public async updateWorldLoreEntry(
    id: string,
    input: UpdateWorldLoreEntryRequest,
  ): Promise<WorldLoreEntryDto> {
    const store = requireWorldLoreStore(this.store);
    const existing = await store.worldLoreEntries.getById(id);
    if (!existing) throw new ApiError(404, "NOT_FOUND", "World lore entry not found");
    try {
      const entry = createWorldLoreEntryDomain({
        id: existing.id,
        storyWorldId: existing.storyWorldId,
        category: input.category ?? existing.category,
        title: input.title ?? existing.title,
        content: input.content ?? existing.content,
        tags: input.tags ?? existing.tags,
        isEnabled: input.isEnabled ?? existing.isEnabled,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      });
      await store.worldLoreEntries.save(entry);
      return toWorldLoreEntryDto(entry);
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        throw new ApiError(400, "BAD_REQUEST", error.message);
      }
      throw error;
    }
  }

  public async deleteWorldLoreEntry(id: string): Promise<void> {
    const store = requireWorldLoreStore(this.store);
    if (!(await store.worldLoreEntries.getById(id))) {
      throw new ApiError(404, "NOT_FOUND", "World lore entry not found");
    }
    await store.worldLoreEntries.delete(id);
  }


  public async createStoryWorld(input: CreateStoryWorldRequest): Promise<StoryWorldDto> {
    if (await this.store.storyWorlds.getById(input.id)) {
      throw new ApiError(409, "CONFLICT", "Story world already exists");
    }
    try {
      const world = createStoryWorldDomain(input);
      await this.store.storyWorlds.save(world);
      return toWorldDto(world);
    } catch (error) {
      if (error instanceof TypeError) throw new ApiError(400, 'BAD_REQUEST', error.message);
      if (error instanceof RangeError) throw new ApiError(400, 'BAD_REQUEST', error.message);
      throw error;
    }
  }

  public async updateStoryWorld(id: string, input: UpdateStoryWorldRequest): Promise<StoryWorldDto> {
    const existing = await this.store.storyWorlds.getById(id);
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Story world not found');
    try {
      const storyMode = input.storyMode ?? existing.storyMode;
      const updated = createStoryWorldDomain({
        id: existing.id,
        name: input.name ?? existing.name,
        timezone: input.timezone ?? existing.timezone,
        storyMode,
        relationshipDynamicsEnabled: input.relationshipDynamicsEnabled
          ?? (input.storyMode === undefined
            ? existing.relationshipDynamicsEnabled
            : storyMode === "DYNAMIC"),
      });
      await this.store.storyWorlds.save(updated);
      return toWorldDto(updated);
    } catch (error) {
      if (error instanceof TypeError) throw new ApiError(400, 'BAD_REQUEST', error.message);
      if (error instanceof RangeError) throw new ApiError(400, 'BAD_REQUEST', error.message);
      throw error;
    }
  }

  public async createCharacter(input: CreateCharacterRequest): Promise<CharacterDto> {
    if (await this.store.characters.getById(input.id)) {
      throw new ApiError(409, "CONFLICT", "Character already exists");
    }
    if (!(await this.store.storyWorlds.getById(input.storyWorldId))) {
      throw new ApiError(404, "NOT_FOUND", "Story world not found");
    }
    try {
      const character = createCharacterDomain(input);
      await this.store.characters.save(character);
      return toCharacterDto(character);
    } catch (error) {
      if (error instanceof TypeError) throw new ApiError(400, 'BAD_REQUEST', error.message);
      if (error instanceof RangeError) throw new ApiError(400, 'BAD_REQUEST', error.message);
      throw error;
    }
  }

  public async updateCharacter(id: string, input: UpdateCharacterRequest): Promise<CharacterDto> {
    const existing = await this.store.characters.getById(id);
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Character not found');
    try {
      const updated = createCharacterDomain({
        id: existing.id,
        displayName: input.displayName ?? existing.displayName,
        role: existing.role,
        storyWorldId: existing.storyWorldId,
        timezone: input.timezone ?? existing.timezone,
        ...(input.birthDate !== undefined ? { birthDate: input.birthDate } : existing.birthDate !== undefined ? { birthDate: existing.birthDate } : {}),
        ...(input.personaPrompt !== undefined ? { personaPrompt: input.personaPrompt } : existing.personaPrompt !== undefined ? { personaPrompt: existing.personaPrompt } : {}),
        ...(input.personaPromptRef !== undefined ? { personaPromptRef: input.personaPromptRef } : existing.personaPromptRef !== undefined ? { personaPromptRef: existing.personaPromptRef } : {}),
        ...(input.visualPromptRef !== undefined ? { visualPromptRef: input.visualPromptRef } : existing.visualPromptRef !== undefined ? { visualPromptRef: existing.visualPromptRef } : {}),
      });
      await this.store.characters.save(updated);
      return toCharacterDto(updated);
    } catch (error) {
      if (error instanceof TypeError) throw new ApiError(400, 'BAD_REQUEST', error.message);
      if (error instanceof RangeError) throw new ApiError(400, 'BAD_REQUEST', error.message);
      throw error;
    }
  }

  public async listRelationships(storyWorldId: string): Promise<RelationshipEdgeDto[]> {
    if (!(await this.store.storyWorlds.getById(storyWorldId))) {
      throw new ApiError(404, "NOT_FOUND", "Story world not found");
    }
    return (await this.store.relationshipEdges.listByStoryWorld(storyWorldId))
      .map(toRelationshipEdgeDto);
  }

  public async createRelationship(input: CreateRelationshipEdgeRequest): Promise<RelationshipEdgeDto> {
    if (await this.store.relationshipEdges.getById(input.id)) {
      throw new ApiError(409, "CONFLICT", "Relationship already exists");
    }
    const world = await this.store.storyWorlds.getById(input.storyWorldId);
    if (!world) throw new ApiError(404, "NOT_FOUND", "Story world not found");
    const source = await this.store.characters.getById(input.sourceCharacterId);
    const target = await this.store.characters.getById(input.targetCharacterId);
    if (!source || !target) throw new ApiError(404, "NOT_FOUND", "Relationship character not found");
    try {
      const edge = createRelationshipEdgeDomain({
        id: input.id,
        source,
        target,
        storyWorld: world,
        relationshipType: input.relationshipType,
        initialState: input.initialState,
        isPublic: input.isPublic,
        isBidirectional: input.isBidirectional,
      });
      await this.store.relationshipEdges.save(edge);
      return toRelationshipEdgeDto(edge);
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  public async updateRelationship(id: string, input: UpdateRelationshipEdgeRequest): Promise<RelationshipEdgeDto> {
    const existing = await this.store.relationshipEdges.getById(id);
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Relationship not found");
    try {
      const updated = {
        ...existing,
        relationshipType: input.relationshipType ?? existing.relationshipType,
        initialState: { ...(input.initialState ?? existing.initialState) },
        isPublic: input.isPublic ?? existing.isPublic,
        isBidirectional: input.isBidirectional ?? existing.isBidirectional,
      };
      const world = await this.store.storyWorlds.getById(existing.storyWorldId);
      const source = await this.store.characters.getById(existing.sourceCharacterId);
      const target = await this.store.characters.getById(existing.targetCharacterId);
      if (!world || !source || !target) throw new ApiError(409, "CONFLICT", "Relationship references are invalid");
      const validated = createRelationshipEdgeDomain({
        id: updated.id,
        source,
        target,
        storyWorld: world,
        relationshipType: updated.relationshipType,
        initialState: updated.initialState,
        isPublic: updated.isPublic,
        isBidirectional: updated.isBidirectional,
      });
      await this.store.relationshipEdges.save(validated);
      return toRelationshipEdgeDto(validated);
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  public async createWorldEvent(input: CreateWorldEventDefinitionRequest): Promise<WorldEventDefinitionDto> {
    const store = requireEventCalendarStore(this.store);
    if (await store.worldEventDefinitions.getById(input.id)) {
      throw new ApiError(409, "CONFLICT", "World event already exists");
    }
    const world = await store.storyWorlds.getById(input.storyWorldId);
    if (!world) throw new ApiError(404, "NOT_FOUND", "Story world not found");
    const targetCharacters = await Promise.all(input.targetCharacterIds.map((id) => store.characters.getById(id)));
    const recipientIds = input.recipientCharacterIds ?? input.targetCharacterIds;
    const recipientCharacters = await Promise.all(recipientIds.map((id) => store.characters.getById(id)));
    if (targetCharacters.some((character) => character === undefined) || recipientCharacters.some((character) => character === undefined)) {
      throw new ApiError(404, "NOT_FOUND", "Event target or recipient character not found");
    }
    try {
      const definition = createWorldEventDefinitionDomain({
        id: input.id,
        storyWorld: world,
        eventKey: input.eventKey,
        name: input.name,
        triggerSource: input.triggerSource,
        ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
        recurrence: input.recurrence,
        targetCharacters: targetCharacters.filter((character): character is Character => character !== undefined),
        recipientCharacters: recipientCharacters.filter((character): character is Character => character !== undefined),
        ...(input.outputs === undefined ? {} : { outputs: input.outputs }),
        ...(input.priority === undefined ? {} : { priority: input.priority }),
        ...(input.cooldownSeconds === undefined ? {} : { cooldownSeconds: input.cooldownSeconds }),
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        createdAt: input.createdAt,
      });
      await store.worldEventDefinitions.save(definition);
      return toWorldEventDefinitionDto(definition);
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  public async updateWorldEvent(id: string, input: UpdateWorldEventDefinitionRequest): Promise<WorldEventDefinitionDto> {
    const store = requireEventCalendarStore(this.store);
    const existing = await store.worldEventDefinitions.getById(id);
    if (!existing) throw new ApiError(404, "NOT_FOUND", "World event not found");
    const targetIds = input.targetCharacterIds ?? existing.targetCharacterIds;
    const recipientIds = input.recipientCharacterIds ?? existing.recipientCharacterIds;
    const targetCharacters = await Promise.all(targetIds.map((characterId) => store.characters.getById(characterId)));
    const recipientCharacters = await Promise.all(recipientIds.map((characterId) => store.characters.getById(characterId)));
    if (targetCharacters.some((character) => character === undefined) || recipientCharacters.some((character) => character === undefined)) {
      throw new ApiError(404, "NOT_FOUND", "Event target or recipient character not found");
    }
    const world = await store.storyWorlds.getById(existing.storyWorldId);
    if (!world) throw new ApiError(409, "CONFLICT", "World event references an unknown story world");
    try {
      const definition = createWorldEventDefinitionDomain({
        id: existing.id,
        storyWorld: world,
        eventKey: input.eventKey ?? existing.eventKey,
        name: input.name ?? existing.name,
        triggerSource: input.triggerSource ?? existing.triggerSource,
        timezone: input.timezone ?? existing.timezone,
        recurrence: input.recurrence ?? existing.recurrence,
        targetCharacters: targetCharacters.filter((character): character is Character => character !== undefined),
        recipientCharacters: recipientCharacters.filter((character): character is Character => character !== undefined),
        outputs: { ...existing.outputs, ...input.outputs },
        priority: input.priority ?? existing.priority,
        ...(input.cooldownSeconds === undefined
          ? existing.cooldownSeconds === undefined ? {} : { cooldownSeconds: existing.cooldownSeconds }
          : { cooldownSeconds: input.cooldownSeconds }),
        enabled: input.enabled ?? existing.enabled,
        createdAt: existing.createdAt,
      });
      await store.worldEventDefinitions.save(definition);
      return toWorldEventDefinitionDto(definition);
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  public async getWorldCalendar(
    storyWorldId: string,
    startsAt: string,
    endsAt: string,
    limit = 200,
  ): Promise<WorldCalendarDto> {
    const store = requireEventCalendarStore(this.store);
    if (!(await store.storyWorlds.getById(storyWorldId))) {
      throw new ApiError(404, "NOT_FOUND", "Story world not found");
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new ApiError(400, "BAD_REQUEST", "limit must be an integer between 1 and 500");
    }
    try {
      const [definitions, occurrences] = await Promise.all([
        store.worldEventDefinitions.listByStoryWorld(storyWorldId),
        store.scheduledOccurrences.listByWindow(storyWorldId, startsAt, endsAt, limit),
      ]);
      return {
        storyWorldId,
        startsAt,
        endsAt,
        definitions: definitions.map(toWorldEventDefinitionDto),
        occurrences: occurrences.map(toScheduledOccurrenceDto),
      };
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        throw new ApiError(400, "BAD_REQUEST", error.message);
      }
      throw error;
    }
  }

  public async getCharacterVisualIdentity(
    characterId: string,
  ): Promise<CharacterVisualIdentityDto> {
    const store = requireVisualWorkflowStore(this.store);
    if (!(await store.characters.getById(characterId))) {
      throw new ApiError(404, "NOT_FOUND", "Character not found");
    }
    const identity = await store.characterVisualIdentities.getByCharacterId(characterId);
    if (!identity) throw new ApiError(404, "NOT_FOUND", "Character visual identity not found");
    return toCharacterVisualIdentityDto(identity);
  }

  public async listImageWorkflowTemplates(): Promise<ImageWorkflowTemplateDto[]> {
    const store = requireVisualWorkflowStore(this.store);
    return (await store.imageWorkflowTemplates.list()).map(toImageWorkflowTemplateDto);
  }

  public validateImageWorkflow(
    input: ValidateImageWorkflowRequest,
  ): ValidateImageWorkflowResultDto {
    try {
      const template = createImageWorkflowTemplate({
        id: input.id,
        version: input.version,
        workflow: input.workflow as JsonObject,
        positivePromptPath: input.positivePromptPath,
        ...(input.negativePromptPath === undefined
          ? {}
          : { negativePromptPath: input.negativePromptPath }),
        ...(input.seedPath === undefined ? {} : { seedPath: input.seedPath }),
      });
      assertImageWorkflowTemplateBindings(template);
      return {
        valid: true,
        id: template.id,
        version: template.version,
        checkedBindings: [
          "positivePromptPath",
          ...(template.negativePromptPath === undefined ? [] : ["negativePromptPath"]),
          ...(template.seedPath === undefined ? [] : ["seedPath"]),
        ],
      };
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        throw new ApiError(400, "BAD_REQUEST", error.message);
      }
      throw error;
    }
  }

  public async getImageJob(jobId: string): Promise<ImageJobDto> {
    const store = requireImageJobStore(this.store);
    const job = await store.imageJobs.getById(jobId);
    if (!job) throw new ApiError(404, "NOT_FOUND", "Image job not found");
    return toImageJobDto(job);
  }

  public async listImageAssets(storyWorldId: string): Promise<ImageAssetDto[]> {
    const store = requireImageAssetStore(this.store);
    const world = await store.storyWorlds.getById(storyWorldId);
    if (!world) throw new ApiError(404, "NOT_FOUND", "Story world not found");
    const jobs = await store.imageJobs.listSucceededByStoryWorld(storyWorldId);
    return Promise.all(jobs.map(async (job) => {
      const action = await store.behaviorActions.getById(job.actionId);
      if (!action) throw new ApiError(500, "INTERNAL_ERROR", "Image asset action is missing");
      return toImageAssetDto(job, action);
    }));
  }

  public async importImageWorkflow(input: { id: string; version: string; workflow: JsonObject; positivePromptPath?: string[]; negativePromptPath?: string[]; seedPath?: string[] }): Promise<ImageWorkflowTemplateDto> {
    const store = requireVisualWorkflowStore(this.store);
    try {
      const imported = importImageWorkflow(input.workflow);
      const template = createImageWorkflowTemplate({
        id: input.id,
        version: input.version,
        workflow: imported.workflow,
        positivePromptPath: input.positivePromptPath ?? imported.positivePromptPath,
        ...(input.negativePromptPath ?? imported.negativePromptPath ? { negativePromptPath: input.negativePromptPath ?? imported.negativePromptPath } : {}),
        ...(input.seedPath ?? imported.seedPath ? { seedPath: input.seedPath ?? imported.seedPath } : {}),
      });
      assertImageWorkflowTemplateBindings(template);
      await store.imageWorkflowTemplates.save(template);
      return toImageWorkflowTemplateDto(template);
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  /**
   * Records an explicit private-chat image request as a normal behavior action
   * and image job.  The small, disabled event record provides the execution
   * provenance required by the existing behavior/media persistence model; it
   * is never scheduled as a world event.
   */
  public async requestConversationImage(
    conversationId: string,
    input: RequestConversationImageRequest,
  ): Promise<ImageJobDto> {
    const store = requireConversationImageStore(this.store);
    const conversation = await store.conversations.getById(conversationId);
    if (!conversation) throw new ApiError(404, "NOT_FOUND", "Conversation not found");
    if (conversation.conversation.type !== "PRIVATE") {
      throw new ApiError(400, "BAD_REQUEST", "Image requests are only supported in private conversations");
    }
    if (conversation.conversation.storyWorldId === "") {
      throw new ApiError(400, "BAD_REQUEST", "Conversation story world is invalid");
    }
    const activeMembers = conversation.members.filter((member) => member.leftAt === undefined);
    const memberIds = new Set(activeMembers.map((member) => member.characterId));
    if (
      activeMembers.length !== 2 ||
      input.actorCharacterId === input.recipientCharacterId ||
      !memberIds.has(input.actorCharacterId) ||
      !memberIds.has(input.recipientCharacterId)
    ) {
      throw new ApiError(403, "FORBIDDEN", "Actor and recipient must be the two active private-conversation members");
    }

    const actor = await store.characters.getById(input.actorCharacterId);
    const recipient = await store.characters.getById(input.recipientCharacterId);
    const storyWorld = await store.storyWorlds.getById(conversation.conversation.storyWorldId);
    if (!actor || !recipient || !storyWorld) {
      throw new ApiError(404, "NOT_FOUND", "Conversation participants or story world not found");
    }
    if (actor.storyWorldId !== storyWorld.id || recipient.storyWorldId !== storyWorld.id) {
      throw new ApiError(403, "FORBIDDEN", "Conversation participants must belong to its story world");
    }

    const requestKey = encodeURIComponent(input.idempotencyKey);
    const prefix = `chat-image:${conversationId}:${requestKey}`;
    const actionId = `${prefix}:action`;
    const jobId = `${prefix}:job`;
    const existing = await store.imageJobs.getByActionId(actionId);
    if (existing) {
      if (
        existing.ownerCharacterId !== input.actorCharacterId ||
        existing.workflowVersion !== input.workflowVersion ||
        existing.prompt !== input.prompt
      ) {
        throw new ApiError(409, "CONFLICT", "Image request idempotency key was already used with different content");
      }
      return toImageJobDto(existing);
    }
    const conflictingJob = await store.imageJobs.getById(jobId);
    if (conflictingJob) {
      throw new ApiError(409, "CONFLICT", "Image request idempotency key conflicts with an existing job");
    }

    try {
      const eventKey = `${prefix}:request`;
      const definitionId = `${prefix}:definition`;
      const occurrenceId = `${prefix}:occurrence`;
      const executionId = `${prefix}:execution`;
      let definition = await store.worldEventDefinitions.getById(definitionId);
      if (!definition) {
        definition = createWorldEventDefinitionDomain({
          id: definitionId,
          storyWorld,
          eventKey,
          name: "Private chat image request",
          triggerSource: TriggerSource.USER_INTERACTION,
          recurrence: { kind: EventRecurrenceKind.ONCE, runAt: input.createdAt },
          targetCharacters: [actor],
          recipientCharacters: [recipient],
          outputs: { sendMessage: false, publishMoment: false, generateImage: true },
          enabled: false,
          createdAt: input.createdAt,
        });
        await store.worldEventDefinitions.save(definition);
      }
      let occurrence = await store.scheduledOccurrences.getById(occurrenceId);
      if (!occurrence) {
        occurrence = createScheduledOccurrence({
          id: occurrenceId,
          definition,
          scheduledFor: input.createdAt,
          occurrenceKey: occurrenceId,
          status: ScheduledOccurrenceStatus.RUNNING,
          createdAt: input.createdAt,
        });
        await store.scheduledOccurrences.save(occurrence);
      }
      let execution = await store.eventExecutions.getById(executionId);
      if (!execution) {
        execution = createEventExecution({
          id: executionId,
          occurrence,
          definition,
          ruleVersion: "chat-image-v1",
          inputSnapshot: {
            conversationId,
            actorCharacterId: input.actorCharacterId,
            recipientCharacterId: input.recipientCharacterId,
            idempotencyKey: input.idempotencyKey,
          },
          startedAt: input.createdAt,
        });
        await store.eventExecutions.save(execution);
      }
      let action = await store.behaviorActions.getById(actionId);
      if (!action) {
        action = createBehaviorAction({
          id: actionId,
          execution,
          actorCharacterId: input.actorCharacterId,
          kind: ActionKind.REQUEST_IMAGE,
          payload: {
            conversationId,
            recipientCharacterId: input.recipientCharacterId,
            prompt: input.prompt,
            workflowVersion: input.workflowVersion,
            ...(input.negativePrompt === undefined ? {} : { negativePrompt: input.negativePrompt }),
            ...(input.seed === undefined ? {} : { seed: input.seed }),
          },
          createdAt: input.createdAt,
        });
        await store.behaviorActions.save(action);
      } else if (
        action.actorCharacterId !== input.actorCharacterId ||
        action.payload.conversationId !== conversationId ||
        action.payload.recipientCharacterId !== input.recipientCharacterId ||
        action.payload.prompt !== input.prompt ||
        action.payload.workflowVersion !== input.workflowVersion
      ) {
        throw new ApiError(409, "CONFLICT", "Image request idempotency key was already used with different content");
      }
      const job = createImageJob({ id: jobId, action, createdAt: input.createdAt });
      await store.imageJobs.save(job);
      return toImageJobDto(job);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof TypeError || error instanceof RangeError) {
        throw new ApiError(400, "BAD_REQUEST", error.message);
      }
      throw error;
    }
  }

  /**
   * Settings-gated, best-effort convenience layer over requestConversationImage.
   * The worker remains solely responsible for talking to ComfyUI; this method
   * only persists an idempotent request after an AI reply has been saved.
   */
  private async requestAutomaticConversationImage(context: ConversationReplyContext): Promise<void> {
    if (!context.reply.inserted || context.conversation.conversation.type !== "PRIVATE") return;
    const settings = this.store.comfyUiSettings === undefined
      ? undefined
      : await this.store.comfyUiSettings.get();
    if (!settings?.autoImageIntentEnabled || !settings.defaultWorkflowVersion) return;
    const userContent = context.latestUserMessage?.text;
    const prompt = promptForExplicitChatImageIntent(userContent, context.reply.message.text ?? "");
    if (!prompt) return;
    const userId = context.latestUserMessage?.authorCharacterId;
    if (!userId || userId === context.ai.id) return;
    await this.requestConversationImage(context.conversation.conversation.id, {
      actorCharacterId: context.ai.id,
      recipientCharacterId: userId,
      prompt,
      workflowVersion: settings.defaultWorkflowVersion,
      createdAt: context.reply.message.createdAt,
      idempotencyKey: `auto-image:${context.reply.message.id}`,
    });
  }

  public async listStickerPacks(storyWorldId: string): Promise<StickerPackDto[]> {
    const store = requireStickerStore(this.store);
    if (!(await store.storyWorlds.getById(storyWorldId))) {
      throw new ApiError(404, "NOT_FOUND", "Story world not found");
    }
    return (await store.stickerPacks.listByStoryWorld(storyWorldId)).map(toStickerPackDto);
  }

  public async listStickers(packId: string): Promise<StickerDto[]> {
    const store = requireStickerStore(this.store);
    if (!(await store.stickerPacks.getById(packId))) {
      throw new ApiError(404, "NOT_FOUND", "Sticker pack not found");
    }
    return (await store.stickers.listByPack(packId)).map(toStickerDto);
  }

  public async importStickerPack(input: CreateStickerPackRequest): Promise<StickerPackImportResultDto> {
    const store = requireStickerStore(this.store);
    const world = await store.storyWorlds.getById(input.storyWorldId);
    if (!world) throw new ApiError(404, "NOT_FOUND", "Story world not found");
    try {
      const pack = createStickerPackDomain({
        id: input.id,
        storyWorld: world,
        name: input.name,
        createdAt: input.createdAt,
        ...(input.sourceRef === undefined ? {} : { sourceRef: input.sourceRef }),
      });
      const stickers = input.stickers.map((sticker) => createStickerDomain({
        id: sticker.id,
        pack,
        label: sticker.label,
        mediaRef: sticker.mediaRef,
        ...(sticker.tags === undefined ? {} : { tags: sticker.tags }),
        createdAt: input.createdAt,
      }));
await store.stickerPacks.save(pack);
for (const sticker of stickers) await store.stickers.save(sticker);
return toStickerPackImportResult(pack, stickers);
} catch (error) {
if (error instanceof TypeError || error instanceof RangeError) {
throw new ApiError(400, "BAD_REQUEST", error.message);
}
throw error;
}
}


  public async appendStickersToPack(packId: string, inputs: readonly CreateStickerInput[]): Promise<StickerPackImportResultDto> {
    const store = requireStickerStore(this.store);
    const pack = await store.stickerPacks.getById(packId);
    if (!pack) throw new ApiError(404, "NOT_FOUND", "Sticker pack not found");
    try {
      const stickers = inputs.map((sticker) => createStickerDomain({
        id: sticker.id,
        pack,
        label: sticker.label,
        mediaRef: sticker.mediaRef,
        ...(sticker.tags === undefined ? {} : { tags: sticker.tags }),
        createdAt: new Date().toISOString(),
      }));
      for (const sticker of stickers) await store.stickers.save(sticker);
      return toStickerPackImportResult(pack, stickers);
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        throw new ApiError(400, "BAD_REQUEST", error.message);
      }
      throw error;
    }
  }
public async getAppearanceSettings(ownerKey: string): Promise<AppearanceSettingsDto> {
const store = requireAppearanceStore(this.store);
const existing = await store.appearanceSettings.getByOwnerKey(ownerKey);
const settings = existing ?? createDefaultAppearanceSettings(ownerKey, new Date().toISOString());
return toAppearanceSettingsDto(settings);
}

  public async saveAppearanceSettings(
ownerKey: string,
input: UpdateAppearanceSettingsRequest,
): Promise<AppearanceSettingsDto> {
const store = requireAppearanceStore(this.store);
try {
const existing = await store.appearanceSettings.getByOwnerKey(ownerKey);
const settings = createAppearanceSettingsDomain({
id: existing?.id ?? `appearance-${ownerKey}`,
ownerKey,
themeId: input.themeId,
chatBackground: {
kind: input.chatBackground.kind === ChatBackgroundKind.CUSTOM
? ChatBackgroundKind.CUSTOM
: ChatBackgroundKind.THEME,
opacity: input.chatBackground.opacity,
blur: input.chatBackground.blur,
...(input.chatBackground.imageRef === undefined
? {}
: { imageRef: input.chatBackground.imageRef }),
...(input.chatBackground.items === undefined
? {}
: { items: input.chatBackground.items.map((item) => ({ ...item })) }),
},
updatedAt: new Date().toISOString(),
});
await store.appearanceSettings.save(settings);
return toAppearanceSettingsDto(settings);
} catch (error) {
if (error instanceof TypeError || error instanceof RangeError) {
throw new ApiError(400, "BAD_REQUEST", error.message);
}
throw error;
}
  }

  public async listLlmProviderProfiles(): Promise<LlmProviderProfileDto[]> {
    return (await requireLlmProviderProfileStore(this.store).llmProviderProfiles.list()).map((profile) => toLlmProviderProfileDto(profile));
  }

  public async saveLlmProviderProfile(input: SaveLlmProviderProfileRequest): Promise<LlmProviderProfileDto> {
    const store = requireLlmProviderProfileStore(this.store);
    const existing = await store.llmProviderProfiles.getById(input.id);
    const profiles = await store.llmProviderProfiles.list();
    const isOnlyProfile = profiles.every((profile) => profile.id === input.id);
    let encryptedApiKey = existing?.encryptedApiKey;
    let encryptionIv = existing?.encryptionIv;
    if (input.apiKey !== undefined) {
      if (!this.secretCipher) throw new ApiError(503, "SERVICE_UNAVAILABLE", "API key encryption is not configured");
      const encrypted = this.secretCipher.encrypt(input.apiKey);
      encryptedApiKey = encrypted.ciphertext;
      encryptionIv = encrypted.iv;
    }
    try {
      const profile = createLlmProviderProfileDomain({
        id: input.id, name: input.name, protocol: input.protocol, baseUrl: input.baseUrl, model: input.model,
        ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
        ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
        ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
        ...(encryptedApiKey === undefined ? {} : { encryptedApiKey }),
        ...(encryptionIv === undefined ? {} : { encryptionIv }),
        isActive: isOnlyProfile ? true : (input.isActive ?? existing?.isActive ?? false),
        createdAt: existing?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await store.llmProviderProfiles.save(profile);
      return toLlmProviderProfileDto(profile);
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  public async deleteLlmProviderProfile(id: string): Promise<void> {
    await requireLlmProviderProfileStore(this.store).llmProviderProfiles.delete(id);
  }

  public async getComfyUiSettings(): Promise<ComfyUiSettingsDto> {
    const settings = await requireComfyUiSettingsStore(this.store).comfyUiSettings.get();
    if (settings) return toComfyUiSettingsDto(settings);
    return toComfyUiSettingsDto(createComfyUiSettingsDomain({
      id: "default",
      baseUrl: "http://127.0.0.1:8188",
      autoImageIntentEnabled: false,
      updatedAt: new Date().toISOString(),
    }));
  }

  public async saveComfyUiSettings(input: UpdateComfyUiSettingsRequest): Promise<ComfyUiSettingsDto> {
    const store = requireComfyUiSettingsStore(this.store);
    try {
      const existing = await store.comfyUiSettings.get();
      const defaults = existing ?? createComfyUiSettingsDomain({
        id: "default",
        baseUrl: "http://127.0.0.1:8188",
        autoImageIntentEnabled: false,
        updatedAt: new Date().toISOString(),
      });
      const settings = createComfyUiSettingsDomain({ id: "default", baseUrl: input.baseUrl ?? defaults.baseUrl,
        timeoutMs: input.timeoutMs ?? defaults.timeoutMs,
        ...(input.defaultWorkflowVersion ?? defaults.defaultWorkflowVersion
          ? { defaultWorkflowVersion: input.defaultWorkflowVersion ?? defaults.defaultWorkflowVersion }
          : {}),
        autoImageIntentEnabled: input.autoImageIntentEnabled ?? defaults.autoImageIntentEnabled,
        updatedAt: new Date().toISOString() });
      await store.comfyUiSettings.save(settings);
      return toComfyUiSettingsDto(settings);
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  public async switchActorCharacter(
    input: ActorSessionSwitchRequest,
  ): Promise<ActorSessionDto> {
    const session = await this.store.actorSessions.getById(input.actorSessionId);
    if (!session) {
      throw new ApiError(404, "NOT_FOUND", "Actor session not found");
    }

    const nextCharacter = await this.store.characters.getById(input.nextCharacterId);
    if (!nextCharacter) {
      throw new ApiError(404, "NOT_FOUND", "Character not found");
    }

    try {
      const switched = applyActorCharacterSwitch(session, nextCharacter);
      await this.store.actorSessions.save(switched);
      return toSessionDto(switched);
    } catch (error) {
      if (error instanceof TypeError) {
        throw new ApiError(400, "BAD_REQUEST", error.message);
      }
      throw error;
    }
  }

  public async createConversation(
    input: CreateConversationRequest,
  ): Promise<ConversationDetailDto> {
    const store = requireChatStore(this.store);
    const storyWorld = await store.storyWorlds.getById(input.storyWorldId);
    if (!storyWorld) throw new ApiError(404, "NOT_FOUND", "Story world not found");
    const members = await Promise.all(
      input.memberCharacterIds.map(async (id) => {
        const character = await store.characters.getById(id);
        if (!character) throw new ApiError(404, "NOT_FOUND", `Character not found: ${id}`);
        return character;
      }),
    );
    try {
      const aggregate = createConversationDomain({
        id: input.id,
        storyWorld,
        type: input.type,
        createdAt: input.createdAt,
        members,
        ...(input.title === undefined ? {} : { title: input.title }),
      });
      await store.conversations.save(aggregate);
      return toConversationDto(aggregate);
    } catch (error) {
      if (error instanceof TypeError && error.message.startsWith("Duplicate")) {
        throw new ApiError(409, "CONFLICT", error.message);
      }
      if (error instanceof TypeError || error instanceof RangeError) {
        throw new ApiError(400, "BAD_REQUEST", error.message);
      }
      throw error;
    }
  }

  public async listConversations(characterId: string): Promise<ConversationDetailDto[]> {
    const store = requireChatStore(this.store);
    if (!(await store.characters.getById(characterId))) {
      throw new ApiError(404, "NOT_FOUND", "Character not found");
    }
    const conversations = await store.conversations.listByCharacter(characterId);
    return conversations.map(toConversationDto);
  }

  private async getConversationForMember(
    conversationId: string,
    characterId: string,
  ): Promise<{ store: ChatStore; conversation: ConversationAggregate }> {
    const store = requireChatStore(this.store);
    const conversation = await store.conversations.getById(conversationId);
    if (!conversation) throw new ApiError(404, "NOT_FOUND", "Conversation not found");
    const member = conversation.members.some(
      (candidate) => candidate.characterId === characterId && candidate.leftAt === undefined,
    );
    if (!member) throw new ApiError(403, "FORBIDDEN", "Character is not an active member");
    return { store, conversation };
  }

  public async listMessages(
    conversationId: string,
    characterId: string,
  ): Promise<MessageDto[]> {
    const { store } = await this.getConversationForMember(conversationId, characterId);
    const messages = await store.messages.listByConversation(conversationId);
    return messages.map(toMessageDto);
  }

  private automaticReplyState(
    status: AutomaticReplyState["status"],
    trace: AutomaticReplyTrace,
    sourceMessageId: string,
  ): AutomaticReplyState {
    return { status, correlationId: trace.correlationId, sourceMessageId };
  }

  private async scheduleAutomaticReply(
    conversationId: string,
    readerCharacterId: string,
    sourceMessageId: string,
    trace: AutomaticReplyTrace,
    requireLatest: boolean,
  ): Promise<ScheduledAutomaticReply> {
    const store = requireChatStore(this.store);
    const conversation = await store.conversations.getById(conversationId);
    if (!conversation) throw new ApiError(404, "NOT_FOUND", "Conversation not found");

    const characters = await Promise.all(
      conversation.members
        .filter((member) => member.leftAt === undefined)
        .map((member) => store.characters.getById(member.characterId)),
    );
    const ai = findEligibleAi(conversation, characters, readerCharacterId);
    const messages = await store.messages.listByConversation(conversationId);
    const source = messages.find((message) => message.id === sourceMessageId);
    if (!ai || !isEligibleSource(source, readerCharacterId) || !this.provider) {
      return { state: this.automaticReplyState("NOT_APPLICABLE", trace, sourceMessageId) };
    }

    const userIds = new Set(
      characters
        .filter((character) => character?.role === CharacterRole.USER)
        .map((character) => character!.id),
    );
    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.authorCharacterId !== undefined && userIds.has(message.authorCharacterId));
    if (requireLatest && latestUserMessage?.id !== sourceMessageId) {
      throw new ApiError(409, "CONFLICT", "sourceMessageId is not the latest USER message");
    }

    const deterministicId = assistantReplyId(conversationId, sourceMessageId);
    if (messages.some((message) => message.id === deterministicId)) {
      return { state: this.automaticReplyState("ALREADY_EXISTS", trace, sourceMessageId) };
    }

    const flightKey = automaticReplyFlightKey(conversationId, sourceMessageId);
    const active = this.replyFlights.get(flightKey);
    if (active) {
      return {
        state: this.automaticReplyState("QUEUED", trace, sourceMessageId),
        completion: active,
      };
    }

    const logBase = {
      source: "API" as const,
      category: "CHAT" as const,
      correlationId: trace.correlationId,
      ...(trace.requestId === undefined ? {} : { requestId: trace.requestId }),
      conversationId,
      actorId: readerCharacterId,
      entityType: "message",
      entityId: sourceMessageId,
    };
    void this.appendLog({ ...logBase, level: "INFO", action: "auto_reply.queued", outcome: "QUEUED" });

    let completion!: Promise<ConversationReply>;
    completion = (async (): Promise<ConversationReply> => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      await this.appendLog({ ...logBase, level: "INFO", action: "auto_reply.started", outcome: "STARTED" });
      try {
        const currentMessages = await store.messages.listByConversation(conversationId);
        const currentLatestUser = [...currentMessages]
          .reverse()
          .find((message) => message.authorCharacterId !== undefined && userIds.has(message.authorCharacterId));
        if (currentLatestUser?.id !== sourceMessageId) {
          throw new ApiError(409, "CONFLICT", "A newer USER message superseded this automatic reply");
        }        const reply = await new ConversationOrchestrator(
          this.store,
          this.provider!,
          this.conversationOptions,
        ).completeReply(conversationId, readerCharacterId, trace);
        await this.appendLog({
          ...logBase,
          level: "INFO",
          action: "auto_reply.completed",
          outcome: reply.inserted ? "SUCCESS" : "REPLAY",
          ...(previewMessage(reply.message.text) === undefined ? {} : { message: previewMessage(reply.message.text)! }),
          details: { replyMessageId: reply.message.id },
        });
        return reply;
      } catch (error) {
        await this.appendLog({
          ...logBase,
          level: "ERROR",
          action: "auto_reply.failed",
          outcome: "FAILURE",
          ...(previewMessage(error instanceof Error ? error.message : "Automatic reply failed") === undefined ? {} : { message: previewMessage(error instanceof Error ? error.message : "Automatic reply failed")! }),
          details: { retryable: true },
        });
        throw error;
      } finally {
        if (this.replyFlights.get(flightKey) === completion) this.replyFlights.delete(flightKey);
      }
    })();
    this.replyFlights.set(flightKey, completion);
    void completion.catch(() => undefined);
    return {
      state: this.automaticReplyState("QUEUED", trace, sourceMessageId),
      completion,
    };
  }

  public async sendMessage(
    conversationId: string,
    authorCharacterId: string | undefined,
    input: SendMessageRequest,
    trace: AutomaticReplyTrace = { correlationId: crypto.randomUUID(), conversationId },
  ): Promise<SendMessageWithAutoReplyResult> {
    const store = requireChatStore(this.store);
    const conversation = await store.conversations.getById(conversationId);
    if (!conversation) throw new ApiError(404, "NOT_FOUND", "Conversation not found");
    const author = authorCharacterId === undefined
      ? undefined
      : await store.characters.getById(authorCharacterId);
    if (authorCharacterId !== undefined && !author) {
      throw new ApiError(404, "NOT_FOUND", "Author character not found");
    }
    try {
      const message = createMessageDomain({
        id: input.id,
        conversation,
        kind: input.kind,
        createdAt: input.createdAt,
        idempotencyKey: input.idempotencyKey,
        ...(author === undefined ? {} : { author }),
        ...(input.text === undefined ? {} : { text: input.text }),
        ...(input.mediaRef === undefined ? {} : { mediaRef: input.mediaRef }),
        ...(input.stickerId === undefined ? {} : { stickerId: input.stickerId }),
      });
      const result = await store.messages.save(message);
      await this.appendLog({
        level: "INFO",
        source: "API",
        category: "CHAT",
        action: "message.save",
        outcome: result.inserted ? "SUCCESS" : "REPLAY",
        correlationId: trace.correlationId,
        ...(trace.requestId === undefined ? {} : { requestId: trace.requestId }),
        conversationId,
        ...(authorCharacterId === undefined ? {} : { actorId: authorCharacterId }),
        entityType: "message",
        entityId: result.message.id,
        ...(previewMessage(result.message.text) === undefined ? {} : { message: previewMessage(result.message.text)! }),
      });
      const scheduled = input.suppressAutoReply === true
        ? { state: this.automaticReplyState("NOT_APPLICABLE", trace, result.message.id) }
        : await this.scheduleAutomaticReply(
          conversationId,
          authorCharacterId ?? "",
          result.message.id,
          trace,
          false,
        );
      return {
        message: toMessageDto(result.message),
        inserted: result.inserted,
        autoReply: scheduled.state,
      };
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("idempotency")) {
        throw new ApiError(409, "CONFLICT", error.message);
      }
      if (error instanceof TypeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  public async retryAutomaticReply(
    conversationId: string,
    readerCharacterId: string,
    sourceMessageId: string | undefined,
    trace: AutomaticReplyTrace,
  ): Promise<RetryAutomaticReplyState> {
    const store = requireChatStore(this.store);
    const messages = await store.messages.listByConversation(conversationId);
    const selected = sourceMessageId ?? [...messages].reverse().find((message) => message.authorCharacterId === readerCharacterId)?.id;
    if (!selected) throw new ApiError(409, "CONFLICT", "Conversation has no USER message to retry");
    const scheduled = await this.scheduleAutomaticReply(
      conversationId,
      readerCharacterId,
      selected,
      trace,
      true,
    );
    if (scheduled.state.status !== "QUEUED" || !scheduled.completion) return scheduled.state;
    try {
      const reply = await scheduled.completion;
      return {
        status: "COMPLETED",
        correlationId: trace.correlationId,
        sourceMessageId: selected,
        messageId: reply.message.id,
      };
    } catch {
      return {
        status: "FAILED",
        correlationId: trace.correlationId,
        sourceMessageId: selected,
        retryable: true,
      };
    }
  }
  public async streamConversation(
    conversationId: string,
    characterId: string,
  ): Promise<Response> {
    if (!this.provider) {
      throw new ApiError(501, "NOT_IMPLEMENTED", "Chat provider is not configured");
    }
    try {
      const orchestrator = new ConversationOrchestrator(
        this.store,
        this.provider,
        {
          ...this.conversationOptions,
          afterReplySaved: async (context) => this.requestAutomaticConversationImage(context),
        },
      );
      return createSseResponse(orchestrator.streamReply(conversationId, characterId));
    } catch (error) {
      if (error instanceof TypeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  public async listMoments(
    storyWorldId: string,
    readerCharacterId: string,
    limit = 20,
  ): Promise<MomentDto[]> {
    const store = requireMomentStore(this.store);
    if (!(await store.storyWorlds.getById(storyWorldId))) {
      throw new ApiError(404, "NOT_FOUND", "Story world not found");
    }
    if (!(await store.characters.getById(readerCharacterId))) {
      throw new ApiError(404, "NOT_FOUND", "Reader character not found");
    }
    try {
      return (await store.moments.listFeed(storyWorldId, readerCharacterId, limit)).map(toMomentDto);
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        throw new ApiError(400, "BAD_REQUEST", error.message);
      }
      throw error;
    }
  }

  public async listMomentInteractions(
    momentId: string,
    readerCharacterId: string,
  ): Promise<MomentInteractionDto[]> {
    const store = requireMomentStore(this.store);
    const moment = await store.moments.getById(momentId);
    if (!moment) throw new ApiError(404, "NOT_FOUND", "Moment not found");
    if (!(await store.characters.getById(readerCharacterId))) {
      throw new ApiError(404, "NOT_FOUND", "Reader character not found");
    }
    if (!isMomentVisibleTo(moment, readerCharacterId)) {
      throw new ApiError(403, "FORBIDDEN", "Character cannot view this moment");
    }
    return (await store.momentInteractions.listByMoment(momentId)).map(toMomentInteractionDto);
  }

  public async createMomentInteraction(
    momentId: string,
    input: CreateMomentInteractionRequest,
  ): Promise<MomentInteractionWriteResultDto> {
    const store = requireMomentStore(this.store);
    const moment = await store.moments.getById(momentId);
    if (!moment) throw new ApiError(404, "NOT_FOUND", "Moment not found");
    const actor = await store.characters.getById(input.actorCharacterId);
    if (!actor) throw new ApiError(404, "NOT_FOUND", "Actor character not found");
    if (!isMomentVisibleTo(moment, actor.id)) {
      throw new ApiError(403, "FORBIDDEN", "Character cannot interact with this moment");
    }
    try {
      const interaction = createMomentInteractionDomain({
        id: input.id,
        moment,
        actor,
        kind: input.kind,
        createdAt: input.createdAt,
        idempotencyKey: input.idempotencyKey,
        ...(input.text === undefined ? {} : { text: input.text }),
      });
      const result = await store.momentInteractions.save(interaction);
      return { interaction: toMomentInteractionDto(result.interaction), inserted: result.inserted };
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("idempotency")) {
        throw new ApiError(409, "CONFLICT", error.message);
      }
      if (error instanceof TypeError || error instanceof RangeError) {
        throw new ApiError(400, "BAD_REQUEST", error.message);
      }
      throw error;
    }
  }

  public stop(): void { this.logging.stop(); }  public recordHttpCompletion(input: { method: string; pathname: string; status: number; durationMs: number; requestId?: string; correlationId: string }): void {
    if (input.pathname === "/health" || input.pathname === "/ready" || input.pathname.startsWith("/v1/interaction-logs")) return;
    void this.appendLog({ level: input.status >= 400 ? "ERROR" : "INFO", source: "API", category: "HTTP", action: `${input.method} ${input.pathname}`, outcome: input.status >= 400 ? "FAILURE" : "SUCCESS", durationMs: input.durationMs, correlationId: input.correlationId, ...(input.requestId === undefined ? {} : { requestId: input.requestId }), details: { method: input.method, pathname: input.pathname, status: input.status } });
  }

  private async appendLog(input: Omit<InteractionLogDto, "id" | "createdAt">): Promise<void> {
    try { await this.logging.append(input); } catch { /* logging is best effort */ }
  }

  private async listInteractionLogs(url: URL): Promise<unknown> {
    const rawLimit = url.searchParams.get("limit");
    const limit = rawLimit === null ? 100 : Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new ApiError(400, "BAD_REQUEST", "limit must be between 1 and 200");
    const enums: Record<string, readonly string[]> = { level: ["DEBUG", "INFO", "WARN", "ERROR"], source: ["API", "AI", "WORKER", "SYSTEM", "DATABASE", "PROVIDER"], category: ["HTTP", "CHAT", "LLM", "DISPATCH", "QUEUE", "EVENT_OUTPUT", "IMAGE", "WORKER_LIFECYCLE", "SYSTEM", "DATABASE", "AUTH", "PROVIDER"] };
    for (const key of ["level", "source", "category"] as const) { const value = url.searchParams.get(key); if (value !== null && !enums[key]!.includes(value)) throw new ApiError(400, "BAD_REQUEST", `${key} is invalid`); }
    const q: InteractionLogQuery = { limit };
    for (const key of ["cursor", "level", "source", "category", "action", "outcome", "requestId", "correlationId", "worldId", "actorId", "conversationId", "entityType", "entityId", "query", "createdAfter", "createdBefore"] as const) {
      const value = url.searchParams.get(key); if (value !== null && value.length > 0) (q as Record<string, unknown>)[key] = value;
    }
    try { return await this.logging.query(q); } catch (error) { throw new ApiError(400, "BAD_REQUEST", error instanceof Error ? error.message : "Invalid log query"); }
  }

  private async uploadChatImage(request: Request): Promise<StoredMedia> {
    const contentType = ((request.headers.get("content-type") ?? "").split(";", 1)[0] ?? "").trim().toLowerCase();
    const length = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > 12 * 1024 * 1024) {
      throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Image must be 12MB or smaller");
    }
    if (!contentType.startsWith("image/")) {
      throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Upload must be a PNG, JPEG, WebP, or GIF image");
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > 12 * 1024 * 1024) {
      throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Image must be 12MB or smaller");
    }
    try {
      return await this.media.put(bytes, contentType);
    } catch (error) {
      if (error instanceof TypeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  private async readLocalMedia(reference: string): Promise<Response> {
    try {
      const media = await this.media.get(reference);
      return new Response(media.bytes.buffer as ArrayBuffer, {
        headers: { "content-type": media.contentType, "cache-control": "public, max-age=31536000, immutable" },
      });
    } catch (error) {
      if (error instanceof TypeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw new ApiError(404, "NOT_FOUND", "Media not found");
      }
      throw error;
    }
  }

  private async testLlmProfile(id: string, correlationId: string): Promise<ProviderConnectionTestResultDto> {
    const store = requireLlmProviderProfileStore(this.store); const profile = await store.llmProviderProfiles.getById(id);
    if (!profile) throw new ApiError(404, "NOT_FOUND", "LLM provider profile not found");
    const started = Date.now();
    try {
      const key = profile.encryptedApiKey && profile.encryptionIv && this.secretCipher ? this.secretCipher.decrypt({ ciphertext: profile.encryptedApiKey, iv: profile.encryptionIv }) : undefined;
      const provider = createProviderFromProfile(profile, key);
      const result = await provider.complete({ messages: [{ role: "user", content: "Reply with exactly OK." }], model: profile.model, temperature: 0, maxTokens: 8 });
      return { success: true, ok: result.content.trim() === "OK", profileId: id, protocol: profile.protocol, model: result.model, latencyMs: Date.now() - started, preview: result.content.slice(0, 500), correlationId };
    } catch (error) {
      const e = error as ProviderError; return { success: false, ok: false, profileId: id, protocol: profile.protocol, model: profile.model, latencyMs: Date.now() - started, error: { code: e.code, message: e instanceof Error ? e.message.slice(0, 200) : "Provider test failed", ...(e.retryable === undefined ? {} : { retryable: e.retryable }), ...(e.status === undefined ? {} : { status: e.status }) }, correlationId };
    }
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
      const correlationId = (() => { const value = request.headers.get("x-correlation-id")?.trim(); return value && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value) ? value : crypto.randomUUID(); })();
      if (request.method === "GET" && url.pathname === "/health") {
        return jsonResponse({ status: "ok" });
      }

      if (url.pathname === "/v1/media/chat-images" || url.pathname === "/v1/media/images") {
        if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        this.trustedActor(request);
        return jsonResponse({ data: await this.uploadChatImage(request) }, 201);
      }
      const localMediaPath = /^\/v1\/media\/local\/([^/]+)$/.exec(url.pathname);
      if (localMediaPath) {
        if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        const filename = decodeURIComponent(localMediaPath[1] ?? "");
        return this.readLocalMedia(`media://local/${filename}`);
      }

      if (request.method === "GET" && url.pathname === "/ready") {
        try {
          await this.readiness?.();
        } catch {
          throw new ApiError(503, "SERVICE_UNAVAILABLE", "Service is not ready");
        }
        return jsonResponse({ status: "ready" });
      }

      const creatorCandidatesPath =
        /^\/v1\/creator\/worlds\/([^/]+)\/event-candidates$/.exec(
          url.pathname,
        );
      if (creatorCandidatesPath) {
        if (request.method !== "GET") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        const rawHorizonDays = url.searchParams.get("horizonDays");
        const horizonDays = rawHorizonDays === null ? 7 : Number(rawHorizonDays);
        return jsonResponse({
          data: await this.listCreatorEventCandidates(
            decodeURIComponent(creatorCandidatesPath[1] ?? ""),
            horizonDays,
          ),
        });
      }
      const creatorPreviewPath =
        /^\/v1\/creator\/worlds\/([^/]+)\/event-dispatches\/preview$/.exec(
          url.pathname,
        );
      if (creatorPreviewPath) {
        if (request.method !== "POST") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
        }
        const input = parseDispatchPreviewRequest(body);
        return jsonResponse({
          data: await this.previewCreatorEventDispatch(
            decodeURIComponent(creatorPreviewPath[1] ?? ""),
            input.selections,
          ),
        });
      }

      const creatorDispatchPath =
        /^\/v1\/creator\/worlds\/([^/]+)\/event-dispatches$/.exec(url.pathname);
      if (creatorDispatchPath) {
        if (request.method !== "POST") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        this.trustedActor(request);
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
        }
        return jsonResponse({
          data: await this.createCreatorEventDispatch(
            decodeURIComponent(creatorDispatchPath[1] ?? ""),
            parseCreateDispatchRequest(body),
          ),
        }, 201);
      }

      const creatorBatchPath =
        /^\/v1\/creator\/event-dispatches\/([^/]+)$/.exec(url.pathname);
      if (creatorBatchPath) {
        if (request.method !== "GET") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        return jsonResponse({
          data: await this.getCreatorEventDispatchBatch(
            decodeURIComponent(creatorBatchPath[1] ?? ""),
          ),
        });
      }

      if (url.pathname === "/v1/worlds") {
        if (request.method === "GET") return jsonResponse({ data: await this.listWorlds() });
        if (request.method === "POST") {
          this.trustedActor(request);
          let body: unknown;
          try { body = await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
          return jsonResponse({ data: await this.createStoryWorld(parseCreateStoryWorldRequest(body)) }, 201);
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
      }

      const worldIdPath = /^\/v1\/worlds\/([^/]+)$/.exec(url.pathname);
      if (worldIdPath && !url.pathname.endsWith('/calendar')) {
        const worldId = decodeURIComponent(worldIdPath[1] ?? '');
        if (request.method !== "PUT") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        this.trustedActor(request);
        let body: unknown;
        try { body = await request.json(); } catch { throw new ApiError(400, 'BAD_REQUEST', 'Request body must be valid JSON'); }
        return jsonResponse({ data: await this.updateStoryWorld(worldId, parseUpdateStoryWorldRequest(body)) });
      }

      if (url.pathname === "/v1/world-lore") {
        if (request.method === "GET") {
          const storyWorldId = url.searchParams.get("storyWorldId");
          if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId is required");
          const rawQuery = url.searchParams.get("q");
          const query = rawQuery === null ? undefined : bodyString(rawQuery, "q");
          return jsonResponse({ data: await this.listWorldLoreEntries(storyWorldId, query) });
        }
        if (request.method === "POST") {
          this.trustedActor(request);
          let body: unknown;
          try { body = await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
          return jsonResponse({ data: await this.createWorldLoreEntry(parseCreateWorldLoreEntryRequest(body)) }, 201);
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
      }

      const worldLorePath = /^\/v1\/world-lore\/([^/]+)$/.exec(url.pathname);
      if (worldLorePath) {
        const id = decodeURIComponent(worldLorePath[1] ?? "");
        if (request.method === "PUT") {
          this.trustedActor(request);
          let body: unknown;
          try { body = await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
          return jsonResponse({ data: await this.updateWorldLoreEntry(id, parseUpdateWorldLoreEntryRequest(body)) });
        }
        if (request.method === "DELETE") {
          this.trustedActor(request);
          await this.deleteWorldLoreEntry(id);
          return new Response(null, { status: 204 });
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
      }

      if (url.pathname === "/v1/world-events") {
        if (request.method === "GET") {
          const storyWorldId = url.searchParams.get("storyWorldId");
          if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId is required");
          const store = requireEventCalendarStore(this.store);
          if (!(await store.storyWorlds.getById(storyWorldId))) throw new ApiError(404, "NOT_FOUND", "Story world not found");
          return jsonResponse({ data: (await store.worldEventDefinitions.listByStoryWorld(storyWorldId)).map(toWorldEventDefinitionDto) });
        }
        if (request.method === "POST") {
          this.trustedActor(request);
          let body: unknown;
          try { body = await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
          return jsonResponse({ data: await this.createWorldEvent(parseCreateWorldEventDefinitionRequest(body)) }, 201);
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
      }

      const worldEventPath = /^\/v1\/world-events\/([^/]+)$/.exec(url.pathname);
      if (worldEventPath) {
        if (request.method !== "PUT") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        this.trustedActor(request);
        let body: unknown;
        try { body = await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
        return jsonResponse({ data: await this.updateWorldEvent(
          decodeURIComponent(worldEventPath[1] ?? ""),
          parseUpdateWorldEventDefinitionRequest(body),
        ) });
      }

      const calendarPath = /^\/v1\/worlds\/([^/]+)\/calendar$/.exec(url.pathname);
      if (calendarPath) {
        if (request.method !== "GET") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        const startsAt = url.searchParams.get("startsAt");
        const endsAt = url.searchParams.get("endsAt");
        if (!startsAt || !endsAt) {
          throw new ApiError(400, "BAD_REQUEST", "startsAt and endsAt are required");
        }
        const rawLimit = url.searchParams.get("limit");
        const limit = rawLimit === null ? 200 : Number(rawLimit);
        return jsonResponse({
          data: await this.getWorldCalendar(
            decodeURIComponent(calendarPath[1] ?? ""),
            startsAt,
            endsAt,
            limit,
          ),
        });
      }

      if (url.pathname === "/v1/characters") {
        if (request.method === "GET") {
          return jsonResponse({
            data: await this.listCharacters(url.searchParams.get("storyWorldId") ?? undefined),
          });
        }
        if (request.method === "POST") {
          this.trustedActor(request);
          let body: unknown;
          try { body = await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
          return jsonResponse({ data: await this.createCharacter(parseCreateCharacterRequest(body)) }, 201);
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
      }

      if (/^\/v1\/characters\/([^/]+)$/.test(url.pathname)) {
        const charId = decodeURIComponent(/^\/v1\/characters\/([^/]+)$/.exec(url.pathname)![1] ?? "");
        if (request.method !== "PUT") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        this.trustedActor(request);
        let body: unknown;
        try { body = await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
        return jsonResponse({ data: await this.updateCharacter(charId, parseUpdateCharacterRequest(body)) });
      }

      if (url.pathname === "/v1/relationships") {
        if (request.method === "POST") {
          this.trustedActor(request);
          let body: unknown;
          try { body = await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
          return jsonResponse({ data: await this.createRelationship(parseCreateRelationshipEdgeRequest(body)) }, 201);
        }
        if (request.method !== "GET") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        const storyWorldId = url.searchParams.get("storyWorldId");
        if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId is required");
        return jsonResponse({ data: await this.listRelationships(storyWorldId) });
      }

      const relationshipPath = /^\/v1\/relationships\/([^/]+)$/.exec(url.pathname);
      if (relationshipPath) {
        if (request.method !== "PUT") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        this.trustedActor(request);
        let body: unknown;
        try { body = await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
        return jsonResponse({ data: await this.updateRelationship(
          decodeURIComponent(relationshipPath[1] ?? ""),
          parseUpdateRelationshipEdgeRequest(body),
        ) });
      }

      const visualIdentityPath = /^\/v1\/characters\/([^/]+)\/visual-identity$/.exec(url.pathname);
      if (visualIdentityPath) {
        if (request.method !== "GET") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        return jsonResponse({
          data: await this.getCharacterVisualIdentity(
            decodeURIComponent(visualIdentityPath[1] ?? ""),
          ),
        });
      }

      if (url.pathname === "/v1/comfyui/workflows") {
        if (request.method === "POST") {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
          }
          return jsonResponse({ data: this.validateImageWorkflow(parseValidateImageWorkflowRequest(body)) });
        }
        if (request.method !== "GET") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        return jsonResponse({ data: await this.listImageWorkflowTemplates() });
      }

      const imageJobPath = /^\/v1\/image-jobs\/([^/]+)$/.exec(url.pathname);
      if (imageJobPath) {
        if (request.method !== "GET") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        return jsonResponse({
          data: await this.getImageJob(decodeURIComponent(imageJobPath[1] ?? "")),
        });
      }

      if (url.pathname === "/v1/image-assets") {
        if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        const storyWorldId = url.searchParams.get("storyWorldId");
        if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId is required");
        const actor = this.trustedActor(request);
        if (this.requireTrustedActor && actor !== undefined) {
          const character = await this.store.characters.getById(actor);
          if (!character || character.storyWorldId !== storyWorldId) {
            throw new ApiError(403, "FORBIDDEN", "Trusted actor cannot view this story-world album");
          }
        }
        return jsonResponse({ data: await this.listImageAssets(storyWorldId) });
      }

      if (url.pathname === "/v1/sticker-packs") {
        if (request.method === "POST") {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
          }
          const actor = this.trustedActor(request);
          const input = parseCreateStickerPackRequest(body);
          if (this.requireTrustedActor && actor !== undefined) {
            const character = await this.store.characters.getById(actor);
            if (!character || character.storyWorldId !== input.storyWorldId) {
              throw new ApiError(403, "FORBIDDEN", "Trusted actor cannot import into this story world");
            }
          }
          return jsonResponse({ data: await this.importStickerPack(input) });
        }
        if (request.method !== "GET") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        const storyWorldId = url.searchParams.get("storyWorldId");
        if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId is required");
        return jsonResponse({ data: await this.listStickerPacks(storyWorldId) });
      }

      const stickerPath = /^\/v1\/sticker-packs\/([^/]+)\/stickers$/.exec(url.pathname);
      if (stickerPath) {
        const packId = decodeURIComponent(stickerPath[1] ?? "");
        if (request.method === "POST") {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
          }
          const actor = this.trustedActor(request);
          if (this.requireTrustedActor && actor !== undefined) {
            const pack = await requireStickerStore(this.store).stickerPacks.getById(packId);
            if (!pack) throw new ApiError(404, "NOT_FOUND", "Sticker pack not found");
            const character = await this.store.characters.getById(actor);
            if (!character || character.storyWorldId !== pack.storyWorldId) {
              throw new ApiError(403, "FORBIDDEN", "Trusted actor cannot import into this sticker pack");
            }
          }
          return jsonResponse({ data: await this.appendStickersToPack(packId, parseAppendStickersRequest(body)) });
        }
        if (request.method !== "GET") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        return jsonResponse({
          data: await this.listStickers(packId),
        });
      }
      if (request.method === "GET" && url.pathname === "/v1/moments") {
        const storyWorldId = url.searchParams.get("storyWorldId");
        const readerCharacterId = url.searchParams.get("readerCharacterId");
        if (!storyWorldId || !readerCharacterId) {
          throw new ApiError(
            400,
            "BAD_REQUEST",
            "storyWorldId and readerCharacterId are required",
          );
        }
        this.trustedActor(request, readerCharacterId);
        const rawLimit = url.searchParams.get("limit");
        const limit = rawLimit === null ? 20 : Number(rawLimit);
        if (!Number.isSafeInteger(limit) || limit < 1) {
          throw new ApiError(400, "BAD_REQUEST", "limit must be a positive integer");
        }
        return jsonResponse({
          data: await this.listMoments(storyWorldId, readerCharacterId, limit),
        });
      }

      const momentInteractionsPath = /^\/v1\/moments\/([^/]+)\/interactions$/.exec(url.pathname);
      if (momentInteractionsPath) {
        const momentId = decodeURIComponent(momentInteractionsPath[1] ?? "");
        if (request.method === "GET") {
          const readerCharacterId = url.searchParams.get("readerCharacterId");
          if (!readerCharacterId) throw new ApiError(400, "BAD_REQUEST", "readerCharacterId is required");
          this.trustedActor(request, readerCharacterId);
          return jsonResponse({ data: await this.listMomentInteractions(momentId, readerCharacterId) });
        }
        if (request.method === "POST") {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
          }
          const input = parseCreateMomentInteractionRequest(body);
          this.trustedActor(request, input.actorCharacterId);
          return jsonResponse({
            data: await this.createMomentInteraction(momentId, input),
          });
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
      }

      if (request.method === "POST" && url.pathname === "/v1/conversations") {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
        }
        const input = parseCreateConversationRequest(body);
        const actor = this.trustedActor(request);
        if (this.requireTrustedActor && actor !== undefined && !input.memberCharacterIds.includes(actor)) {
          throw new ApiError(403, "FORBIDDEN", "Trusted actor must be a conversation member");
        }
        return jsonResponse({ data: await this.createConversation(input) });
      }

      if (url.pathname === "/v1/conversations" && request.method === "GET") {
        const characterId = url.searchParams.get("characterId");
        if (!characterId) throw new ApiError(400, "BAD_REQUEST", "characterId is required");
        this.trustedActor(request, characterId);
        return jsonResponse({ data: await this.listConversations(characterId) });
      }

      const retryReplyPath = /^\/v1\/conversations\/([^/]+)\/auto-reply\/retry$/.exec(url.pathname);
      if (retryReplyPath) {
        if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        let body: unknown;
        try { body = await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
        if (!isRecord(body)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
        assertAllowedBodyKeys(body, ["readerCharacterId", "sourceMessageId"]);
        const readerCharacterId = bodyString(body.readerCharacterId, "readerCharacterId");
        const sourceMessageId = body.sourceMessageId === undefined ? undefined : bodyString(body.sourceMessageId, "sourceMessageId");
        this.trustedActor(request, readerCharacterId);
        const conversationId = decodeURIComponent(retryReplyPath[1] ?? "");
        const trace: AutomaticReplyTrace = {
          correlationId,
          conversationId,
          actorId: readerCharacterId,
          ...(request.headers.get("x-request-id") === null ? {} : { requestId: request.headers.get("x-request-id")! }),
        };
        return jsonResponse({ data: await this.retryAutomaticReply(conversationId, readerCharacterId, sourceMessageId, trace) });
      }

      if (url.pathname === "/v1/comfyui/workflows/import") {
        if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        this.trustedActor(request);
        let body: unknown;
        try { body = await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
        return jsonResponse({ data: await this.importImageWorkflow(parseImportImageWorkflowRequest(body)) }, 201);
      }
      const messagePath = /^\/v1\/conversations\/([^/]+)\/messages$/.exec(url.pathname);
      if (messagePath) {
        const conversationId = decodeURIComponent(messagePath[1] ?? "");
        if (request.method === "GET") {
          const characterId = url.searchParams.get("characterId");
          if (!characterId) throw new ApiError(400, "BAD_REQUEST", "characterId is required");
          this.trustedActor(request, characterId);
          return jsonResponse({ data: await this.listMessages(conversationId, characterId) });
        }
        if (request.method === "POST") {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
          }
          const input = parseSendMessageRequest(body);
          const actor = this.trustedActor(request, input.authorCharacterId);
          if (this.requireTrustedActor && actor !== undefined && input.authorCharacterId === undefined) {
            throw new ApiError(403, "FORBIDDEN", "Public API cannot create system messages");
          }
          const trace: AutomaticReplyTrace = {
            correlationId,
            conversationId,
            ...(request.headers.get("x-request-id") === null ? {} : { requestId: request.headers.get("x-request-id")! }),
            ...(input.authorCharacterId === undefined ? {} : { actorId: input.authorCharacterId }),
          };
          return jsonResponse({
            data: await this.sendMessage(conversationId, input.authorCharacterId, input, trace),
          });
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
      }

      const conversationImagePath = /^\/v1\/conversations\/([^/]+)\/image-jobs$/.exec(url.pathname);
      if (conversationImagePath) {
        if (request.method !== "POST") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
        }
        const input = parseRequestConversationImageRequest(body);
        this.trustedActor(request, input.actorCharacterId);
        return jsonResponse({
          data: await this.requestConversationImage(
            decodeURIComponent(conversationImagePath[1] ?? ""),
            input,
          ),
        }, 201);
      }

      const streamPath = /^\/v1\/conversations\/([^/]+)\/stream$/.exec(url.pathname);
      if (streamPath) {
        if (request.method !== "GET") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        const characterId = url.searchParams.get("characterId");
        if (!characterId) throw new ApiError(400, "BAD_REQUEST", "characterId is required");
        this.trustedActor(request, characterId);
        return await this.streamConversation(
          decodeURIComponent(streamPath[1] ?? ""),
          characterId,
        );
      }

      if (request.method === "POST" && url.pathname === "/v1/actor-sessions/switch") {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
        }
        const input = parseSwitchRequest(body);
        const actor = this.trustedActor(request);
        if (this.requireTrustedActor) {
          const session = await this.store.actorSessions.getById(input.actorSessionId);
          if (!session) throw new ApiError(404, "NOT_FOUND", "Actor session not found");
          if (actor !== session.userCharacterId) {
            throw new ApiError(403, "FORBIDDEN", "Trusted actor does not own this session");
          }
        }
        return jsonResponse({ data: await this.switchActorCharacter(input) });
      }

      if (url.pathname === "/v1/appearance-settings") {
        const ownerKey = url.searchParams.get("ownerKey") ?? DEFAULT_APPEARANCE_OWNER_KEY;
        if (ownerKey.trim().length === 0) {
          throw new ApiError(400, "BAD_REQUEST", "ownerKey must be a non-empty string");
        }
        if (request.method === "GET") {
          return jsonResponse({ data: await this.getAppearanceSettings(ownerKey) });
        }
        if (request.method === "PUT") {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
          }
          return jsonResponse({
            data: await this.saveAppearanceSettings(
              ownerKey,
              parseUpdateAppearanceSettingsRequest(body),
            ),
          });
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
      }


      if (request.method === "GET" && url.pathname === "/v1/interaction-logs") {
        return withHeaders(jsonResponse({ data: await this.listInteractionLogs(url) }), { "x-correlation-id": correlationId, "x-request-id": request.headers.get("x-request-id") ?? "" });
      }
      const logStream = request.method === "GET" && url.pathname === "/v1/interaction-logs/stream";
      if (logStream) {
        const cursor = url.searchParams.get("cursor") ?? request.headers.get("last-event-id") ?? undefined;
        const history = await this.logging.query({ limit: 200, ...(cursor === undefined ? {} : { cursor }) });
        const encoder = new TextEncoder();
        let cleanupStream: (() => void) | undefined;
        const stream = new ReadableStream<Uint8Array>({
          start: (controller) => {
            let closed = false;
            const seen = new Set(history.items.map((item) => item.id));
            const writeLog = (item: InteractionLogDto): void => {
              if (closed || seen.has(item.id)) return;
              seen.add(item.id);
              const eventId = encodeInteractionLogCursor(item.createdAt, item.id);
              controller.enqueue(encoder.encode(`event: log\nid: ${eventId}\ndata: ${JSON.stringify(item)}\n\n`));
            };
            for (const item of history.items) {
              seen.delete(item.id);
              writeLog(item);
            }
            const unsubscribe = this.logging.subscribe(writeLog);
            const poll = setInterval(() => {
              void this.logging.query({ limit: 200 }).then((page) => { for (const item of page.items) writeLog(item); }).catch(() => undefined);
            }, 1_000);
            const keepalive = setInterval(() => { if (!closed) controller.enqueue(encoder.encode(": keepalive\n\n")); }, 15_000);
            const cleanup = (): void => { if (closed) return; closed = true; unsubscribe(); clearInterval(poll); clearInterval(keepalive); request.signal.removeEventListener("abort", cleanup); };
            cleanupStream = cleanup;
            request.signal.addEventListener("abort", cleanup, { once: true });
          },
          cancel: () => { cleanupStream?.(); },
        });
        return withHeaders(new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", "connection": "keep-alive" } }), { "x-correlation-id": correlationId });
      }
      const testPath = /^\/v1\/llm-provider-profiles\/([^/]+)\/test$/.exec(url.pathname);
      if (testPath) {
        if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        const result = await this.testLlmProfile(decodeURIComponent(testPath[1] ?? ""), correlationId);
        void this.appendLog({ level: result.success ? "INFO" : "ERROR", source: "API", category: "LLM", action: "provider.test", outcome: result.success ? "SUCCESS" : "FAILURE", correlationId, entityType: "llm-provider-profile", entityId: decodeURIComponent(testPath[1] ?? ""), ...(result.preview === undefined ? {} : { message: result.preview }) });
        return withHeaders(jsonResponse({ data: result }), { "x-correlation-id": correlationId });
      }
      if (url.pathname === "/v1/llm-provider-profiles") {
        if (request.method === "GET") return jsonResponse({ data: await this.listLlmProviderProfiles() });
        if (request.method === "PUT") {
          let body: unknown;
          try { body = await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
          return jsonResponse({ data: await this.saveLlmProviderProfile(parseSaveLlmProviderProfileRequest(body)) });
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
      }

      const llmProfilePath = /^\/v1\/llm-provider-profiles\/([^/]+)$/.exec(url.pathname);
      if (llmProfilePath) {
        if (request.method !== "DELETE") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        await this.deleteLlmProviderProfile(decodeURIComponent(llmProfilePath[1] ?? ""));
        return new Response(null, { status: 204 });
      }

      if (url.pathname === "/v1/comfyui/settings") {
        if (request.method === "GET") return jsonResponse({ data: await this.getComfyUiSettings() });
        if (request.method === "PUT") {
          let body: unknown;
          try { body = await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
          return jsonResponse({ data: await this.saveComfyUiSettings(parseUpdateComfyUiSettingsRequest(body)) });
        }
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
      }

      const knownPath =
        url.pathname === "/health" ||
        url.pathname === "/v1/worlds" ||
        url.pathname === "/v1/world-lore" ||
        url.pathname === "/v1/characters" ||
        url.pathname === "/v1/relationships" ||
        url.pathname === "/v1/comfyui/workflows" ||
        url.pathname === "/v1/image-assets" ||
        url.pathname === "/v1/sticker-packs" ||
        url.pathname === "/v1/moments" ||
        url.pathname === "/v1/conversations" ||
        url.pathname === "/v1/appearance-settings" ||
        url.pathname === "/v1/llm-provider-profiles" ||
        url.pathname === "/v1/comfyui/settings" ||
        url.pathname === "/v1/actor-sessions/switch";
      if (knownPath) {
        throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
      }
      throw new ApiError(404, "NOT_FOUND", "Route not found");
    } catch (error) {
      return errorResponse(error);
    }
  }
}
