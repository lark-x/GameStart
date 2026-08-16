import assert from "node:assert/strict";
import test from "node:test";

import {
  createV2CanonWorld,
  createV2ReleaseManifest,
  startV2RuntimeRun,
} from "@living-network/domain/v2";
import {
  applyV2Migrations,
  openV2TempSqliteConnection,
  revertV2Migrations,
  V2SqliteReleaseRuntimeUnitOfWork,
} from "../index.ts";

test("V2 release/runtime SQLite repository stores immutable releases, runs, and saves", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const unit = new V2SqliteReleaseRuntimeUnitOfWork(db);
    await unit.withReleaseRuntimeTransaction(async ({ canon, releaseRuntime }) => {
      await canon.createWorld(createV2CanonWorld({ storyWorldId: "world_release" as never, name: "Release World" }));
      const manifest = await releaseRuntime.createRelease(createV2ReleaseManifest({
        releaseId: "release_a",
        storyWorldId: "world_release",
        version: "1.0.0",
        sourceRevision: 1,
        canon: { world: { name: "Release World" } },
        graph: {
          arcs: [],
          scenes: [{ storyWorldId: "world_release", sceneId: "scene_entry", title: "Entry", isEntry: true }],
          choices: [],
        },
        stateSchema: [],
      }));
      const run = await releaseRuntime.createRun(startV2RuntimeRun({
        runId: "run_a",
        releaseId: manifest.releaseId,
        releaseVersion: manifest.version,
        scenes: manifest.graph.scenes,
        stateSchema: manifest.stateSchema,
      }));
      await releaseRuntime.createSave({
        saveId: "save_a" as never,
        runId: "run_a" as never,
        releaseId: "release_a" as never,
        releaseVersion: run.releaseVersion,
        currentSceneId: run.currentSceneId,
        stateValues: run.stateValues,
        choiceHistory: run.choiceHistory,
        label: "First checkpoint",
      });
    });

    await unit.withReleaseRuntimeTransaction(async ({ releaseRuntime }) => {
      assert.equal((await releaseRuntime.getRelease("release_a" as never))?.version, "1.0.0");
      assert.equal((await releaseRuntime.getRun("run_a" as never))?.currentSceneId, "scene_entry");
      assert.equal((await releaseRuntime.getSave("save_a" as never))?.label, "First checkpoint");
      const saves = await releaseRuntime.listSavesByStoryWorld("world_release" as never, 10);
      assert.equal(saves.length, 1);
      assert.equal(saves[0]?.saveId, "save_a");
    });

    revertV2Migrations(db);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'v2_releases'").get(), undefined);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 release/runtime SQLite repository rejects run and save release version mismatches", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const unit = new V2SqliteReleaseRuntimeUnitOfWork(db);
    await unit.withReleaseRuntimeTransaction(async ({ canon, releaseRuntime }) => {
      await canon.createWorld(createV2CanonWorld({ storyWorldId: "world_release" as never, name: "Release World" }));
      const manifest = await releaseRuntime.createRelease(createV2ReleaseManifest({
        releaseId: "release_a",
        storyWorldId: "world_release",
        version: "1.0.0",
        sourceRevision: 1,
        canon: { world: { name: "Release World" } },
        graph: {
          arcs: [],
          scenes: [{ storyWorldId: "world_release", sceneId: "scene_entry", title: "Entry", isEntry: true }],
          choices: [],
        },
        stateSchema: [],
      }));

      await assert.rejects(() => releaseRuntime.createRun({
        runId: "run_bad" as never,
        releaseId: manifest.releaseId,
        releaseVersion: "2.0.0",
        currentSceneId: "scene_entry",
        stateValues: {},
        choiceHistory: [],
      }));

      const run = await releaseRuntime.createRun(startV2RuntimeRun({
        runId: "run_a",
        releaseId: manifest.releaseId,
        releaseVersion: manifest.version,
        scenes: manifest.graph.scenes,
        stateSchema: manifest.stateSchema,
      }));

      await assert.rejects(() => releaseRuntime.createSave({
        saveId: "save_bad" as never,
        runId: "run_a" as never,
        releaseId: "release_a" as never,
        releaseVersion: "2.0.0",
        currentSceneId: run.currentSceneId,
        stateValues: run.stateValues,
        choiceHistory: run.choiceHistory,
      }));
    });
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 release/runtime repository maps scalar and JSON shape failures explicitly", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const repository = new (await import("./release-runtime-repository.ts")).V2SqliteReleaseRuntimeRepository(db);
    db.prepare("INSERT INTO v2_worlds (story_world_id, name, summary, revision) VALUES (?, ?, ?, ?)").run("world", "World", null, 1);
    db.prepare("INSERT INTO v2_releases (release_id, story_world_id, version, source_revision, content_hash, manifest_json) VALUES (?, ?, ?, ?, ?, ?)").run("bad", "world", "1.0.0", 1, "hash", "[]");
    await assert.rejects(() => repository.getRelease("bad" as never), /JSON object/);
    db.prepare("INSERT INTO v2_releases (release_id, story_world_id, version, source_revision, content_hash, manifest_json) VALUES (?, ?, ?, ?, ?, ?)").run("good", "world", "1.0.1", 1, "hash", JSON.stringify({ releaseId: "good", storyWorldId: "world", version: "1.0.1", sourceRevision: 1, contentHash: "hash", canon: {}, graph: { arcs: [], scenes: [], choices: [] }, stateSchema: [] }));
    db.prepare("INSERT INTO v2_runtime_runs (run_id, release_id, release_version, current_scene_id, state_json, choice_history_json) VALUES (?, ?, ?, ?, ?, ?)").run("bad-run", "good", "1.0.1", "scene", JSON.stringify({ bad: [] }), JSON.stringify({}));
    await assert.rejects(() => repository.getRun("bad-run" as never), /scalar|JSON array/);
  } finally {
    db.close();
    cleanup();
  }
});
