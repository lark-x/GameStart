import assert from "node:assert/strict";
import test from "node:test";

import {
  applyV2Migrations,
  openV2TempSqliteConnection,
  V2SqliteCanonUnitOfWork,
  V2SqliteCandidateReviewUnitOfWork,
  V2SqliteGraphStateUnitOfWork,
  V2SqliteReleaseRuntimeUnitOfWork,
} from "@living-network/database/v2";
import { createV2FastifyApp } from "../platform/index.ts";
import { V2DomainError } from "@living-network/domain/v2";
import { toV2HttpError, V2HttpError } from "./errors.ts";
import { createV2CoreUseCases } from "./use-cases.ts";
import { createV2GraphScene } from "@living-network/domain/v2";

function createSqliteCoreApp(db: import("node:sqlite").DatabaseSync) {
  return createV2FastifyApp({
    coreOptions: {
      useCases: createV2CoreUseCases(
        new V2SqliteCanonUnitOfWork(db),
        new V2SqliteGraphStateUnitOfWork(db),
        new V2SqliteCandidateReviewUnitOfWork(db),
        new V2SqliteReleaseRuntimeUnitOfWork(db),
      ),
    },
  });
}

test("V2 core API creates canon records with revision and idempotent replay", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  applyV2Migrations(db);
  const app = createSqliteCoreApp(db);
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

    const timeline = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_api/timeline-events",
      payload: {
        timelineEventId: "event_first",
        localDate: "2026-08-13",
        title: "First release rehearsal",
        summary: "The creator checks the entry scene.",
        expectedRevision: 3,
        idempotencyKey: "key_timeline",
      },
    });
    assert.equal(timeline.statusCode, 201);
    const withTimeline = await app.inject({ method: "GET", url: "/api/v2/core/worlds/world_api/canon" });
    assert.equal(withTimeline.json().timelineEvents[0].timelineEventId, "event_first");
  } finally {
    await app.close();
    db.close();
    cleanup();
  }
});

test("V2 HTTP error mapping preserves domain, constraint, and unknown failures", () => {
  const existing = new V2HttpError(418, "TEAPOT", "already mapped");
  assert.equal(toV2HttpError(existing), existing);
  const stale = toV2HttpError(new V2DomainError("STALE_REVISION", "stale"));
  assert.deepEqual({ status: stale.statusCode, code: stale.code }, { status: 409, code: "STALE_REVISION" });
  const crossWorld = toV2HttpError(new V2DomainError("CROSS_WORLD_REFERENCE", "cross world"));
  assert.deepEqual({ status: crossWorld.statusCode, code: crossWorld.code }, { status: 422, code: "VALIDATION_FAILED" });
  const genericDomain = toV2HttpError(new V2DomainError("INVALID_INPUT", "bad input"));
  assert.equal(genericDomain.statusCode, 422);
  const constraint = Object.assign(new Error("constraint"), { code: "ERR_SQLITE_CONSTRAINT_FOREIGNKEY" });
  assert.equal(toV2HttpError(constraint).statusCode, 409);
  assert.equal(toV2HttpError(new Error("unknown")).code, "INTERNAL_ERROR");
});

test("V2 core API maps stale revisions, idempotency conflicts, and unknown fields", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  applyV2Migrations(db);
  const app = createSqliteCoreApp(db);
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
  const app = createSqliteCoreApp(db);
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

    const variable = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_graph_api/state/variables",
      payload: {
        key: "Trust",
        valueType: "number",
        defaultValue: 0,
        expectedRevision: 4,
        idempotencyKey: "key_state_trust",
      },
    });
    assert.equal(variable.statusCode, 201);
    assert.equal(variable.json().revision, 5);

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
        expectedRevision: 5,
        idempotencyKey: "key_choice_go",
      },
    });
    assert.equal(choice.statusCode, 201);
    assert.equal(choice.json().revision, 6);

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

    const worlds = await app.inject({ method: "GET", url: "/api/v2/core/worlds" });
    assert.equal(worlds.statusCode, 200);
    assert.equal(worlds.json().length, 1);
    const variables = await app.inject({ method: "GET", url: "/api/v2/core/worlds/world_graph_api/state/variables" });
    assert.equal(variables.json()[0].key, "Trust");
  } finally {
    await app.close();
    db.close();
    cleanup();
  }
});

