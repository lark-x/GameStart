import type {
  V2CharacterId,
  V2CharacterProfileInput,
  V2CharacterRelationshipType,
  V2CharacterRelationshipVisibility,
  V2UpsertCharacterRelationshipRequest,
  V2CharacterContextPreviewRequest,
  V2CreateCharacterStateDefinitionRequest,
  V2UpdateCharacterStateDefinitionRequest,
  V2UpsertCharacterVisualVariantRequest,
  V2UpsertCharacterEventDefinitionRequest,
  V2UpdateCharacterProactivePolicyRequest,
  V2ArcId,
  V2CandidateId,
  V2ChoiceId,
  V2CreateReleaseRequest,
  V2CreateRuntimeSaveRequest,
  V2CreateArcRequest,
  V2CreateCharacterRequest,
  V2CreateCharacterCandidateRequest,
  V2CreateChoiceRequest,
  V2CreateFactRequest,
  V2CreateLocationRequest,
  V2CreateRuleRequest,
  V2CreateSceneRequest,
  V2CreateStoryWorldRequest,
  V2CreateStateVariableRequest,
  V2CreateTimelineEventRequest,
  V2FactVisibility,
  V2IdempotencyKey,
  V2LocationId,
  V2LoadRuntimeSaveRequest,
  V2PreviewStateDeltaRequest,
  V2Revision,
  V2RuleSeverity,
  V2SceneId,
  V2SceneCandidatePayload,
  V2StateComparisonOperator,
  V2StateConsequenceOperation,
  V2StateDeltaDto,
  V2ChoiceConsequenceDto,
  V2StateGateDto,
  V2StateValue,
  V2StateValueType,
  V2StoryWorldId,
  V2SubmitSceneCandidateRequest,
  V2ReviewCandidateRequest,
  V2ReleaseId,
  V2RunId,
  V2SaveId,
  V2StartRuntimeRunRequest,
  V2SubmitRuntimeChoiceRequest,
} from "@living-network/contracts/v2";

import { V2HttpError } from "./errors.ts";
import type {
  V2UpdateArcRequest,
  V2UpdateCharacterRequest,
  V2UpdateChoiceRequest,
  V2UpdateFactRequest,
  V2UpdateLocationRequest,
  V2UpdateRuleRequest,
  V2UpdateSceneRequest,
  V2UpdateStateVariableRequest,
  V2UpdateStoryWorldRequest,
  V2UpdateTimelineEventRequest,
} from "@living-network/contracts/v2";


