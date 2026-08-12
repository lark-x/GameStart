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
import { parseOptionalStringArray, parseStoryArcStatus, parseStoryNodeType, parseStoryNodeStatus, parseStoryNodeTimeMode, parseStoryEdgeType, parsePromptTemplateType } from "./helpers.ts";

export function parseCreateStoryArcRequest(value: unknown): CreateStoryArcRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["id", "storyWorldId", "title", "summary", "status", "startAt", "endAt"]);
  const result: CreateStoryArcRequest = {
    id: bodyString(value.id, "id"),
    storyWorldId: bodyString(value.storyWorldId, "storyWorldId"),
    title: bodyString(value.title, "title"),
  };
  if (value.summary !== undefined) result.summary = bodyString(value.summary, "summary");
  if (value.status !== undefined) result.status = parseStoryArcStatus(value.status, "status");
  if (value.startAt !== undefined) result.startAt = bodyString(value.startAt, "startAt");
  if (value.endAt !== undefined) result.endAt = bodyString(value.endAt, "endAt");
  return result;
}

export function parseUpdateStoryArcRequest(value: unknown): UpdateStoryArcRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["title", "summary", "status", "startAt", "endAt"]);
  const result: UpdateStoryArcRequest = {};
  if (value.title !== undefined) result.title = bodyString(value.title, "title");
  if (value.summary !== undefined) result.summary = bodyString(value.summary, "summary");
  if (value.status !== undefined) result.status = parseStoryArcStatus(value.status, "status");
  if (value.startAt !== undefined) result.startAt = bodyString(value.startAt, "startAt");
  if (value.endAt !== undefined) result.endAt = bodyString(value.endAt, "endAt");
  return result;
}

export function parseCreateStoryNodeRequest(value: unknown): CreateStoryNodeRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, [
    "id", "storyWorldId", "arcId", "title", "nodeType", "status", "timeMode",
    "scheduledAt", "windowStart", "windowEnd", "summary", "generationGoal",
    "requiredFacts", "involvedCharacterIds", "referencedMemoryIds", "creatorNotes",
    "priority", "locked",
  ]);
  const result: CreateStoryNodeRequest = {
    id: bodyString(value.id, "id"),
    storyWorldId: bodyString(value.storyWorldId, "storyWorldId"),
    arcId: bodyString(value.arcId, "arcId"),
    title: bodyString(value.title, "title"),
    nodeType: parseStoryNodeType(value.nodeType, "nodeType"),
    timeMode: parseStoryNodeTimeMode(value.timeMode, "timeMode"),
  };
  if (value.status !== undefined) result.status = parseStoryNodeStatus(value.status, "status");
  if (value.scheduledAt !== undefined) result.scheduledAt = bodyString(value.scheduledAt, "scheduledAt");
  if (value.windowStart !== undefined) result.windowStart = bodyString(value.windowStart, "windowStart");
  if (value.windowEnd !== undefined) result.windowEnd = bodyString(value.windowEnd, "windowEnd");
  if (value.summary !== undefined) result.summary = bodyString(value.summary, "summary");
  if (value.generationGoal !== undefined) result.generationGoal = bodyString(value.generationGoal, "generationGoal");
  if (value.requiredFacts !== undefined) result.requiredFacts = bodyStringArray(value.requiredFacts, "requiredFacts");
  if (value.involvedCharacterIds !== undefined) result.involvedCharacterIds = bodyStringArray(value.involvedCharacterIds, "involvedCharacterIds");
  if (value.referencedMemoryIds !== undefined) result.referencedMemoryIds = bodyStringArray(value.referencedMemoryIds, "referencedMemoryIds");
  if (value.creatorNotes !== undefined) result.creatorNotes = bodyString(value.creatorNotes, "creatorNotes");
  if (value.priority !== undefined) result.priority = parseOptionalNonNegativeInteger(value.priority, "priority");
  if (value.locked !== undefined) {
    if (typeof value.locked !== "boolean") throw new ApiError(400, "BAD_REQUEST", "locked must be a boolean");
    result.locked = value.locked;
  }
  return result;
}

export function parseUpdateStoryNodeRequest(value: unknown): UpdateStoryNodeRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, [
    "title", "nodeType", "status", "timeMode", "scheduledAt", "windowStart",
    "windowEnd", "summary", "generationGoal", "requiredFacts", "involvedCharacterIds",
    "referencedMemoryIds", "creatorNotes", "priority", "locked",
  ]);
  const result: UpdateStoryNodeRequest = {};
  if (value.title !== undefined) result.title = bodyString(value.title, "title");
  if (value.nodeType !== undefined) result.nodeType = parseStoryNodeType(value.nodeType, "nodeType");
  if (value.status !== undefined) result.status = parseStoryNodeStatus(value.status, "status");
  if (value.timeMode !== undefined) result.timeMode = parseStoryNodeTimeMode(value.timeMode, "timeMode");
  if (value.scheduledAt !== undefined) result.scheduledAt = bodyString(value.scheduledAt, "scheduledAt");
  if (value.windowStart !== undefined) result.windowStart = bodyString(value.windowStart, "windowStart");
  if (value.windowEnd !== undefined) result.windowEnd = bodyString(value.windowEnd, "windowEnd");
  if (value.summary !== undefined) result.summary = bodyString(value.summary, "summary");
  if (value.generationGoal !== undefined) result.generationGoal = bodyString(value.generationGoal, "generationGoal");
  if (value.requiredFacts !== undefined) result.requiredFacts = bodyStringArray(value.requiredFacts, "requiredFacts");
  if (value.involvedCharacterIds !== undefined) result.involvedCharacterIds = bodyStringArray(value.involvedCharacterIds, "involvedCharacterIds");
  if (value.referencedMemoryIds !== undefined) result.referencedMemoryIds = bodyStringArray(value.referencedMemoryIds, "referencedMemoryIds");
  if (value.creatorNotes !== undefined) result.creatorNotes = bodyString(value.creatorNotes, "creatorNotes");
  if (value.priority !== undefined) result.priority = parseOptionalNonNegativeInteger(value.priority, "priority");
  if (value.locked !== undefined) {
    if (typeof value.locked !== "boolean") throw new ApiError(400, "BAD_REQUEST", "locked must be a boolean");
    result.locked = value.locked;
  }
  return result;
}

