import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { applyV2Migrations } from "../platform/migrations.ts";
import {
  V2SqliteCanonRepository,
  V2SqliteGraphStateRepository,
} from "../core/canon-repository.ts";
import { SqliteNarrativeHierarchyRepository } from "./hierarchy-repository.ts";
import { SqliteSceneDocumentRepository } from "./scene-document-repository.ts";
import { SqliteNarrativeReferenceRepository } from "./reference-repository.ts";
import { SqliteCanonLoreRepository } from "./lore-repository.ts";
import { SqliteNarrativeSearchRepository } from "./search-repository.ts";
import { SqliteNarrativeUnitOfWork } from "./unit-of-work.ts";

function createTestDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  applyV2Migrations(db);
  return db;
}

test("V2 Database Narrative Hierarchy, Document, Reference, Lore, and Search Repository", async () => {
  const db = createTestDatabase();
  const canonRepo = new V2SqliteCanonRepository(db);
  const graphRepo = new V2SqliteGraphStateRepository(db);
  const hierarchyRepo = new SqliteNarrativeHierarchyRepository(db);
  const docRepo = new SqliteSceneDocumentRepository(db);
  const refRepo = new SqliteNarrativeReferenceRepository(db);
  const loreRepo = new SqliteCanonLoreRepository(db);
  const searchRepo = new SqliteNarrativeSearchRepository(db);

  // 1. Setup World, Characters, Locations, Arcs
  await canonRepo.createWorld({
    storyWorldId: "world_test",
    name: "测试大陆",
    revision: 1,
  });

  await canonRepo.createLocation({
    storyWorldId: "world_test",
    locationId: "loc_golden_house",
    name: "黄金屋",
  });

  await canonRepo.createCharacter({
    storyWorldId: "world_test",
    characterId: "char_traveler",
    name: "旅行者",
    profile: { aliases: [], tags: [], persona: { traits: [], behaviorPatterns: [], values: [], taboos: [] } },
  });

  await canonRepo.createCharacter({
    storyWorldId: "world_test",
    characterId: "char_paimon",
    name: "派蒙",
    profile: { aliases: [], tags: [], persona: { traits: [], behaviorPatterns: [], values: [], taboos: [] } },
  });

  await canonRepo.createCharacter({
    storyWorldId: "world_test",
    characterId: "char_childe",
    name: "公子",
    profile: { aliases: [], tags: [], persona: { traits: [], behaviorPatterns: [], values: [], taboos: [] } },
  });

  await graphRepo.createArc({
    storyWorldId: "world_test",
    arcId: "arc_liyue",
    title: "璃月主线",
    summary: "璃月地区的旅途与危机",
  });

  // 2. Test Chapter CRUD
  const chapter1 = await hierarchyRepo.createChapter({
    chapterId: "ch_1",
    storyWorldId: "world_test",
    arcId: "arc_liyue",
    title: "第一章 · 辞行久远之躯",
    summary: "璃月送仙典仪与追查真凶",
    ordinal: 0,
    revision: 1,
  });
  assert.equal(chapter1.chapterId, "ch_1");
  assert.equal(chapter1.title, "第一章 · 辞行久远之躯");

  const updatedChapter = await hierarchyRepo.updateChapter({
    ...chapter1,
    title: "第一章 · 辞行久远之躯 (修订)",
    revision: 2,
  });
  assert.equal(updatedChapter.title, "第一章 · 辞行久远之躯 (修订)");

  // 3. Test Quest CRUD
  const quest1 = await hierarchyRepo.createQuest({
    questId: "quest_golden_house",
    storyWorldId: "world_test",
    arcId: "arc_liyue",
    chapterId: "ch_1",
    title: "黄金屋事件",
    summary: "阻止公子的计划",
    kind: "main",
    ordinal: 0,
    revision: 1,
  });
  assert.equal(quest1.questId, "quest_golden_house");
  assert.equal(quest1.kind, "main");

  // 4. Test Scene and Document Blocks
  await graphRepo.createScene({
    storyWorldId: "world_test",
    sceneId: "scene_confrontation",
    arcId: "arc_liyue",
    title: "与公子对峙",
    body: "legacy body fallback",
    isEntry: true,
  });

  const savedDoc = await docRepo.saveSceneDocument({
    scene: {
      sceneId: "scene_confrontation",
      storyWorldId: "world_test",
      arcId: "arc_liyue",
      chapterId: "ch_1",
      questId: "quest_golden_house",
      title: "与公子对峙",
      documentMode: "blocks",
      isEntry: true,
      ordinal: 0,
      revision: 2,
    },
    blocks: [
      {
        blockId: "b1",
        storyWorldId: "world_test",
        sceneId: "scene_confrontation",
        ordinal: 0,
        kind: "dialogue",
        speakerCharacterId: "char_paimon",
        text: "这里的气氛好奇怪。",
        payload: {},
        revision: 1,
      },
      {
        blockId: "b2",
        storyWorldId: "world_test",
        sceneId: "scene_confrontation",
        ordinal: 1,
        kind: "stage_direction",
        text: "镜头转向大厅中央。",
        payload: {},
        revision: 1,
      },
      {
        blockId: "b3",
        storyWorldId: "world_test",
        sceneId: "scene_confrontation",
        ordinal: 2,
        kind: "dialogue",
        speakerCharacterId: "char_childe",
        text: "终于来了。",
        payload: {},
        revision: 1,
      },
      {
        blockId: "b4",
        storyWorldId: "world_test",
        sceneId: "scene_confrontation",
        ordinal: 3,
        kind: "narration",
        text: "空气中的元素力开始剧烈震动。",
        payload: {},
        revision: 1,
      },
    ],
  });

  assert.equal(savedDoc.scene.documentMode, "blocks");
  assert.equal(savedDoc.blocks.length, 4);
  assert.equal(savedDoc.blocks[0]!.speakerCharacterId, "char_paimon");

  // 5. Test Narrative References
  await refRepo.replaceReferencesForSource(
    { storyWorldId: "world_test", sourceType: "scene", sourceId: "scene_confrontation" },
    [
      { referenceId: "ref_loc", storyWorldId: "world_test", sourceType: "scene", sourceId: "scene_confrontation", targetType: "location", targetId: "loc_golden_house", role: "location" },
      { referenceId: "ref_p1", storyWorldId: "world_test", sourceType: "scene", sourceId: "scene_confrontation", targetType: "character", targetId: "char_traveler", role: "participant" },
      { referenceId: "ref_p2", storyWorldId: "world_test", sourceType: "scene", sourceId: "scene_confrontation", targetType: "character", targetId: "char_paimon", role: "participant" },
      { referenceId: "ref_p3", storyWorldId: "world_test", sourceType: "scene", sourceId: "scene_confrontation", targetType: "character", targetId: "char_childe", role: "participant" },
    ],
  );

  const sceneRefs = await refRepo.listReferencesBySource({ storyWorldId: "world_test", sourceType: "scene", sourceId: "scene_confrontation" });
  assert.equal(sceneRefs.length, 4);

  // 6. Test Outline Retrieval
  const outline = await hierarchyRepo.listOutline("world_test");
  assert.equal(outline.arcs.length, 1);
  assert.equal(outline.arcs[0]!.chapters.length, 1);
  assert.equal(outline.arcs[0]!.chapters[0]!.quests.length, 1);
  const questScenes = outline.arcs[0]!.chapters[0]!.quests[0]!.scenes;
  assert.equal(questScenes.length, 1);
  assert.equal(questScenes[0]!.sceneId, "scene_confrontation");
  assert.equal(questScenes[0]!.locationId, "loc_golden_house");
  assert.deepEqual([...questScenes[0]!.participantCharacterIds].sort(), ["char_childe", "char_paimon", "char_traveler"]);
  assert.equal(questScenes[0]!.blockCount, 4);

  // 7. Test Lore CRUD and Search
  const loreEntry = await loreRepo.createLoreEntry({
    loreEntryId: "lore_gnosis",
    storyWorldId: "world_test",
    type: "item",
    name: "神之心",
    summary: "尘世七执政神权的证明与魔力枢纽",
    body: "由天空岛赐予七神的至宝，蕴含纯净的元素权能。",
    tags: ["七神", "天理"],
    revision: 1,
  });
  assert.equal(loreEntry.name, "神之心");

  const loreSearchResults = await loreRepo.searchLore("world_test", "天空岛");
  assert.equal(loreSearchResults.length, 1);
  assert.equal(loreSearchResults[0]!.loreEntryId, "lore_gnosis");

  // 8. Test Global Narrative Search
  const globalSearch = await searchRepo.searchNarrative("world_test", "黄金屋");
  assert(globalSearch.some((item) => item.id === "quest_golden_house" || item.id === "loc_golden_house"));

  // 9. Test Unit of Work transaction rollback
  const uow = new SqliteNarrativeUnitOfWork(db);
  await assert.rejects(async () => {
    await uow.withNarrativeTransaction(async (ctx) => {
      await ctx.hierarchy.createChapter({
        chapterId: "ch_rollback",
        storyWorldId: "world_test",
        arcId: "arc_liyue",
        title: "Will be rolled back",
        ordinal: 99,
        revision: 1,
      });
      throw new Error("Intentional rollback test");
    });
  });

  const rolledBackChapter = await hierarchyRepo.getChapter({ storyWorldId: "world_test", chapterId: "ch_rollback" });
  assert.equal(rolledBackChapter, undefined);
});
