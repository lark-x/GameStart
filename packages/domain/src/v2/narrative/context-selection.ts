import { createHash } from "node:crypto";

import type {
  V2NarrativeChapter,
  V2NarrativeQuest,
  V2NarrativeScene,
  V2SceneBlock,
  V2NarrativeReference,
  V2CanonLoreEntry,
} from "./index.ts";
import {
  buildV2NarrativeContextFingerprint,
  deriveV2ContextSourceRevision,
  type V2ContextSourceRevision,
  type V2NarrativeContextFingerprint,
} from "./context-fingerprint.ts";
import { renderSceneBlocksToPlainText } from "./scene-block.ts";

export type V2NarrativeGenerationTask =
  | "create_scene"
  | "continue_scene"
  | "rewrite_scene"
  | "expand_dialogue"
  | "generate_choices"
  | "create_quest_outline";

export interface V2NarrativeContextPromptSection {
  readonly title: string;
  readonly content: string;
  readonly tokenEstimate: number;
}

export interface V2NarrativeGenerationContextInput {
  readonly storyWorldId: string;
  readonly worldName: string;
  readonly worldSummary?: string;
  readonly worldRevision: number;
  readonly task: V2NarrativeGenerationTask;
  readonly targetSceneId?: string;
  readonly targetQuestId?: string;
  readonly prompt?: string;
  readonly tokenBudget?: number;

  readonly arcs: readonly { readonly arcId: string; readonly title: string; readonly summary?: string }[];
  readonly chapters: readonly V2NarrativeChapter[];
  readonly quests: readonly V2NarrativeQuest[];
  readonly scenes: readonly V2NarrativeScene[];
  readonly blocks: readonly V2SceneBlock[];
  readonly choices: readonly { readonly choiceId: string; readonly sourceSceneId: string; readonly targetSceneId?: string; readonly label: string; readonly gates?: readonly { readonly stateKey: string; readonly operator: string; readonly value: unknown }[]; readonly consequences?: readonly { readonly stateKey?: string; readonly operation: string; readonly value?: unknown }[] }[];
  readonly references: readonly V2NarrativeReference[];
  readonly characters: readonly { readonly characterId: string; readonly name: string; readonly summary?: string; readonly profile?: { readonly persona?: { readonly traits?: readonly string[]; readonly values?: readonly string[]; readonly taboos?: readonly string[] } } }[];
  readonly locations: readonly { readonly locationId: string; readonly name: string; readonly summary?: string }[];
  readonly loreEntries?: readonly V2CanonLoreEntry[];
  readonly facts?: readonly { readonly factId: string; readonly text: string }[];
  readonly rules?: readonly { readonly ruleId: string; readonly text: string }[];
  readonly timelineEvents?: readonly { readonly timelineEventId: string; readonly title: string; readonly summary?: string; readonly localDate?: string }[];
  readonly stateVariables?: readonly { readonly key: string; readonly valueType: string; readonly defaultValue: string | number | boolean }[];
}

