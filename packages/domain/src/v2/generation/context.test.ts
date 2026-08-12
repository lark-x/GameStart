import assert from "node:assert/strict";
import test from "node:test";

import { buildV2GenerationContextSnapshot } from "./context.ts";

const source = {
  storyWorldId: "world_v2",
  revision: 2,
  facts: [{ id: "fact-1", text: "The old bridge is closed.", visibility: "player_visible" as const }],
  characters: [{ characterId: "char_mira", name: "Mira" }],
  scenes: [{ sceneId: "scene_intro", title: "Intro" }],
};

test("builds deterministic V2 generation context snapshots", () => {
  const first = buildV2GenerationContextSnapshot({
    snapshot: source,
    prompt: "  Write the next scene.  ",
    requestedAt: "2026-08-12T00:00:00.000Z",
    tokenBudget: 1200,
  });
  const second = buildV2GenerationContextSnapshot({
    snapshot: source,
    prompt: "Write the next scene.",
    requestedAt: "2026-08-12T00:00:00.000Z",
    tokenBudget: 1200,
  });
  assert.equal(first.contextHash, second.contextHash);
  assert.match(first.contextHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.prompt, "Write the next scene.");
  assert.equal(first.promptPreview, "Write the next scene.");
  assert.deepEqual(first.sourceFactIds, ["fact-1"]);
  assert.deepEqual(first.sourceCharacterIds, ["char_mira"]);
  assert.deepEqual(first.sourceSceneIds, ["scene_intro"]);
});

test("rejects invalid V2 generation context inputs", () => {
  assert.throws(
    () => buildV2GenerationContextSnapshot({
      snapshot: source,
      prompt: " ",
      requestedAt: "2026-08-12T00:00:00.000Z",
      tokenBudget: 1200,
    }),
    /prompt/,
  );
  assert.throws(
    () => buildV2GenerationContextSnapshot({
      snapshot: source,
      prompt: "ok",
      requestedAt: "2026-08-12T00:00:00.000Z",
      tokenBudget: 0,
    }),
    /tokenBudget/,
  );
});