export function parseCreateWorldBody(body: unknown): V2CreateStoryWorldRequest {
  const value = requireBody(body);
  assertKeys(value, ["storyWorldId", "name", "summary", "idempotencyKey"]);
  return {
    storyWorldId: requiredString(value.storyWorldId, "storyWorldId") as V2StoryWorldId,
    name: requiredString(value.name, "name"),
    ...(value.summary === undefined ? {} : { summary: requiredString(value.summary, "summary") }),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCreateCharacterCandidateBody(body: unknown): V2CreateCharacterCandidateRequest {
  const value = requireRevisionedBody(body, ["candidateId", "kind", "targetScope", "payload", "provenance", "contextHash"]);
  if (value.payload === undefined) throw new V2HttpError(400, "BAD_REQUEST", "payload is required");
  if (value.provenance === undefined) throw new V2HttpError(400, "BAD_REQUEST", "provenance is required");
  const kinds = ["profile_patch", "relationship_upsert", "visual_variant_upsert", "memory_promotion", "state_delta", "relationship_delta", "event_definition_upsert", "event_instance_transition"] as const;
  if (!kinds.includes(value.kind as never)) throw new V2HttpError(400, "BAD_REQUEST", "kind is not supported");
  return { candidateId: requiredString(value.candidateId, "candidateId") as never, kind: value.kind as V2CreateCharacterCandidateRequest["kind"], targetScope: requiredString(value.targetScope, "targetScope"), payload: value.payload, provenance: value.provenance, ...(value.contextHash === undefined ? {} : { contextHash: requiredString(value.contextHash, "contextHash") }), expectedRevision: requiredRevision(value.expectedRevision), idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey };
}

export function parseCreateLocationBody(body: unknown): V2CreateLocationRequest {
  const value = requireRevisionedBody(body, ["locationId", "name", "summary"]);
  return {
    locationId: requiredString(value.locationId, "locationId") as V2LocationId,
    name: requiredString(value.name, "name"),
    ...(value.summary === undefined ? {} : { summary: value.summary === null ? null : requiredString(value.summary, "summary") }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCreateCharacterBody(body: unknown): V2CreateCharacterRequest {
  const value = requireRevisionedBody(body, ["characterId", "name", "summary", "homeLocationId", "personaText", "profile"]);
  return {
    characterId: requiredString(value.characterId, "characterId") as V2CharacterId,
    name: requiredString(value.name, "name"),
    ...(value.summary === undefined ? {} : { summary: value.summary === null ? null : requiredString(value.summary, "summary") }),
    ...(value.personaText === undefined ? {} : { personaText: value.personaText === null ? null : requiredString(value.personaText, "personaText") }),
    ...(value.homeLocationId === undefined ? {} : { homeLocationId: value.homeLocationId === null ? null : requiredString(value.homeLocationId, "homeLocationId") as V2LocationId }),
    ...(value.profile === undefined ? {} : { profile: value.profile === null ? null : parseCharacterProfile(value.profile) }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseUpsertCharacterRelationshipBody(body: unknown): V2UpsertCharacterRelationshipRequest {
  const value = requireRevisionedBody(body, ["relationshipId", "fromCharacterId", "toCharacterId", "type", "customLabel", "description", "strength", "visibility"]);
  const type = requiredString(value.type, "type") as V2CharacterRelationshipType;
  const visibility = requiredString(value.visibility, "visibility") as V2CharacterRelationshipVisibility;
  if (!["friend", "family", "romantic", "enemy", "mentor", "student", "colleague", "rival", "unknown", "custom"].includes(type)) throw new V2HttpError(400, "BAD_REQUEST", "invalid relationship type");
  if (!["creator_only", "player_visible"].includes(visibility)) throw new V2HttpError(400, "BAD_REQUEST", "invalid relationship visibility");
  if (typeof value.strength !== "number" || !Number.isInteger(value.strength) || value.strength < -100 || value.strength > 100) throw new V2HttpError(400, "BAD_REQUEST", "strength must be an integer between -100 and 100");
  return {
    relationshipId: requiredString(value.relationshipId, "relationshipId") as never,
    fromCharacterId: requiredString(value.fromCharacterId, "fromCharacterId") as V2CharacterId,
    toCharacterId: requiredString(value.toCharacterId, "toCharacterId") as V2CharacterId,
    type,
    ...(value.customLabel === undefined ? {} : { customLabel: value.customLabel === null ? null : requiredString(value.customLabel, "customLabel") }),
    ...(value.description === undefined ? {} : { description: value.description === null ? null : requiredString(value.description, "description") }),
    strength: value.strength,
    visibility,
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCharacterContextPreviewBody(body: unknown): V2CharacterContextPreviewRequest {
  const value = requireRevisionedBody(body, ["task", "characterIds", "currentInput", "tokenBudget"]);
  const task = requiredString(value.task, "task") as V2CharacterContextPreviewRequest["task"];
  if (!["chat", "story_analyze", "scene_generation", "image_generation"].includes(task)) throw new V2HttpError(400, "BAD_REQUEST", "invalid context task");
  if (value.tokenBudget !== undefined && (typeof value.tokenBudget !== "number" || !Number.isInteger(value.tokenBudget) || value.tokenBudget < 1)) throw new V2HttpError(400, "BAD_REQUEST", "tokenBudget must be a positive integer");
  return {
    task,
    ...(value.characterIds === undefined ? {} : { characterIds: requiredStringArray(value.characterIds, "characterIds") as V2CharacterContextPreviewRequest["characterIds"] }),
    ...(value.currentInput === undefined ? {} : { currentInput: requiredString(value.currentInput, "currentInput") }),
    ...(value.tokenBudget === undefined ? {} : { tokenBudget: value.tokenBudget }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  } as unknown as V2CharacterContextPreviewRequest;
}

export function parseCreateCharacterStateDefinitionBody(body: unknown): V2CreateCharacterStateDefinitionRequest {
  const value = requireRevisionedBody(body, ["stateDefinitionId", "characterId", "key", "valueType", "defaultValue", "constraints"]);
  const valueType = requiredString(value.valueType, "valueType") as V2CreateCharacterStateDefinitionRequest["valueType"];
  if (!["string", "number", "boolean"].includes(valueType)) throw new V2HttpError(400, "BAD_REQUEST", "invalid valueType");
  if ((valueType === "string" && typeof value.defaultValue !== "string") || (valueType === "number" && typeof value.defaultValue !== "number") || (valueType === "boolean" && typeof value.defaultValue !== "boolean")) throw new V2HttpError(400, "BAD_REQUEST", "defaultValue does not match valueType");
  return {
    stateDefinitionId: requiredString(value.stateDefinitionId, "stateDefinitionId") as never,
    characterId: requiredString(value.characterId, "characterId") as V2CharacterId,
    key: requiredString(value.key, "key"),
    valueType,
    defaultValue: value.defaultValue as string | number | boolean,
    ...(value.constraints === undefined ? {} : { constraints: parseScalarRecord(value.constraints, "constraints") }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseUpdateCharacterStateDefinitionBody(body: unknown): V2UpdateCharacterStateDefinitionRequest {
  const value = requireRevisionedBody(body, ["defaultValue", "constraints"]);
  if (!["string", "number", "boolean"].includes(typeof value.defaultValue)) throw new V2HttpError(400, "BAD_REQUEST", "defaultValue must be a scalar");
  return {
    defaultValue: value.defaultValue as string | number | boolean,
    ...(value.constraints === undefined ? {} : { constraints: parseScalarRecord(value.constraints, "constraints") }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseUpsertCharacterVisualVariantBody(body: unknown): V2UpsertCharacterVisualVariantRequest {
  const value = requireRevisionedBody(body, ["visualVariantId", "characterId", "name", "appearance", "loras", "triggerWords", "negativePrompt", "workflowPreset", "isDefault", "referenceAssetIds"]);
  const loras = value.loras === undefined ? undefined : (() => {
    if (!Array.isArray(value.loras)) throw new V2HttpError(400, "BAD_REQUEST", "loras must be an array");
    return value.loras.map((item) => {
      const record = requireBody(item);
      assertKeys(record, ["name", "weight"]);
      if (typeof record.weight !== "number" || record.weight < 0 || record.weight > 2) throw new V2HttpError(400, "BAD_REQUEST", "LoRA weight must be between 0 and 2");
      return { name: requiredString(record.name, "loras.name"), weight: record.weight };
    });
  })();
  return {
    visualVariantId: requiredString(value.visualVariantId, "visualVariantId") as never,
    characterId: requiredString(value.characterId, "characterId") as V2CharacterId,
    name: requiredString(value.name, "name"),
    ...(value.appearance === undefined ? {} : { appearance: parseStringRecord(value.appearance, "appearance") }),
    ...(loras === undefined ? {} : { loras }),
    ...(value.triggerWords === undefined ? {} : { triggerWords: requiredStringArray(value.triggerWords, "triggerWords") }),
    ...(value.negativePrompt === undefined ? {} : { negativePrompt: value.negativePrompt === null ? null : requiredString(value.negativePrompt, "negativePrompt") }),
    ...(value.workflowPreset === undefined ? {} : { workflowPreset: value.workflowPreset === null ? null : requiredString(value.workflowPreset, "workflowPreset") }),
    ...(value.isDefault === undefined ? {} : { isDefault: requiredBoolean(value.isDefault, "isDefault") }),
    ...(value.referenceAssetIds === undefined ? {} : { referenceAssetIds: requiredStringArray(value.referenceAssetIds, "referenceAssetIds") }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  } as unknown as V2UpsertCharacterVisualVariantRequest;
}

export function parseUpsertCharacterEventDefinitionBody(body: unknown): V2UpsertCharacterEventDefinitionRequest {
  const value = requireRevisionedBody(body, ["eventDefinitionId", "name", "description", "participantCharacterIds", "initialState"]);
  return {
    eventDefinitionId: requiredString(value.eventDefinitionId, "eventDefinitionId") as never,
    name: requiredString(value.name, "name"),
    ...(value.description === undefined ? {} : { description: value.description === null ? null : requiredString(value.description, "description") }),
    participantCharacterIds: requiredStringArray(value.participantCharacterIds, "participantCharacterIds") as V2UpsertCharacterEventDefinitionRequest["participantCharacterIds"],
    ...(value.initialState === undefined ? {} : { initialState: parseScalarRecord(value.initialState, "initialState") }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseUpdateCharacterProactivePolicyBody(body: unknown): V2UpdateCharacterProactivePolicyRequest {
  const value = requireRevisionedBody(body, ["enabled", "cooldownMinutes", "dailyLimit", "quietStart", "quietEnd"]);
  return {
    enabled: requiredBoolean(value.enabled, "enabled"),
    ...(value.cooldownMinutes === undefined ? {} : { cooldownMinutes: value.cooldownMinutes as number }),
    ...(value.dailyLimit === undefined ? {} : { dailyLimit: value.dailyLimit as number }),
    ...(value.quietStart === undefined ? {} : { quietStart: requiredString(value.quietStart, "quietStart") }),
    ...(value.quietEnd === undefined ? {} : { quietEnd: requiredString(value.quietEnd, "quietEnd") }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  } as V2UpdateCharacterProactivePolicyRequest;
}

export function parseCreateFactBody(body: unknown): V2CreateFactRequest {
  const value = requireRevisionedBody(body, ["factId", "text", "visibility"]);
  const visibility = requiredString(value.visibility, "visibility");
  if (visibility !== "creator_only" && visibility !== "player_visible") {
    throw new V2HttpError(400, "BAD_REQUEST", "visibility must be creator_only or player_visible");
  }
  return {
    factId: requiredString(value.factId, "factId"),
    text: requiredString(value.text, "text"),
    visibility: visibility as V2FactVisibility,
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCreateRuleBody(body: unknown): V2CreateRuleRequest {
  const value = requireRevisionedBody(body, ["ruleId", "text", "severity"]);
  const severity = requiredString(value.severity, "severity");
  if (severity !== "guideline" && severity !== "required") {
    throw new V2HttpError(400, "BAD_REQUEST", "severity must be guideline or required");
  }
  return {
    ruleId: requiredString(value.ruleId, "ruleId"),
    text: requiredString(value.text, "text"),
    severity: severity as V2RuleSeverity,
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCreateTimelineEventBody(body: unknown): V2CreateTimelineEventRequest {
  const value = requireRevisionedBody(body, ["timelineEventId", "localDate", "title", "summary"]);
  return {
    timelineEventId: requiredString(value.timelineEventId, "timelineEventId"),
    localDate: requiredString(value.localDate, "localDate"),
    title: requiredString(value.title, "title"),
    ...(value.summary === undefined ? {} : { summary: value.summary === null ? null : requiredString(value.summary, "summary") }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCreateArcBody(body: unknown): V2CreateArcRequest {
  const value = requireRevisionedBody(body, ["arcId", "title", "summary"]);
  return {
    arcId: requiredString(value.arcId, "arcId") as V2ArcId,
    title: requiredString(value.title, "title"),
    ...(value.summary === undefined ? {} : { summary: requiredString(value.summary, "summary") }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCreateSceneBody(body: unknown): V2CreateSceneRequest {
  const value = requireRevisionedBody(body, ["sceneId", "arcId", "title", "body", "isEntry"]);
  return {
    sceneId: requiredString(value.sceneId, "sceneId") as V2SceneId,
    ...(value.arcId === undefined ? {} : { arcId: requiredString(value.arcId, "arcId") as V2ArcId }),
    title: requiredString(value.title, "title"),
    ...(value.body === undefined ? {} : { body: requiredString(value.body, "body") }),
    ...(value.isEntry === undefined ? {} : { isEntry: requiredBoolean(value.isEntry, "isEntry") }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCreateChoiceBody(body: unknown): V2CreateChoiceRequest {
  const value = requireRevisionedBody(body, ["choiceId", "sourceSceneId", "targetSceneId", "label", "gates", "consequences"]);
  return {
    choiceId: requiredString(value.choiceId, "choiceId") as V2ChoiceId,
    sourceSceneId: requiredString(value.sourceSceneId, "sourceSceneId") as V2SceneId,
    ...(value.targetSceneId === undefined ? {} : { targetSceneId: requiredString(value.targetSceneId, "targetSceneId") as V2SceneId }),
    label: requiredString(value.label, "label"),
    ...(value.gates === undefined ? {} : { gates: requiredGates(value.gates) }),
    ...(value.consequences === undefined ? {} : { consequences: requiredConsequences(value.consequences, "consequences") }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCreateStateVariableBody(body: unknown): V2CreateStateVariableRequest {
  const value = requireRevisionedBody(body, ["key", "valueType", "defaultValue"]);
  const valueType = requiredValueType(value.valueType);
  return {
    key: requiredString(value.key, "key"),
    valueType,
    defaultValue: requiredStateValue(value.defaultValue, "defaultValue"),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseUpdateWorldBody(body: unknown): V2UpdateStoryWorldRequest {
  const value = requireRevisionedBody(body, ["name", "summary"]);
  return { name: requiredString(value.name, "name"), ...(value.summary === undefined ? {} : { summary: value.summary === null ? null : requiredString(value.summary, "summary") }), expectedRevision: requiredRevision(value.expectedRevision), idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey };
}

export function parseUpdateLocationBody(body: unknown): V2UpdateLocationRequest {
  const value = requireRevisionedBody(body, ["name", "summary"]);
  return { name: requiredString(value.name, "name"), ...(value.summary === undefined ? {} : { summary: value.summary === null ? null : requiredString(value.summary, "summary") }), expectedRevision: requiredRevision(value.expectedRevision), idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey };
}

export function parseUpdateCharacterBody(body: unknown): V2UpdateCharacterRequest {
  const value = requireRevisionedBody(body, ["name", "summary", "homeLocationId", "personaText", "profile"]);
  return { name: requiredString(value.name, "name"), ...(value.summary === undefined ? {} : { summary: value.summary === null ? null : requiredString(value.summary, "summary") }), ...(value.personaText === undefined ? {} : { personaText: value.personaText === null ? null : requiredString(value.personaText, "personaText") }), ...(value.homeLocationId === undefined ? {} : { homeLocationId: value.homeLocationId === null ? null : requiredString(value.homeLocationId, "homeLocationId") as V2LocationId }), ...(value.profile === undefined ? {} : { profile: value.profile === null ? null : parseCharacterProfile(value.profile) }), expectedRevision: requiredRevision(value.expectedRevision), idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey };
}

function parseCharacterProfile(input: unknown): V2CharacterProfileInput {
  const value = requireBody(input);
  assertKeys(value, ["aliases", "identity", "tags", "persona"]);
  const persona = value.persona === undefined || value.persona === null ? undefined : requireBody(value.persona);
  if (persona) assertKeys(persona, ["traits", "behaviorPatterns", "speechStyle", "values", "taboos", "backgroundStory", "advancedPrompt"]);
  const list = (candidate: unknown, field: string): readonly string[] | undefined => candidate === undefined ? undefined : requiredStringArray(candidate, field);
  return {
    ...(value.aliases === undefined ? {} : { aliases: list(value.aliases, "aliases") }),
    ...(value.identity === undefined ? {} : { identity: value.identity === null ? null : requiredString(value.identity, "identity") }),
    ...(value.tags === undefined ? {} : { tags: list(value.tags, "tags") }),
    ...(persona === undefined ? {} : { persona: {
      ...(persona.traits === undefined ? {} : { traits: list(persona.traits, "traits") }),
      ...(persona.behaviorPatterns === undefined ? {} : { behaviorPatterns: list(persona.behaviorPatterns, "behaviorPatterns") }),
      ...(persona.speechStyle === undefined ? {} : { speechStyle: persona.speechStyle === null ? null : requiredString(persona.speechStyle, "speechStyle") }),
      ...(persona.values === undefined ? {} : { values: list(persona.values, "values") }),
      ...(persona.taboos === undefined ? {} : { taboos: list(persona.taboos, "taboos") }),
      ...(persona.backgroundStory === undefined ? {} : { backgroundStory: persona.backgroundStory === null ? null : requiredString(persona.backgroundStory, "backgroundStory") }),
      ...(persona.advancedPrompt === undefined ? {} : { advancedPrompt: persona.advancedPrompt === null ? null : requiredString(persona.advancedPrompt, "advancedPrompt") }),
    } }),
  } as unknown as V2CharacterProfileInput;
}

export function parseUpdateFactBody(body: unknown): V2UpdateFactRequest {
  const value = requireRevisionedBody(body, ["text", "visibility"]);
  const visibility = requiredFactVisibility(value.visibility);
  return { text: requiredString(value.text, "text"), visibility, expectedRevision: requiredRevision(value.expectedRevision), idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey };
}

export function parseUpdateRuleBody(body: unknown): V2UpdateRuleRequest {
  const value = requireRevisionedBody(body, ["text", "severity"]);
  const severity = requiredRuleSeverity(value.severity);
  return { text: requiredString(value.text, "text"), severity, expectedRevision: requiredRevision(value.expectedRevision), idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey };
}

export function parseUpdateTimelineEventBody(body: unknown): V2UpdateTimelineEventRequest {
  const value = requireRevisionedBody(body, ["localDate", "title", "summary"]);
  return { localDate: requiredString(value.localDate, "localDate"), title: requiredString(value.title, "title"), ...(value.summary === undefined ? {} : { summary: value.summary === null ? null : requiredString(value.summary, "summary") }), expectedRevision: requiredRevision(value.expectedRevision), idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey };
}

export function parseUpdateArcBody(body: unknown): V2UpdateArcRequest {
  const value = requireRevisionedBody(body, ["title", "summary"]);
  return { title: requiredString(value.title, "title"), ...(value.summary === undefined ? {} : { summary: requiredString(value.summary, "summary") }), expectedRevision: requiredRevision(value.expectedRevision), idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey };
}

export function parseUpdateSceneBody(body: unknown): V2UpdateSceneRequest {
  const value = requireRevisionedBody(body, ["arcId", "title", "body", "isEntry"]);
  return { ...(value.arcId === undefined ? {} : { arcId: requiredString(value.arcId, "arcId") as V2ArcId }), title: requiredString(value.title, "title"), ...(value.body === undefined ? {} : { body: requiredString(value.body, "body") }), isEntry: requiredBoolean(value.isEntry, "isEntry"), expectedRevision: requiredRevision(value.expectedRevision), idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey };
}

export function parseUpdateChoiceBody(body: unknown): V2UpdateChoiceRequest {
  const value = requireRevisionedBody(body, ["sourceSceneId", "targetSceneId", "label", "gates", "consequences"]);
  return { sourceSceneId: requiredString(value.sourceSceneId, "sourceSceneId") as V2SceneId, ...(value.targetSceneId === undefined ? {} : { targetSceneId: requiredString(value.targetSceneId, "targetSceneId") as V2SceneId }), label: requiredString(value.label, "label"), ...(value.gates === undefined ? {} : { gates: requiredGates(value.gates) }), ...(value.consequences === undefined ? {} : { consequences: requiredConsequences(value.consequences, "consequences") }), expectedRevision: requiredRevision(value.expectedRevision), idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey };
}

export function parseUpdateStateVariableBody(body: unknown): V2UpdateStateVariableRequest {
  const value = requireRevisionedBody(body, ["defaultValue"]);
  return { defaultValue: requiredStateValue(value.defaultValue, "defaultValue"), expectedRevision: requiredRevision(value.expectedRevision), idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey };
}

export function parsePreviewStateDeltaBody(body: unknown): V2PreviewStateDeltaRequest {
  const value = requireBody(body);
  assertKeys(value, ["currentValues", "deltas"]);
  return {
    ...(value.currentValues === undefined ? {} : { currentValues: requiredStateRecord(value.currentValues, "currentValues") }),
    deltas: requiredDeltas(value.deltas, "deltas"),
  };
}

export function parseSubmitSceneCandidateBody(body: unknown): V2SubmitSceneCandidateRequest {
  const value = requireBody(body);
  assertKeys(value, ["candidateId", "baseCanonRevision", "payload", "provenance", "idempotencyKey"]);
  return {
    candidateId: requiredString(value.candidateId, "candidateId") as V2CandidateId,
    baseCanonRevision: requiredRevision(value.baseCanonRevision),
    payload: requiredSceneCandidatePayload(value.payload),
    provenance: requiredCandidateProvenance(value.provenance),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseReviewCandidateBody(body: unknown): V2ReviewCandidateRequest {
  const value = requireRevisionedBody(body, ["action", "reviewer", "reason"]);
  return {
    action: requiredReviewAction(value.action),
    reviewer: requiredString(value.reviewer, "reviewer"),
    ...(value.reason === undefined ? {} : { reason: requiredString(value.reason, "reason") }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCreateReleaseBody(body: unknown): V2CreateReleaseRequest {
  const value = requireBody(body);
  assertKeys(value, ["releaseId", "version", "sourceRevision", "idempotencyKey"]);
  return {
    releaseId: requiredString(value.releaseId, "releaseId") as V2ReleaseId,
    version: requiredString(value.version, "version"),
    sourceRevision: requiredRevision(value.sourceRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseStartRuntimeRunBody(body: unknown): V2StartRuntimeRunRequest {
  const value = requireBody(body);
  assertKeys(value, ["runId", "releaseId", "idempotencyKey"]);
  return {
    runId: requiredString(value.runId, "runId") as V2RunId,
    releaseId: requiredString(value.releaseId, "releaseId") as V2ReleaseId,
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseSubmitRuntimeChoiceBody(body: unknown): V2SubmitRuntimeChoiceRequest {
  const value = requireBody(body);
  assertKeys(value, ["choiceId", "idempotencyKey"]);
  return {
    choiceId: requiredString(value.choiceId, "choiceId") as V2ChoiceId,
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCreateRuntimeSaveBody(body: unknown): V2CreateRuntimeSaveRequest {
  const value = requireBody(body);
  assertKeys(value, ["saveId", "label", "idempotencyKey"]);
  return {
    saveId: requiredString(value.saveId, "saveId") as V2SaveId,
    ...(value.label === undefined ? {} : { label: requiredString(value.label, "label") }),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseLoadRuntimeSaveBody(body: unknown): V2LoadRuntimeSaveRequest {
  const value = requireBody(body);
  assertKeys(value, ["runId", "idempotencyKey"]);
  return {
    runId: requiredString(value.runId, "runId") as V2RunId,
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

function requireRevisionedBody(body: unknown, keys: readonly string[]): Record<string, unknown> {
  const value = requireBody(body);
  assertKeys(value, [...keys, "expectedRevision", "idempotencyKey"]);
  return value;
}

function requireBody(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new V2HttpError(400, "BAD_REQUEST", "Request body must be an object");
  }
  return body as Record<string, unknown>;
}

function assertKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new V2HttpError(400, "BAD_REQUEST", "Request body contains unknown fields");
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new V2HttpError(400, "BAD_REQUEST", `${field} must be a non-empty string`);
  }
  return value;
}

function requiredStringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) throw new V2HttpError(400, "BAD_REQUEST", `${field} must be an array`);
  return value.map((item) => requiredString(item, field));
}

function parseScalarRecord(value: unknown, field: string): Readonly<Record<string, string | number | boolean>> {
  const record = requireBody(value);
  if (Object.entries(record).some(([, item]) => !["string", "number", "boolean"].includes(typeof item))) throw new V2HttpError(400, "BAD_REQUEST", `${field} must contain scalar values`);
  return record as Readonly<Record<string, string | number | boolean>>;
}

function parseStringRecord(value: unknown, field: string): Readonly<Record<string, string>> {
  const record = requireBody(value);
  if (Object.entries(record).some(([, item]) => typeof item !== "string")) throw new V2HttpError(400, "BAD_REQUEST", `${field} must contain strings`);
  return record as Readonly<Record<string, string>>;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new V2HttpError(400, "BAD_REQUEST", `${field} must be a boolean`);
  }
  return value;
}

function requiredRevision(value: unknown): V2Revision {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new V2HttpError(400, "BAD_REQUEST", "expectedRevision must be a positive integer");
  }
  return value as V2Revision;
}

function requiredFactVisibility(value: unknown): V2FactVisibility {
  if (value !== "creator_only" && value !== "player_visible") {
    throw new V2HttpError(400, "BAD_REQUEST", "visibility must be creator_only or player_visible");
  }
  return value;
}

function requiredRuleSeverity(value: unknown): V2RuleSeverity {
  if (value !== "guideline" && value !== "required") {
    throw new V2HttpError(400, "BAD_REQUEST", "severity must be guideline or required");
  }
  return value;
}

function requiredValueType(value: unknown): V2StateValueType {
  if (value !== "string" && value !== "number" && value !== "boolean") {
    throw new V2HttpError(400, "BAD_REQUEST", "valueType must be string, number, or boolean");
  }
  return value;
}

function requiredStateValue(value: unknown, field: string): V2StateValue {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  throw new V2HttpError(400, "BAD_REQUEST", `${field} must be a string, number, or boolean`);
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new V2HttpError(400, "BAD_REQUEST", `${field} must be a finite number`);
}

function requiredStateRecord(value: unknown, field: string): Record<string, V2StateValue> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new V2HttpError(400, "BAD_REQUEST", `${field} must be an object`);
  }
  return Object.fromEntries(Object.entries(value).map(([key, recordValue]) => [
    key,
    requiredStateValue(recordValue, `${field}.${key}`),
  ]));
}

function requiredGates(value: unknown): readonly V2StateGateDto[] {
  return requiredArray(value, "gates").map((item, index) => {
    const gate = requiredRecord(item, `gates[${index}]`);
    assertKeys(gate, ["stateKey", "operator", "value"]);
    return {
      stateKey: requiredString(gate.stateKey, `gates[${index}].stateKey`),
      operator: requiredComparisonOperator(gate.operator),
      value: requiredStateValue(gate.value, `gates[${index}].value`),
    };
  });
}

function requiredDeltas(value: unknown, field: string): readonly V2StateDeltaDto[] {
  return requiredArray(value, field).map((item, index) => {
    const delta = requiredRecord(item, `${field}[${index}]`);
    assertKeys(delta, ["stateKey", "operation", "value"]);
    return {
      stateKey: requiredString(delta.stateKey, `${field}[${index}].stateKey`),
      operation: requiredConsequenceOperation(delta.operation),
      value: requiredStateValue(delta.value, `${field}[${index}].value`),
    };
  });
}

function requiredConsequences(value: unknown, field: string): readonly V2ChoiceConsequenceDto[] {
  return requiredArray(value, field).map((item, index) => {
    const consequence = requiredRecord(item, `${field}[${index}]`);
    const kind = consequence.kind;
    if (kind === undefined || kind === "story") {
      assertKeys(consequence, ["kind", "stateKey", "operation", "value"]);
      return { ...(kind === undefined ? {} : { kind: "story" as const }), stateKey: requiredString(consequence.stateKey, `${field}[${index}].stateKey`), operation: requiredConsequenceOperation(consequence.operation), value: requiredStateValue(consequence.value, `${field}[${index}].value`) };
    }
    if (kind === "character") {
      assertKeys(consequence, ["kind", "characterId", "stateKey", "operation", "value"]);
      return { kind, characterId: requiredString(consequence.characterId, `${field}[${index}].characterId`) as V2CharacterId, stateKey: requiredString(consequence.stateKey, `${field}[${index}].stateKey`), operation: requiredConsequenceOperation(consequence.operation), value: requiredStateValue(consequence.value, `${field}[${index}].value`) };
    }
    if (kind === "relationship") {
      assertKeys(consequence, ["kind", "fromCharacterId", "toCharacterId", "operation", "value"]);
      const relationshipValue = requiredNumber(consequence.value, `${field}[${index}].value`);
      if (!Number.isInteger(relationshipValue) || relationshipValue < -100 || relationshipValue > 100) throw new V2HttpError(400, "BAD_REQUEST", `${field}[${index}].value must be between -100 and 100`);
      return { kind, fromCharacterId: requiredString(consequence.fromCharacterId, `${field}[${index}].fromCharacterId`) as V2CharacterId, toCharacterId: requiredString(consequence.toCharacterId, `${field}[${index}].toCharacterId`) as V2CharacterId, operation: requiredConsequenceOperation(consequence.operation), value: relationshipValue };
    }
    if (kind === "event") {
      assertKeys(consequence, ["kind", "eventDefinitionId", "operation", "eventInstanceId", "state"]);
      if (consequence.operation !== "create" && consequence.operation !== "transition") throw new V2HttpError(400, "BAD_REQUEST", `${field}[${index}].operation is not supported`);
      return { kind, eventDefinitionId: requiredString(consequence.eventDefinitionId, `${field}[${index}].eventDefinitionId`), operation: consequence.operation, ...(consequence.eventInstanceId === undefined ? {} : { eventInstanceId: requiredString(consequence.eventInstanceId, `${field}[${index}].eventInstanceId`) }), ...(consequence.state === undefined ? {} : { state: requiredStateRecord(consequence.state, `${field}[${index}].state`) }) };
    }
    throw new V2HttpError(400, "BAD_REQUEST", `${field}[${index}].kind is not supported`);
  });
}

function requiredComparisonOperator(value: unknown): V2StateComparisonOperator {
  if (value !== "eq" && value !== "neq" && value !== "gt" && value !== "gte" && value !== "lt" && value !== "lte") {
    throw new V2HttpError(400, "BAD_REQUEST", "gate operator is not supported");
  }
  return value;
}

function requiredConsequenceOperation(value: unknown): V2StateConsequenceOperation {
  if (value !== "set" && value !== "increment") {
    throw new V2HttpError(400, "BAD_REQUEST", "state operation is not supported");
  }
  return value;
}

function requiredArray(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new V2HttpError(400, "BAD_REQUEST", `${field} must be an array`);
  }
  return value;
}

function requiredRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new V2HttpError(400, "BAD_REQUEST", `${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredSceneCandidatePayload(value: unknown): V2SceneCandidatePayload {
  const payload = requiredRecord(value, "payload");
  assertKeys(payload, ["scene", "choices", "validationNotes"]);
  const scene = requiredRecord(payload.scene, "payload.scene");
  assertKeys(scene, ["sceneId", "title", "body", "locationId", "participantCharacterIds"]);
  return {
    scene: {
      sceneId: requiredString(scene.sceneId, "payload.scene.sceneId") as V2SceneId,
      title: requiredString(scene.title, "payload.scene.title"),
      body: requiredString(scene.body, "payload.scene.body"),
      ...(scene.locationId === undefined ? {} : { locationId: requiredString(scene.locationId, "payload.scene.locationId") as V2LocationId }),
      participantCharacterIds: requiredArray(scene.participantCharacterIds, "payload.scene.participantCharacterIds")
        .map((item, index) => requiredString(item, `payload.scene.participantCharacterIds[${index}]`) as never),
    },
    choices: requiredArray(payload.choices, "payload.choices").map((item, index) => {
      const choice = requiredRecord(item, `payload.choices[${index}]`);
      assertKeys(choice, ["label", "targetSceneId", "consequenceSummary"]);
      return {
        label: requiredString(choice.label, `payload.choices[${index}].label`),
        ...(choice.targetSceneId === undefined ? {} : { targetSceneId: requiredString(choice.targetSceneId, `payload.choices[${index}].targetSceneId`) as V2SceneId }),
        ...(choice.consequenceSummary === undefined ? {} : { consequenceSummary: requiredString(choice.consequenceSummary, `payload.choices[${index}].consequenceSummary`) }),
      };
    }),
    validationNotes: requiredArray(payload.validationNotes, "payload.validationNotes")
      .map((item, index) => requiredString(item, `payload.validationNotes[${index}]`)),
  };
}

function requiredCandidateProvenance(value: unknown): V2SubmitSceneCandidateRequest["provenance"] {
  const provenance = requiredRecord(value, "provenance");
  assertKeys(provenance, ["source", "jobId", "contextHash", "summary", "sourceRevisionSet"]);
  const source = provenance.source;
  if (source !== "human" && source !== "llm" && source !== "comfyui" && source !== "import") {
    throw new V2HttpError(400, "BAD_REQUEST", "provenance.source is not supported");
  }
  return {
    source,
    ...(provenance.jobId === undefined ? {} : { jobId: requiredString(provenance.jobId, "provenance.jobId") }),
    ...(provenance.contextHash === undefined ? {} : { contextHash: requiredString(provenance.contextHash, "provenance.contextHash") }),
    ...(provenance.summary === undefined ? {} : { summary: requiredString(provenance.summary, "provenance.summary") }),
    ...(provenance.sourceRevisionSet === undefined ? {} : { sourceRevisionSet: requiredSourceRevisionSet(provenance.sourceRevisionSet) }),
  };
}

function requiredSourceRevisionSet(value: unknown): readonly { readonly kind: string; readonly id: string; readonly revision: number }[] {
  return requiredArray(value, "provenance.sourceRevisionSet").map((entry, index) => {
    const source = requiredRecord(entry, `provenance.sourceRevisionSet[${index}]`);
    assertKeys(source, ["kind", "id", "revision"]);
    const revision = source.revision;
    if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1) {
      throw new V2HttpError(400, "BAD_REQUEST", `provenance.sourceRevisionSet[${index}].revision must be a positive integer`);
    }
    return {
      kind: requiredString(source.kind, `provenance.sourceRevisionSet[${index}].kind`),
      id: requiredString(source.id, `provenance.sourceRevisionSet[${index}].id`),
      revision,
    };
  });
}
function requiredReviewAction(value: unknown): V2ReviewCandidateRequest["action"] {
  if (value !== "approve" && value !== "reject" && value !== "request_changes") {
    throw new V2HttpError(400, "BAD_REQUEST", "review action is not supported");
  }
  return value;
}
