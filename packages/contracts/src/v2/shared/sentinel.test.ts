import assert from "node:assert/strict";
import test from "node:test";

import { v2FixtureCandidate, v2FixtureRelease, v2FixtureRun, v2FixtureWorld } from "../fixtures/index.ts";

test("V2 contract sentinel fixtures cover the Gate 0 wire surface", () => {
  assert.equal(v2FixtureWorld.storyWorldId, v2FixtureCandidate.storyWorldId);
  assert.equal(v2FixtureCandidate.kind, "scene");
  assert.equal(v2FixtureCandidate.status, "pending");
  assert.equal(v2FixtureRelease.valid, true);
  assert.equal(v2FixtureRun.currentSceneId, "scene_opening");
});
