import assert from "node:assert/strict";
import test from "node:test";

import { V2DomainError } from "../shared/index.ts";
import {
  createV2GraphChoice,
  createV2GraphScene,
  validateV2Graph,
} from "./graph.ts";
import {
  buildV2InitialTypedState,
  createV2TypedStateVariable,
  previewV2TypedStateDelta,
  applyV2TypedStateDelta,
} from "./state.ts";

test("V2 graph domain validates entry scene and reachability", () => {
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
  const unreachable = createV2GraphScene({
    storyWorldId: "world_a",
    sceneId: "scene_unreachable",
    title: "Secret",
  });
  const choice = createV2GraphChoice({
    storyWorldId: "world_a",
    choiceId: "choice_a",
    sourceScene: entry,
    targetScene: next,
    label: "Go",
  });

  const validation = validateV2Graph({ scenes: [entry, next, unreachable], choices: [choice] });

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.diagnostics.map((diagnostic) => diagnostic.code), ["UNREACHABLE_SCENE"]);
  assert.equal(validation.diagnostics[0]?.sceneId, "scene_unreachable");
});

test("V2 graph domain rejects cross-world choices and malformed gates", () => {
  const source = createV2GraphScene({
    storyWorldId: "world_a",
    sceneId: "scene_a",
    title: "A",
  });
  const target = createV2GraphScene({
    storyWorldId: "world_b",
    sceneId: "scene_b",
    title: "B",
  });

  assert.throws(
    () => createV2GraphChoice({
      storyWorldId: "world_a",
      choiceId: "choice_bad",
      sourceScene: source,
      targetScene: target,
      label: "Bad",
    }),
    (error) => error instanceof V2DomainError && error.code === "CROSS_WORLD_REFERENCE",
  );
  const foreignArc = { storyWorldId: "world_b", arcId: "arc_b", title: "B" };
  assert.throws(() => createV2GraphScene({ storyWorldId: "world_a", sceneId: "scene_foreign_arc", title: "Bad", arc: foreignArc }), /arcId/);
  assert.throws(() => createV2GraphChoice({ storyWorldId: "world_b", choiceId: "choice_bad_source", sourceScene: source, label: "Bad" }), /sourceSceneId/);
  assert.throws(() => createV2GraphScene({ storyWorldId: "world_a", sceneId: "scene", title: "" }), /title/);
  assert.throws(() => createV2GraphScene({ storyWorldId: "world_a", sceneId: "scene", title: "Scene", body: "x".repeat(8001) }), /body/);
  assert.throws(() => createV2GraphChoice({ storyWorldId: "world_a", choiceId: "choice", sourceScene: source, label: "Choice", gates: [{ stateKey: "bad-key", operator: "eq", value: true }] }), /stateKey/);
  assert.throws(() => createV2GraphChoice({ storyWorldId: "world_a", choiceId: "choice", sourceScene: source, label: "Choice", consequences: [{ stateKey: "Trust", operation: "bad" as never, value: 1 }] }), /consequence operation/);
  assert.throws(() => createV2GraphChoice({ storyWorldId: "world_a", choiceId: "choice_bad_value", sourceScene: source, label: "Bad", gates: [{ stateKey: "Trust", operator: "eq", value: null as never }] }), /gate value/);
  assert.throws(() => createV2GraphChoice({ storyWorldId: "world_a", choiceId: "choice_bad_operator", sourceScene: source, label: "Bad", gates: [{ stateKey: "Trust", operator: "unsupported" as never, value: true }] }), /gate operator/);
  assert.throws(() => createV2GraphScene({ storyWorldId: "world_a", sceneId: "", title: "Bad" }), /sceneId/);
  const noEntry = validateV2Graph({ scenes: [source], choices: [] });
  assert.equal(noEntry.valid, false);
  const multipleEntry = validateV2Graph({ scenes: [{ ...source, isEntry: true }, { ...target, storyWorldId: "world_a", isEntry: true }], choices: [] });
  assert.equal(multipleEntry.diagnostics.filter((item) => item.code === "MULTIPLE_ENTRY_SCENES").length, 2);
  const missing = validateV2Graph({ scenes: [source], choices: [{ choiceId: "missing", storyWorldId: "world_a", sourceSceneId: "unknown", targetSceneId: "also_missing", label: "Missing", gates: [], consequences: [] }] });
  assert.equal(missing.diagnostics.filter((item) => item.severity === "error").length, 3);

  assert.throws(
    () => createV2GraphChoice({
      storyWorldId: "world_a",
      choiceId: "choice_gate_bad",
      sourceScene: source,
      label: "Bad Gate",
      gates: [{ stateKey: "9bad", operator: "eq", value: true }],
    }),
    (error) => error instanceof V2DomainError && error.code === "INVALID_INPUT",
  );
});

test("V2 typed state domain builds initial state and previews deltas with diagnostics", () => {
  const schema = [
    createV2TypedStateVariable({
      storyWorldId: "world_a",
      key: "Trust",
      valueType: "number",
      defaultValue: 0,
    }),
    createV2TypedStateVariable({
      storyWorldId: "world_a",
      key: "HasKey",
      valueType: "boolean",
      defaultValue: false,
    }),
  ];

  assert.deepEqual(buildV2InitialTypedState(schema), { Trust: 0, HasKey: false });
  assert.deepEqual(previewV2TypedStateDelta({
    schema,
    deltas: [
      { stateKey: "Trust", operation: "increment", value: 2 },
      { stateKey: "HasKey", operation: "set", value: true },
    ],
  }), {
    valid: true,
    values: { Trust: 2, HasKey: true },
    diagnostics: [],
  });

  const invalid = previewV2TypedStateDelta({
    schema,
    deltas: [{ stateKey: "HasKey", operation: "increment", value: 1 }],
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.diagnostics[0]?.code, "STATE_INCREMENT_TYPE_MISMATCH");
  assert.equal(invalid.diagnostics[0]?.deltaIndex, 0);
  assert.throws(() => createV2TypedStateVariable({ storyWorldId: "world_a", key: "9bad", valueType: "number", defaultValue: 0 }), /state key/);
  assert.throws(() => createV2TypedStateVariable({ storyWorldId: "world_a", key: "Trust", valueType: "number", defaultValue: "wrong" as never }), /defaultValue/);
  const unknown = previewV2TypedStateDelta({ schema, deltas: [{ stateKey: "Missing", operation: "set", value: true }, { stateKey: "Trust", operation: "set", value: "wrong" as never }, { stateKey: "Trust", operation: "unknown" as never, value: 1 }] });
  assert.equal(unknown.diagnostics.length, 3);
  assert.throws(() => createV2TypedStateVariable({ storyWorldId: "world_a", key: "Flag", valueType: "invalid" as never, defaultValue: true }), /valueType/);
  assert.throws(() => applyV2TypedStateDelta({ schema, deltas: [{ stateKey: "Missing", operation: "set", value: true }] }), /not declared/);
  assert.throws(() => createV2TypedStateVariable({ storyWorldId: "", key: "Flag", valueType: "boolean", defaultValue: false }), /storyWorldId/);
});
