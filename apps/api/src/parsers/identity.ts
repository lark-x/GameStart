import {
  ChatBackgroundKind,
  LlmProviderProtocol,
  EventRecurrenceKind,
  TriggerSource,
  type JsonObject,
} from "@living-network/domain";
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
  CreateStoryArcRequest,
  CreateStoryNodeRequest,
  CreateStoryEdgeRequest,
  CreatePromptTemplateRequest,
  CreateMemoryCandidateRequest,
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
  UpdateStoryArcRequest,
  UpdateStoryNodeRequest,
  UpdateStoryEdgeRequest,
  UpdateStoryWorldRequest,
  UpdatePromptTemplateRequest,
  ReviewMemoryCandidateRequest,
  UpdateWorldEventDefinitionRequest,
  UpdateWorldLoreEntryRequest,
  ValidateImageWorkflowRequest,
} from "@living-network/contracts";
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
} from "../helpers.ts";

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

export function parseAppendStickersRequest(value: unknown): import("@living-network/contracts").CreateStickerInput[] {
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

