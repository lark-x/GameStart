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
  createRelationshipEdge as createRelationshipEdgeDomain,
  createWorldEventDefinition as createWorldEventDefinitionDomain,
  createScheduledOccurrence,
  createEventExecution,
  createBehaviorAction,
  createImageJob,
  ActionKind,
  EventRecurrenceKind,
  ScheduledOccurrenceStatus,
  TriggerSource,
  createStoryWorld as createStoryWorldDomain,
  createCharacter as createCharacterDomain,
  assertImageWorkflowTemplateBindings,
  type JsonObject,
  type StoryWorld,
} from "../../../packages/domain/src/index.ts";
import {
  ProviderError,
  SecretCipher,
  type ChatDelta,
  type ChatProvider,
} from "../../../packages/ai/src/index.ts";
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
  StickerPackDto,
  StickerDto,
  CreateStickerPackRequest,
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
} from "../../../packages/contracts/src/index.ts";
import {
  createInMemoryRepositories,
  type DomainRepositories,
  type InMemoryRepositorySeed,
} from "../../../packages/database/src/index.ts";
import { ConversationOrchestrator } from "./conversation-orchestrator.ts";
import type { ConversationOrchestratorOptions, ConversationReplyContext } from "./conversation-orchestrator.ts";
import { promptForExplicitChatImageIntent } from "./auto-image-intent.ts";

export type ApiSeed = InMemoryRepositorySeed;

export type ApiStore = DomainRepositories;

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "SERVICE_UNAVAILABLE"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "NOT_IMPLEMENTED"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  public readonly statusCode: 401 | 400 | 403 | 404 | 405 | 409 | 500 | 501 | 503;
  public readonly code: ApiErrorCode;

  public constructor(
    statusCode: 401 | 400 | 403 | 404 | 405 | 409 | 500 | 501 | 503,
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
  identity: import("../../../packages/domain/src/index.ts").CharacterVisualIdentity,
): CharacterVisualIdentityDto {
  return {
    ...identity,
    styleTags: [...identity.styleTags],
    referenceImageRefs: [...identity.referenceImageRefs],
  };
}

function toImageWorkflowTemplateDto(
  template: import("../../../packages/domain/src/index.ts").ImageWorkflowTemplate,
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
  job: import("../../../packages/domain/src/index.ts").ImageJob,
): ImageJobDto {
  return { ...job };
}

function toStickerPackDto(
  pack: import("../../../packages/domain/src/index.ts").StickerPack,
): StickerPackDto {
  return { ...pack };
}

function toStickerDto(
  sticker: import("../../../packages/domain/src/index.ts").Sticker,
): StickerDto {
  return { ...sticker, tags: [...sticker.tags] };
}

function toStickerPackImportResult(
pack: import("../../../packages/domain/src/index.ts").StickerPack,
stickers: readonly import("../../../packages/domain/src/index.ts").Sticker[],
): StickerPackImportResultDto {
return { pack: toStickerPackDto(pack), stickers: stickers.map(toStickerDto) };
}

function toAppearanceSettingsDto(settings: AppearanceSettings): AppearanceSettingsDto {
return { ...settings, chatBackground: { ...settings.chatBackground } };
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

function parseCreateStickerPackRequest(value: unknown): CreateStickerPackRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["id", "storyWorldId", "name", "sourceRef", "createdAt", "stickers"]);
  if (!Array.isArray(value.stickers)) {
    throw new ApiError(400, "BAD_REQUEST", "stickers must be an array");
  }
  const stickers = value.stickers.map((item, index) => {
    if (!isRecord(item)) throw new ApiError(400, "BAD_REQUEST", `stickers[${index}] must be an object`);
    assertAllowedBodyKeys(item, ["id", "label", "mediaRef", "tags"]);
    const parsed: { id: string; label: string; mediaRef: string; tags?: string[] } = {
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

function parseChatBackgroundSettings(value: unknown): ChatBackgroundSettingsDto {
if (!isRecord(value)) {
throw new ApiError(400, "BAD_REQUEST", "chatBackground must be an object");
}
assertAllowedBodyKeys(value, ["kind", "imageRef", "opacity", "blur"]);
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

export class ApiApplication {
  public readonly store: ApiStore;
  public readonly provider: ChatProvider | undefined;
  private readonly conversationOptions: ConversationOrchestratorOptions;
  private readonly requireTrustedActor: boolean;
  private readonly readiness: (() => Promise<void>) | undefined;
  private readonly secretCipher: SecretCipher | undefined;

  public constructor(
    store: ApiStore,
    provider?: ChatProvider,
    conversationOptions: ConversationOrchestratorOptions = {},
    securityOptions: { requireTrustedActor?: boolean } = {},
    operationalOptions: { readiness?: () => Promise<void>; secretCipher?: SecretCipher } = {},
  ) {
    this.store = store;
    this.provider = provider;
    this.conversationOptions = conversationOptions;
    this.requireTrustedActor = securityOptions.requireTrustedActor ?? false;
    this.readiness = operationalOptions.readiness;
    this.secretCipher = operationalOptions.secretCipher;
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
        isActive: input.isActive ?? existing?.isActive ?? false,
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

  public async sendMessage(
    conversationId: string,
    authorCharacterId: string | undefined,
    input: SendMessageRequest,
  ): Promise<SendMessageResultDto> {
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
      return { message: toMessageDto(result.message), inserted: result.inserted };
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("idempotency")) {
        throw new ApiError(409, "CONFLICT", error.message);
      }
      if (error instanceof TypeError) {
        throw new ApiError(400, "BAD_REQUEST", error.message);
      }
      throw error;
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

  public async handle(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/health") {
        return jsonResponse({ status: "ok" });
      }

      if (request.method === "GET" && url.pathname === "/ready") {
        try {
          await this.readiness?.();
        } catch {
          throw new ApiError(503, "SERVICE_UNAVAILABLE", "Service is not ready");
        }
        return jsonResponse({ status: "ready" });
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
          return jsonResponse({
            data: this.validateImageWorkflow(parseValidateImageWorkflowRequest(body)),
          });
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
        if (request.method !== "GET") {
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
        }
        return jsonResponse({
          data: await this.listStickers(decodeURIComponent(stickerPath[1] ?? "")),
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
          return jsonResponse({
            data: await this.sendMessage(conversationId, input.authorCharacterId, input),
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
