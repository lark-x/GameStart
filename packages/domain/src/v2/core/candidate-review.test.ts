import assert from "node:assert/strict";
import test from "node:test";

import { V2DomainError } from "../shared/index.ts";
import {
  buildV2SceneCandidateApplyPlan,
  createV2SceneCandidate,
  reviewV2SceneCandidate,
} from "./candidate-review.ts";

test("V2 candidate review creates pending scene candidates and deterministic apply plans", () => {
  const candidate = createV2SceneCandidate({
    candidateId: "candidate_a",
    storyWorldId: "world_a",
    baseCanonRevision: 3,
    provenance: { source: "llm", jobId: "job_a" },
    payload: {
      scene: {
        sceneId: "scene_new",
        title: "New Scene",
        body: "A newly proposed scene.",
        participantCharacterIds: ["char_a"],
      },
      choices: [
        { label: "Continue", targetSceneId: "scene_existing" },
        { label: "Stay" },
      ],
      validationNotes: [],
    },
  });

  assert.equal(candidate.status, "pending");
  assert.deepEqual(buildV2SceneCandidateApplyPlan(candidate), {
    scene: {
      sceneId: "scene_new",
      title: "New Scene",
      body: "A newly proposed scene.",
      participantCharacterIds: ["char_a"],
    },
    choices: [
      {
        choiceId: "candidate_a:choice:1",
        sourceSceneId: "scene_new",
        targetSceneId: "scene_existing",
        label: "Continue",
      },
      {
        choiceId: "candidate_a:choice:2",
        sourceSceneId: "scene_new",
        label: "Stay",
      },
    ],
  });
});

test("V2 candidate review enforces transitions and stale approvals", () => {
  const candidate = createV2SceneCandidate({
    candidateId: "candidate_a",
    storyWorldId: "world_a",
    baseCanonRevision: 2,
    provenance: { source: "human" },
    payload: {
      scene: {
        sceneId: "scene_new",
        title: "New Scene",
        body: "Body",
        participantCharacterIds: [],
      },
      choices: [],
      validationNotes: [],
    },
  });

  assert.throws(
    () => reviewV2SceneCandidate({
      candidate,
      action: "approve",
      reviewer: "creator",
      expectedRevision: 3,
    }),
    (error) => error instanceof V2DomainError && error.code === "STALE_REVISION",
  );

  const rejected = reviewV2SceneCandidate({
    candidate,
    action: "reject",
    reviewer: "creator",
    reason: "Not right",
    expectedRevision: 2,
  });
  assert.equal(rejected.status, "rejected");
  assert.throws(
    () => reviewV2SceneCandidate({
      candidate: rejected,
      action: "approve",
      reviewer: "creator",
      expectedRevision: 2,
    }),
    (error) => error instanceof V2DomainError && error.code === "INVALID_CANDIDATE_TRANSITION",
  );
});

test("V2 candidate review accepts unrelated world revisions only when exact sources remain fresh", () => {
  const candidate = createV2SceneCandidate({
    candidateId: "candidate_precise",
    storyWorldId: "world_a",
    baseCanonRevision: 2,
    provenance: { source: "llm", sourceRevisionSet: [{ kind: "character", id: "char_a", revision: 7 }] },
    payload: { scene: { sceneId: "scene_new", title: "New Scene", participantCharacterIds: [] }, choices: [], validationNotes: [] },
  });
  assert.equal(reviewV2SceneCandidate({ candidate, action: "approve", reviewer: "creator", expectedRevision: 3, sourceRevisionSetFresh: true }).status, "approved");
  assert.throws(
    () => reviewV2SceneCandidate({ candidate, action: "approve", reviewer: "creator", expectedRevision: 3, sourceRevisionSetFresh: false }),
    (error) => error instanceof V2DomainError && error.code === "STALE_REVISION",
  );
});
test("V2 candidate domain rejects malformed provenance, payload, and revisions", () => {
  const base = {
    candidateId: "candidate_invalid",
    storyWorldId: "world_a",
    baseCanonRevision: 1,
    payload: {
      scene: { sceneId: "scene", title: "Scene", body: "Body", participantCharacterIds: ["char"] },
      choices: [{ label: "Stay", consequenceSummary: "" }],
      validationNotes: [""],
    },
    provenance: { source: "human" as const },
  };
  assert.throws(() => createV2SceneCandidate({ ...base, baseCanonRevision: 0 }), /baseCanonRevision/);
  assert.throws(() => createV2SceneCandidate({ ...base, candidateId: "" }), /candidateId/);
  assert.throws(() => createV2SceneCandidate({ ...base, provenance: { source: "unknown" as never } }), /provenance source/);
  assert.throws(() => createV2SceneCandidate({ ...base, payload: { ...base.payload, scene: { ...base.payload.scene, participantCharacterIds: ["char", "char"] } } }), /duplicate/);
  assert.throws(() => createV2SceneCandidate({ ...base, payload: { ...base.payload, scene: { ...base.payload.scene, title: "" } } }), /scene.title/);
  assert.throws(() => createV2SceneCandidate({ ...base, payload: { ...base.payload, choices: [{ label: "", consequenceSummary: "" }] } }), /choices\[0\]\.label/);
  assert.throws(() => createV2SceneCandidate({ ...base, payload: { ...base.payload, validationNotes: ["x".repeat(1201)] } }), /validationNotes/);
  assert.throws(() => reviewV2SceneCandidate({ candidate: createV2SceneCandidate(base), action: "approve", reviewer: "", expectedRevision: 1 }), /reviewer/);
  assert.throws(() => reviewV2SceneCandidate({ candidate: createV2SceneCandidate(base), action: "approve", reviewer: "creator", reason: "x".repeat(1201), expectedRevision: 1 }), /reason/);
  const approved = { ...createV2SceneCandidate(base), status: "approved" as const };
  assert.throws(() => buildV2SceneCandidateApplyPlan(approved), /Cannot apply/);
});
