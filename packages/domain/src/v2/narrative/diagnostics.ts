import type { V2NarrativeChapter } from "./chapter.ts";
import type { V2NarrativeQuest } from "./quest.ts";
import type { V2NarrativeScene } from "./scene.ts";
import type { V2SceneBlock } from "./scene-block.ts";
import type { V2NarrativeReference } from "./reference.ts";
import type { V2CanonLoreEntry } from "./lore.ts";

export type V2NarrativeDiagnosticSeverity = "error" | "warning" | "info";

export type V2NarrativeDiagnosticCode =
  | "MISSING_SCENE_REFERENCE_TARGET"
  | "MISSING_PARTICIPANT_CHARACTER"
  | "MISSING_LOCATION"
  | "INVALID_BLOCK_SPEAKER"
  | "DUPLICATE_REFERENCE"
  | "SCENE_BLOCK_ORDER_INVALID"
  | "QUEST_SCENE_CROSS_WORLD"
  | "CHAPTER_ARC_MISMATCH"
  | "QUEST_CHAPTER_MISMATCH"
  | "QUEST_ARC_MISMATCH"
  | "SCENE_ARC_MISMATCH"
  | "SCENE_CHAPTER_MISMATCH"
  | "SCENE_QUEST_MISMATCH"
  | "MISSING_REFERENCE_SOURCE"
  | "UNREACHABLE_SCENE"
  | "MISSING_ENTRY_SCENE"
  | "MULTIPLE_ENTRY_SCENES"
  | "DANGLING_CHOICE"
  | "UNREFERENCED_SCENE"
  | "EMPTY_QUEST"
  | "EMPTY_CHAPTER"
  | "TIMELINE_ORDER_WARNING"
  | "MENTION_WITHOUT_REFERENCE"
  | "REFERENCE_NOT_MENTIONED"
  | "ORPHAN_LORE"
  | "STATE_GATE_UNKNOWN_VARIABLE"
  | "STATE_CONSEQUENCE_TYPE_MISMATCH";

export interface V2NarrativeDiagnostic {
  readonly code: V2NarrativeDiagnosticCode;
  readonly severity: V2NarrativeDiagnosticSeverity;
  readonly message: string;
  readonly entityType: "scene" | "choice" | "arc" | "chapter" | "quest" | "block" | "reference" | "timeline" | "lore" | "state";
  readonly entityId: string;
  readonly targetId?: string;
}

export interface V2NarrativeDiagnosticsReport {
  readonly valid: boolean;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly diagnostics: readonly V2NarrativeDiagnostic[];
}

export interface V2NarrativeDiagnosticsContext {
  readonly storyWorldId: string;
  readonly arcs: readonly { readonly arcId: string; readonly title: string }[];
  readonly chapters: readonly V2NarrativeChapter[];
  readonly quests: readonly V2NarrativeQuest[];
  readonly scenes: readonly V2NarrativeScene[];
  readonly blocks: readonly V2SceneBlock[];
  readonly choices: readonly {
    readonly choiceId: string;
    readonly sourceSceneId: string;
    readonly targetSceneId?: string;
    readonly label: string;
    readonly gates?: readonly { readonly stateKey: string; readonly operator: string; readonly value: unknown }[];
    readonly consequences?: readonly { readonly stateKey?: string; readonly operation: string; readonly value?: unknown }[];
  }[];
  readonly references: readonly V2NarrativeReference[];
  readonly characters: readonly { readonly characterId: string; readonly name: string }[];
  readonly locations: readonly { readonly locationId: string; readonly name: string }[];
  readonly facts?: readonly { readonly factId: string; readonly text: string }[];
  readonly rules?: readonly { readonly ruleId: string; readonly text: string }[];
  readonly timelineEvents?: readonly { readonly timelineEventId: string; readonly title: string; readonly sortKey?: number }[];
  readonly loreEntries?: readonly V2CanonLoreEntry[];
  readonly stateVariables?: readonly { readonly key: string; readonly valueType: string }[];
}

