import assert from "node:assert/strict";
import test from "node:test";

import {
  createV2CanonWorld,
  createV2GraphChoice,
  createV2GraphScene,
  createV2TypedStateVariable,
} from "@living-network/domain";
import {
  applyV2Migrations,
  openV2TempSqliteConnection,
  revertV2Migrations,
  V2SqliteCanonRepository,
  V2SqliteGraphStateRepository,
  V2SqliteGraphStateUnitOfWork,
} from "../index.ts";

test("V2 graph/state SQLite repository persists graph and typed state", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const unit = new V2SqliteGraphStateUnitOfWork(db);
    await unit.withGraphStateTransaction(async ({ canon, graphState }) => {
      await canon.createWorld(createV2CanonWorld({ storyWorldId: "world_graph" as never, name: "Graph World" }));
      const arc = await graphState.createArc({
        storyWorldId: "world_graph",
        arcId: "arc_intro",
        title: "Intro",
      });
      const entry = await graphState.createScene(createV2GraphScene({
        storyWorldId: "world_graph",
        sceneId: "scene_entry",
        arc,
        title: "Entry",
        isEntry: true,
      }));
      const target = await graphState.createScene(createV2GraphScene({
        storyWorldId: "world_graph",
        sceneId: "scene_target",
        arc,
        title: "Target",
      }));
      await graphState.createChoice(createV2GraphChoice({
        storyWorldId: "world_graph",
        choiceId: "choice_go",
        sourceScene: entry,
        targetScene: target,
        label: "Go",
        gates: [{ stateKey: "Trust", operator: "gte", value: 1 }],
        consequences: [{ stateKey: "Trust", operation: "increment", value: 1 }],
      }));
      await graphState.createStateVariable(createV2TypedStateVariable({
        storyWorldId: "world_graph",
        key: "Trust",
        valueType: "number",
        defaultValue: 0,
      }));
    });

    const graphState = new V2SqliteGraphStateRepository(db);
    assert.equal((await graphState.listArcs("world_graph" as never)).length, 1);
    assert.equal((await graphState.listScenes("world_graph" as never)).length, 2);
    assert.equal((await graphState.listChoices("world_graph" as never))[0]?.gates[0]?.stateKey, "Trust");
    assert.equal((await graphState.listStateVariables("world_graph" as never))[0]?.defaultValue, 0);

    revertV2Migrations(db);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'v2_arcs'").get(), undefined);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 graph/state SQLite repository keeps graph references inside one world", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const canon = new V2SqliteCanonRepository(db);
    const graphState = new V2SqliteGraphStateRepository(db);
    db.exec("BEGIN IMMEDIATE");
    try {
      await canon.createWorld(createV2CanonWorld({ storyWorldId: "world_a" as never, name: "A" }));
      await canon.createWorld(createV2CanonWorld({ storyWorldId: "world_b" as never, name: "B" }));
      await graphState.createScene(createV2GraphScene({
        storyWorldId: "world_a",
        sceneId: "scene_a",
        title: "A",
      }));
      await assert.rejects(
        () => graphState.createChoice({
          storyWorldId: "world_b",
          choiceId: "choice_bad",
          sourceSceneId: "scene_a",
          label: "Bad",
          gates: [],
          consequences: [],
        }),
        /constraint/i,
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
    cleanup();
  }
});
