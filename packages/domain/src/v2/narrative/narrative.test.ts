import assert from "node:assert/strict";
import test from "node:test";

import { V2DomainError } from "../shared/index.ts";
import { createV2NarrativeChapter } from "./chapter.ts";
import { createV2NarrativeQuest } from "./quest.ts";
import { createV2NarrativeScene } from "./scene.ts";
import { createV2SceneBlock, renderSceneBlocksToPlainText } from "./scene-block.ts";
import { createV2NarrativeReference } from "./reference.ts";
import { createV2CanonLoreEntry } from "./lore.ts";
import { createV2NarrativeTime } from "./timeline.ts";
import { buildV2NarrativeContextFingerprint } from "./context-fingerprint.ts";
import { runNarrativeDiagnostics } from "./diagnostics.ts";
import { getV2NarrativeTemplate, listV2NarrativeTemplates } from "./template.ts";

test("V2 Chapter domain validates id, titles, ordinals and revisions", () => {
  const chapter = createV2NarrativeChapter({
    chapterId: "ch_1",
    storyWorldId: "world_1",
    arcId: "arc_1",
    title: "Chapter 1",
    summary: "First chapter",
    ordinal: 0,
    revision: 1,
  });
  assert.equal(chapter.chapterId, "ch_1");
  assert.equal(chapter.ordinal, 0);

  assert.throws(() => createV2NarrativeChapter({ chapterId: "", storyWorldId: "world_1", arcId: "arc_1", title: "Ch" }), (err) => err instanceof V2DomainError);
  assert.throws(() => createV2NarrativeChapter({ chapterId: "ch_1", storyWorldId: "", arcId: "arc_1", title: "Ch" }), (err) => err instanceof V2DomainError);
  assert.throws(() => createV2NarrativeChapter({ chapterId: "ch_1", storyWorldId: "world_1", arcId: "", title: "Ch" }), (err) => err instanceof V2DomainError);
  assert.throws(() => createV2NarrativeChapter({ chapterId: "ch_1", storyWorldId: "world_1", arcId: "arc_1", title: "" }), (err) => err instanceof V2DomainError);
  assert.throws(() => createV2NarrativeChapter({ chapterId: "ch_1", storyWorldId: "world_1", arcId: "arc_1", title: "Ch", ordinal: -1 }), (err) => err instanceof V2DomainError);
  assert.throws(() => createV2NarrativeChapter({ chapterId: "ch_1", storyWorldId: "world_1", arcId: "arc_1", title: "Ch", revision: 0 }), (err) => err instanceof V2DomainError);
});

test("V2 Quest domain validates kind and hierarchy bindings", () => {
  const quest = createV2NarrativeQuest({
    questId: "q_1",
    storyWorldId: "world_1",
    arcId: "arc_1",
    chapterId: "ch_1",
    title: "Main Quest",
    kind: "main",
    ordinal: 1,
  });
  assert.equal(quest.kind, "main");
  assert.equal(quest.ordinal, 1);

  assert.throws(() => createV2NarrativeQuest({ questId: "q_1", storyWorldId: "world_1", title: "Q", kind: "invalid_kind" as never }), (err) => err instanceof V2DomainError);
});

test("V2 Scene domain supports legacy_body and blocks modes", () => {
  const legacyScene = createV2NarrativeScene({
    sceneId: "scene_legacy",
    storyWorldId: "world_1",
    title: "Legacy Scene",
    body: "Classic plain text",
  });
  assert.equal(legacyScene.documentMode, "legacy_body");

  const blockScene = createV2NarrativeScene({
    sceneId: "scene_blocks",
    storyWorldId: "world_1",
    title: "Block Scene",
    documentMode: "blocks",
  });
  assert.equal(blockScene.documentMode, "blocks");
});

test("V2 SceneBlock domain and plain text rendering", () => {
  const dBlock = createV2SceneBlock({
    blockId: "b1",
    storyWorldId: "world_1",
    sceneId: "s1",
    ordinal: 0,
    kind: "dialogue",
    speakerCharacterId: "char_paimon",
    text: "前面好像有人。",
  });
  const sBlock = createV2SceneBlock({
    blockId: "b2",
    storyWorldId: "world_1",
    sceneId: "s1",
    ordinal: 1,
    kind: "stage_direction",
    text: "镜头转向山坡",
  });
  const nBlock = createV2SceneBlock({
    blockId: "b3",
    storyWorldId: "world_1",
    sceneId: "s1",
    ordinal: 2,
    kind: "narration",
    text: "微风拂过草地。",
  });

  assert.equal(dBlock.speakerCharacterId, "char_paimon");
  assert.throws(() => createV2SceneBlock({ blockId: "b_bad", storyWorldId: "w", sceneId: "s", kind: "narration", speakerCharacterId: "char_a" }), (err) => err instanceof V2DomainError);

  const rendered = renderSceneBlocksToPlainText([dBlock, sBlock, nBlock], { char_paimon: "派蒙" });
  assert.equal(rendered, "[派蒙] 前面好像有人。\n\n（镜头转向山坡）\n\n微风拂过草地。");
});

