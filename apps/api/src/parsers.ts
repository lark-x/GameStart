import {
  ChatBackgroundKind,
  LlmProviderProtocol,
  EventRecurrenceKind,
  TriggerSource,
  type JsonObject,
} from "../../../packages/domain/src/index.ts";
import type {
  ActorSessionSwitchRequest,
  CharacterId,
  ChatBackgroundSettingsDto,
  CreateCharacterRequest,
  CreateConversationRequest,
  CreateEventDispatchBatchRequest,
  CreateMomentInteractionRequest,
  CreateRelationshipEdgeRequest,
  CreateStickerPackRequest,
  CreateStoryWorldRequest,
  CreateWorldEventDefinitionRequest,
  CreateWorldLoreEntryRequest,
  EventDispatchSelectionDto,
  EventRecurrenceDto,
  RequestConversationImageRequest,
  SaveLlmProviderProfileRequest,
  SendMessageRequest,
  UpdateAppearanceSettingsRequest,
  UpdateCharacterRequest,
  UpdateComfyUiSettingsRequest,
  UpdateRelationshipEdgeRequest,
  UpdateStoryWorldRequest,
  UpdateWorldEventDefinitionRequest,
  UpdateWorldLoreEntryRequest,
  ValidateImageWorkflowRequest,
} from "../../../packages/contracts/src/index.ts";
import {
  ApiError,
  isRecord,
  bodyString,
  bodyNumber,
  assertAllowedBodyKeys,
  optionalBodyNumber,
  optionalBodyBoolean,
  bodyStringArray,
  parseOptionalNonNegativeInteger,
} from "./helpers.ts";

export function parseSwitchRequest(value: unknown): ActorSessionSwitchRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
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
    throw new ApiError(400, "BAD_REQUEST", "actorSessionId and nextCharacterId must be non-empty strings");
  }
  return {
    actorSessionId: value.actorSessionId as ActorSessionSwitchRequest["actorSessionId"],
    nextCharacterId: value.nextCharacterId as CharacterId,
  };
}

export function parseCreateStickerPackRequest(value: unknown): CreateStickerPackRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["id", "storyWorldId", "name", "sourceRef", "createdAt", "stickers"]);
  if (!Array.isArray(value.stickers)) throw new ApiError(400, "BAD_REQUEST", "stickers must be an array");
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

export function parseChatBackgroundItems(value: unknown): NonNullable<ChatBackgroundSettingsDto["items"]> | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ApiError(400, "BAD_REQUEST", "chatBackground.items must be an array");
  if (value.length > 12) throw new ApiError(400, "BAD_REQUEST", "chatBackground.items cannot contain more than 12 items");
  return value.map((item, index) => {
    if (!isRecord(item)) throw new ApiError(400, "BAD_REQUEST", `chatBackground.items[${index}] must be an object`);
    assertAllowedBodyKeys(item, ["id", "label", "kind", "imageRef", "createdAt"]);
    const kind = bodyString(item.kind, `chatBackground.items[${index}].kind`);
    if (kind !== ChatBackgroundKind.CUSTOM) throw new ApiError(400, "BAD_REQUEST", `chatBackground.items[${index}].kind must be custom`);
    return {
      id: bodyString(item.id, `chatBackground.items[${index}].id`),
      label: bodyString(item.label, `chatBackground.items[${index}].label`),
      kind,
      imageRef: bodyString(item.imageRef, `chatBackground.items[${index}].imageRef`),
      createdAt: bodyString(item.createdAt, `chatBackground.items[${index}].createdAt`),
    };
  });
}

export function parseAppendStickersRequest(value: unknown): import("../../../packages/contracts/src/index.ts").CreateStickerInput[] {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["stickers"]);
  if (!Array.isArray(value.stickers)) throw new ApiError(400, "BAD_REQUEST", "stickers must be an array");
  return value.stickers.map((item, index) => {
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
}

export function parseChatBackgroundSettings(value: unknown): ChatBackgroundSettingsDto {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "chatBackground must be an object");
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

export function parseUpdateAppearanceSettingsRequest(value: unknown): UpdateAppearanceSettingsRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["themeId", "chatBackground"]);
  return {
    themeId: bodyString(value.themeId, "themeId"),
    chatBackground: parseChatBackgroundSettings(value.chatBackground),
  };
}

export function parseSaveLlmProviderProfileRequest(value: unknown): SaveLlmProviderProfileRequest {
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

export function parseUpdateComfyUiSettingsRequest(value: unknown): UpdateComfyUiSettingsRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["baseUrl", "timeoutMs", "defaultWorkflowVersion", "autoImageIntentEnabled"]);
  const result: UpdateComfyUiSettingsRequest = {
    baseUrl: bodyString(value.baseUrl, "baseUrl"),
  };
  const timeoutMs = optionalBodyNumber(value.timeoutMs, "timeoutMs");
  const autoImageIntentEnabled = optionalBodyBoolean(value.autoImageIntentEnabled, "autoImageIntentEnabled");
  if (timeoutMs !== undefined) result.timeoutMs = timeoutMs;
  if (autoImageIntentEnabled !== undefined) result.autoImageIntentEnabled = autoImageIntentEnabled;
  if (value.defaultWorkflowVersion !== undefined) {
    result.defaultWorkflowVersion = bodyString(value.defaultWorkflowVersion, "defaultWorkflowVersion");
  }
  return result;
}

