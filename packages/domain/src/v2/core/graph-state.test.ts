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
});