export function runNarrativeDiagnostics(context: V2NarrativeDiagnosticsContext): V2NarrativeDiagnosticsReport {
  const diagnostics: V2NarrativeDiagnostic[] = [];

  const arcIdSet = new Set(context.arcs.map((a) => a.arcId));
  const chapterIdSet = new Set(context.chapters.map((c) => c.chapterId));
  const questIdSet = new Set(context.quests.map((q) => q.questId));  const chapterById = new Map(context.chapters.map((chapter) => [chapter.chapterId, chapter]));
  const questById = new Map(context.quests.map((quest) => [quest.questId, quest]));
  const sceneIdSet = new Set(context.scenes.map((s) => s.sceneId));
  const characterIdSet = new Set(context.characters.map((c) => c.characterId));
  const locationIdSet = new Set(context.locations.map((l) => l.locationId));
  const factIdSet = new Set((context.facts ?? []).map((f) => f.factId));
  const ruleIdSet = new Set((context.rules ?? []).map((r) => r.ruleId));
  const timelineIdSet = new Set((context.timelineEvents ?? []).map((t) => t.timelineEventId));
  const loreIdSet = new Set((context.loreEntries ?? []).map((l) => l.loreEntryId));
  const stateVarMap = new Map((context.stateVariables ?? []).map((v) => [v.key, v.valueType]));

  // 1. Chapter validation
  for (const chapter of context.chapters) {
    if (!arcIdSet.has(chapter.arcId)) {
      diagnostics.push({
        code: "CHAPTER_ARC_MISMATCH",
        severity: "error",
        message: `Chapter "${chapter.title}" references non-existent Arc "${chapter.arcId}"`,
        entityType: "chapter",
        entityId: chapter.chapterId,
        targetId: chapter.arcId,
      });
    }
  }

  // 2. Quest validation
  for (const quest of context.quests) {
    if (quest.chapterId && !chapterIdSet.has(quest.chapterId)) {
      diagnostics.push({
        code: "QUEST_CHAPTER_MISMATCH",
        severity: "error",
        message: `Quest "${quest.title}" references non-existent Chapter "${quest.chapterId}"`,
        entityType: "quest",
        entityId: quest.questId,
        targetId: quest.chapterId,
      });
    }
    if (quest.chapterId) {
      const parentChapter = chapterById.get(quest.chapterId);
      if (parentChapter && parentChapter.arcId !== quest.arcId) {
        diagnostics.push({ code: "QUEST_ARC_MISMATCH", severity: "error", message: `Quest "${quest.title}" arcId does not match parent Chapter`, entityType: "quest", entityId: quest.questId, targetId: quest.chapterId });
      }
    }    if (quest.arcId && !arcIdSet.has(quest.arcId)) {
      diagnostics.push({
        code: "QUEST_SCENE_CROSS_WORLD",
        severity: "error",
        message: `Quest "${quest.title}" references non-existent Arc "${quest.arcId}"`,
        entityType: "quest",
        entityId: quest.questId,
        targetId: quest.arcId,
      });
    }
  }

  // 3. Scene validation & Hierarchy
  let entryCount = 0;
  for (const scene of context.scenes) {
    if (scene.isEntry) entryCount++;
    if (scene.arcId && !arcIdSet.has(scene.arcId)) {
      diagnostics.push({
        code: "QUEST_SCENE_CROSS_WORLD",
        severity: "error",
        message: `Scene "${scene.title}" references non-existent Arc "${scene.arcId}"`,
        entityType: "scene",
        entityId: scene.sceneId,
        targetId: scene.arcId,
      });
    }
    if (scene.chapterId && !chapterIdSet.has(scene.chapterId)) {
      diagnostics.push({
        code: "CHAPTER_ARC_MISMATCH",
        severity: "error",
        message: `Scene "${scene.title}" references non-existent Chapter "${scene.chapterId}"`,
        entityType: "scene",
        entityId: scene.sceneId,
        targetId: scene.chapterId,
      });
    }
    if (scene.questId && !questIdSet.has(scene.questId)) {
      diagnostics.push({
        code: "QUEST_CHAPTER_MISMATCH",
        severity: "error",
        message: `Scene "${scene.title}" references non-existent Quest "${scene.questId}"`,
        entityType: "scene",
        entityId: scene.sceneId,
        targetId: scene.questId,
      });
    }
  }

  for (const scene of context.scenes) {
    const chapter = scene.chapterId ? chapterById.get(scene.chapterId) : undefined;
    const quest = scene.questId ? questById.get(scene.questId) : undefined;
    if (chapter && scene.arcId && chapter.arcId !== scene.arcId) diagnostics.push({ code: "SCENE_ARC_MISMATCH", severity: "error", message: `Scene "${scene.title}" arcId does not match Chapter`, entityType: "scene", entityId: scene.sceneId, targetId: chapter.chapterId });
    if (quest && scene.arcId && quest.arcId !== scene.arcId) diagnostics.push({ code: "SCENE_ARC_MISMATCH", severity: "error", message: `Scene "${scene.title}" arcId does not match Quest`, entityType: "scene", entityId: scene.sceneId, targetId: quest.questId });
    if (quest && scene.chapterId && quest.chapterId !== scene.chapterId) diagnostics.push({ code: "SCENE_CHAPTER_MISMATCH", severity: "error", message: `Scene "${scene.title}" chapterId does not match Quest`, entityType: "scene", entityId: scene.sceneId, targetId: quest.questId });
  }
  const firstScene = context.scenes[0];
  if (firstScene !== undefined && entryCount === 0) {
    diagnostics.push({
      code: "MISSING_ENTRY_SCENE",
      severity: "error",
      message: "No entry scene is designated for this story world",
      entityType: "scene",
      entityId: firstScene.sceneId,
    });
  }

  // 4. Scene blocks validation
  const blocksByScene = new Map<string, V2SceneBlock[]>();
  for (const block of context.blocks) {
    const list = blocksByScene.get(block.sceneId) ?? [];
    list.push(block);
    blocksByScene.set(block.sceneId, list);

    if (block.kind === "dialogue" && !block.speakerCharacterId) {
      diagnostics.push({ code: "INVALID_BLOCK_SPEAKER", severity: "error", message: "Dialogue blocks must declare a speaker character", entityType: "block", entityId: block.blockId });
    } else if (block.kind === "dialogue" && block.speakerCharacterId) {
      if (!characterIdSet.has(block.speakerCharacterId)) {
        diagnostics.push({
          code: "INVALID_BLOCK_SPEAKER",
          severity: "error",
          message: `Block dialogue references non-existent speaker character "${block.speakerCharacterId}"`,
          entityType: "block",
          entityId: block.blockId,
          targetId: block.speakerCharacterId,
        });
      }
    }
  }

  for (const [sceneId, sceneBlocks] of blocksByScene.entries()) {
    const ordinals = new Set<number>();
    for (const b of sceneBlocks) {
      if (ordinals.has(b.ordinal)) {
        diagnostics.push({
          code: "SCENE_BLOCK_ORDER_INVALID",
          severity: "error",
          message: `Duplicate ordinal ${b.ordinal} found in scene "${sceneId}"`,
          entityType: "block",
          entityId: b.blockId,
        });
      }
      ordinals.add(b.ordinal);
    }
  }

  // 5. References validation
  const seenRefs = new Set<string>();
  const referencedLoreSet = new Set<string>();

  for (const ref of context.references) {
    const refKey = `${ref.sourceType}:${ref.sourceId}:${ref.targetType}:${ref.targetId}:${ref.role}`;
    if (seenRefs.has(refKey)) {
      diagnostics.push({
        code: "DUPLICATE_REFERENCE",
        severity: "error",
        message: `Duplicate reference from ${ref.sourceType} ${ref.sourceId} to ${ref.targetType} ${ref.targetId} with role ${ref.role}`,
        entityType: "reference",
        entityId: ref.referenceId,
      });
    }
    seenRefs.add(refKey);

    const sourceExists = ref.sourceType === "arc" ? arcIdSet.has(ref.sourceId)
      : ref.sourceType === "chapter" ? chapterIdSet.has(ref.sourceId)
      : ref.sourceType === "quest" ? questIdSet.has(ref.sourceId)
      : ref.sourceType === "scene" ? sceneIdSet.has(ref.sourceId)
      : ref.sourceType === "scene_block" ? context.blocks.some((block) => block.blockId === ref.sourceId)
      : false;
    if (!sourceExists) diagnostics.push({ code: "MISSING_REFERENCE_SOURCE", severity: "error", message: `Reference source ${ref.sourceType} "${ref.sourceId}" does not exist`, entityType: "reference", entityId: ref.referenceId, targetId: ref.sourceId });
    let targetExists = false;
    if (ref.targetType === "character") targetExists = characterIdSet.has(ref.targetId);
    else if (ref.targetType === "location") targetExists = locationIdSet.has(ref.targetId);
    else if (ref.targetType === "fact") targetExists = factIdSet.has(ref.targetId);
    else if (ref.targetType === "rule") targetExists = ruleIdSet.has(ref.targetId);
    else if (ref.targetType === "timeline_event") targetExists = timelineIdSet.has(ref.targetId);
    else if (ref.targetType === "lore") {
      targetExists = loreIdSet.has(ref.targetId);
      if (targetExists) referencedLoreSet.add(ref.targetId);
    }

    if (!targetExists) {
      const code = ref.role === "participant"
        ? "MISSING_PARTICIPANT_CHARACTER"
        : ref.role === "location"
          ? "MISSING_LOCATION"
          : "MISSING_SCENE_REFERENCE_TARGET";
      diagnostics.push({
        code,
        severity: "error",
        message: `Reference targets non-existent ${ref.targetType} "${ref.targetId}"`,
        entityType: "reference",
        entityId: ref.referenceId,
        targetId: ref.targetId,
      });
    }
  }

  // 6. Choices & Reachability
  const targetSceneIds = new Set<string>();
  for (const choice of context.choices) {
    if (choice.targetSceneId) {
      if (!sceneIdSet.has(choice.targetSceneId)) {
        diagnostics.push({
          code: "DANGLING_CHOICE",
          severity: "error",
          message: `Choice "${choice.label}" targets non-existent scene "${choice.targetSceneId}"`,
          entityType: "choice",
          entityId: choice.choiceId,
          targetId: choice.targetSceneId,
        });
      } else {
        targetSceneIds.add(choice.targetSceneId);
      }
    }

    // State variable gate/consequence check
    if (choice.gates) {
      for (const gate of choice.gates) {
        if (!stateVarMap.has(gate.stateKey)) {
          diagnostics.push({
            code: "STATE_GATE_UNKNOWN_VARIABLE",
            severity: "warning",
            message: `Choice gate references unknown state variable "${gate.stateKey}"`,
            entityType: "choice",
            entityId: choice.choiceId,
            targetId: gate.stateKey,
          });
        }
      }
    }
  }

  // Reachability graph search
  if (context.scenes.length > 0) {
    const reachable = new Set<string>();
    const queue: string[] = context.scenes.filter((s) => s.isEntry).map((s) => s.sceneId);
    for (const entryId of queue) reachable.add(entryId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const choice of context.choices) {
        if (choice.sourceSceneId === current && choice.targetSceneId) {
          if (!reachable.has(choice.targetSceneId) && sceneIdSet.has(choice.targetSceneId)) {
            reachable.add(choice.targetSceneId);
            queue.push(choice.targetSceneId);
          }
        }
      }
    }

    for (const scene of context.scenes) {
      if (!reachable.has(scene.sceneId)) {
        diagnostics.push({
          code: "UNREACHABLE_SCENE",
          severity: "warning",
          message: `Scene "${scene.title}" (${scene.sceneId}) is unreachable from any entry scene`,
          entityType: "scene",
          entityId: scene.sceneId,
        });
      }
    }
  }

  // 7. P2: Orphan Lore check
  for (const lore of context.loreEntries ?? []) {
    if (!referencedLoreSet.has(lore.loreEntryId)) {
      diagnostics.push({
        code: "ORPHAN_LORE",
        severity: "info",
        message: `Lore entry "${lore.name}" is not referenced by any scene`,
        entityType: "lore",
        entityId: lore.loreEntryId,
      });
    }
  }

  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.filter((d) => d.severity === "warning").length;
  const infoCount = diagnostics.filter((d) => d.severity === "info").length;

  return {
    valid: errorCount === 0,
    errorCount,
    warningCount,
    infoCount,
    diagnostics,
  };
}