export function parseCreateStoryEdgeRequest(value: unknown): CreateStoryEdgeRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["id", "storyWorldId", "arcId", "fromNodeId", "toNodeId", "edgeType", "condition", "weight"]);
  const result: CreateStoryEdgeRequest = {
    id: bodyString(value.id, "id"),
    storyWorldId: bodyString(value.storyWorldId, "storyWorldId"),
    arcId: bodyString(value.arcId, "arcId"),
    fromNodeId: bodyString(value.fromNodeId, "fromNodeId"),
    toNodeId: bodyString(value.toNodeId, "toNodeId"),
    edgeType: parseStoryEdgeType(value.edgeType, "edgeType"),
  };
  if (value.condition !== undefined) result.condition = bodyString(value.condition, "condition");
  if (value.weight !== undefined) result.weight = bodyNumber(value.weight, "weight");
  return result;
}

export function parseUpdateStoryEdgeRequest(value: unknown): UpdateStoryEdgeRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["edgeType", "condition", "weight"]);
  const result: UpdateStoryEdgeRequest = {};
  if (value.edgeType !== undefined) result.edgeType = parseStoryEdgeType(value.edgeType, "edgeType");
  if (value.condition !== undefined) result.condition = bodyString(value.condition, "condition");
  if (value.weight !== undefined) result.weight = bodyNumber(value.weight, "weight");
  return result;
}

export function parseCreatePromptTemplateRequest(value: unknown): CreatePromptTemplateRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["id", "storyWorldId", "type", "name", "content", "isDefault"]);
  const result: CreatePromptTemplateRequest = {
    id: bodyString(value.id, "id"),
    storyWorldId: bodyString(value.storyWorldId, "storyWorldId"),
    type: parsePromptTemplateType(value.type, "type"),
    name: bodyString(value.name, "name"),
    content: bodyString(value.content, "content"),
  };
  if (value.isDefault !== undefined) {
    if (typeof value.isDefault !== "boolean") throw new ApiError(400, "BAD_REQUEST", "isDefault must be a boolean");
    result.isDefault = value.isDefault;
  }
  return result;
}

export function parseUpdatePromptTemplateRequest(value: unknown): UpdatePromptTemplateRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["type", "name", "content", "isDefault"]);
  const result: UpdatePromptTemplateRequest = {};
  if (value.type !== undefined) result.type = parsePromptTemplateType(value.type, "type");
  if (value.name !== undefined) result.name = bodyString(value.name, "name");
  if (value.content !== undefined) result.content = bodyString(value.content, "content");
  if (value.isDefault !== undefined) {
    if (typeof value.isDefault !== "boolean") throw new ApiError(400, "BAD_REQUEST", "isDefault must be a boolean");
    result.isDefault = value.isDefault;
  }
  return result;
}

export function parseCreateMemoryCandidateRequest(value: unknown): CreateMemoryCandidateRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["id", "storyWorldId", "sourceRef", "content", "rationale", "confidence"]);
  const result: CreateMemoryCandidateRequest = {
    id: bodyString(value.id, "id"),
    storyWorldId: bodyString(value.storyWorldId, "storyWorldId"),
    sourceRef: bodyString(value.sourceRef, "sourceRef"),
    content: bodyString(value.content, "content"),
    confidence: bodyNumber(value.confidence, "confidence"),
  };
  if (value.rationale !== undefined) result.rationale = bodyString(value.rationale, "rationale");
  return result;
}

export function parseReviewMemoryCandidateRequest(value: unknown): ReviewMemoryCandidateRequest {
  if (!isRecord(value)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
  assertAllowedBodyKeys(value, ["reviewerCharacterId", "content", "status", "mergedIntoMemoryId"]);
  if (value.status !== "APPROVED" && value.status !== "REJECTED" && value.status !== "MERGED") {
    throw new ApiError(400, "BAD_REQUEST", "status must be APPROVED, REJECTED, or MERGED");
  }
  const result: ReviewMemoryCandidateRequest = { status: value.status };
  if (value.reviewerCharacterId !== undefined) result.reviewerCharacterId = bodyString(value.reviewerCharacterId, "reviewerCharacterId");
  if (value.content !== undefined) result.content = bodyString(value.content, "content");
  if (value.mergedIntoMemoryId !== undefined) result.mergedIntoMemoryId = bodyString(value.mergedIntoMemoryId, "mergedIntoMemoryId");
  return result;
}

