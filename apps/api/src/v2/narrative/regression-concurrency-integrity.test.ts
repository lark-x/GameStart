import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  applyV2Migrations,
  SqliteNarrativeUnitOfWork,
  V2SqliteCanonRepository,
  V2SqliteGraphStateRepository,
} from "@living-network/database/v2";
import { createV2FastifyApp } from "../platform/app.ts";
import { v2NarrativePlugin } from "./plugin.ts";

function createTestApp() {
  const db = new DatabaseSync(":memory:");
  applyV2Migrations(db);
  const narrativeUnitOfWork = new SqliteNarrativeUnitOfWork(db);
  const canonRepo = new V2SqliteCanonRepository(db);
  const graphRepo = new V2SqliteGraphStateRepository(db);

  const app = createV2FastifyApp({
    narrativePlugin: v2NarrativePlugin,
    narrativeOptions: { narrativeUnitOfWork },
  });

  return { app, db, canonRepo, graphRepo, narrativeUnitOfWork };
}

test("Phase 0 Regression - Scene Revision Concurrency Conflict", async () => {
  const { app, canonRepo, graphRepo } = createTestApp();

  await canonRepo.createWorld({
    storyWorldId: "w1",
    name: "World 1",
    revision: 1,
  });
  await graphRepo.createArc({
    storyWorldId: "w1" as any,
    arcId: "arc1" as any,
    title: "Arc 1",
  });
  await graphRepo.createScene({
    storyWorldId: "w1" as any,
    sceneId: "s1" as any,
    arcId: "arc1" as any,
    title: "Scene 1",
    isEntry: true,
  });

  // Client A saves Scene 1 at expectedSceneRevision = 1
  const resA = await app.inject({
    method: "PUT",
    url: "/api/v2/worlds/w1/narrative/scenes/s1/document",
    payload: {
      title: "Scene 1 - Modified by A",
      documentMode: "blocks",
      blocks: [{ kind: "narration", text: "Text by A" }],
      expectedSceneRevision: 1,
      expectedRevision: 1,
      idempotencyKey: "save_scene_a_1",
    },
  });
  assert.equal(resA.statusCode, 200);
  const docA = resA.json();
  assert.equal(docA.revision, 2);

  // Client B tries to save Scene 1 using stale expectedSceneRevision = 1
  const resB = await app.inject({
    method: "PUT",
    url: "/api/v2/worlds/w1/narrative/scenes/s1/document",
    payload: {
      title: "Scene 1 - Stale Overwrite by B",
      documentMode: "blocks",
      blocks: [{ kind: "narration", text: "Text by B" }],
      expectedSceneRevision: 1, // Stale! Current is 2
      expectedRevision: 2,
      idempotencyKey: "save_scene_b_1",
    },
  });
  assert.equal(resB.statusCode, 409);
  assert.equal(resB.json().code, "STALE_REVISION");

  // Verify Scene 1 kept Client A's content
  const getRes = await app.inject({
    method: "GET",
    url: "/api/v2/worlds/w1/narrative/scenes/s1/document",
  });
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.json().title, "Scene 1 - Modified by A");
  assert.equal(getRes.json().revision, 2);
});