test("V2 core API reviews scene candidates and applies approved candidates atomically", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  applyV2Migrations(db);
  const app = createSqliteCoreApp(db);
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
    const candidate = await app.inject({
      method: "GET",
      url: "/api/v2/core/worlds/world_review_api/candidates/scenes/candidate_scene_a",
    });
    assert.equal(candidate.statusCode, 200);
    const candidates = await app.inject({ method: "GET", url: "/api/v2/core/worlds/world_review_api/candidates/scenes" });
    assert.equal(candidates.json().length, 1);
  } finally {
    await app.close();
    db.close();
    cleanup();
  }
});

test("V2 core API rejects stale scene candidate approvals without applying graph writes", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  applyV2Migrations(db);
  const app = createSqliteCoreApp(db);
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

test("V2 core API keeps request-changes review revision stable so a revised candidate can be approved", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  applyV2Migrations(db);
  const app = createSqliteCoreApp(db);
  await app.ready();
  try {
    await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds",
      payload: { storyWorldId: "world_changes_api", name: "Changes API", idempotencyKey: "world_changes" },
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_changes_api/candidates/scenes",
      payload: {
        candidateId: "candidate_changes",
        baseCanonRevision: 1,
        provenance: { source: "human" },
        payload: {
          scene: { sceneId: "scene_changes", title: "Changed Scene", body: "Body", participantCharacterIds: [] },
          choices: [],
          validationNotes: [],
        },
        idempotencyKey: "submit_changes",
      },
    });
    const changes = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_changes_api/candidates/scenes/candidate_changes/review",
      payload: {
        action: "request_changes",
        reviewer: "creator",
        expectedRevision: 1,
        idempotencyKey: "request_changes",
      },
    });
    assert.equal(changes.statusCode, 200);
    assert.equal(changes.json().revision, 1);

    const approved = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_changes_api/candidates/scenes/candidate_changes/review",
      payload: {
        action: "approve",
        reviewer: "creator",
        expectedRevision: 1,
        idempotencyKey: "approve_changes",
      },
    });
    assert.equal(approved.statusCode, 200);
    assert.equal(approved.json().revision, 2);
  } finally {
    await app.close();
    db.close();
    cleanup();
  }
});

