import assert from "node:assert/strict";
import test from "node:test";

import {
  applyV2Migrations,
  openV2TempSqliteConnection,
} from "@living-network/database";
import { createV2FastifyApp } from "../platform/index.ts";

test("V2 core API creates canon records with revision and idempotent replay", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  applyV2Migrations(db);
  const app = createV2FastifyApp({ coreOptions: { sqlite: db } });
  await app.ready();
  try {
    const createWorld = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds",
      payload: {
        storyWorldId: "world_api",
        name: "API World",
        idempotencyKey: "key_world",
      },
    });
    assert.equal(createWorld.statusCode, 201);
    assert.equal(createWorld.json().revision, 1);

    const location = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_api/locations",
      payload: {
        locationId: "loc_gate",
        name: "Gate",
        expectedRevision: 1,
        idempotencyKey: "key_location",
      },
    });
    assert.equal(location.statusCode, 201);
    assert.equal(location.json().revision, 2);

    const replay = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_api/locations",
      payload: {
        locationId: "loc_gate",
        name: "Gate",
        expectedRevision: 1,
        idempotencyKey: "key_location",
      },
    });
    assert.equal(replay.statusCode, 201);
    assert.deepEqual(replay.json(), location.json());

    const character = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_api/characters",
      payload: {
        characterId: "char_a",
        name: "Ada",
        homeLocationId: "loc_gate",
        expectedRevision: 2,
        idempotencyKey: "key_character",
      },
    });
    assert.equal(character.statusCode, 201);
    assert.equal(character.json().revision, 3);

    const snapshot = await app.inject({ method: "GET", url: "/api/v2/core/worlds/world_api/canon" });
    assert.equal(snapshot.statusCode, 200);
    assert.equal(snapshot.json().world.revision, 3);
    assert.equal(snapshot.json().locations.length, 1);
    assert.equal(snapshot.json().characters[0].homeLocationId, "loc_gate");
  } finally {
    await app.close();
    db.close();
    cleanup();
  }
});

test("V2 core API maps stale revisions, idempotency conflicts, and unknown fields", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  applyV2Migrations(db);
  const app = createV2FastifyApp({ coreOptions: { sqlite: db } });
  await app.ready();
  try {
    await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds",
      payload: {
        storyWorldId: "world_api",
        name: "API World",
        idempotencyKey: "key_world",
      },
    });
    const stale = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_api/facts",
      payload: {
        factId: "fact_a",
        text: "Fact",
        visibility: "player_visible",
        expectedRevision: 5,
        idempotencyKey: "key_fact",
      },
    });
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.json().error.code, "STALE_REVISION");

    const first = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_api/rules",
      payload: {
        ruleId: "rule_a",
        text: "Keep it local",
        severity: "required",
        expectedRevision: 1,
        idempotencyKey: "key_rule",
      },
    });
    assert.equal(first.statusCode, 201);
    const conflict = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_api/rules",
      payload: {
        ruleId: "rule_b",
        text: "Changed",
        severity: "required",
        expectedRevision: 2,
        idempotencyKey: "key_rule",
      },
    });
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.json().error.code, "IDEMPOTENCY_CONFLICT");

    const bad = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds",
      payload: {
        storyWorldId: "world_bad",
        name: "Bad",
        idempotencyKey: "key_bad",
        extra: true,
      },
    });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().error.code, "BAD_REQUEST");
  } finally {
    await app.close();
    db.close();
    cleanup();
  }
});

test("V2 core API creates graph records, validates reachability, and previews typed state", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  applyV2Migrations(db);
  const app = createV2FastifyApp({ coreOptions: { sqlite: db } });
  await app.ready();
  try {
    await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds",
      payload: {
        storyWorldId: "world_graph_api",
        name: "Graph API World",
        idempotencyKey: "key_world_graph_api",
      },
    });

    const arc = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_graph_api/arcs",
      payload: {
        arcId: "arc_intro",
        title: "Intro Arc",
        expectedRevision: 1,
        idempotencyKey: "key_arc_intro",
      },
    });
    assert.equal(arc.statusCode, 201);
    assert.equal(arc.json().revision, 2);

    const entry = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_graph_api/scenes",
      payload: {
        sceneId: "scene_entry",
        arcId: "arc_intro",
        title: "Entry",
        isEntry: true,
        expectedRevision: 2,
        idempotencyKey: "key_scene_entry",
      },
    });
    assert.equal(entry.statusCode, 201);
    assert.equal(entry.json().revision, 3);

    const next = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_graph_api/scenes",
      payload: {
        sceneId: "scene_next",
        arcId: "arc_intro",
        title: "Next",
        expectedRevision: 3,
        idempotencyKey: "key_scene_next",
      },
    });
    assert.equal(next.statusCode, 201);
    assert.equal(next.json().revision, 4);

    const choice = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_graph_api/choices",
      payload: {
        choiceId: "choice_go",
        sourceSceneId: "scene_entry",
        targetSceneId: "scene_next",
        label: "Go",
        gates: [{ stateKey: "Trust", operator: "gte", value: 1 }],
        consequences: [{ stateKey: "Trust", operation: "increment", value: 1 }],
        expectedRevision: 4,
        idempotencyKey: "key_choice_go",
      },
    });
    assert.equal(choice.statusCode, 201);
    assert.equal(choice.json().revision, 5);

    const variable = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_graph_api/state/variables",
      payload: {
        key: "Trust",
        valueType: "number",
        defaultValue: 0,
        expectedRevision: 5,
        idempotencyKey: "key_state_trust",
      },
    });
    assert.equal(variable.statusCode, 201);
    assert.equal(variable.json().revision, 6);

    const graph = await app.inject({
      method: "GET",
      url: "/api/v2/core/worlds/world_graph_api/graph",
    });
    assert.equal(graph.statusCode, 200);
    assert.equal(graph.json().scenes.length, 2);
    assert.equal(graph.json().choices[0].consequences[0].stateKey, "Trust");

    const validation = await app.inject({
      method: "GET",
      url: "/api/v2/core/worlds/world_graph_api/graph/validation",
    });
    assert.equal(validation.statusCode, 200);
    assert.deepEqual(validation.json(), { valid: true, diagnostics: [] });

    const initial = await app.inject({
      method: "GET",
      url: "/api/v2/core/worlds/world_graph_api/state/initial",
    });
    assert.equal(initial.statusCode, 200);
    assert.deepEqual(initial.json(), { values: { Trust: 0 } });

    const preview = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_graph_api/state/preview-delta",
      payload: {
        deltas: [{ stateKey: "Trust", operation: "increment", value: 3 }],
      },
    });
    assert.equal(preview.statusCode, 200);
    assert.deepEqual(preview.json(), { valid: true, values: { Trust: 3 }, diagnostics: [] });
  } finally {
    await app.close();
    db.close();
    cleanup();
  }
});

