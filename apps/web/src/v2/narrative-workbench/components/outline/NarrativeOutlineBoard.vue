<script setup lang="ts">
import { computed } from "vue";
import {
  Layers,
  Folder,
  BookOpen,
  FileText,
  Plus,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
} from "@lucide/vue";
import { useNarrativeOutlineStore } from "../../../story/stores/useNarrativeOutlineStore.ts";
import { useNarrativeDiagnosticsStore } from "../../../story/stores/useNarrativeDiagnosticsStore.ts";
import type {
  V2ArcId,
  V2IdempotencyKey,
  V2NarrativeOutlineScene,
  V2Revision,
} from "@living-network/contracts/v2";

const props = defineProps<{
  storyWorldId: string;
  selectedSceneId: string | null;
}>();

const emit = defineEmits<{
  selectScene: [sceneId: string];
  openScript: [sceneId: string];
  createScene: [payload: { arcId?: string; chapterId?: string; questId?: string }];
}>();

const outlineStore = useNarrativeOutlineStore();
const diagStore = useNarrativeDiagnosticsStore();

function getSceneDiagnostics(sceneId: string) {
  const issues = diagStore.issuesBySceneId[sceneId] ?? [];
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return { issues, errors, warnings, hasError: errors.length > 0, hasWarning: warnings.length > 0 };
}

function handleSceneClick(sceneId: string): void {
  emit("selectScene", sceneId);
}

function handleSceneDoubleClick(sceneId: string): void {
  emit("openScript", sceneId);
}

function handleAddChapter(arcId: string): void {
  const title = prompt("请输入新章节名称：", "新章节");
  if (!title) return;
  outlineStore.createChapter(props.storyWorldId, {
    arcId: arcId as V2ArcId,
    title,
    expectedRevision: 1 as V2Revision,
    idempotencyKey: `ch_create_${Date.now()}` as V2IdempotencyKey,
  });
}

function handleAddQuest(arcId?: string, chapterId?: string): void {
  const title = prompt("请输入新任务名称：", "新任务");
  if (!title) return;
  outlineStore.createQuest(props.storyWorldId, {
    ...(arcId ? { arcId: arcId as V2ArcId } : {}),
    ...(chapterId ? { chapterId } : {}),
    title,
    kind: "main",
    expectedRevision: 1 as V2Revision,
    idempotencyKey: `q_create_${Date.now()}` as V2IdempotencyKey,
  });
}

function handleAddScene(arcId?: string, chapterId?: string, questId?: string): void {
  emit("createScene", {
    ...(arcId ? { arcId } : {}),
    ...(chapterId ? { chapterId } : {}),
    ...(questId ? { questId } : {}),
  });
}

const stats = computed(() => {
  if (!outlineStore.outline) return { arcs: 0, chapters: 0, quests: 0, scenes: 0 };
  let chapters = 0;
  let quests = 0;
  for (const arc of outlineStore.outline.arcs) {
    chapters += arc.chapters.length;
    for (const ch of arc.chapters) {
      quests += ch.quests.length;
    }
    quests += arc.looseQuests.length;
  }
  return {
    arcs: outlineStore.outline.arcs.length,
    chapters,
    quests,
    scenes: outlineStore.allScenes.length,
  };
});
</script>

