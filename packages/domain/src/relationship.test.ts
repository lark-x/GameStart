import assert from "node:assert/strict";
import test from "node:test";

import { StoryMode, applyRelationshipDelta } from "./index.ts";

const current = {
  affinity: 20,
  trust: 30,
  conflict: -10,
  dependency: 5,
};

const delta = {
  affinity: 5,
  trust: -10,
  conflict: 15,
  dependency: 20,
};

test("STATIC returns a new object with unchanged metric values", () => {
  const currentBefore = { ...current };
  const deltaBefore = { ...delta };

  const result = applyRelationshipDelta(StoryMode.STATIC, current, delta);

  assert.deepEqual(result, current);
  assert.notStrictEqual(result, current);
  assert.deepEqual(current, currentBefore);
  assert.deepEqual(delta, deltaBefore);
});

test("DYNAMIC applies every delta without mutating either input", () => {
  const currentBefore = { ...current };
  const deltaBefore = { ...delta };

  const result = applyRelationshipDelta(StoryMode.DYNAMIC, current, delta);

  assert.deepEqual(result, {
    affinity: 25,
    trust: 20,
    conflict: 5,
    dependency: 25,
  });
  assert.notStrictEqual(result, current);
  assert.deepEqual(current, currentBefore);
  assert.deepEqual(delta, deltaBefore);
});

test("DYNAMIC clamps every metric to the inclusive range -100 through 100", () => {
  const result = applyRelationshipDelta(
    StoryMode.DYNAMIC,
    { affinity: 95, trust: -95, conflict: 100, dependency: -100 },
    { affinity: 20, trust: -20, conflict: 1, dependency: -1 },
  );

  assert.deepEqual(result, {
    affinity: 100,
    trust: -100,
    conflict: 100,
    dependency: -100,
  });
});

test("rejects NaN in current with the field name", () => {
  assert.throws(
    () =>
      applyRelationshipDelta(
        StoryMode.DYNAMIC,
        { ...current, trust: Number.NaN },
        delta,
      ),
    { name: "TypeError", message: /current\.trust must be a finite number/ },
  );
});

test("rejects Infinity in delta with the field name even in STATIC mode", () => {
  assert.throws(
    () =>
      applyRelationshipDelta(StoryMode.STATIC, current, {
        ...delta,
        dependency: Number.POSITIVE_INFINITY,
      }),
    { name: "TypeError", message: /delta\.dependency must be a finite number/ },
  );
});
