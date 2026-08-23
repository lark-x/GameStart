import assert from "node:assert/strict";
import test from "node:test";

import {
  createV2CanonWorld,
  createV2SceneCandidate,
} from "@living-network/domain/v2";
import {
  applyV2Migrations,
  openV2TempSqliteConnection,
  revertV2Migrations,
  V2SqliteCandidateReviewRepository,
  V2SqliteCandidateReviewUnitOfWork,
  V2SqliteCandidateSubmissionPort,
  V2SqliteCanonSnapshotReader,
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
    await unit.withCandidateReviewTransaction(async ({ canon }) => {
      await canon.advanceRevision("world_submit" as never, 1 as never);
    });
    const replayAfterRevisionChange = await port.submitSceneCandidate({
      candidate: candidate as never,
      idempotencyKey: "key_candidate" as never,
    });
    assert.deepEqual(replayAfterRevisionChange, first);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 exact-source candidate submission survives an unrelated world revision", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const unit = new V2SqliteCandidateReviewUnitOfWork(db);
    await unit.withCandidateReviewTransaction(async ({ canon }) => {
      await canon.createWorld(createV2CanonWorld({ storyWorldId: "world_exact_source" as never, name: "Exact Source World" }));
      await canon.advanceRevision("world_exact_source" as never, 1 as never);
    });
    const candidate = createV2SceneCandidate({
      candidateId: "candidate_exact_source",
      storyWorldId: "world_exact_source",
      baseCanonRevision: 1,
      provenance: { source: "llm", sourceRevisionSet: [{ kind: "character", id: "character_a", revision: 7 }] },
      payload: { scene: { sceneId: "scene_exact_source", title: "Exact Source", body: "Body", participantCharacterIds: [] }, choices: [], validationNotes: [] },
    });
    const result = await new V2SqliteCandidateSubmissionPort(db).submitSceneCandidate({
      candidate: candidate as never,
      idempotencyKey: "key_exact_source" as never,
    });
    assert.equal(result.status, "pending");
  } finally {
    db.close();
    cleanup();
  }
});
test("V2 candidate submission port rejects reviewed or stale envelopes", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const unit = new V2SqliteCandidateReviewUnitOfWork(db);
    await unit.withCandidateReviewTransaction(async ({ canon }) => {
      await canon.createWorld(createV2CanonWorld({ storyWorldId: "world_guard" as never, name: "Guard World" }));
    });
    const candidate = createV2SceneCandidate({
      candidateId: "candidate_guard",
      storyWorldId: "world_guard",
      baseCanonRevision: 1,
      provenance: { source: "llm" },
      payload: {
        scene: { sceneId: "scene_guard", title: "Guard", body: "Body", participantCharacterIds: [] },
        choices: [],
        validationNotes: [],
      },
    });
    const port = new V2SqliteCandidateSubmissionPort(db);
    await assert.rejects(() => port.submitSceneCandidate({
      candidate: { ...candidate, status: "approved" } as never,
      idempotencyKey: "key_reviewed" as never,
    }), /pending scene candidates/);

    await unit.withCandidateReviewTransaction(async ({ canon }) => {
      await canon.advanceRevision("world_guard" as never, 1 as never);
    });
    await assert.rejects(() => port.submitSceneCandidate({
      candidate: candidate as never,
      idempotencyKey: "key_stale" as never,
    }), /current revision is 2/);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 SQLite snapshot reader validates world revisions and maps canon rows", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const unit = new V2SqliteCandidateReviewUnitOfWork(db);
    await unit.withCandidateReviewTransaction(async ({ canon, graphState }) => {
      await canon.createWorld(createV2CanonWorld({ storyWorldId: "world_snapshot" as never, name: "Snapshot" }));
      await canon.createFact({ factId: "fact", storyWorldId: "world_snapshot", text: "Fact", visibility: "player_visible" });
      await canon.createCharacter({ characterId: "char", storyWorldId: "world_snapshot", name: "Character" });
      await graphState.createScene({ storyWorldId: "world_snapshot", sceneId: "scene", title: "Scene", isEntry: true });
    });
    const reader = new V2SqliteCanonSnapshotReader(db);
    const snapshot = await reader.getCanonSnapshot({ storyWorldId: "world_snapshot" as never, revision: 1 as never });
    assert.equal(snapshot.facts[0]?.id, "fact");
    assert.equal(snapshot.characters[0]?.characterId, "char");
    assert.equal(snapshot.scenes[0]?.sceneId, "scene");
    await assert.rejects(() => reader.getCanonSnapshot({ storyWorldId: "world_snapshot" as never, revision: 2 as never }), /current revision/);
    await assert.rejects(() => reader.getCanonSnapshot({ storyWorldId: "missing" as never, revision: 1 as never }), /does not exist/);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 candidate submission port rejects conflicting idempotent payloads", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const unit = new V2SqliteCandidateReviewUnitOfWork(db);
    await unit.withCandidateReviewTransaction(async ({ canon }) => {
      await canon.createWorld(createV2CanonWorld({ storyWorldId: "world_conflict" as never, name: "Conflict" }));
    });
    const port = new V2SqliteCandidateSubmissionPort(db);
    const base = createV2SceneCandidate({ candidateId: "candidate_conflict", storyWorldId: "world_conflict", baseCanonRevision: 1, provenance: { source: "human" }, payload: { scene: { sceneId: "scene", title: "Scene", body: "Body", participantCharacterIds: [] }, choices: [], validationNotes: [] } });
    await port.submitSceneCandidate({ candidate: base as never, idempotencyKey: "conflict-key" as never });
    await assert.rejects(() => port.submitSceneCandidate({ candidate: { ...base, payload: { ...base.payload, scene: { ...base.payload.scene, body: "Different" } } } as never, idempotencyKey: "conflict-key" as never }), /different candidate payload/);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 candidate repository rejects malformed persisted candidate JSON", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    db.prepare("INSERT INTO v2_worlds (story_world_id, name, revision) VALUES (?, ?, ?)").run("world_bad_candidate", "Bad", 1);
    db.prepare("INSERT INTO v2_scene_candidates (candidate_id, story_world_id, base_canon_revision, status, payload_json, provenance_json) VALUES (?, ?, ?, ?, ?, ?)").run("candidate_bad", "world_bad_candidate", 1, "pending", "[]", JSON.stringify({ source: "human" }));
    const repository = new V2SqliteCandidateReviewRepository(db);
    await assert.rejects(() => repository.getSceneCandidate({ storyWorldId: "world_bad_candidate" as never, candidateId: "candidate_bad" as never }), /payload_json/);
  } finally {
    db.close();
    cleanup();
  }
});