export function parseValidateImageWorkflowRequest(value: unknown): ValidateImageWorkflowRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["id", "version", "workflow", "positivePromptPath", "negativePromptPath", "seedPath"]);
  if (!isRecord(value.workflow)) throw new ApiError(400, "BAD_REQUEST", "workflow must be an object");
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

export function parseCreateConversationRequest(value: unknown): CreateConversationRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["id", "storyWorldId", "type", "title", "createdAt", "memberCharacterIds"]);
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

export function parseSendMessageRequest(value: unknown): SendMessageRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["id", "authorCharacterId", "kind", "text", "mediaRef", "stickerId", "suppressAutoReply", "createdAt", "idempotencyKey"]);
  if (value.kind !== "TEXT" && value.kind !== "IMAGE" && value.kind !== "STICKER" && value.kind !== "SYSTEM") {
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

export function parseCreateMomentInteractionRequest(value: unknown): CreateMomentInteractionRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["id", "actorCharacterId", "kind", "text", "createdAt", "idempotencyKey"]);
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

export function parseCreateStoryWorldRequest(value: unknown): CreateStoryWorldRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["id", "name", "timezone", "storyMode", "relationshipDynamicsEnabled"]);
  if (value.storyMode !== "STATIC" && value.storyMode !== "DYNAMIC") {
    throw new ApiError(400, "BAD_REQUEST", "storyMode must be STATIC or DYNAMIC");
  }
  if (typeof value.relationshipDynamicsEnabled !== "boolean") {
    throw new ApiError(400, "BAD_REQUEST", "relationshipDynamicsEnabled must be a boolean");
  }
  return {
    id: bodyString(value.id, "id"),
    name: bodyString(value.name, "name"),
    timezone: bodyString(value.timezone, "timezone"),
    storyMode: value.storyMode,
    relationshipDynamicsEnabled: value.relationshipDynamicsEnabled,
  };
}

export function parseUpdateStoryWorldRequest(value: unknown): UpdateStoryWorldRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["name", "timezone", "storyMode", "relationshipDynamicsEnabled"]);
  const result: UpdateStoryWorldRequest = {};
  if (value.name !== undefined) result.name = bodyString(value.name, "name");
  if (value.timezone !== undefined) result.timezone = bodyString(value.timezone, "timezone");
  if (value.storyMode !== undefined) {
    if (value.storyMode !== "STATIC" && value.storyMode !== "DYNAMIC") {
      throw new ApiError(400, "BAD_REQUEST", "storyMode must be STATIC or DYNAMIC");
    }
    result.storyMode = value.storyMode;
  }
  if (value.relationshipDynamicsEnabled !== undefined) {
    if (typeof value.relationshipDynamicsEnabled !== "boolean") {
      throw new ApiError(400, "BAD_REQUEST", "relationshipDynamicsEnabled must be a boolean");
    }
    result.relationshipDynamicsEnabled = value.relationshipDynamicsEnabled;
  }
  return result;
}

export function parseImportImageWorkflowRequest(value: unknown): {
  id: string;
  version: string;
  workflow: JsonObject;
  positivePromptPath?: string[];
  negativePromptPath?: string[];
  seedPath?: string[];
} {
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

export function parseRequestConversationImageRequest(value: unknown): RequestConversationImageRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["actorCharacterId", "recipientCharacterId", "prompt", "workflowVersion", "negativePrompt", "seed", "createdAt", "idempotencyKey"]);
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

export function parseWorldLoreTags(value: unknown, field = "tags"): string[] {
  if (!Array.isArray(value)) throw new ApiError(400, "BAD_REQUEST", `${field} must be an array`);
  return value.map((tag, index) => bodyString(tag, `${field}[${index}]`));
}

export function parseCreateWorldLoreEntryRequest(value: unknown): CreateWorldLoreEntryRequest {
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

export function parseUpdateWorldLoreEntryRequest(value: unknown): UpdateWorldLoreEntryRequest {
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

export function parseCreateCharacterRequest(value: unknown): CreateCharacterRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["id", "displayName", "role", "storyWorldId", "timezone", "birthDate", "personaPrompt", "personaPromptRef", "visualPromptRef"]);
  if (value.role !== "AI" && value.role !== "USER") {
    throw new ApiError(400, "BAD_REQUEST", "role must be AI or USER");
  }
  const result: CreateCharacterRequest = {
    id: bodyString(value.id, "id"),
    displayName: bodyString(value.displayName, "displayName"),
    role: value.role,
    storyWorldId: bodyString(value.storyWorldId, "storyWorldId"),
    timezone: bodyString(value.timezone, "timezone"),
  };
  if (value.birthDate !== undefined) result.birthDate = bodyString(value.birthDate, "birthDate");
  if (value.personaPrompt !== undefined) result.personaPrompt = bodyString(value.personaPrompt, "personaPrompt");
  if (value.personaPromptRef !== undefined) result.personaPromptRef = bodyString(value.personaPromptRef, "personaPromptRef");
  if (value.visualPromptRef !== undefined) result.visualPromptRef = bodyString(value.visualPromptRef, "visualPromptRef");
  return result;
}

