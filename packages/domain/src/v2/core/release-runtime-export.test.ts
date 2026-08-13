import assert from "node:assert/strict";
import test from "node:test";

import { createV2CanonWorld } from "./canon.ts";
import {
  createV2GraphChoice,
  createV2GraphScene,
} from "./graph.ts";
import {
  buildV2ReleasePreflight,
  createV2ReleaseManifest,
} from "./release.ts";
import {
  getV2RuntimeScene,
  loadV2RuntimeSave,
  startV2RuntimeRun,
  submitV2RuntimeChoice,
} from "./runtime.ts";
import { createV2TypedStateVariable } from "./state.ts";
import {
  buildV2CoreExportMarkdown,
  buildV2ReleaseExportJson,
} from "./export.ts";

test("V2 release domain preflights graph and creates stable content hashes", () => {
  const world = createV2CanonWorld({ storyWorldId: "world_a", name: "World A" });
  const entry = createV2GraphScene({
    storyWorldId: "world_a",
    sceneId: "scene_entry",
    title: "Entry",
    isEntry: true,
  });
  const manifest = createV2ReleaseManifest({
    releaseId: "release_a",
    storyWorldId: "world_a",
    version: "1.0.0",
    sourceRevision: 1,
    canon: { world },
    graph: { arcs: [], scenes: [entry], choices: [] },
    stateSchema: [],
  });

  assert.equal(buildV2ReleasePreflight({ world, scenes: [entry], choices: [], stateSchema: [] }).valid, true);
  assert.match(manifest.contentHash, /^[a-f0-9]{64}$/);
  assert.equal(createV2ReleaseManifest({
    releaseId: "release_b",
    storyWorldId: "world_a",
    version: "1.0.0",
    sourceRevision: 1,
    canon: { world },
    graph: { arcs: [], scenes: [entry], choices: [] },
    stateSchema: [],
  }).contentHash, manifest.contentHash);
  const incompatible = createV2GraphChoice({ storyWorldId: "world_a", choiceId: "choice_type", sourceScene: entry, label: "Type", gates: [{ stateKey: "Trust", operator: "gt", value: true }] });
  const typed = createV2TypedStateVariable({ storyWorldId: "world_a", key: "Trust", valueType: "string", defaultValue: "zero" });
  const invalidPreflight = buildV2ReleasePreflight({ world, scenes: [entry], choices: [incompatible], stateSchema: [typed] });
  assert.equal(invalidPreflight.diagnostics.some((diagnostic) => diagnostic.code === "INVALID_GATE_STATE_TYPE"), true);
});

test("V2 runtime domain starts at entry scene and applies gated choice consequences", () => {
  const entry = createV2GraphScene({
    storyWorldId: "world_a",
    sceneId: "scene_entry",
    title: "Entry",
    isEntry: true,
  });
  const next = createV2GraphScene({
    storyWorldId: "world_a",
    sceneId: "scene_next",
    title: "Next",
  });
  const choice = createV2GraphChoice({
    storyWorldId: "world_a",
    choiceId: "choice_go",
    sourceScene: entry,
    targetScene: next,
    label: "Go",
    gates: [{ stateKey: "Trust", operator: "gte", value: 1 }],
    consequences: [{ stateKey: "Trust", operation: "increment", value: 2 }],
  });
  const stateSchema = [createV2TypedStateVariable({
    storyWorldId: "world_a",
    key: "Trust",
    valueType: "number",
    defaultValue: 1,
  })];

  const run = startV2RuntimeRun({
    runId: "run_a",
    releaseId: "release_a",
    releaseVersion: "1.0.0",
    scenes: [entry, next],
    stateSchema,
  });
  assert.equal(getV2RuntimeScene({ run, scenes: [entry, next], choices: [choice] }).availableChoices.length, 1);

  const updated = submitV2RuntimeChoice({
    run,
    choice,
    scenes: [entry, next],
    stateSchema,
  });
  assert.equal(updated.currentSceneId, "scene_next");
  assert.equal(updated.stateValues.Trust, 3);
  assert.deepEqual(updated.choiceHistory, ["choice_go"]);

  const loaded = loadV2RuntimeSave({
    runId: "run_loaded",
    releaseId: "release_a",
    releaseVersion: "1.0.0",
    currentSceneId: updated.currentSceneId,
    stateValues: updated.stateValues,
    choiceHistory: updated.choiceHistory,
  });
  assert.equal(loaded.currentSceneId, "scene_next");
  assert.equal(loaded.stateValues.Trust, 3);
  assert.throws(() => startV2RuntimeRun({ runId: "run", releaseId: "release", releaseVersion: "1.0.0", scenes: [next], stateSchema: [] }), /no entry/);
  assert.throws(() => getV2RuntimeScene({ run: { ...run, currentSceneId: "missing" }, scenes: [entry, next], choices: [] }), /missing/);
  assert.throws(() => submitV2RuntimeChoice({ run, choice: { ...choice, sourceSceneId: "other" }, scenes: [entry, next], stateSchema }), /not available/);
  assert.throws(() => submitV2RuntimeChoice({ run, choice: { ...choice, gates: [{ stateKey: "Trust", operator: "gte", value: 99 }] }, scenes: [entry, next], stateSchema }), /gates/);
  assert.throws(() => submitV2RuntimeChoice({ run, choice: { ...choice, targetSceneId: "missing" }, scenes: [entry, next], stateSchema }), /missing/);
  assert.throws(() => startV2RuntimeRun({ runId: "", releaseId: "release", releaseVersion: "1.0.0", scenes: [entry], stateSchema: [] }), /runId/);
  const gateValues = { eq: 1, neq: 0, gt: 0, gte: 1, lt: 2, lte: 1 } as const;
  for (const operator of ["eq", "neq", "gt", "gte", "lt", "lte"] as const) {
    const gated = { ...choice, gates: [{ stateKey: "Trust", operator, value: gateValues[operator] }] };
    assert.equal(getV2RuntimeScene({ run, scenes: [entry, next], choices: [gated] }).availableChoices.length, 1);
  }
});