test("V2 NarrativeReference domain validates source, target and roles", () => {
  const ref = createV2NarrativeReference({
    referenceId: "ref_1",
    storyWorldId: "world_1",
    sourceType: "scene",
    sourceId: "scene_1",
    targetType: "character",
    targetId: "char_1",
    role: "participant",
  });
  assert.equal(ref.role, "participant");
  assert.throws(() => createV2NarrativeReference({ referenceId: "r", storyWorldId: "w", sourceType: "unknown" as never, sourceId: "s", targetType: "character", targetId: "c", role: "participant" }), (err) => err instanceof V2DomainError);
});

test("V2 LoreEntry domain validates custom types and tags", () => {
  const lore = createV2CanonLoreEntry({
    loreEntryId: "lore_1",
    storyWorldId: "world_1",
    type: "faction",
    name: "愚人众",
    tags: ["至冬", "执行官"],
  });
  assert.equal(lore.name, "愚人众");
  assert.deepEqual(lore.tags, ["至冬", "执行官"]);

  assert.throws(() => createV2CanonLoreEntry({ loreEntryId: "l", storyWorldId: "w", type: "custom", name: "Custom" }), /customType/);
});

test("V2 NarrativeTime validates certainty and type", () => {
  const time = createV2NarrativeTime({
    type: "era",
    displayText: "魔神战争时期",
    certainty: "approximate",
  });
  assert.equal(time.type, "era");
  assert.equal(time.displayText, "魔神战争时期");
});

test("V2 Context Fingerprint produces deterministic sorted sha256 hash", () => {
  const fp1 = buildV2NarrativeContextFingerprint({
    storyWorldId: "world_1",
    worldRevision: 5,
    sources: [
      { kind: "character", id: "char_b", revision: 1 },
      { kind: "character", id: "char_a", revision: 2 },
      { kind: "lore", id: "lore_1", revision: 1 },
    ],
  });

  const fp2 = buildV2NarrativeContextFingerprint({
    storyWorldId: "world_1",
    worldRevision: 5,
    sources: [
      { kind: "lore", id: "lore_1", revision: 1 },
      { kind: "character", id: "char_a", revision: 2 },
      { kind: "character", id: "char_b", revision: 1 },
    ],
  });

  assert.equal(fp1.hash, fp2.hash);
  assert.equal(fp1.hash, buildV2NarrativeContextFingerprint({ storyWorldId: "world_1", worldRevision: 6, sources: fp1.sources }).hash);
  assert.equal(fp1.sources[0]?.id, "char_a");
  assert.equal(fp1.sources[1]?.id, "char_b");
  assert.equal(fp1.sources[2]?.id, "lore_1");
});

test("V2 Narrative Diagnostics detects P0/P1 issues", () => {
  const report = runNarrativeDiagnostics({
    storyWorldId: "world_1",
    arcs: [{ arcId: "arc_1", title: "Arc 1" }],
    chapters: [{ chapterId: "ch_1", storyWorldId: "world_1", arcId: "arc_nonexistent", title: "Chapter 1", ordinal: 0, revision: 1 }],
    quests: [],
    scenes: [
      { sceneId: "scene_1", storyWorldId: "world_1", title: "Scene 1", documentMode: "blocks", isEntry: true, ordinal: 0, revision: 1 },
      { sceneId: "scene_orphan", storyWorldId: "world_1", title: "Orphan", documentMode: "blocks", isEntry: false, ordinal: 1, revision: 1 },
    ],
    blocks: [],
    choices: [],
    references: [
      { referenceId: "ref_bad", storyWorldId: "world_1", sourceType: "scene", sourceId: "scene_1", targetType: "character", targetId: "char_missing", role: "participant" },
    ],
    characters: [{ characterId: "char_1", name: "Hero" }],
    locations: [{ locationId: "loc_1", name: "Town" }],
  });

  assert.equal(report.valid, false);
  assert(report.diagnostics.some((d: { code: string }) => d.code === "CHAPTER_ARC_MISMATCH"));
  assert(report.diagnostics.some((d: { code: string }) => d.code === "MISSING_PARTICIPANT_CHARACTER"));
  assert(report.diagnostics.some((d: { code: string }) => d.code === "UNREACHABLE_SCENE"));
});

test("V2 Narrative Templates exposes builtin templates without project-specific hardcoding", () => {
  const templates = listV2NarrativeTemplates();
  assert(templates.length >= 5);
  const threeAct = getV2NarrativeTemplate("three-act");
  assert.equal(threeAct.structure.arcs.length, 3);
  // Ensure no hardcoded "歌剧院", "审判席", "破晓之光" in generic template
  const jsonStr = JSON.stringify(threeAct);
  assert(!jsonStr.includes("歌剧院"));
  assert(!jsonStr.includes("审判席"));
});
