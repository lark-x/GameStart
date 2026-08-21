import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCreateArcBody,
  parseCreateCharacterBody,
  parseCreateChoiceBody,
  parseCreateFactBody,
  parseCreateLocationBody,
  parseCreateReleaseBody,
  parseCreateRuleBody,
  parseCreateRuntimeSaveBody,
  parseCreateSceneBody,
  parseCreateStateVariableBody,
  parseCreateTimelineEventBody,
  parseCreateWorldBody,
  parseLoadRuntimeSaveBody,
  parsePreviewStateDeltaBody,
  parseReviewCandidateBody,
  parseStartRuntimeRunBody,
  parseSubmitRuntimeChoiceBody,
  parseSubmitSceneCandidateBody,
  parseUpdateArcBody,
  parseUpdateCharacterBody,
  parseUpdateChoiceBody,
  parseUpdateFactBody,
  parseUpdateLocationBody,
  parseUpdateRuleBody,
  parseUpdateSceneBody,
  parseUpdateStateVariableBody,
  parseUpdateTimelineEventBody,
  parseUpdateWorldBody,
} from "./parsers.ts";

const revisioned = { expectedRevision: 1, idempotencyKey: "idem" };

test("V2 core parsers accept the complete public request surface", () => {
  assert.deepEqual(parseCreateWorldBody({ storyWorldId: "world", name: "World", summary: "Summary", idempotencyKey: "world" }).name, "World");
  assert.equal(parseCreateLocationBody({ locationId: "location", name: "Station", summary: "Summary", ...revisioned }).locationId, "location");
  assert.equal(parseCreateCharacterBody({ characterId: "character", name: "Mira", summary: "Pilot", homeLocationId: "location", ...revisioned }).homeLocationId, "location");
  assert.equal(parseCreateCharacterBody({ characterId: "character", name: "Mira", personaText: "爱笑", ...revisioned }).personaText, "爱笑");
  assert.equal(parseCreateFactBody({ factId: "fact", text: "Fact", visibility: "player_visible", ...revisioned }).visibility, "player_visible");
  assert.equal(parseCreateRuleBody({ ruleId: "rule", text: "Rule", severity: "required", ...revisioned }).severity, "required");
  assert.equal(parseCreateTimelineEventBody({ timelineEventId: "event", localDate: "2026-01-01", title: "Launch", summary: "Summary", ...revisioned }).localDate, "2026-01-01");
  assert.equal(parseCreateArcBody({ arcId: "arc", title: "Arc", summary: "Summary", ...revisioned }).arcId, "arc");
  assert.equal(parseCreateSceneBody({ sceneId: "scene", arcId: "arc", title: "Scene", body: "Body", isEntry: true, ...revisioned }).isEntry, true);
  assert.equal(parseCreateChoiceBody({
    choiceId: "choice",
    sourceSceneId: "scene",
    targetSceneId: "next",
    label: "Continue",
    gates: [{ stateKey: "Trust", operator: "gte", value: 1 }],
    consequences: [{ stateKey: "Trust", operation: "increment", value: 1 }],
    ...revisioned,
  }).gates?.[0]?.operator, "gte");
  assert.equal(parseCreateStateVariableBody({ key: "Trust", valueType: "number", defaultValue: 0, ...revisioned }).valueType, "number");
  assert.equal(parsePreviewStateDeltaBody({ currentValues: { Trust: 1 }, deltas: [{ stateKey: "Trust", operation: "set", value: 2 }] }).deltas[0]?.operation, "set");
  assert.equal(parseSubmitSceneCandidateBody({
    candidateId: "candidate",
    baseCanonRevision: 1,
    payload: {
      scene: { sceneId: "scene", title: "Scene", body: "Body", locationId: "location", participantCharacterIds: ["character"] },
      choices: [{ label: "Continue", targetSceneId: "next", consequenceSummary: "Moves on" }],
      validationNotes: ["Checked"],
    },
    provenance: { source: "llm", jobId: "job", contextHash: "hash", summary: "Generated" },
    idempotencyKey: "candidate",
  }).provenance.source, "llm");
  assert.equal(parseReviewCandidateBody({ action: "request_changes", reviewer: "creator", reason: "Revise", ...revisioned }).action, "request_changes");
  assert.equal(parseCreateReleaseBody({ releaseId: "release", version: "1.0.0", sourceRevision: 1, idempotencyKey: "release" }).version, "1.0.0");
  assert.equal(parseStartRuntimeRunBody({ runId: "run", releaseId: "release", idempotencyKey: "run" }).releaseId, "release");
  assert.equal(parseSubmitRuntimeChoiceBody({ choiceId: "choice", idempotencyKey: "choice" }).choiceId, "choice");
  assert.equal(parseCreateRuntimeSaveBody({ saveId: "save", label: "Checkpoint", idempotencyKey: "save" }).label, "Checkpoint");
  assert.equal(parseLoadRuntimeSaveBody({ runId: "run", idempotencyKey: "load" }).runId, "run");
});