test("V2 core API releases, runs, saves, and exports a playable graph", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  applyV2Migrations(db);
  const app = createSqliteCoreApp(db);
  await app.ready();
  try {
    await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds",
      payload: {
        storyWorldId: "world_release_api",
        name: "Release API World",
        idempotencyKey: "key_release_world",
      },
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_release_api/state/variables",
      payload: {
        key: "Trust",
        valueType: "number",
        defaultValue: 1,
        expectedRevision: 1,
        idempotencyKey: "key_release_state",
      },
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_release_api/scenes",
      payload: {
        sceneId: "scene_entry",
        title: "Entry",
        body: "Entry body",
        isEntry: true,
        expectedRevision: 2,
        idempotencyKey: "key_release_entry",
      },
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_release_api/scenes",
      payload: {
        sceneId: "scene_next",
        title: "Next",
        body: "Next body",
        expectedRevision: 3,
        idempotencyKey: "key_release_next",
      },
    });
    await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_release_api/choices",
      payload: {
        choiceId: "choice_go",
        sourceSceneId: "scene_entry",
        targetSceneId: "scene_next",
        label: "Go",
        gates: [{ stateKey: "Trust", operator: "gte", value: 1 }],
        consequences: [{ stateKey: "Trust", operation: "increment", value: 2 }],
        expectedRevision: 4,
        idempotencyKey: "key_release_choice",
      },
    });

    const preflight = await app.inject({
      method: "GET",
      url: "/api/v2/core/worlds/world_release_api/releases/preflight",
    });
    assert.equal(preflight.statusCode, 200);
    assert.equal(preflight.json().valid, true);

    const releasesBefore = await app.inject({ method: "GET", url: "/api/v2/core/worlds/world_release_api/releases" });
    assert.equal(releasesBefore.statusCode, 200);
    assert.deepEqual(releasesBefore.json(), []);

    const release = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_release_api/releases",
      payload: {
        releaseId: "release_api",
        version: "1.0.0",
        sourceRevision: 5,
        idempotencyKey: "key_create_release",
      },
    });
    assert.equal(release.statusCode, 201);
    assert.equal(release.json().version, "1.0.0");
    assert.deepEqual(release.json().graph.arcs, []);
    assert.match(release.json().contentHash, /^[a-f0-9]{64}$/);

    const releasesAfter = await app.inject({ method: "GET", url: "/api/v2/core/worlds/world_release_api/releases" });
    assert.equal(releasesAfter.json().length, 1);
    const staleRelease = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_release_api/releases",
      payload: { releaseId: "release_stale", version: "1.0.1", sourceRevision: 4, idempotencyKey: "key_stale_release" },
    });
    assert.equal(staleRelease.statusCode, 409);

    const run = await app.inject({
      method: "POST",
      url: "/api/v2/core/runtime/runs",
      payload: {
        runId: "run_api",
        releaseId: "release_api",
        idempotencyKey: "key_start_run",
      },
    });
    assert.equal(run.statusCode, 201);
    assert.equal(run.json().scene.sceneId, "scene_entry");
    assert.equal(run.json().availableChoices[0].choiceId, "choice_go");
    const runtimeScene = await app.inject({ method: "GET", url: "/api/v2/core/runtime/runs/run_api/scene" });
    assert.equal(runtimeScene.statusCode, 200);

    const advanced = await app.inject({
      method: "POST",
      url: "/api/v2/core/runtime/runs/run_api/choices",
      payload: {
        choiceId: "choice_go",
        idempotencyKey: "key_submit_choice",
      },
    });
    assert.equal(advanced.statusCode, 200);
    assert.equal(advanced.json().scene.sceneId, "scene_next");
    assert.equal(advanced.json().run.stateValues.Trust, 3);

    const save = await app.inject({
      method: "POST",
      url: "/api/v2/core/runtime/runs/run_api/saves",
      payload: {
        saveId: "save_api",
        idempotencyKey: "key_create_save",
      },
    });
    assert.equal(save.statusCode, 201);
    assert.equal(save.json().releaseVersion, "1.0.0");
    const saved = await app.inject({ method: "GET", url: "/api/v2/core/runtime/saves/save_api" });
    assert.equal(saved.statusCode, 200);

    const loaded = await app.inject({
      method: "POST",
      url: "/api/v2/core/runtime/saves/save_api/load",
      payload: {
        runId: "run_loaded",
        idempotencyKey: "key_load_save",
      },
    });
    assert.equal(loaded.statusCode, 201);
    assert.equal(loaded.json().run.runId, "run_loaded");
    assert.equal(loaded.json().scene.sceneId, "scene_next");
    assert.equal(loaded.json().run.stateValues.Trust, 3);

    const workspaceExport = await app.inject({
      method: "GET",
      url: "/api/v2/core/worlds/world_release_api/export?revision=5",
    });
    assert.equal(workspaceExport.statusCode, 200);
    assert.match(workspaceExport.json().markdown, /Release API World/);
    const staleExport = await app.inject({ method: "GET", url: "/api/v2/core/worlds/world_release_api/export?revision=4" });
    assert.equal(staleExport.statusCode, 409);

    const releaseExport = await app.inject({
      method: "GET",
      url: "/api/v2/core/releases/release_api/export",
    });
    assert.equal(releaseExport.statusCode, 200);
    assert.equal(releaseExport.json().source.releaseVersion, "1.0.0");
  } finally {
    await app.close();
    db.close();
    cleanup();
  }
});

