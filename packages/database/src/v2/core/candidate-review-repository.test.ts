import assert from "node:assert/strict";
import test from "node:test";

import {
  createV2CanonWorld,
  createV2SceneCandidate,
} from "@living-network/domain";
import {
  applyV2Migrations,
  openV2TempSqliteConnection,
  revertV2Migrations,
  V2SqliteCandidateReviewRepository,
  V2SqliteCandidateReviewUnitOfWork,
  V2SqliteCandidateSubmissionPort,
} from "../index.ts";

test("V2 candidate review SQLite repository persists candidates and audits", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const unit = new V2SqliteCandidateReviewUnitOfWork(db);
    await unit.withCandidateReviewTransaction(async ({ canon, candidateReview }) => {
      await canon.createWorld(createV2CanonWorld({ storyWorldId: "world_review" as never, name: "Review World" }));
      const candidate = await candidateReview.createSceneCandidate(createV2SceneCandidate({
        candidateId: "candidate_a",
        storyWorldId: "world_review",
        baseCanonRevision: 1,
        provenance: { source: "llm", jobId: "job_a" },
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
      }));
      const updated = await candidateReview.updateSceneCandidateReview({
        candidate: { ...candidate, status: "rejected", reviewer: "creator", reviewReason: "No" },
        reviewedAt: "2026-08-12T00:00:00.000Z",
      });
      assert.equal(updated.status, "rejected");
      await candidateReview.createAudit({
        candidateId: "candidate_a" as never,
        storyWorldId: "world_review" as never,
        fromStatus: "pending",
        toStatus: "rejected",
        action: "reject",
        reviewer: "creator",
        reason: "No",
        resultingRevision: 2 as never,
      });
    });

    const repository = new V2SqliteCandidateReviewRepository(db);
    const audits = await repository.listAudits({
      storyWorldId: "world_review" as never,
      candidateId: "candidate_a" as never,
    });
    assert.equal((await repository.listSceneCandidates("world_review" as never))[0]?.reviewer, "creator");
    assert.equal(audits[0]?.toStatus, "rejected");

    revertV2Migrations(db);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'v2_scene_candidates'").get(), undefined);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 candidate submission port replays identical idempotent submissions", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const unit = new V2SqliteCandidateReviewUnitOfWork(db);
    await unit.withCandidateReviewTransaction(async ({ canon }) => {
      await canon.createWorld(createV2CanonWorld({ storyWorldId: "world_submit" as never, name: "Submit World" }));
    });
    const candidate = createV2SceneCandidate({
      candidateId: "candidate_a",
      storyWorldId: "world_submit",
      baseCanonRevision: 1,
      provenance: { source: "llm" },
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
    const port = new V2SqliteCandidateSubmissionPort(db);
    const first = await port.submitSceneCandidate({
      candidate: candidate as never,
      idempotencyKey: "key_candidate" as never,
    });
    const replay = await port.submitSceneCandidate({
      candidate: candidate as never,
      idempotencyKey: "key_candidate" as never,
    });

    assert.deepEqual(replay, first);
  } finally {
    db.close();
    cleanup();
  }
});