test("V2 release preflight rejects unknown or incompatible typed state references", () => {
  const world = createV2CanonWorld({ storyWorldId: "world_state", name: "State World" });
  const entry = createV2GraphScene({
    storyWorldId: "world_state",
    sceneId: "scene_entry",
    title: "Entry",
    isEntry: true,
  });
  const choice = createV2GraphChoice({
    storyWorldId: "world_state",
    choiceId: "choice_bad_state",
    sourceScene: entry,
    label: "Break state",
    gates: [{ stateKey: "Missing", operator: "eq", value: true }],
    consequences: [{ stateKey: "Missing", operation: "increment", value: 1 }],
  });
  const preflight = buildV2ReleasePreflight({ world, scenes: [entry], choices: [choice], stateSchema: [] });
  assert.equal(preflight.valid, false);
  assert.equal(preflight.diagnostics.some((diagnostic) => diagnostic.code === "UNKNOWN_GATE_STATE_KEY"), true);
  assert.equal(preflight.diagnostics.some((diagnostic) => diagnostic.code === "UNKNOWN_STATE_KEY"), true);
});

test("V2 release domain rejects invalid manifest identity and source revision", () => {
  const valid = { releaseId: "release", storyWorldId: "world", version: "1.0.0", sourceRevision: 1, canon: {}, graph: { arcs: [], scenes: [], choices: [] }, stateSchema: [] };
  assert.throws(() => createV2ReleaseManifest({ ...valid, releaseId: "" }), /releaseId/);
  assert.throws(() => createV2ReleaseManifest({ ...valid, version: "not-semver" }), /version/);
  assert.throws(() => createV2ReleaseManifest({ ...valid, sourceRevision: 0 }), /sourceRevision/);
  assert.equal(buildV2ReleasePreflight({ world: { storyWorldId: "world", name: "World", revision: 0 }, scenes: [], choices: [], stateSchema: [] }).valid, false);
});

test("V2 export domain renders release JSON and readable markdown", () => {
  const manifest = createV2ReleaseManifest({
    releaseId: "release_a",
    storyWorldId: "world_a",
    version: "1.0.0",
    sourceRevision: 1,
    canon: { world: { name: "World A" } },
    graph: {
      arcs: [],
      scenes: [{ storyWorldId: "world_a", sceneId: "scene_entry", title: "Entry", body: "Body", isEntry: true }],
      choices: [],
    },
    stateSchema: [],
  });
  assert.equal((buildV2ReleaseExportJson(manifest) as { readonly releaseId: string }).releaseId, "release_a");
  assert.match(buildV2CoreExportMarkdown({
    title: "World A",
    sourceLabel: "release 1.0.0",
    scenes: manifest.graph.scenes,
    choices: manifest.graph.choices,
  }), /## Scenes/);
});