test("V2 core API rejects malformed parser inputs and unknown resources", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  applyV2Migrations(db);
  const app = createSqliteCoreApp(db);
  await app.ready();
  try {
    const malformedWorld = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds",
      payload: { storyWorldId: "world_parser", name: "Parser", idempotencyKey: "parser", extra: true },
    });
    assert.equal(malformedWorld.statusCode, 400);

    const invalidFact = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_parser/facts",
      payload: { factId: "fact", text: "Fact", visibility: "private", expectedRevision: 1, idempotencyKey: "fact" },
    });
    assert.equal(invalidFact.statusCode, 400);

    const invalidRule = await app.inject({
      method: "POST",
      url: "/api/v2/core/worlds/world_parser/rules",
      payload: { ruleId: "rule", text: "Rule", severity: "hard", expectedRevision: 1, idempotencyKey: "rule" },
    });
    assert.equal(invalidRule.statusCode, 400);

    const unknownWorld = await app.inject({ method: "GET", url: "/api/v2/core/worlds/does-not-exist/canon" });
    assert.equal(unknownWorld.statusCode, 404);
    const invalidParams = await app.inject({ method: "GET", url: "/api/v2/core/worlds/%20/canon" });
    assert.equal(invalidParams.statusCode, 400);
    const invalidRevision = await app.inject({ method: "GET", url: "/api/v2/core/worlds/world_parser/export?revision=nope" });
    assert.equal(invalidRevision.statusCode, 400);
    const invalidCandidate = await app.inject({ method: "GET", url: "/api/v2/core/worlds/world_parser/candidates/scenes/%20" });
    assert.equal(invalidCandidate.statusCode, 400);
    const invalidRun = await app.inject({ method: "GET", url: "/api/v2/core/runtime/runs/%20/scene" });
    assert.equal(invalidRun.statusCode, 400);
    const invalidSave = await app.inject({ method: "GET", url: "/api/v2/core/runtime/saves/%20" });
    assert.equal(invalidSave.statusCode, 400);
    const invalidRelease = await app.inject({ method: "GET", url: "/api/v2/core/releases/%20/export" });
    assert.equal(invalidRelease.statusCode, 400);
    const missingRelease = await app.inject({ method: "GET", url: "/api/v2/core/releases/missing/export" });
    assert.equal(missingRelease.statusCode, 404);
  } finally {
    await app.close();
    db.close();
    cleanup();
  }
});

test("V2 core use cases report missing optional dependency groups explicitly", async () => {
  const useCases = createV2CoreUseCases({} as never);
  assert.throws(() => useCases.getGraph("world" as never), (error) => error instanceof V2HttpError && error.statusCode === 503);
  assert.throws(() => useCases.listSceneCandidates("world" as never), (error) => error instanceof V2HttpError && error.statusCode === 503);
  assert.throws(() => useCases.listReleases("world" as never), (error) => error instanceof V2HttpError && error.statusCode === 503);
});