<template>
  <div class="h-full flex flex-col space-y-6 select-none">
    <!-- Outline Stats Summary Banner -->
    <div class="p-4 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm flex items-center justify-between">
      <div>
        <h2 class="text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
          <Layers class="h-5 w-5 text-amber-500" />
          故事全局大纲全景 (Story Outline Overview)
        </h2>
        <p class="text-xs text-stone-500 mt-0.5">以故事篇章 (Arc)、章节 (Chapter) 和任务 (Quest) 组织的全局情节脉络。双击场景卡片直接进入剧本编辑器。</p>
      </div>

      <div class="flex items-center gap-4 text-xs">
        <div class="text-center px-3 py-1.5 bg-stone-50 dark:bg-stone-800/80 rounded-lg border border-stone-200 dark:border-stone-700">
          <span class="block text-[10px] text-stone-400 font-medium">篇章 (Arcs)</span>
          <span class="font-bold text-stone-800 dark:text-stone-200 text-sm">{{ stats.arcs }}</span>
        </div>
        <div class="text-center px-3 py-1.5 bg-stone-50 dark:bg-stone-800/80 rounded-lg border border-stone-200 dark:border-stone-700">
          <span class="block text-[10px] text-stone-400 font-medium">章节 (Chapters)</span>
          <span class="font-bold text-stone-800 dark:text-stone-200 text-sm">{{ stats.chapters }}</span>
        </div>
        <div class="text-center px-3 py-1.5 bg-stone-50 dark:bg-stone-800/80 rounded-lg border border-stone-200 dark:border-stone-700">
          <span class="block text-[10px] text-stone-400 font-medium">任务 (Quests)</span>
          <span class="font-bold text-stone-800 dark:text-stone-200 text-sm">{{ stats.quests }}</span>
        </div>
        <div class="text-center px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-900/50">
          <span class="block text-[10px] text-amber-600 dark:text-amber-400 font-medium">总场景 (Scenes)</span>
          <span class="font-bold text-amber-700 dark:text-amber-300 text-sm">{{ stats.scenes }}</span>
        </div>
      </div>
    </div>

    <!-- Main Arc Boards -->
    <template v-if="outlineStore.outline && outlineStore.outline.arcs.length > 0">
      <div v-for="arc in outlineStore.outline.arcs" :key="arc.arcId" class="p-5 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm space-y-4">
        <!-- Arc Header -->
        <div class="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60">
                篇章 {{ arc.act ?? '主线' }}
              </span>
              <h3 class="text-sm font-bold text-stone-900 dark:text-stone-100">{{ arc.title }}</h3>
              <span class="text-xs text-stone-400 font-mono">({{ arc.arcId }})</span>
            </div>
            <p v-if="arc.summary" class="text-xs text-stone-500 leading-relaxed">{{ arc.summary }}</p>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              class="px-2.5 py-1 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 flex items-center gap-1 transition-colors"
              @click="handleAddChapter(arc.arcId)"
            >
              <Plus class="h-3.5 w-3.5" />
              <span>新增章节</span>
            </button>
          </div>
        </div>

        <!-- Chapters List inside Arc -->
        <div class="space-y-4">
          <div
            v-for="ch in arc.chapters"
            :key="ch.chapterId"
            class="p-4 bg-stone-50/60 dark:bg-stone-950/40 rounded-lg border border-stone-200/80 dark:border-stone-800 space-y-3"
          >
            <!-- Chapter Title -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Folder class="h-4 w-4 text-sky-500 shrink-0" />
                <h4 class="text-xs font-bold text-stone-800 dark:text-stone-200">{{ ch.title }}</h4>
                <span class="text-[10px] text-stone-400 font-mono">({{ ch.chapterId }})</span>
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="px-2 py-0.5 text-[11px] font-medium rounded border border-stone-200 dark:border-stone-700 hover:bg-white dark:hover:bg-stone-800 text-stone-600 dark:text-stone-400 flex items-center gap-1 transition-colors"
                  @click="handleAddQuest(arc.arcId, ch.chapterId)"
                >
                  <Plus class="h-3 w-3" />
                  <span>新增任务</span>
                </button>
              </div>
            </div>

            <!-- Quests in Chapter -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div
                v-for="quest in ch.quests"
                :key="quest.questId"
                class="p-3 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 space-y-2"
              >
                <div class="flex items-center justify-between pb-1.5 border-b border-stone-100 dark:border-stone-800">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <BookOpen class="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span class="text-xs font-semibold text-stone-800 dark:text-stone-200 truncate">{{ quest.title }}</span>
                  </div>
                  <button
                    type="button"
                    class="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500"
                    title="在此任务下新增场景"
                    @click="handleAddScene(arc.arcId, ch.chapterId, quest.questId)"
                  >
                    <Plus class="h-3 w-3" />
                  </button>
                </div>

                <!-- Scene Cards -->
                <div class="space-y-1.5">
                  <div
                    v-for="sc in quest.scenes"
                    :key="sc.sceneId"
                    class="p-2 rounded border cursor-pointer transition-all flex items-center justify-between text-xs group"
                    :class="[
                      selectedSceneId === sc.sceneId
                        ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 shadow-sm'
                        : 'border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 bg-stone-50/40 dark:bg-stone-900'
                    ]"
                    @click="handleSceneClick(sc.sceneId)"
                    @dblclick="handleSceneDoubleClick(sc.sceneId)"
                  >
                    <div class="flex items-center gap-2 min-w-0">
                      <FileText class="h-3.5 w-3.5 text-stone-400 shrink-0" />
                      <span class="font-medium text-stone-800 dark:text-stone-200 truncate">{{ sc.title }}</span>
                    </div>

                    <div class="flex items-center gap-2 shrink-0">
                      <AlertCircle v-if="getSceneDiagnostics(sc.sceneId).hasError" class="h-3.5 w-3.5 text-red-500" title="存在错误" />
                      <AlertTriangle v-else-if="getSceneDiagnostics(sc.sceneId).hasWarning" class="h-3.5 w-3.5 text-amber-400" title="存在警告" />
                      <ArrowRight class="h-3.5 w-3.5 text-stone-300 group-hover:text-amber-500 transition-colors" />
                    </div>
                  </div>

                  <div v-if="quest.scenes.length === 0" class="text-center py-2 text-[11px] text-stone-400">
                    暂无场景，点击右上角 + 创建
                  </div>
                </div>
              </div>

              <!-- Loose Scenes in Chapter -->
              <div v-if="ch.looseScenes.length > 0" class="p-3 bg-white dark:bg-stone-900 rounded-lg border border-dashed border-stone-200 dark:border-stone-800 space-y-2">
                <div class="text-[11px] font-semibold text-stone-500 pb-1 border-b border-stone-100 dark:border-stone-800">
                  章节直接附属场景
                </div>
                <div class="space-y-1.5">
                  <div
                    v-for="sc in ch.looseScenes"
                    :key="sc.sceneId"
                    class="p-2 rounded border cursor-pointer transition-all flex items-center justify-between text-xs group"
                    :class="[
                      selectedSceneId === sc.sceneId
                        ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20'
                        : 'border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700'
                    ]"
                    @click="handleSceneClick(sc.sceneId)"
                    @dblclick="handleSceneDoubleClick(sc.sceneId)"
                  >
                    <div class="flex items-center gap-2 min-w-0">
                      <FileText class="h-3.5 w-3.5 text-stone-400 shrink-0" />
                      <span class="font-medium text-stone-800 dark:text-stone-200 truncate">{{ sc.title }}</span>
                    </div>
                    <ArrowRight class="h-3.5 w-3.5 text-stone-300 group-hover:text-amber-500 transition-colors" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="p-12 text-center bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 text-stone-400">
      <span>大纲数据为空，可在右上角「模版」中套用预设故事范式。</span>
    </div>
  </div>
</template>