export function parseUpdateCharacterRequest(value: unknown): UpdateCharacterRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["displayName", "timezone", "birthDate", "personaPrompt", "personaPromptRef", "visualPromptRef"]);
  const result: UpdateCharacterRequest = {};
  if (value.displayName !== undefined) result.displayName = bodyString(value.displayName, "displayName");
  if (value.timezone !== undefined) result.timezone = bodyString(value.timezone, "timezone");
  if (value.birthDate !== undefined) result.birthDate = bodyString(value.birthDate, "birthDate");
  if (value.personaPrompt !== undefined) result.personaPrompt = bodyString(value.personaPrompt, "personaPrompt");
  if (value.personaPromptRef !== undefined) result.personaPromptRef = bodyString(value.personaPromptRef, "personaPromptRef");
  if (value.visualPromptRef !== undefined) result.visualPromptRef = bodyString(value.visualPromptRef, "visualPromptRef");
  return result;
}

export function parseRelationshipState(value: unknown): CreateRelationshipEdgeRequest["initialState"] {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "initialState must be an object");
  assertAllowedBodyKeys(value, ["affinity", "trust", "conflict", "dependency"]);
  const result = { affinity: value.affinity, trust: value.trust, conflict: value.conflict, dependency: value.dependency };
  for (const [key, numberValue] of Object.entries(result)) {
    if (typeof numberValue !== "number" || !Number.isFinite(numberValue)) {
      throw new ApiError(400, "BAD_REQUEST", `initialState.${key} must be a finite number`);
    }
  }
  return result as CreateRelationshipEdgeRequest["initialState"];
}

export function parseCreateRelationshipEdgeRequest(value: unknown): CreateRelationshipEdgeRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["id", "sourceCharacterId", "targetCharacterId", "storyWorldId", "relationshipType", "initialState", "isPublic", "isBidirectional"]);
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

export function parseUpdateRelationshipEdgeRequest(value: unknown): UpdateRelationshipEdgeRequest {
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

export function parseEventRecurrence(value: unknown): EventRecurrenceDto {
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
    return { kind: EventRecurrenceKind.ANNUAL, month: value.month, day: value.day, localTime: bodyString(value.localTime, "recurrence.localTime") };
  }
  throw new ApiError(400, "BAD_REQUEST", "recurrence.kind must be ONCE or ANNUAL");
}

export function parseTargetCharacterIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new ApiError(400, "BAD_REQUEST", "targetCharacterIds must be an array");
  return value.map((item, index) => bodyString(item, `targetCharacterIds[${index}]`));
}

export function parseEventOutputs(value: unknown): NonNullable<CreateWorldEventDefinitionRequest["outputs"]> {
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

export function parseTriggerSource(value: unknown): CreateWorldEventDefinitionRequest["triggerSource"] {
  if (typeof value !== "string" || !Object.values(TriggerSource).includes(value as TriggerSource)) {
    throw new ApiError(400, "BAD_REQUEST", "triggerSource is invalid");
  }
  return value as CreateWorldEventDefinitionRequest["triggerSource"];
}

export function parseCreateWorldEventDefinitionRequest(value: unknown): CreateWorldEventDefinitionRequest {
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

export function parseUpdateWorldEventDefinitionRequest(value: unknown): UpdateWorldEventDefinitionRequest {
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

export function parseDispatchAction(value: unknown): EventDispatchSelectionDto["action"] {
  if (value !== "EXECUTE_EXISTING" && value !== "RETRY_FAILED" && value !== "RUN_TRIAL") {
    throw new ApiError(400, "BAD_REQUEST", "action is invalid");
  }
  return value;
}

export function parseDispatchSelections(value: unknown): EventDispatchSelectionDto[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError(400, "BAD_REQUEST", "selections must be a non-empty array");
  }
  const selections = value.map((selection, index) => {
    if (!isRecord(selection)) throw new ApiError(400, "BAD_REQUEST", `selections[${index}] must be an object`);
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

export function parseDispatchPreviewRequest(value: unknown): { selections: EventDispatchSelectionDto[] } {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["selections"]);
  return { selections: parseDispatchSelections(value.selections) };
}

export function parseCreateDispatchRequest(value: unknown): CreateEventDispatchBatchRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["idempotencyKey", "selections"]);
  return {
    idempotencyKey: bodyString(value.idempotencyKey, "idempotencyKey"),
    selections: parseDispatchSelections(value.selections),
  };
}