test("V2 core parsers reject malformed scalar, collection, and nested values", () => {
  assert.throws(() => parseCreateWorldBody(null), /body must be an object/);
  assert.throws(() => parseCreateWorldBody({ storyWorldId: "", name: "World", idempotencyKey: "id" }), /storyWorldId/);
  assert.throws(() => parseCreateSceneBody({ sceneId: "scene", title: "Scene", isEntry: "yes", ...revisioned }), /isEntry/);
  assert.throws(() => parseCreateLocationBody({ locationId: "location", name: "Location", expectedRevision: 0, idempotencyKey: "id" }), /expectedRevision/);
  assert.throws(() => parseCreateStateVariableBody({ key: "Trust", valueType: "object", defaultValue: 0, ...revisioned }), /valueType/);
  assert.throws(() => parseCreateStateVariableBody({ key: "Trust", valueType: "number", defaultValue: [], ...revisioned }), /defaultValue/);
  assert.throws(() => parsePreviewStateDeltaBody({ currentValues: [], deltas: [] }), /currentValues/);
  assert.throws(() => parsePreviewStateDeltaBody({ currentValues: { Trust: [] }, deltas: [] }), /currentValues\.Trust/);
  assert.throws(() => parsePreviewStateDeltaBody({ deltas: {} }), /deltas must be an array/);
  assert.throws(() => parseCreateChoiceBody({ choiceId: "choice", sourceSceneId: "scene", label: "Choice", gates: [{ stateKey: "Trust", operator: "bad", value: 1 }], ...revisioned }), /gate operator/);
  assert.throws(() => parseCreateChoiceBody({ choiceId: "choice", sourceSceneId: "scene", label: "Choice", consequences: [{ stateKey: "Trust", operation: "bad", value: 1 }], ...revisioned }), /state operation/);
  assert.throws(() => parseCreateChoiceBody({ choiceId: "choice", sourceSceneId: "scene", label: "Choice", gates: [null], ...revisioned }), /must be an object/);
  assert.throws(() => parseSubmitSceneCandidateBody({ candidateId: "candidate", baseCanonRevision: 1, payload: {}, provenance: { source: "unknown" }, idempotencyKey: "id" }), /payload\.scene/);
  assert.throws(() => parseSubmitSceneCandidateBody({ candidateId: "candidate", baseCanonRevision: 1, payload: { scene: { sceneId: "scene", title: "Scene", body: "Body", participantCharacterIds: [] }, choices: [], validationNotes: [] }, provenance: { source: "unknown" }, idempotencyKey: "id" }), /provenance\.source/);
  assert.throws(() => parseReviewCandidateBody({ action: "bad", reviewer: "creator", ...revisioned }), /review action/);
});

test("V2 core parsers accept update request bodies", () => {
  const update = { expectedRevision: 2, idempotencyKey: "update-idem" };
  assert.equal(parseUpdateWorldBody({ name: "World", summary: "S", ...update }).name, "World");
  assert.equal(parseUpdateLocationBody({ name: "Station", summary: "S", ...update }).name, "Station");
  assert.equal(parseUpdateCharacterBody({ name: "Mira", summary: "Pilot", homeLocationId: "loc", ...update }).homeLocationId, "loc");
  assert.equal(parseUpdateCharacterBody({ name: "Mira", personaText: "嘴硬心软", ...update }).personaText, "嘴硬心软");
  assert.equal(parseUpdateCharacterBody({ name: "Mira", homeLocationId: null, ...update }).homeLocationId, null);
  assert.equal(parseUpdateFactBody({ text: "Fact", visibility: "creator_only", ...update }).visibility, "creator_only");
  assert.equal(parseUpdateRuleBody({ text: "Rule", severity: "guideline", ...update }).severity, "guideline");
  assert.equal(parseUpdateTimelineEventBody({ localDate: "2026-01-01", title: "Event", summary: "S", ...update }).title, "Event");
  assert.equal(parseUpdateArcBody({ title: "Arc", summary: "S", ...update }).title, "Arc");
  assert.equal(parseUpdateSceneBody({ title: "Scene", body: "B", isEntry: true, ...update }).isEntry, true);
  assert.equal(parseUpdateChoiceBody({ sourceSceneId: "scene", targetSceneId: "next", label: "Choice", gates: [{ stateKey: "Trust", operator: "gte", value: 1 }], consequences: [{ stateKey: "Trust", operation: "increment", value: 1 }], ...update }).label, "Choice");
  assert.equal(parseUpdateStateVariableBody({ defaultValue: 3, ...update }).defaultValue, 3);
  assert.throws(() => parseUpdateFactBody({ text: "Fact", visibility: "bad", ...update }), /visibility/);
  assert.throws(() => parseUpdateRuleBody({ text: "Rule", severity: "bad", ...update }), /severity/);
});
