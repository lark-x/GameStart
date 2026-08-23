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

function createTestContext() {
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

test("Section 66 Golden Master E2E: 黄金屋对峙 (Golden House Confrontation) Story Lifecycle", async () => {
  const { app, canonRepo, graphRepo } = createTestContext();
  const storyWorldId = "world_teyvat_liyue";

  // 1. Initialize World
  await canonRepo.createWorld({
    storyWorldId: storyWorldId as any,
    name: "提瓦特 · 璃月",
    revision: 1,
  });

  // 2. Setup Canon Entities
  await canonRepo.createLocation({
    storyWorldId: storyWorldId as any,
    locationId: "loc_golden_house" as any,
    name: "黄金屋",
    summary: "璃月铸造全大陆流通摩拉的重地",
  });

  await canonRepo.createCharacter({
    storyWorldId: storyWorldId as any,
    characterId: "char_childe" as any,
    name: "达达利亚",
    summary: "愚人众执行官第十一席【公子】",
    profile: { aliases: ["公子", "阿贾克斯"], tags: ["执行官", "至冬"], persona: { traits: ["好战", "爽朗"], behaviorPatterns: [], values: [], taboos: [] } },
  });

  await canonRepo.createCharacter({
    storyWorldId: storyWorldId as any,
    characterId: "char_traveler" as any,
    name: "旅行者",
    summary: "游历七国的异界旅人",
    profile: { aliases: ["荣誉骑士"], tags: ["异界", "主角"], persona: { traits: ["果决", "勇敢"], behaviorPatterns: [], values: [], taboos: [] } },
  });

  await canonRepo.createCharacter({
    storyWorldId: storyWorldId as any,
    characterId: "char_paimon" as any,
    name: "派蒙",
    summary: "最好的向导与伙伴",
    profile: { aliases: ["应急食品"], tags: ["向导"], persona: { traits: ["贪吃", "活泼"], behaviorPatterns: [], values: [], taboos: [] } },
  });

  // 3. Create Canon Lore Entry
  const createLoreRes = await app.inject({
    method: "POST",
    url: `/api/v2/worlds/${storyWorldId}/narrative/lore`,
    payload: {
      loreEntryId: "lore_fatui_harbingers",
      type: "organization",
      name: "愚人众执行官",
      summary: "至冬国冰之女皇麾下的最高执行者群体",
      body: "共有十一席，每位都拥有女皇赐予的邪眼与超越常人的战斗能力，负责在提瓦特各国搜集神之心。",
      tags: ["至冬", "愚人众", "神之心"],
    },
  });
  assert.equal(createLoreRes.statusCode, 200);

  // 4. Create Arc & Chapter & Quest Hierarchy
  await graphRepo.createArc({
    storyWorldId: storyWorldId as any,
    arcId: "arc_act1" as any,
    title: "第一幕 · 辞行久远之躯",
    summary: "送仙典仪与追查岩神遇害真相的主线篇章",
  });

  const createChapterRes = await app.inject({
    method: "POST",
    url: `/api/v2/worlds/${storyWorldId}/narrative/chapters`,
    payload: {
      chapterId: "ch_golden_house",
      arcId: "arc_act1",
      title: "第三章 · 迫近的客星",
      summary: "黄金屋交锋与魔神旋涡决战",
      ordinal: 2,
    },
  });
  assert.equal(createChapterRes.statusCode, 200);

  const createQuestRes = await app.inject({
    method: "POST",
    url: `/api/v2/worlds/${storyWorldId}/narrative/quests`,
    payload: {
      questId: "quest_section_66",
      arcId: "arc_act1",
      chapterId: "ch_golden_house",
      title: "第66节 · 黄金屋对峙与对决",
      summary: "在仙祖法蜕前阻止公子的抢夺企图",
      kind: "main",
      ordinal: 0,
    },
  });
  assert.equal(createQuestRes.statusCode, 200);

  // 5. Create Scene & Structured Scene Document
  await graphRepo.createScene({
    storyWorldId: storyWorldId as any,
    sceneId: "scene_section_66_showdown" as any,
    arcId: "arc_act1" as any,
    title: "黄金屋决战",
    body: "初始占位",
    isEntry: false,
  });

  const saveDocRes = await app.inject({
    method: "PUT",
    url: `/api/v2/worlds/${storyWorldId}/narrative/scenes/scene_section_66_showdown/document`,
    payload: {
      title: "黄金屋决战 (正典分块剧本)",
      arcId: "arc_act1",
      chapterId: "ch_golden_house",
      questId: "quest_section_66",
      documentMode: "blocks",
      isEntry: false,
      ordinal: 0,
      revision: 1,
      blocks: [
        {
          ordinal: 0,
          kind: "narration",
          text: "黄金屋内，满地都是昏迷的千岩军守卫，先祖法蜕静静横卧在大殿正中央。",
        },
        {
          ordinal: 1,
          kind: "stage_direction",
          text: "公子从龙躯前缓缓转过身，嘴角噙着自信而危险的微笑。",
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
          speakerCharacterId: "char_paimon",
          text: "公子！神之心不在这里，你被愚弄了！",
        },
        {
          ordinal: 4,
          kind: "action",
          text: "达达利亚冷笑一声，拔出水形双刀，湛蓝与幽紫的雷光在周身瞬间狂暴爆发。",
        },
        {
          ordinal: 5,
          kind: "dialogue",
          speakerCharacterId: "char_childe",
          text: "借口就留到战后再说吧！让我见识一下你的全部实力！",
        },
      ],
    },
  });
  assert.equal(saveDocRes.statusCode, 200);
  const docData = saveDocRes.json();
  assert.equal(docData.documentMode, "blocks");
  assert.equal(docData.blocks.length, 6);
  assert.equal(docData.blocks[2].speakerCharacterId, "char_childe");
  assert.equal(docData.blocks[3].speakerCharacterId, "char_paimon");
  assert(docData.body.includes("水形双刀"));

  // 6. Bind Scene References (Location & Participant Characters)
  const replaceRefsRes = await app.inject({
    method: "PUT",
    url: `/api/v2/worlds/${storyWorldId}/narrative/scenes/scene_section_66_showdown/references`,
    payload: {
      mainLocationId: "loc_golden_house",
      participantCharacterIds: ["char_childe", "char_traveler", "char_paimon"],
      references: [
        { targetType: "lore", targetId: "lore_fatui_harbingers", role: "related" },
      ],
    },
  });
  assert.equal(replaceRefsRes.statusCode, 200);
  const refsData = replaceRefsRes.json();
  assert.equal(refsData.mainLocationId, "loc_golden_house");
  assert.deepEqual(refsData.participantCharacterIds.sort(), ["char_childe", "char_paimon", "char_traveler"]);

  // 7. Verify Outline Output
  const outlineRes = await app.inject({
    method: "GET",
    url: `/api/v2/worlds/${storyWorldId}/narrative/outline`,
  });
  assert.equal(outlineRes.statusCode, 200);
  const outline = outlineRes.json();
  assert.equal(outline.arcs.length, 1);
  assert.equal(outline.arcs[0].chapters.length, 1);
  assert.equal(outline.arcs[0].chapters[0].quests.length, 1);
  const sceneSummary = outline.arcs[0].chapters[0].quests[0].scenes[0];
  assert.equal(sceneSummary.sceneId, "scene_section_66_showdown");
  assert.equal(sceneSummary.blockCount, 6);
  assert.equal(sceneSummary.locationId, "loc_golden_house");
  assert.equal(sceneSummary.participantCharacterIds.length, 3);

  // 8. Verify Search
  const searchRes = await app.inject({
    method: "GET",
    url: `/api/v2/worlds/${storyWorldId}/narrative/search?q=水形双刀`,
  });
  assert.equal(searchRes.statusCode, 200);
  const searchResults = searchRes.json();
  assert(searchResults.items.length > 0);
  assert(searchResults.items.some((item: any) => item.snippet.includes("水形双刀")));

  // 9. Verify Diagnostics
  const diagRes = await app.inject({
    method: "GET",
    url: `/api/v2/worlds/${storyWorldId}/narrative/diagnostics`,
  });
  assert.equal(diagRes.statusCode, 200);
  const diagReport = diagRes.json();
  assert.equal(typeof diagReport.valid, "boolean");
  assert.equal(typeof diagReport.errorCount, "number");
  assert(Array.isArray(diagReport.diagnostics));

  // 10. Verify Generation Context Preview with Fingerprint
  const ctxRes = await app.inject({
    method: "POST",
    url: `/api/v2/worlds/${storyWorldId}/narrative/context/preview`,
    payload: {
      task: "continue_scene",
      targetSceneId: "scene_section_66_showdown",
      targetQuestId: "quest_section_66",
      prompt: "描写旅行者迎战公子第一阶段的水流瞬步反击",
    },
  });
  assert.equal(ctxRes.statusCode, 200);
  const contextData = ctxRes.json();
  assert.equal(contextData.fingerprint.hash.length, 64);
  assert(contextData.sections.length >= 3);
  assert(contextData.sections.some((s: any) => s.title.includes("当前场景")));
  assert(contextData.sections.some((s: any) => s.title.includes("当前任务")));
});
