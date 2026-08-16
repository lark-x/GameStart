import type {
  V2CharacterId,
  V2ArcId,
  V2CandidateId,
  V2ChoiceId,
  V2CreateReleaseRequest,
  V2CreateRuntimeSaveRequest,
  V2CreateArcRequest,
  V2CreateCharacterRequest,
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

export function parseCreateLocationBody(body: unknown): V2CreateLocationRequest {
  const value = requireRevisionedBody(body, ["locationId", "name", "summary"]);
  return {
    locationId: requiredString(value.locationId, "locationId") as V2LocationId,
    name: requiredString(value.name, "name"),
    ...(value.summary === undefined ? {} : { summary: requiredString(value.summary, "summary") }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseCreateCharacterBody(body: unknown): V2CreateCharacterRequest {
  const value = requireRevisionedBody(body, ["characterId", "name", "summary", "homeLocationId"]);
  return {
    characterId: requiredString(value.characterId, "characterId") as V2CharacterId,
    name: requiredString(value.name, "name"),
    ...(value.summary === undefined ? {} : { summary: requiredString(value.summary, "summary") }),
    ...(value.homeLocationId === undefined ? {} : { homeLocationId: requiredString(value.homeLocationId, "homeLocationId") as V2LocationId }),
    expectedRevision: requiredRevision(value.expectedRevision),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
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
    ...(value.summary === undefined ? {} : { summary: requiredString(value.summary, "summary") }),
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
    ...(value.consequences === undefined ? {} : { consequences: requiredDeltas(value.consequences, "consequences") }),
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
  return { name: requiredString(value.name, "name"), ...(value.summary === undefined ? {} : { summary: requiredString(value.summary, "summary") }), expectedRevision: requiredRevision(value.expectedRevision), idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey };
}

export function parseUpdateLocationBody(body: unknown): V2UpdateLocationRequest {
  const value = requireRevisionedBody(body, ["name", "summary"]);
  return { name: requiredString(value.name, "name"), ...(value.summary === undefined ? {} : { summary: requiredString(value.summary, "summary") }), expectedRevision: requiredRevision(value.expectedRevision), idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey };
}

export function parseUpdateCharacterBody(body: unknown): V2UpdateCharacterRequest {
  const value = requireRevisionedBody(body, ["name", "summary", "homeLocationId"]);
  return { name: requiredString(value.name, "name"), ...(value.summary === undefined ? {} : { summary: requiredString(value.summary, "summary") }), ...(value.homeLocationId === undefined ? {} : { homeLocationId: requiredString(value.homeLocationId, "homeLocationId") as V2LocationId }), expectedRevision: requiredRevision(value.expectedRevision), idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey };
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
  return { localDate: requiredString(value.localDate, "localDate"), title: requiredString(value.title, "title"), ...(value.summary === undefined ? {} : { summary: requiredString(value.summary, "summary") }), expectedRevision: requiredRevision(value.expectedRevision), idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey };
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
  return { sourceSceneId: requiredString(value.sourceSceneId, "sourceSceneId") as V2SceneId, ...(value.targetSceneId === undefined ? {} : { targetSceneId: requiredString(value.targetSceneId, "targetSceneId") as V2SceneId }), label: requiredString(value.label, "label"), ...(value.gates === undefined ? {} : { gates: requiredGates(value.gates) }), ...(value.consequences === undefined ? {} : { consequences: requiredDeltas(value.consequences, "consequences") }), expectedRevision: requiredRevision(value.expectedRevision), idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey };
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
  assertKeys(value, ["saveId", "idempotencyKey"]);
  return {
    saveId: requiredString(value.saveId, "saveId") as V2SaveId,
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
  assertKeys(provenance, ["source", "jobId", "contextHash", "summary"]);
  const source = provenance.source;
  if (source !== "human" && source !== "llm" && source !== "comfyui" && source !== "import") {
    throw new V2HttpError(400, "BAD_REQUEST", "provenance.source is not supported");
  }
  return {
    source,
    ...(provenance.jobId === undefined ? {} : { jobId: requiredString(provenance.jobId, "provenance.jobId") }),
    ...(provenance.contextHash === undefined ? {} : { contextHash: requiredString(provenance.contextHash, "provenance.contextHash") }),
    ...(provenance.summary === undefined ? {} : { summary: requiredString(provenance.summary, "provenance.summary") }),
  };
}

function requiredReviewAction(value: unknown): V2ReviewCandidateRequest["action"] {
  if (value !== "approve" && value !== "reject" && value !== "request_changes") {
    throw new V2HttpError(400, "BAD_REQUEST", "review action is not supported");
  }
  return value;
}
