import assert from "node:assert/strict";
import test from "node:test";

import { parseV2SceneCandidateText } from "./scene-candidate.ts";

test("parses strict V2 scene candidate JSON", () => {
  const parsed = parseV2SceneCandidateText(JSON.stringify({
    scene: {
      sceneId: "scene_2",
      title: "A Clear Path",
      body: "Mira studies the sealed bridge.",
      locationId: "loc_bridge",
      participantCharacterIds: ["char_mira"],
    },
    choices: [
      { label: "Inspect the gate", targetSceneId: "scene_gate", consequenceSummary: "Mira learns why it is sealed." },
    ],
    validationNotes: ["Needs canon review."],
  }));
  assert.equal(parsed.payload.scene.sceneId, "scene_2");
  assert.equal(parsed.payload.scene.locationId, "loc_bridge");
  assert.equal(parsed.payload.choices[0]?.label, "Inspect the gate");
  assert.equal(parsed.payload.validationNotes[0], "Needs canon review.");
});

test("preserves structured scene blocks, hierarchy, and references", () => {
  const parsed = parseV2SceneCandidateText(JSON.stringify({
    scene: {
      sceneId: "scene_3",
      title: "Structured path",
      body: "Fallback body",
      arcId: "arc_main",
      chapterId: "chapter_1",
      questId: "quest_1",
      document: { mode: "blocks", blocks: [{ kind: "dialogue", speakerCharacterId: "char_mira", text: "The path is open.", payload: { emotion: "calm" } }] },
      participantCharacterIds: ["char_mira"],
    },
    references: [{ targetType: "character", targetId: "char_mira", role: "participant" }],
    choices: [{ label: "Cross the bridge" }],
    validationNotes: [],
  }));
  assert.equal(parsed.payload.scene.document?.mode, "blocks");
  assert.equal(parsed.payload.scene.document?.blocks?.[0]?.payload?.emotion, "calm");
  assert.equal(parsed.payload.scene.questId, "quest_1");
  assert.equal(parsed.payload.references?.[0]?.targetId, "char_mira");
});
test("rejects invalid V2 scene candidate JSON", () => {
  assert.throws(() => parseV2SceneCandidateText("not json"), /valid JSON/);
  assert.throws(() => parseV2SceneCandidateText(JSON.stringify({ choices: [] })), /include scene/);
  assert.throws(
    () => parseV2SceneCandidateText(JSON.stringify({
      scene: { sceneId: "scene", title: "Title", body: "Body", participantCharacterIds: [] },
      choices: [],
    })),
    /choices/,
  );
});