export interface V2NarrativeGenerationContextResult {
  readonly contextHash: string;
  readonly fingerprint: V2NarrativeContextFingerprint;
  readonly sections: readonly V2NarrativeContextPromptSection[];
  readonly totalTokensEstimate: number;
  readonly selectedSources: readonly string[];
  readonly omittedSources: readonly string[];
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

export function buildTaskScopedNarrativeContext(
  input: V2NarrativeGenerationContextInput,
): V2NarrativeGenerationContextResult {
  const budget = input.tokenBudget && input.tokenBudget > 0 ? input.tokenBudget : 4096;

  // 1. Identify Target Hierarchy
  let targetScene: V2NarrativeScene | undefined = undefined;
  if (input.targetSceneId) {
    targetScene = input.scenes.find((s) => s.sceneId === input.targetSceneId);
  }

  let targetQuest: V2NarrativeQuest | undefined = undefined;
  const questId = input.targetQuestId || targetScene?.questId;
  if (questId) {
    targetQuest = input.quests.find((q) => q.questId === questId);
  }

  let targetChapter: V2NarrativeChapter | undefined = undefined;
  const chapterId = targetQuest?.chapterId || targetScene?.chapterId;
  if (chapterId) {
    targetChapter = input.chapters.find((c) => c.chapterId === chapterId);
  }

  let targetArc = undefined;
  const arcId = targetChapter?.arcId || targetQuest?.arcId || targetScene?.arcId;
  if (arcId) {
    targetArc = input.arcs.find((a) => a.arcId === arcId);
  }

  // 2. Identify Target Blocks & Neighbor Scenes
  const sceneBlocks = targetScene
    ? input.blocks.filter((b) => b.sceneId === targetScene!.sceneId).sort((a, b) => a.ordinal - b.ordinal)
    : [];

  const outChoices = targetScene
    ? input.choices.filter((c) => c.sourceSceneId === targetScene!.sceneId)
    : [];

  const neighborSceneIds = new Set<string>();
  if (targetScene) {
    for (const choice of outChoices) if (choice.targetSceneId) neighborSceneIds.add(choice.targetSceneId);
    for (const choice of input.choices) if (choice.targetSceneId === targetScene.sceneId) neighborSceneIds.add(choice.sourceSceneId);
  }
  const neighborScenes = input.scenes.filter((scene) => neighborSceneIds.has(scene.sceneId)).slice(0, 3);

  // 3. Identify Scene References (Location & Characters)
  const sceneRefs = targetScene
    ? input.references.filter((r) => r.sourceType === "scene" && r.sourceId === targetScene!.sceneId)
    : [];

  const participantCharIds = new Set<string>();
  for (const ref of sceneRefs) {
    if (ref.role === "participant" && ref.targetType === "character") {
      participantCharIds.add(ref.targetId);
    }
  }
  for (const b of sceneBlocks) {
    if (b.speakerCharacterId) {
      participantCharIds.add(b.speakerCharacterId);
    }
  }

  const charNameMap: Record<string, string> = {};
  for (const c of input.characters) {
    charNameMap[c.characterId] = c.name;
  }

  const relevantCharacters = input.characters.filter((c) => participantCharIds.has(c.characterId));
  const locRef = sceneRefs.find((r) => r.role === "location" && r.targetType === "location");
  const mainLocation = locRef ? input.locations.find((l) => l.locationId === locRef.targetId) : undefined;

  // 5. Build Structured Sections
  const sections: V2NarrativeContextPromptSection[] = [];
  const selectedSources: string[] = [];
  const omittedSources: string[] = [];

  // Section: World Setting (High Priority)
  const worldContent = `# 世界正典设定：${input.worldName}\n${input.worldSummary ?? "（暂无世界摘要）"}`;
  sections.push({
    title: "世界设定",
    content: worldContent,
    tokenEstimate: estimateTokens(worldContent),
  });
  selectedSources.push(`world:${input.storyWorldId}`);

  // Section: Hierarchy Path (High Priority)
  const hierarchyLines: string[] = [];
  if (targetArc) hierarchyLines.push(`- **篇章/大纲幕**：${targetArc.title}${targetArc.summary ? `（${targetArc.summary}）` : ""}`);
  if (targetChapter) hierarchyLines.push(`- **章节**：${targetChapter.title}${targetChapter.summary ? `（${targetChapter.summary}）` : ""}`);
  if (hierarchyLines.length > 0) {
    const hierContent = `## 剧情所属层级大纲：\n${hierarchyLines.join("\n")}`;
    sections.push({
      title: "大纲层级",
      content: hierContent,
      tokenEstimate: estimateTokens(hierContent),
    });
    if (targetArc) selectedSources.push(`arc:${targetArc.arcId}`);
    if (targetChapter) selectedSources.push(`chapter:${targetChapter.chapterId}`);
  }

  // Section: Target Quest (High Priority)
  if (targetQuest) {
    const questContent = `## 当前任务：${targetQuest.title} [${targetQuest.kind}]\n${targetQuest.summary ?? "（暂无任务描述）"}`;
    sections.push({
      title: "当前任务",
      content: questContent,
      tokenEstimate: estimateTokens(questContent),
    });
    selectedSources.push(`quest:${targetQuest.questId}`);
  }

  // Section: Location (Medium-High Priority)
  if (mainLocation) {
    const locContent = `### 场景主发生地点：${mainLocation.name}\n${mainLocation.summary ?? "（暂无地点描述）"}`;
    sections.push({
      title: "发生地点",
      content: locContent,
      tokenEstimate: estimateTokens(locContent),
    });
    selectedSources.push(`location:${mainLocation.locationId}`);
  }

  // Section: Characters (High Priority)
  if (relevantCharacters.length > 0) {
    const charBlocks = relevantCharacters.map((c) => {
      const traits = c.profile?.persona?.traits?.join("、");
      const values = c.profile?.persona?.values?.join("、");
      const taboos = c.profile?.persona?.taboos?.join("、");
      return `- **${c.name}**：${c.summary ?? "（暂无简介）"}${traits ? `\n  - 性格特征：${traits}` : ""}${values ? `\n  - 核心价值观：${values}` : ""}${taboos ? `\n  - 言行禁忌：${taboos}` : ""}`;
    });
    const charContent = `### 登场角色正典档案：\n${charBlocks.join("\n")}`;
    sections.push({
      title: "登场角色",
      content: charContent,
      tokenEstimate: estimateTokens(charContent),
    });
    for (const c of relevantCharacters) {
      selectedSources.push(`character:${c.characterId}`);
    }
  }

  // Section: Current Scene Content (High Priority)
  if (targetScene) {
    const renderedBody = sceneBlocks.length > 0
      ? renderSceneBlocksToPlainText(sceneBlocks, charNameMap)
      : targetScene.body ?? "（空白场景内容）";
    const sceneContent = `### 当前场景剧本【${targetScene.title}】：\n${renderedBody}`;
    sections.push({
      title: "当前场景内容",
      content: sceneContent,
      tokenEstimate: estimateTokens(sceneContent),
    });
    selectedSources.push(`scene:${targetScene.sceneId}`);
    for (const block of sceneBlocks) selectedSources.push(`block:${block.blockId}`);
    for (const reference of sceneRefs) selectedSources.push(`reference:${reference.referenceId}`);
  }

  // Section: Outgoing Choices & Branching (Medium Priority)
  if (outChoices.length > 0) {
    const choiceLines = outChoices.map((c) => `- 选项【${c.label}】${c.targetSceneId ? ` $\to$ 跳转场景 [${c.targetSceneId}]` : " $\to$ （未设定目标）"}`);
    const choicesContent = `### 场景分支选项：\n${choiceLines.join("\n")}`;
    sections.push({
      title: "分支选项",
      content: choicesContent,
      tokenEstimate: estimateTokens(choicesContent),
    });
    for (const choice of outChoices) selectedSources.push(`choice:${choice.choiceId}`);
  }

  // Section: Neighboring Scene Continuity (High Priority)
  if (neighborScenes.length > 0) {
    const neighborContent = neighborScenes.map((scene) => {
      const blocks = input.blocks.filter((block) => block.sceneId === scene.sceneId).sort((left, right) => left.ordinal - right.ordinal);
      const body = blocks.length > 0 ? renderSceneBlocksToPlainText(blocks, charNameMap) : scene.body ?? "（空白场景内容）";
      return `### 相邻场景【${scene.title}】\n${body}`;
    }).join("\n\n");
    sections.push({ title: "相邻场景", content: neighborContent, tokenEstimate: estimateTokens(neighborContent) });
    for (const scene of neighborScenes) {
      selectedSources.push(`scene:${scene.sceneId}`);
      for (const block of input.blocks.filter((candidate) => candidate.sceneId === scene.sceneId)) selectedSources.push(`block:${block.blockId}`);
    }
  }
  // Section: Lore & Knowledge (Medium Priority - Subject to token budget pruning)
  const loreEntries = input.loreEntries ?? [];
  if (loreEntries.length > 0) {
    const loreLines = loreEntries.slice(0, 3).map((l) => `- **${l.name}** [${l.type}]：${l.summary ?? l.body ?? ""}`);
    const loreContent = `### 关联世界观词条（Lore）：\n${loreLines.join("\n")}`;
    const loreEstimate = estimateTokens(loreContent);
    const currentTotal = sections.reduce((sum, s) => sum + s.tokenEstimate, 0);

    if (currentTotal + loreEstimate < budget * 0.85) {
      sections.push({
        title: "世界观词条",
        content: loreContent,
        tokenEstimate: loreEstimate,
      });
      for (const l of loreEntries.slice(0, 3)) {
        selectedSources.push(`lore:${l.loreEntryId}`);
      }
    } else {
      for (const l of loreEntries) {
        omittedSources.push(`lore:${l.loreEntryId}`);
      }
    }
  }

  // Section: Facts & Invariant Rules
  const facts = input.facts ?? [];
  const rules = input.rules ?? [];
  if (facts.length > 0 || rules.length > 0) {
    const ruleItems = rules.map((r) => `- [强制规则] ${r.text}`);
    const factItems = facts.map((f) => `- [已确立事实] ${f.text}`);
    const factContent = `### 正典事实与强制规则：\n${[...ruleItems, ...factItems].join("\n")}`;
    const factEstimate = estimateTokens(factContent);
    const currentTotal = sections.reduce((sum, s) => sum + s.tokenEstimate, 0);

    if (currentTotal + factEstimate < budget * 0.9) {
      sections.push({
        title: "正典规则与事实",
        content: factContent,
        tokenEstimate: factEstimate,
      });
      for (const r of rules) selectedSources.push(`rule:${r.ruleId}`);
      for (const f of facts) selectedSources.push(`fact:${f.factId}`);
    } else {
      for (const r of rules) omittedSources.push(`rule:${r.ruleId}`);
      for (const f of facts) omittedSources.push(`fact:${f.factId}`);
    }
  }

  // Section: Timeline (Medium Priority)
  const timelineEvents = input.timelineEvents ?? [];
  if (timelineEvents.length > 0) {
    const timelineContent = `### 时间线\n${timelineEvents.slice(0, 10).map((event) => `- ${event.localDate ? `[${event.localDate}] ` : ""}${event.title}${event.summary ? `：${event.summary}` : ""}`).join("\n")}`;
    const currentTotal = sections.reduce((sum, section) => sum + section.tokenEstimate, 0);
    if (currentTotal + estimateTokens(timelineContent) < budget * 0.95) {
      sections.push({ title: "时间线", content: timelineContent, tokenEstimate: estimateTokens(timelineContent) });
      for (const event of timelineEvents.slice(0, 10)) selectedSources.push(`timeline_event:${event.timelineEventId}`);
    } else {
      for (const event of timelineEvents) omittedSources.push(`timeline_event:${event.timelineEventId}`);
    }
  }

  // Section: Typed State Schema (Medium Priority)
  const stateVariables = input.stateVariables ?? [];
  if (stateVariables.length > 0) {
    const stateContent = `### 剧情状态变量\n${stateVariables.map((state) => `- ${state.key} (${state.valueType})，默认值：${String(state.defaultValue)}`).join("\n")}`;
    sections.push({ title: "剧情状态", content: stateContent, tokenEstimate: estimateTokens(stateContent) });
    for (const state of stateVariables) selectedSources.push(`state:${state.key}`);
  }
  // Section: Author Instruction & Task Directive (Highest Priority)
  const taskDescriptions: Record<V2NarrativeGenerationTask, string> = {
    create_scene: "创建新的剧情场景，请保持文风与正典角色口吻一致并输出结构化剧本内容。",
    continue_scene: "续写当前场景后续对话与动作，推进情节发展。",
    rewrite_scene: "根据作者指令重写当前场景内容，增强戏剧冲突或修正设定。",
    expand_dialogue: "扩展角色的对白与肢体描写，丰富角色互动细节。",
    generate_choices: "为当前场景设计有意义的分支选项与抉择。",
    create_quest_outline: "为当前任务构建多幕场景大纲与主支线节奏。",
  };

  const instructionContent = `### 创作任务与作者指令：\n- **当前任务类型**：${taskDescriptions[input.task] || input.task}\n- **作者额外指令**：${input.prompt ?? "请依据上下文自然展开"}`;
  sections.push({
    title: "创作指令",
    content: instructionContent,
    tokenEstimate: estimateTokens(instructionContent),
  });

  const sourceEntities = new Map<string, unknown>();
  sourceEntities.set(`world:${input.storyWorldId}`, { name: input.worldName, summary: input.worldSummary });
  if (targetArc) sourceEntities.set(`arc:${targetArc.arcId}`, targetArc);
  if (targetChapter) sourceEntities.set(`chapter:${targetChapter.chapterId}`, targetChapter);
  if (targetQuest) sourceEntities.set(`quest:${targetQuest.questId}`, targetQuest);
  if (targetScene) sourceEntities.set(`scene:${targetScene.sceneId}`, { scene: targetScene, blocks: sceneBlocks });
  for (const scene of neighborScenes) sourceEntities.set(`scene:${scene.sceneId}`, { scene, blocks: input.blocks.filter((block) => block.sceneId === scene.sceneId) });
  for (const character of relevantCharacters) sourceEntities.set(`character:${character.characterId}`, character);
  if (mainLocation) sourceEntities.set(`location:${mainLocation.locationId}`, mainLocation);
  for (const lore of loreEntries) sourceEntities.set(`lore:${lore.loreEntryId}`, lore);
  for (const fact of facts) sourceEntities.set(`fact:${fact.factId}`, fact);
  for (const rule of rules) sourceEntities.set(`rule:${rule.ruleId}`, rule);
  for (const block of sceneBlocks) sourceEntities.set(`block:${block.blockId}`, block);
  for (const reference of sceneRefs) sourceEntities.set(`reference:${reference.referenceId}`, reference);
  for (const choice of input.choices) sourceEntities.set(`choice:${choice.choiceId}`, choice);
  for (const event of timelineEvents) sourceEntities.set(`timeline_event:${event.timelineEventId}`, event);
  for (const state of stateVariables) sourceEntities.set(`state:${state.key}`, state);
  const rawSources: V2ContextSourceRevision[] = [...new Set(selectedSources)].flatMap((key) => {
    const value = sourceEntities.get(key);
    if (value === undefined) return [];
    const [kind, id] = key.split(":", 2);
    if (kind === undefined || id === undefined) return [];
    return [{ kind, id, revision: deriveV2ContextSourceRevision(value) }];
  });

  const totalTokensEstimate = sections.reduce((sum, s) => sum + s.tokenEstimate, 0);
  const fingerprint = buildV2NarrativeContextFingerprint({
    storyWorldId: input.storyWorldId,
    worldRevision: input.worldRevision,
    sources: rawSources,
  });

  const generationContextHash = `sha256:${createHash("sha256").update(JSON.stringify({
    storyWorldId: input.storyWorldId,
    task: input.task,
    prompt: input.prompt ?? "",
    tokenBudget: budget,
    sourceFingerprint: fingerprint.hash,
    sections: sections.map((section) => ({ title: section.title, content: section.content })),
  })).digest("hex")}`;

  return {
    contextHash: generationContextHash,
    fingerprint,
    sections,
    totalTokensEstimate,
    selectedSources,
    omittedSources,
  };
}