test("V2 core API reviews scene candidates and applies approved candidates atomically", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  applyV2Migrations(db);
  const app = createV2FastifyApp({ coreOptions: { sqlite: db } });
  await app.ready();
  try {
    await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds",
      payload: {
        storyWorldId: "world_review_api",
        name: "Review API World",
        idempotencyKey: "key_world_review_api",
      },
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_review_api/characters",
      payload: {
        characterId: "char_a",
        name: "Ada",
        expectedRevision: 1,
        idempotencyKey: "key_review_char",
      },
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_review_api/scenes",
      payload: {
        sceneId: "scene_existing",
        title: "Existing",
        isEntry: true,
        expectedRevision: 2,
        idempotencyKey: "key_review_existing_scene",
      },
    });

    const submitted = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_review_api/candidates/scenes",
      payload: {
        candidateId: "candidate_scene_a",
        baseCanonRevision: 3,
        provenance: { source: "llm", jobId: "job_a" },
        payload: {
          scene: {
            sceneId: "scene_new",
            title: "New Scene",
            body: "Candidate body",
            participantCharacterIds: ["char_a"],
          },
          choices: [{ label: "Back", targetSceneId: "scene_existing" }],
          validationNotes: [],
        },
        idempotencyKey: "key_submit_candidate",
      },
    });
    assert.equal(submitted.statusCode, 201);
    assert.equal(submitted.json().status, "pending");

    const approved = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_review_api/candidates/scenes/candidate_scene_a/review",
      payload: {
        action: "approve",
        reviewer: "creator",
        expectedRevision: 3,
        idempotencyKey: "key_approve_candidate",
      },
    });
    assert.equal(approved.statusCode, 200);
    assert.equal(approved.json().revision, 4);
    assert.equal(approved.json().candidate.status, "approved");
    assert.equal(approved.json().appliedSceneId, "scene_new");
    assert.deepEqual(approved.json().appliedChoiceIds, ["candidate_scene_a:choice:1"]);

    const graph = await app.inject({
      method: "GET",
      url: "/api/v2/core/worlds/world_review_api/graph",
    });
    assert.equal(graph.statusCode, 200);
    assert.equal(graph.json().scenes.some((scene: { readonly sceneId: string }) => scene.sceneId === "scene_new"), true);
    assert.equal(graph.json().choices[0].sourceSceneId, "scene_new");

    const audits = await app.inject({
      method: "GET",
      url: "/api/v2/core/worlds/world_review_api/candidates/scenes/candidate_scene_a/audits",
    });
    assert.equal(audits.statusCode, 200);
    assert.equal(audits.json()[0].toStatus, "approved");
  } finally {
    await app.close();
    db.close();
    cleanup();
  }
});

test("V2 core API rejects stale scene candidate approvals without applying graph writes", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  applyV2Migrations(db);
  const app = createV2FastifyApp({ coreOptions: { sqlite: db } });
  await app.ready();
  try {
    await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds",
      payload: {
        storyWorldId: "world_stale_api",
        name: "Stale API World",
        idempotencyKey: "key_world_stale_api",
      },
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_stale_api/facts",
      payload: {
        factId: "fact_a",
        text: "A later edit",
        visibility: "player_visible",
        expectedRevision: 1,
        idempotencyKey: "key_stale_fact",
      },
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_stale_api/candidates/scenes",
      payload: {
        candidateId: "candidate_stale",
        baseCanonRevision: 1,
        provenance: { source: "human" },
        payload: {
          scene: {
            sceneId: "scene_new",
            title: "New Scene",
            body: "Candidate body",
            participantCharacterIds: [],
          },
          choices: [],
          validationNotes: [],
        },
        idempotencyKey: "key_submit_stale_candidate",
      },
    });

    const stale = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_stale_api/candidates/scenes/candidate_stale/review",
      payload: {
        action: "approve",
        reviewer: "creator",
        expectedRevision: 2,
        idempotencyKey: "key_approve_stale_candidate",
      },
    });
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.json().error.code, "STALE_REVISION");

    const graph = await app.inject({
      method: "GET",
      url: "/api/v2/core/worlds/world_stale_api/graph",
    });
    assert.equal(graph.statusCode, 200);
    assert.equal(graph.json().scenes.length, 0);
  } finally {
    await app.close();
    db.close();
    cleanup();
  }
});
