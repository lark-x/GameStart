import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ARTIFACT_DIR = "C:/Users/12938/.gemini/antigravity/brain/81d32b99-d107-4b27-bed3-68ddc1ad51d6/screenshots";
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

const DIST_DIR = path.resolve("apps/web/dist");

const mockOutline = {
  arcs: [
    {
      arcId: "arc_prologue",
      title: "第一幕：捕风的异乡人",
      summary: "旅行者初抵提瓦特，与派蒙结伴踏上蒙德的冒险旅程。",
      ordinal: 1,
      chapters: [
        {
          chapterId: "ch_wind",
          arcId: "arc_prologue",
          title: "第一章：风起低语林",
          ordinal: 1,
          quests: [
            {
              questId: "q_forest",
              arcId: "arc_prologue",
              chapterId: "ch_wind",
              title: "低语森林的龙影",
              ordinal: 1,
              scenes: [
                { sceneId: "sc_forest_entry", title: "低语森林初遇", ordinal: 1, isEntry: true },
                { sceneId: "sc_dragon_sight", title: "巨龙翱翔之影", ordinal: 2 },
              ],
            },
          ],
          looseScenes: [],
        },
      ],
      looseQuests: [],
      looseScenes: [
        { sceneId: "sc_arc_loose_1", title: "星落湖畔的休憩", ordinal: 3 },
        { sceneId: "sc_arc_loose_2", title: "风神像的共鸣", ordinal: 4 },
      ],
    },
    {
      arcId: "arc_chapter_1",
      title: "第二幕：辞行久远之躯",
      summary: "岩王帝君遇刺，璃月港暗流涌动。",
      ordinal: 2,
      chapters: [],
      looseQuests: [],
      looseScenes: [
        { sceneId: "sc_rite_descension", title: "请仙典仪上的异变", ordinal: 1, isEntry: true },
      ],
    },
  ],
  unassignedScenes: [],
};

const mockDoc = {
  sceneId: "sc_forest_entry",
  title: "低语森林初遇",
  revision: 3,
  isEntry: true,
  blocks: [
    {
      blockId: "blk_1",
      kind: "narration",
      text: "阳光透过繁密的树冠，在斑驳的草地上投下细碎的光斑。微风拂过林梢，带来远方松脂与野花的清香。",
    },
    {
      blockId: "blk_2",
      kind: "dialogue",
      speakerCharacterId: "paimon",
      text: "哇！前面就是低语森林了！旅行者，抓紧跟上，听说蒙德城就在森林另一边呢！",
    },
    {
      blockId: "blk_3",
      kind: "action",
      speakerCharacterId: "traveler",
      text: "旅行者环顾四周，敏锐地察觉到林中深处传来一阵低沉的龙吟轰鸣。",
    },
    {
      blockId: "blk_4",
      kind: "dialogue",
      speakerCharacterId: "paimon",
      text: "等、等等……你刚才有没有听到什么奇怪的声音？好像有庞然大物在树林上空飞过！",
    },
  ],
};

const mockDragonDoc = {
  sceneId: "sc_dragon_sight",
  title: "巨龙翱翔之影",
  revision: 2,
  isEntry: false,
  blocks: [
    {
      blockId: "blk_d1",
      kind: "narration",
      text: "狂风卷席着树叶，一片巨大的青色龙翼掠过树冠，林中鸟雀惊飞。",
    },
    {
      blockId: "blk_d2",
      kind: "dialogue",
      speakerCharacterId: "paimon",
      text: "那是……特瓦林？它怎么会出现在低语森林？",
    },
  ],
};

const mockGraph = {
  choices: [
    {
      choiceId: "choice_investigate",
      sourceSceneId: "sc_forest_entry",
      targetSceneId: "sc_dragon_sight",
      label: "跟随异响深入密林调查",
      gates: [],
      consequences: [{ kind: "story", stateKey: "Bravery", operation: "increment", value: 1 }],
    },
    {
      choiceId: "choice_rest",
      sourceSceneId: "sc_forest_entry",
      targetSceneId: "sc_arc_loose_1",
      label: "先前往星落湖畔暂作休整",
      gates: [{ stateKey: "Stamina", operator: "lt", value: 30 }],
      consequences: [],
    },
  ],
};

const mockDiagnostics = {
  errorCount: 0,
  warningCount: 0,
  issues: [],
  report: { errorCount: 0, warningCount: 0, issues: [] },
};

const mockCharacters = [
  { characterId: "paimon", name: "派蒙", description: "最好的向导与伙伴" },
  { characterId: "traveler", name: "旅行者 (空/荧)", description: "来自异世界的异乡人" },
  { characterId: "venti", name: "温迪", description: "吟游诗人" },
];

const mockLocations = [
  { locationId: "whispering_woods", name: "低语森林", description: "蒙德城外的幽静森林" },
  { locationId: "starfell_lake", name: "星落湖", description: "风神神像伫立的湖泊" },
];

const mockRefs = {
  sceneId: "sc_forest_entry",
  storyWorldId: "teyvat",
  mainLocationId: "whispering_woods",
  participantCharacterIds: ["paimon", "traveler"],
  references: [
    { targetType: "location", targetId: "whispering_woods", role: "location" },
    { targetType: "character", targetId: "paimon", role: "participant" },
    { targetType: "character", targetId: "traveler", role: "participant" },
  ],
};