test("V2 core API maps graph diagnostics, candidate references, and release preflight failures", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  applyV2Migrations(db);
  const app = createSqliteCoreApp(db);
  await app.ready();
  try {
    await app.inject({ method: "POST", url: "/api/v2/core/worlds", payload: { storyWorldId: "world_edges", name: "Edges", idempotencyKey: "edges-world" } });
    await app.inject({ method: "POST", url: "/api/v2/core/worlds/world_edges/scenes", payload: { sceneId: "entry", title: "Entry", isEntry: true, expectedRevision: 1, idempotencyKey: "entry" } });
    await app.inject({ method: "POST", url: "/api/v2/core/worlds/world_edges/scenes", payload: { sceneId: "second-entry", title: "Second entry", isEntry: true, expectedRevision: 2, idempotencyKey: "second-entry" } });
    await app.inject({ method: "POST", url: "/api/v2/core/worlds/world_edges/choices", payload: { choiceId: "bad-choice", sourceSceneId: "entry", targetSceneId: "second-entry", label: "Unknown state", gates: [{ stateKey: "Missing", operator: "eq", value: true }], expectedRevision: 3, idempotencyKey: "bad-choice" } });
    const validation = await app.inject({ method: "GET", url: "/api/v2/core/worlds/world_edges/graph/validation" });
    assert.equal(validation.statusCode, 200);
    assert.equal(validation.json().diagnostics[0].sceneId, "entry");

    const locationCandidate = await app.inject({ method: "POST", url: "/api/v2/core/worlds/world_edges/candidates/scenes", payload: {
      candidateId: "candidate_location", baseCanonRevision: 4, provenance: { source: "human" },
      payload: { scene: { sceneId: "candidate_scene", title: "Candidate", body: "Body", locationId: "missing_location", participantCharacterIds: [] }, choices: [], validationNotes: [] }, idempotencyKey: "candidate_location",
    } });
    assert.equal(locationCandidate.statusCode, 201);
    const review = await app.inject({ method: "POST", url: "/api/v2/core/worlds/world_edges/candidates/scenes/candidate_location/review", payload: { action: "approve", reviewer: "creator", expectedRevision: 4, idempotencyKey: "review_location" } });
    assert.equal(review.statusCode, 422);

    const characterCandidate = await app.inject({ method: "POST", url: "/api/v2/core/worlds/world_edges/candidates/scenes", payload: {
      candidateId: "candidate_character", baseCanonRevision: 4, provenance: { source: "human" },
      payload: { scene: { sceneId: "candidate_character_scene", title: "Candidate", body: "Body", participantCharacterIds: ["missing_character"] }, choices: [], validationNotes: [] }, idempotencyKey: "candidate_character",
    } });
    assert.equal(characterCandidate.statusCode, 201);
    const characterReview = await app.inject({ method: "POST", url: "/api/v2/core/worlds/world_edges/candidates/scenes/candidate_character/review", payload: { action: "approve", reviewer: "creator", expectedRevision: 4, idempotencyKey: "review_character" } });
    assert.equal(characterReview.statusCode, 422);

    const preflight = await app.inject({ method: "GET", url: "/api/v2/core/worlds/world_edges/releases/preflight" });
    assert.equal(preflight.statusCode, 200);
    assert.equal(preflight.json().diagnostics.some((item: { choiceId?: string }) => item.choiceId === "bad-choice"), true);
    assert.equal(preflight.json().diagnostics.some((item: { choiceId?: string }) => item.choiceId === "bad-choice"), true);
    await app.inject({ method: "POST", url: "/api/v2/core/worlds", payload: { storyWorldId: "world_invalid_release", name: "Invalid release", idempotencyKey: "invalid-world" } });
    const release = await app.inject({ method: "POST", url: "/api/v2/core/worlds/world_invalid_release/releases", payload: { releaseId: "invalid_release", version: "1.0.0", sourceRevision: 1, idempotencyKey: "invalid_release" } });
    assert.equal(release.statusCode, 422);
  } finally {
    await app.close();
    db.close();
    cleanup();
  }
});

test("V2 core API applies a candidate with a validated location reference", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  applyV2Migrations(db);
  const app = createSqliteCoreApp(db);
  await app.ready();
  try {
    await app.inject({ method: "POST", url: "/api/v2/core/worlds", payload: { storyWorldId: "world_location_candidate", name: "Location candidate", idempotencyKey: "location-world" } });
    await app.inject({ method: "POST", url: "/api/v2/core/worlds/world_location_candidate/locations", payload: { locationId: "location", name: "Location", expectedRevision: 1, idempotencyKey: "location" } });
    const submitted = await app.inject({ method: "POST", url: "/api/v2/core/worlds/world_location_candidate/candidates/scenes", payload: {
      candidateId: "candidate_with_location", baseCanonRevision: 2, provenance: { source: "human" },
      payload: { scene: { sceneId: "scene_with_location", title: "Located scene", body: "Body", locationId: "location", participantCharacterIds: [] }, choices: [], validationNotes: [] }, idempotencyKey: "candidate_with_location",
    } });
    assert.equal(submitted.statusCode, 201);
    const approved = await app.inject({ method: "POST", url: "/api/v2/core/worlds/world_location_candidate/candidates/scenes/candidate_with_location/review", payload: { action: "approve", reviewer: "creator", expectedRevision: 2, idempotencyKey: "review_with_location" } });
    assert.equal(approved.statusCode, 200);
    assert.equal(approved.json().appliedSceneId, "scene_with_location");
  } finally {
    await app.close();
    db.close();
    cleanup();
  }
});

test("V2 core plugin exposes an explicit unavailable status without dependencies", async () => {
  const app = createV2FastifyApp({
    corePlugin: async (instance) => {
      await instance.register((await import("./plugin.ts")).v2CorePlugin, {});
    },
  });
  await app.ready();
  try {
    const status = await app.inject({ method: "GET", url: "/api/v2/core/status" });
    assert.equal(status.statusCode, 200);
    assert.deepEqual(status.json(), { available: false, reason: "V2 core dependencies are not configured" });
  } finally {
    await app.close();
  }
});