test("Phase 0 Regression - World Revision Concurrency Conflict on Chapter & Quest", async () => {
  const { app, canonRepo, graphRepo } = createTestApp();

  await canonRepo.createWorld({
    storyWorldId: "w1",
    name: "World 1",
    revision: 10,
  });
  await graphRepo.createArc({
    storyWorldId: "w1" as any,
    arcId: "arc1" as any,
    title: "Arc 1",
  });

  // Client submits createChapter with stale expectedRevision = 9
  const res = await app.inject({
    method: "POST",
    url: "/api/v2/worlds/w1/narrative/chapters",
    payload: {
      arcId: "arc1",
      title: "Chapter Stale",
      ordinal: 1,
      expectedRevision: 9, // Stale! Current is 10
      idempotencyKey: "create_chap_stale_1",
    },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.json().code, "STALE_REVISION");
});

test("Phase 0 Regression - Idempotency Replay on Chapter and Template", async () => {
  const { app, canonRepo, graphRepo } = createTestApp();

  await canonRepo.createWorld({
    storyWorldId: "w1",
    name: "World 1",
    revision: 1,
  });
  await graphRepo.createArc({
    storyWorldId: "w1" as any,
    arcId: "arc1" as any,
    title: "Arc 1",
  });

  const payload = {
    arcId: "arc1",
    title: "Chapter Idempotent",
    ordinal: 1,
    expectedRevision: 1,
    idempotencyKey: "idem_chap_100",
  };

  // First request
  const res1 = await app.inject({
    method: "POST",
    url: "/api/v2/worlds/w1/narrative/chapters",
    payload,
  });
  assert.equal(res1.statusCode, 200);
  const json1 = res1.json();

  // Second request with exact same idempotencyKey and payload
  const res2 = await app.inject({
    method: "POST",
    url: "/api/v2/worlds/w1/narrative/chapters",
    payload,
  });
  assert.equal(res2.statusCode, 200);
  const json2 = res2.json();
  assert.equal(json1.chapterId, json2.chapterId);

  // Verify only 1 chapter was created in outline
  const outlineRes = await app.inject({
    method: "GET",
    url: "/api/v2/worlds/w1/narrative/outline",
  });
  const outline = outlineRes.json();
  assert.equal(outline.arcs[0].chapters.length, 1);
});

test("Phase 0 Regression - Delete Chapter and Quest Protection (HAS_CHILDREN)", async () => {
  const { app, canonRepo, graphRepo } = createTestApp();

  await canonRepo.createWorld({
    storyWorldId: "w1",
    name: "World 1",
    revision: 1,
  });
  await graphRepo.createArc({
    storyWorldId: "w1" as any,
    arcId: "arc1" as any,
    title: "Arc 1",
  });

  // Create Chapter
  const chRes = await app.inject({
    method: "POST",
    url: "/api/v2/worlds/w1/narrative/chapters",
    payload: {
      arcId: "arc1",
      title: "Chapter 1",
      ordinal: 1,
      expectedRevision: 1,
      idempotencyKey: "chap_del_test_1",
    },
  });
  assert.equal(chRes.statusCode, 200);
  const chapterId = chRes.json().chapterId;

  // Create Quest inside Chapter
  const qRes = await app.inject({
    method: "POST",
    url: "/api/v2/worlds/w1/narrative/quests",
    payload: {
      arcId: "arc1",
      chapterId,
      title: "Quest 1",
      ordinal: 1,
      expectedRevision: 2,
      idempotencyKey: "quest_del_test_1",
    },
  });
  assert.equal(qRes.statusCode, 200);
  const questId = qRes.json().questId;

  // Attempt to delete Chapter while it has Quest -> Should return 409 HAS_CHILDREN
  const delChRes = await app.inject({
    method: "DELETE",
    url: `/api/v2/worlds/w1/narrative/chapters/${chapterId}`,
  });
  assert.equal(delChRes.statusCode, 409);
  assert.equal(delChRes.json().code, "HAS_CHILDREN");

  // Create Scene inside Quest
  await graphRepo.createScene({
    storyWorldId: "w1" as any,
    sceneId: "s1" as any,
    arcId: "arc1" as any,
    title: "Scene in Quest",
    isEntry: true,
  });
  await app.inject({
    method: "PUT",
    url: "/api/v2/worlds/w1/narrative/scenes/s1/document",
    payload: {
      title: "Scene in Quest",
      chapterId,
      questId,
      expectedSceneRevision: 1,
      expectedRevision: 3,
      idempotencyKey: "save_scene_in_quest_1",
    },
  });

  // Attempt to delete Quest while it has Scene -> Should return 409 HAS_CHILDREN
  const delQRes = await app.inject({
    method: "DELETE",
    url: `/api/v2/worlds/w1/narrative/quests/${questId}`,
  });
  assert.equal(delQRes.statusCode, 409);
  assert.equal(delQRes.json().code, "HAS_CHILDREN");
});

test("Phase 0 Regression - Hierarchy Mismatch Validation", async () => {
  const { app, canonRepo, graphRepo } = createTestApp();

  await canonRepo.createWorld({
    storyWorldId: "w1",
    name: "World 1",
    revision: 1,
  });
  await graphRepo.createArc({
    storyWorldId: "w1" as any,
    arcId: "arc_a" as any,
    title: "Arc A",
  });
  await graphRepo.createArc({
    storyWorldId: "w1" as any,
    arcId: "arc_b" as any,
    title: "Arc B",
  });

  // Create Chapter under Arc A
  const chRes = await app.inject({
    method: "POST",
    url: "/api/v2/worlds/w1/narrative/chapters",
    payload: {
      arcId: "arc_a",
      title: "Chapter in Arc A",
      ordinal: 1,
      expectedRevision: 1,
      idempotencyKey: "chap_hier_1",
    },
  });
  const chapterId = chRes.json().chapterId;

  // Try to create Quest with Chapter in Arc A, but arcId = Arc B -> Should fail with 400
  const qRes = await app.inject({
    method: "POST",
    url: "/api/v2/worlds/w1/narrative/quests",
    payload: {
      arcId: "arc_b", // Mismatch! Chapter belongs to Arc A
      chapterId,
      title: "Mismatch Quest",
      ordinal: 1,
      expectedRevision: 2,
      idempotencyKey: "quest_mismatch_1",
    },
  });
  assert.equal(qRes.statusCode, 400);
  assert.equal(qRes.json().code, "VALIDATION_FAILED");
});

test("Phase 0 Regression - Reference Target Existence and Main Location Uniqueness", async () => {
  const { app, canonRepo, graphRepo } = createTestApp();

  await canonRepo.createWorld({
    storyWorldId: "w1",
    name: "World 1",
    revision: 1,
  });
  await graphRepo.createArc({
    storyWorldId: "w1" as any,
    arcId: "arc1" as any,
    title: "Arc 1",
  });
  await graphRepo.createScene({
    storyWorldId: "w1" as any,
    sceneId: "s1" as any,
    arcId: "arc1" as any,
    title: "Scene 1",
    isEntry: true,
  });

  // Try to set non-existent character as participant
  const resBadChar = await app.inject({
    method: "PUT",
    url: "/api/v2/worlds/w1/narrative/scenes/s1/references",
    payload: {
      participantCharacterIds: ["char_non_existent"],
      expectedRevision: 1,
      idempotencyKey: "ref_bad_char_1",
    },
  });
  assert.equal(resBadChar.statusCode, 400);
  assert.equal(resBadChar.json().code, "VALIDATION_FAILED");

  // Try to set non-existent location as main location
  const resBadLoc = await app.inject({
    method: "PUT",
    url: "/api/v2/worlds/w1/narrative/scenes/s1/references",
    payload: {
      mainLocationId: "loc_non_existent",
      expectedRevision: 1,
      idempotencyKey: "ref_bad_loc_1",
    },
  });
  assert.equal(resBadLoc.statusCode, 400);
  assert.equal(resBadLoc.json().code, "VALIDATION_FAILED");
});

test("Phase 0 Regression - Template Single Transaction & Advance Exactly 1 Revision", async () => {
  const { app, canonRepo } = createTestApp();

  await canonRepo.createWorld({
    storyWorldId: "w1",
    name: "World 1",
    revision: 1,
  });

  const res = await app.inject({
    method: "POST",
    url: "/api/v2/worlds/w1/narrative/templates/apply",
    payload: {
      templateId: "three-act",
      expectedRevision: 1,
      idempotencyKey: "apply_tpl_1",
    },
  });
  assert.equal(res.statusCode, 200);

  const world = await canonRepo.getWorld("w1" as any);
  // Revision should have advanced from 1 to 2 (exactly once for the entire template application)
  assert.equal(world?.revision, 2);
});
