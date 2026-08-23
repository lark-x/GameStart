import { V2DomainError } from "../shared/index.ts";
import type { V2QuestKind } from "./quest.ts";
import type { V2SceneBlockKind } from "./scene-block.ts";

export type V2NarrativeTemplateId =
  | "blank"
  | "three-act"
  | "rpg-main-quest"
  | "rpg-side-quest"
  | "visual-novel";

export interface V2TemplateBlockDef {
  readonly kind: V2SceneBlockKind;
  readonly text?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface V2TemplateChoiceDef {
  readonly label: string;
  readonly targetSceneKey?: string;
}

export interface V2TemplateSceneDef {
  readonly key: string;
  readonly title: string;
  readonly summary?: string;
  readonly isEntry?: boolean;
  readonly blocks?: readonly V2TemplateBlockDef[];
  readonly choices?: readonly V2TemplateChoiceDef[];
}

export interface V2TemplateQuestDef {
  readonly key: string;
  readonly title: string;
  readonly summary?: string;
  readonly kind: V2QuestKind;
  readonly scenes: readonly V2TemplateSceneDef[];
}

export interface V2TemplateChapterDef {
  readonly key: string;
  readonly title: string;
  readonly summary?: string;
  readonly quests: readonly V2TemplateQuestDef[];
  readonly looseScenes?: readonly V2TemplateSceneDef[];
}

export interface V2TemplateArcDef {
  readonly key: string;
  readonly title: string;
  readonly summary?: string;
  readonly chapters: readonly V2TemplateChapterDef[];
  readonly looseQuests?: readonly V2TemplateQuestDef[];
  readonly looseScenes?: readonly V2TemplateSceneDef[];
}

export interface V2NarrativeTemplate {
  readonly templateId: V2NarrativeTemplateId;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly structure: {
    readonly arcs: readonly V2TemplateArcDef[];
    readonly unassignedScenes?: readonly V2TemplateSceneDef[];
  };
}

export const BUILTIN_NARRATIVE_TEMPLATES: readonly V2NarrativeTemplate[] = [
  {
    templateId: "blank",
    name: "空白故事架构",
    description: "不预设任何章节与任务，从一张白纸开始构思剧情。",
    category: "基础",
    structure: {
      arcs: [],
      unassignedScenes: [
        {
          key: "intro_scene",
          title: "故事序章",
          summary: "故事的起点场景",
          isEntry: true,
          blocks: [
            { kind: "narration", text: "故事从这里开始……" },
          ],
        },
      ],
    },
  },
  {
    templateId: "three-act",
    name: "经典三幕式戏剧架构",
    description: "通用的开端-冲突-高潮三幕式叙事结构，适合中长篇互动故事与主线叙事。",
    category: "经典叙事",
    structure: {
      arcs: [
        {
          key: "act_1",
          title: "第一幕 · 建立与开端",
          summary: "介绍世界观与主角目标，触发关键激励事件，主角踏上旅途。",
          chapters: [
            {
              key: "ch_1",
              title: "第一章 · 日常与呼唤",
              summary: "展示主角的初始状态与被打破的平静生活。",
              quests: [
                {
                  key: "q_1",
                  title: "启程危机",
                  summary: "应对突发危机并确认核心目标。",
                  kind: "main",
                  scenes: [
                    {
                      key: "scene_1_1",
                      title: "平静的表象",
                      summary: "初始环境与人物登场",
                      isEntry: true,
                      blocks: [
                        { kind: "narration", text: "在一切变故发生之前，生活依然维持着往日的秩序。" },
                        { kind: "stage_direction", text: "光影渐渐拉开序幕。" },
                      ],
                      choices: [
                        { label: "调查异象", targetSceneKey: "scene_1_2" },
                      ],
                    },
                    {
                      key: "scene_1_2",
                      title: "命运的转折",
                      summary: "危机爆发与核心决定",
                      blocks: [
                        { kind: "narration", text: "不寻常的迹象打破了宁静，前方的道路已经改变。" },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          key: "act_2",
          title: "第二幕 · 冲突与发展",
          summary: "对抗阻碍、暗流涌动与中点转折，面临重大考验与分歧。",
          chapters: [
            {
              key: "ch_2",
              title: "第二章 · 迷局与对立",
              summary: "深入事件核心，矛盾全面激化。",
              quests: [
                {
                  key: "q_2",
                  title: "深层调查",
                  summary: "揭露关键真相与利益冲突。",
                  kind: "main",
                  scenes: [
                    {
                      key: "scene_2_1",
                      title: "暗流涌动",
                      summary: "发现关键线索与隐秘动机",
                      blocks: [
                        { kind: "narration", text: "收集到的线索逐渐拼凑出令人不安的事实。" },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          key: "act_3",
          title: "第三幕 · 高潮与结局",
          summary: "最终对决与抉择，结局收束与世界状态重构。",
          chapters: [
            {
              key: "ch_3",
              title: "第三章 · 决战与终局",
              summary: "矛盾迎来全面爆发与命运收束。",
              quests: [
                {
                  key: "q_3",
                  title: "破晓决断",
                  summary: "做出最终决定，走向属于你的结局。",
                  kind: "main",
                  scenes: [
                    {
                      key: "scene_3_1",
                      title: "最终交锋",
                      summary: "关键抉择与结局分支",
                      blocks: [
                        { kind: "narration", text: "所有的因果汇聚于此，未来的走向取决于此刻的决断。" },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    templateId: "rpg-main-quest",
    name: "RPG 主线任务架构",
    description: "标准角色扮演游戏主线章节组织，包含主线任务、前置情境与战斗对话场景。",
    category: "RPG",
    structure: {
      arcs: [
        {
          key: "arc_main",
          title: "主线篇章 · 王都风云",
          summary: "主线核心篇章，包含接受委托、追查真凶与大殿决战。",
          chapters: [
            {
              key: "ch_prologue",
              title: "序章 · 委托接受",
              summary: "在冒险者据点结识关键伙伴并接收主线任务。",
              quests: [
                {
                  key: "quest_accept",
                  title: "紧急召集令",
                  summary: "前往公会大厅与联络人接头。",
                  kind: "main",
                  scenes: [
                    {
                      key: "scene_guild_hall",
                      title: "公会大厅的召集",
                      summary: "接收任务简报",
                      isEntry: true,
                      blocks: [
                        { kind: "narration", text: "公会大厅内人声鼎沸，悬赏告示板前聚集着神色凝重的人群。" },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    templateId: "rpg-side-quest",
    name: "RPG 支线探索任务",
    description: "独立的支线剧情结构，用于角色个人剧情、世界探索与小故事分支。",
    category: "RPG",
    structure: {
      arcs: [
        {
          key: "arc_side",
          title: "支线篇 · 荒野传闻",
          summary: "探索城镇周边的离奇传闻，解锁隐藏角色好感度与背景设定。",
          chapters: [
            {
              key: "ch_side_rumor",
              title: "传闻调查",
              summary: "收集线索并拜访关键证人。",
              quests: [
                {
                  key: "quest_side_investigation",
                  title: "失落的信物",
                  summary: "帮助受委托人找回关键遗物。",
                  kind: "side",
                  scenes: [
                    {
                      key: "scene_side_intro",
                      title: "路边的求助者",
                      summary: "偶遇受困市民并触发支线",
                      isEntry: true,
                      blocks: [
                        { kind: "narration", text: "在旅途的岔路口，一位神色慌张的旅人向你招手求助。" },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    templateId: "visual-novel",
    name: "视觉小说 / Galgame 多分支架构",
    description: "日常篇转入各角色专属路线的经典文字冒险结构，注重台词与好感度分支。",
    category: "Galgame",
    structure: {
      arcs: [
        {
          key: "arc_common",
          title: "共通线 · 日常篇",
          summary: "共通日常篇章，玩家与各角色建立初期交集与好感度基础。",
          chapters: [
            {
              key: "ch_common_school",
              title: "第一周 · 初遇与日常",
              summary: "校园/据点日常，通过选项累积各角色好感度标记。",
              quests: [
                {
                  key: "q_common_events",
                  title: "日常放学后",
                  summary: "多向选择前往不同的活动场所。",
                  kind: "story",
                  scenes: [
                    {
                      key: "scene_school_hallway",
                      title: "走廊上的偶遇",
                      summary: "共通线起始场景",
                      isEntry: true,
                      blocks: [
                        { kind: "narration", text: "午后的阳光透过走廊的窗户洒在地面上。" },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
];

export function getV2NarrativeTemplate(templateId: V2NarrativeTemplateId): V2NarrativeTemplate {
  const template = BUILTIN_NARRATIVE_TEMPLATES.find((t) => t.templateId === templateId);
  if (!template) {
    throw new V2DomainError("INVALID_INPUT", `narrative template not found: ${templateId}`);
  }
  return template;
}

export function listV2NarrativeTemplates(): readonly V2NarrativeTemplate[] {
  return BUILTIN_NARRATIVE_TEMPLATES;
}