test("V2 core API updates canon and graph records", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  applyV2Migrations(db);
  const app = createSqliteCoreApp(db);
  await app.ready();
  try {
    await app.inject({ method: "POST", url: "/api/v2/core/worlds", payload: { storyWorldId: "world_update", name: "Update World", idempotencyKey: "update-world" } });
    let revision = 1;
    const create = async (url: string, payload: Record<string, unknown>): Promise<void> => {
      const response = await app.inject({ method: "POST", url, payload: { ...payload, expectedRevision: revision, idempotencyKey: `idem-${url}-${revision}` } });
      assert.equal(response.statusCode, 201, `${url}: ${response.body}`);
      revision = response.json().revision;
    };
    const update = async (url: string, payload: Record<string, unknown>): Promise<number> => {
      const response = await app.inject({ method: "PATCH", url, payload: { ...payload, expectedRevision: revision, idempotencyKey: `idem-update-${url}-${revision}` } });
      assert.equal(response.statusCode, 200, `${url}: ${response.body}`);
      const next = response.json().revision;
      assert.equal(next, revision + 1);
      revision = next;
      return next;
    };

    await create("/api/v2/core/worlds/world_update/locations", { locationId: "loc", name: "Location" });
    await create("/api/v2/core/worlds/world_update/characters", { characterId: "char", name: "Character" });
    await create("/api/v2/core/worlds/world_update/facts", { factId: "fact", text: "Fact", visibility: "player_visible" });
    await create("/api/v2/core/worlds/world_update/rules", { ruleId: "rule", text: "Rule", severity: "required" });
    await create("/api/v2/core/worlds/world_update/timeline-events", { timelineEventId: "event", localDate: "2026-01-01", title: "Event" });
    await create("/api/v2/core/worlds/world_update/arcs", { arcId: "arc", title: "Arc" });
    await create("/api/v2/core/worlds/world_update/scenes", { sceneId: "scene", title: "Scene", isEntry: true });
    await create("/api/v2/core/worlds/world_update/choices", { choiceId: "choice", sourceSceneId: "scene", label: "Choice" });
    await create("/api/v2/core/worlds/world_update/state/variables", { key: "Trust", valueType: "number", defaultValue: 0 });

    await update("/api/v2/core/worlds/world_update", { name: "Updated World", summary: "S" });
    await update("/api/v2/core/worlds/world_update/locations/loc", { name: "Updated Location" });
    await update("/api/v2/core/worlds/world_update/characters/char", { name: "Updated Character" });
    await update("/api/v2/core/worlds/world_update/facts/fact", { text: "Updated Fact", visibility: "creator_only" });
    await update("/api/v2/core/worlds/world_update/rules/rule", { text: "Updated Rule", severity: "guideline" });
    await update("/api/v2/core/worlds/world_update/timeline-events/event", { localDate: "2026-02-02", title: "Updated Event" });
    await update("/api/v2/core/worlds/world_update/arcs/arc", { title: "Updated Arc" });
    await update("/api/v2/core/worlds/world_update/scenes/scene", { title: "Updated Scene", body: "Body", isEntry: true });
    await update("/api/v2/core/worlds/world_update/choices/choice", { sourceSceneId: "scene", label: "Updated Choice" });
    await update("/api/v2/core/worlds/world_update/state/variables/Trust", { defaultValue: 3 });

    const missingFact = await app.inject({ method: "PATCH", url: "/api/v2/core/worlds/world_update/facts/missing", payload: { text: "X", visibility: "player_visible", expectedRevision: revision, idempotencyKey: "missing-fact" } });
    assert.equal(missingFact.statusCode, 404);
    const missingRule = await app.inject({ method: "PATCH", url: "/api/v2/core/worlds/world_update/rules/missing", payload: { text: "X", severity: "required", expectedRevision: revision, idempotencyKey: "missing-rule" } });
    assert.equal(missingRule.statusCode, 404);
    const missingEvent = await app.inject({ method: "PATCH", url: "/api/v2/core/worlds/world_update/timeline-events/missing", payload: { localDate: "2026-01-01", title: "X", expectedRevision: revision, idempotencyKey: "missing-event" } });
    assert.equal(missingEvent.statusCode, 404);
  } finally {
    await app.close();
    db.close();
    cleanup();
  }
});
