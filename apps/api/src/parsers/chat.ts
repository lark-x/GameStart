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

