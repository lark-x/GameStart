import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  applyV2Migrations,
  SqliteNarrativeUnitOfWork,
  V2SqliteCanonRepository,
  V2SqliteGraphStateRepository,
} from "@living-network/database/v2";
import { createV2FastifyApp } from "../platform/app.ts";
import { v2NarrativePlugin } from "./plugin.ts";

function createTestApp() {
  const db = new DatabaseSync(":memory:");
  applyV2Migrations(db);
  const narrativeUnitOfWork = new SqliteNarrativeUnitOfWork(db);
  const canonRepo = new V2SqliteCanonRepository(db);
  const graphRepo = new V2SqliteGraphStateRepository(db);

  const app = createV2FastifyApp({
    narrativePlugin: v2NarrativePlugin,
    narrativeOptions: { narrativeUnitOfWork },
  });

  return { app, db, canonRepo, graphRepo, narrativeUnitOfWork };
}

test("V2 Narrative API - End-to-end Hierarchy, Scene Documents, References, Lore, Templates, Diagnostics, and Context", async () => {
  const { app, canonRepo, graphRepo } = createTestApp();

  // 1. Create World, Location, Characters, Arc
  await canonRepo.createWorld({
    storyWorldId: "world_test",
    name: "提瓦特测试世界",
    revision: 1,
  });

  await canonRepo.createLocation({
    storyWorldId: "world_test",
    locationId: "loc_golden_house",
    name: "黄金屋",
    summary: "璃月铸造摩拉的重地",
  });

  await canonRepo.createCharacter({
    storyWorldId: "world_test",
    characterId: "char_childe",
    name: "达达利亚",
    summary: "愚人众执行官第十一席【公子】",
    profile: { aliases: [], tags: [], persona: { traits: [], behaviorPatterns: [], values: [], taboos: [] } },
  });

  await canonRepo.createCharacter({
    storyWorldId: "world_test",
    characterId: "char_traveler",
    name: "旅行者",
    summary: "异界的旅人",
    profile: { aliases: [], tags: [], persona: { traits: [], behaviorPatterns: [], values: [], taboos: [] } },
  });

  await graphRepo.createArc({
    storyWorldId: "world_test",
    arcId: "arc_liyue",
    title: "第一幕 · 辞行久远之躯",
    summary: "璃月的主线篇章",
  });

  // 2. Chapter API
  const createChRes = await app.inject({
    method: "POST",
    url: "/api/v2/worlds/world_test/narrative/chapters",
    payload: {
      chapterId: "ch_1",
      arcId: "arc_liyue",
      title: "第一章 · 浮生浮世千岩间",
      summary: "送仙典仪与追查真相",
      ordinal: 0,
    },
  });
  assert.equal(createChRes.statusCode, 200);
  const chapterData = createChRes.json();
  assert.equal(chapterData.chapterId, "ch_1");
  assert.equal(chapterData.title, "第一章 · 浮生浮世千岩间");

  // Update Chapter
  const updateChRes = await app.inject({
    method: "PUT",
    url: "/api/v2/worlds/world_test/narrative/chapters/ch_1",
    payload: {
      title: "第一章 · 浮生浮世千岩间 (已更新)",
      revision: chapterData.revision,
    },
  });
  assert.equal(updateChRes.statusCode, 200);
  assert.equal(updateChRes.json().title, "第一章 · 浮生浮世千岩间 (已更新)");

  // 3. Quest API
  const createQuestRes = await app.inject({
    method: "POST",
    url: "/api/v2/worlds/world_test/narrative/quests",
    payload: {
      questId: "quest_golden_house",
      arcId: "arc_liyue",
      chapterId: "ch_1",
      title: "迫近的客星 · 黄金屋之战",
      summary: "阻止公子夺取先祖法蜕的神之心",
      kind: "main",
      ordinal: 0,
    },
  });
  assert.equal(createQuestRes.statusCode, 200);
  const questData = createQuestRes.json();
  assert.equal(questData.questId, "quest_golden_house");
  assert.equal(questData.kind, "main");

  // 4. Create Scene & Scene Document API
  await graphRepo.createScene({
    storyWorldId: "world_test",
    sceneId: "scene_childe_fight",
    arcId: "arc_liyue",
    title: "与公子对决",
    body: "初始场景占位文本",
    isEntry: true,
  });

  const saveDocRes = await app.inject({
    method: "PUT",
    url: "/api/v2/worlds/world_test/narrative/scenes/scene_childe_fight/document",
    payload: {
      title: "与公子对决 (文档模式)",
      arcId: "arc_liyue",
      chapterId: "ch_1",
      questId: "quest_golden_house",
      documentMode: "blocks",
      isEntry: true,
      ordinal: 0,
      revision: 1,
      blocks: [
        {
          ordinal: 0,
          kind: "narration",
          text: "黄金屋内，满地都是昏迷的千岩军守卫。",
        },
        {
          ordinal: 1,
          kind: "stage_direction",
          text: "公子从大殿中央转过身，微笑着注视着旅行者。",
        },
        {
          ordinal: 2,
          kind: "dialogue",
          speakerCharacterId: "char_childe",
          text: "你终于来了，异乡人。我就知道你不会错过这场好戏。",
        },
        {
          ordinal: 3,
          kind: "dialogue",
          speakerCharacterId: "char_traveler",
          text: "神之心不在这里，你被愚弄了。",
        },
      ],
    },
  });
  assert.equal(saveDocRes.statusCode, 200);
  const docData = saveDocRes.json();
  assert.equal(docData.documentMode, "blocks");
  assert.equal(docData.blocks.length, 4);
  assert.equal(docData.blocks[2].speakerCharacterId, "char_childe");

  // 5. Scene References API
  const replaceRefsRes = await app.inject({
    method: "PUT",
    url: "/api/v2/worlds/world_test/narrative/scenes/scene_childe_fight/references",
    payload: {
      references: [
        { targetType: "location", targetId: "loc_golden_house", role: "location" },
        { targetType: "character", targetId: "char_traveler", role: "participant" },
        { targetType: "character", targetId: "char_childe", role: "participant" },
      ],
    },
  });
  assert.equal(replaceRefsRes.statusCode, 200);
  const refsData = replaceRefsRes.json();
  assert.equal(refsData.references.length, 3);

  // 6. Outline API
  const outlineRes = await app.inject({
    method: "GET",
    url: "/api/v2/worlds/world_test/narrative/outline",
  });
  assert.equal(outlineRes.statusCode, 200);
  const outline = outlineRes.json();
  assert.equal(outline.arcs.length, 1);
  assert.equal(outline.arcs[0].chapters.length, 1);
  assert.equal(outline.arcs[0].chapters[0].quests.length, 1);
  const sceneSummary = outline.arcs[0].chapters[0].quests[0].scenes[0];
  assert.equal(sceneSummary.sceneId, "scene_childe_fight");
  assert.equal(sceneSummary.locationId, "loc_golden_house");
  assert.deepEqual(sceneSummary.participantCharacterIds.sort(), ["char_childe", "char_traveler"]);
  assert.equal(sceneSummary.blockCount, 4);

  // 7. Lore Entry API
  const createLoreRes = await app.inject({
    method: "POST",
    url: "/api/v2/worlds/world_test/narrative/lore",
    payload: {
      loreEntryId: "lore_fatui",
      type: "organization",
      name: "愚人众",
      summary: "至冬国的军事与外交组织",
      body: "由冰之女皇领导，十一位执行官统领的精锐组织，在各国暗中收集神之心。",
      tags: ["至冬", "执行官", "反派"],
    },
  });
  assert.equal(createLoreRes.statusCode, 200);
  const loreData = createLoreRes.json();
  assert.equal(loreData.name, "愚人众");

  const listLoreRes = await app.inject({
    method: "GET",
    url: "/api/v2/worlds/world_test/narrative/lore?tag=至冬",
  });
  assert.equal(listLoreRes.statusCode, 200);
  assert.equal(listLoreRes.json().length, 1);

  // 8. Search API
  const searchRes = await app.inject({
    method: "GET",
    url: "/api/v2/worlds/world_test/narrative/search?q=黄金屋",
  });
  assert.equal(searchRes.statusCode, 200);
  const searchResults = searchRes.json();
  assert(searchResults.items.length > 0);

  // 9. Diagnostics API
  const diagRes = await app.inject({
    method: "GET",
    url: "/api/v2/worlds/world_test/narrative/diagnostics",
  });
  assert.equal(diagRes.statusCode, 200);
  const diagData = diagRes.json();
  assert.equal(typeof diagData.valid, "boolean");

  // 10. Context Preview API
  const contextRes = await app.inject({
    method: "POST",
    url: "/api/v2/worlds/world_test/narrative/context/preview",
    payload: {
      task: "create_scene",
      targetSceneId: "scene_childe_fight",
      targetQuestId: "quest_golden_house",
      prompt: "续写公子的二阶段魔王武装形态变身剧情",
    },
  });
  assert.equal(contextRes.statusCode, 200);
  const contextData = contextRes.json();
  assert(contextData.sections.length >= 3);
  assert.equal(contextData.fingerprint.hash.length, 64);
  assert.match(contextData.contextHash, /^sha256:[a-f0-9]{64}$/);

  // 11. Templates Listing and Apply API
  const listTemplatesRes = await app.inject({
    method: "GET",
    url: "/api/v2/narrative/templates",
  });
  assert.equal(listTemplatesRes.statusCode, 200);
  assert(listTemplatesRes.json().templates.length >= 5);

  const currentWorld = (await canonRepo.getWorld("world_test" as any))!;
  const applyTemplateRes = await app.inject({
    method: "POST",
    url: "/api/v2/worlds/world_test/narrative/templates/apply",
    payload: {
      templateId: "three-act",
      expectedRevision: currentWorld.revision,
    },
  });
  assert.equal(applyTemplateRes.statusCode, 200);
  const templateResult = applyTemplateRes.json();
  assert.equal(templateResult.createdArcsCount, 3);
  assert(templateResult.createdScenesCount >= 3);
});