const mockCandidates = {
  candidates: [
    {
      candidateId: "cand_dragon_encounter",
      status: "pending",
      createdAt: new Date().toISOString(),
      payload: {
        scene: {
          sceneId: "sc_dragon_sight",
          title: "巨龙翱翔之影 (AI续写)",
          document: {
            title: "巨龙翱翔之影",
            blocks: [
              {
                blockId: "cand_blk_1",
                kind: "narration",
                text: "狂风骤起，一片青绿色的巨大羽翼撕裂了林间的宁静，巨龙的咆哮震颤着大地。",
              },
              {
                blockId: "cand_blk_2",
                kind: "dialogue",
                speakerCharacterId: "paimon",
                text: "哇啊啊！那是什么怪物？！赶紧躲到大树后面！",
              },
            ],
          },
        },
      },
    },
  ],
};

const mockSearchResults = {
  results: [
    { id: "sc_forest_entry", kind: "scene", title: "低语森林初遇", snippet: "阳光透过繁密的树冠..." },
    { id: "paimon", kind: "character", title: "派蒙", snippet: "最好的向导与伙伴" },
    { id: "whispering_woods", kind: "location", title: "低语森林", snippet: "蒙德城外的幽静森林" },
  ],
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost:4173");
  const p = url.pathname;

  if (p.endsWith("/outline")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(mockOutline));
  }
  if (p.includes("/scenes/sc_dragon_sight/document") || p.endsWith("/scenes/sc_dragon_sight")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(mockDragonDoc));
  }
  if (p.includes("/scenes/sc_forest_entry/document") || p.endsWith("/scenes/sc_forest_entry") || p.includes("/scenes/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(mockDoc));
  }
  if (p.endsWith("/references") || p.includes("/references/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(mockRefs));
  }
  if (p.endsWith("/graph")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(mockGraph));
  }
  if (p.endsWith("/diagnostics")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(mockDiagnostics));
  }
  if (p.endsWith("/characters")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ characters: mockCharacters }));
  }
  if (p.endsWith("/locations")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ locations: mockLocations }));
  }
  if (p.endsWith("/candidates")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(mockCandidates));
  }
  if (p.endsWith("/search") || p.includes("/search?")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(mockSearchResults));
  }
  if (p === "/api/v2/core/worlds/teyvat") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ storyWorldId: "teyvat", name: "提瓦特正典", revision: 3 }));
  }
  if (p.startsWith("/api/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true }));
  }

  let filePath = path.join(DIST_DIR, p);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, "index.html");
  }

  const ext = path.extname(filePath);
  const mimeTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
  };
  const contentType = mimeTypes[ext] || "text/html";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end("Error loading file");
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    }
  });
});

server.listen(4173, "127.0.0.1", async () => {
  console.log("Mock server running on http://127.0.0.1:4173");

  const executablePath = fs.existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  async function clickTab(tabText) {
    const buttons = await page.$$("button");
    for (const btn of buttons) {
      const text = await page.evaluate(el => el.textContent?.trim(), btn);
      if (text === tabText) {
        await btn.click();
        await new Promise(r => setTimeout(r, 600));
        return true;
      }
    }
    return false;
  }

  try {
    await page.goto("http://127.0.0.1:4173/v2/worlds/teyvat/narrative", { waitUntil: "networkidle0" });
    await new Promise(r => setTimeout(r, 1000));

    // 1. Outline Mode Screenshot
    console.log("Switching to Outline Mode...");
    await clickTab("大纲");
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "1_outline_mode.png"), fullPage: false });
    console.log("Saved 1_outline_mode.png");

    // 2. Script Mode Screenshot
    console.log("Switching to Script Mode...");
    await clickTab("剧本");
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "2_script_mode.png"), fullPage: false });
    console.log("Saved 2_script_mode.png");

    // 3. Flow Mode Screenshot
    console.log("Switching to Flow Mode...");
    await clickTab("分支");
    await new Promise(r => setTimeout(r, 600));
    // Click on choice card to inspect
    const choiceCards = await page.$$("div[class*='cursor-pointer']");
    for (const card of choiceCards) {
      const text = await page.evaluate(el => el.textContent, card);
      if (text && text.includes("跟随异响深入密林调查")) {
        await card.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "3_flow_mode.png"), fullPage: false });
    console.log("Saved 3_flow_mode.png");

    // 4. Review Mode Screenshot
    console.log("Switching to Review Mode...");
    await clickTab("AI 审核");
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "4_review_mode.png"), fullPage: false });
    console.log("Saved 4_review_mode.png");

    // 5. Command Palette Screenshot
    console.log("Opening Command Palette...");
    await clickTab("剧本");
    await new Promise(r => setTimeout(r, 400));
    const allBtns = await page.$$("button");
    for (const btn of allBtns) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes("搜索") && text.includes("⌘K")) {
        await btn.click();
        break;
      }
    }
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "5_command_palette.png"), fullPage: false });
    console.log("Saved 5_command_palette.png");

    console.log("All 5 screenshots captured successfully!");
  } catch (err) {
    console.error("Screenshot error:", err);
  } finally {
    await browser.close();
    server.close();
  }
});
