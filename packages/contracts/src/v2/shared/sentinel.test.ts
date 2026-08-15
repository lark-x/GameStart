import assert from "node:assert/strict";
import test from "node:test";

import { v2FixtureCandidate, v2FixtureRelease, v2FixtureRun, v2FixtureWorld } from "../fixtures/index.ts";
import { normalizeV2ModelLogMessages, normalizeV2ModelLogResponse, redactV2ModelLogText } from "../platform/index.ts";

test("V2 contract sentinel fixtures cover the Gate 0 wire surface", () => {
  assert.equal(v2FixtureWorld.storyWorldId, v2FixtureCandidate.storyWorldId);
  assert.equal(v2FixtureCandidate.kind, "scene");
  assert.equal(v2FixtureCandidate.status, "pending");
  assert.equal(v2FixtureRelease.valid, true);
  assert.equal(v2FixtureRun.currentSceneId, "scene_opening");
});

test("V2 model log helpers redact secrets and bound stored text", () => {
  assert.equal(redactV2ModelLogText("Bearer hidden apiKey=secret"), "Bearer [REDACTED] apiKey=[REDACTED]");
  const messages = normalizeV2ModelLogMessages([
    { role: "user", content: "x".repeat(300_000) },
    { role: "assistant", content: "y".repeat(300_000) },
  ]);
  assert.equal(messages.truncated, true);
  assert.ok(messages.messages.every((message) => message.content.length < 200_000));
  assert.equal(normalizeV2ModelLogResponse("short").truncated, false);
  assert.equal(normalizeV2ModelLogResponse("z".repeat(300_000)).truncated, true);
});
