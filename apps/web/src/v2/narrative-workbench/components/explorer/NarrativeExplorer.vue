<script setup lang="ts">
import { computed, ref } from "vue";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Plus,
  Search,
  FileText,
  AlertCircle,
  AlertTriangle,
  Layers,
  BookOpen,
} from "@lucide/vue";
import { useNarrativeOutlineStore } from "../../../story/stores/useNarrativeOutlineStore.ts";
import { useNarrativeDiagnosticsStore } from "../../../story/stores/useNarrativeDiagnosticsStore.ts";
import type { V2NarrativeOutlineScene } from "@living-network/contracts/v2";

const props = defineProps<{
  storyWorldId: string;
  selectedSceneId: string | null;
}>();

const emit = defineEmits<{
  selectScene: [sceneId: string];
  createScene: [payload: { arcId?: string; chapterId?: string; questId?: string }];
}>();

const outlineStore = useNarrativeOutlineStore();
const diagStore = useNarrativeDiagnosticsStore();

const searchQuery = ref("");
const collapsedNodes = ref<Record<string, boolean>>({});

function toggleCollapse(nodeId: string): void {
  collapsedNodes.value[nodeId] = !collapsedNodes.value[nodeId];
}

function isCollapsed(nodeId: string): boolean {
  return !!collapsedNodes.value[nodeId];
}

function expandAll(): void {
  collapsedNodes.value = {};
}

function collapseAll(): void {
  if (!outlineStore.outline) return;
  const map: Record<string, boolean> = {};
  for (const arc of outlineStore.outline.arcs) {
    map[`arc_${arc.arcId}`] = true;
    for (const ch of arc.chapters) {
      map[`ch_${ch.chapterId}`] = true;
      for (const q of ch.quests) {
        map[`q_${q.questId}`] = true;
      }
    }
    for (const q of arc.looseQuests) {
      map[`q_${q.questId}`] = true;
    }
  }
  collapsedNodes.value = map;
}

function getSceneDiagnostics(sceneId: string) {
  const issues = diagStore.issuesBySceneId[sceneId] ?? [];
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return { issues, errors, warnings, hasError: errors.length > 0, hasWarning: warnings.length > 0 };
}

function handleSelectScene(scene: V2NarrativeOutlineScene): void {
  emit("selectScene", scene.sceneId);
}

function handleAddChapter(arcId: string): void {
  const title = prompt("请输入新章节名称：", "新章节");
  if (!title) return;
  outlineStore.createChapter(props.storyWorldId, {
    arcId,
    title,
  });
}

function handleAddQuest(arcId?: string, chapterId?: string): void {
  const title = prompt("请输入新任务名称：", "新任务");
  if (!title) return;
  outlineStore.createQuest(props.storyWorldId, {
    ...(arcId ? { arcId } : {}),
    ...(chapterId ? { chapterId } : {}),
    title,
  });
}

function handleAddScene(arcId?: string, chapterId?: string, questId?: string): void {
  emit("createScene", {
    ...(arcId ? { arcId } : {}),
    ...(chapterId ? { chapterId } : {}),
    ...(questId ? { questId } : {}),
  });
}

const filteredOutline = computed(() => {
  if (!outlineStore.outline || !searchQuery.value.trim()) {
    return outlineStore.outline;
  }
  const q = searchQuery.value.toLowerCase().trim();

  return {
    ...outlineStore.outline,
    arcs: outlineStore.outline.arcs.map((arc) => ({
      ...arc,
      chapters: arc.chapters.map((ch) => ({
        ...ch,
        quests: ch.quests.map((quest) => ({
          ...quest,
          scenes: quest.scenes.filter((s) => s.title.toLowerCase().includes(q)),
        })).filter((quest) => quest.title.toLowerCase().includes(q) || quest.scenes.length > 0),
        looseScenes: ch.looseScenes.filter((s) => s.title.toLowerCase().includes(q)),
      })).filter((ch) => ch.title.toLowerCase().includes(q) || ch.quests.length > 0 || ch.looseScenes.length > 0),
      looseQuests: arc.looseQuests.map((quest) => ({
        ...quest,
        scenes: quest.scenes.filter((s) => s.title.toLowerCase().includes(q)),
      })).filter((quest) => quest.title.toLowerCase().includes(q) || quest.scenes.length > 0),
      looseScenes: arc.looseScenes.filter((s) => s.title.toLowerCase().includes(q)),
    })).filter((arc) => arc.title.toLowerCase().includes(q) || arc.chapters.length > 0 || arc.looseQuests.length > 0 || arc.looseScenes.length > 0),
    unassignedScenes: outlineStore.outline.unassignedScenes.filter((s) => s.title.toLowerCase().includes(q)),
  };
});
</script>

<template>
  <div class="h-full flex flex-col bg-white dark:bg-stone-900 select-none text-xs">
    <!-- Search & Quick Control Bar -->
    <div class="p-2 border-b border-stone-200 dark:border-stone-800 space-y-2">
      <div class="relative">
        <Search class="absolute left-2.5 top-2 h-3.5 w-3.5 text-stone-400" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索大纲、章节、场景..."
          class="w-full pl-8 pr-2 py-1 bg-stone-100 dark:bg-stone-800 rounded border border-transparent focus:border-amber-500 focus:bg-white dark:focus:bg-stone-900 outline-none text-xs text-stone-900 dark:text-stone-100 placeholder-stone-400 transition-colors"
        />
      </div>

      <div class="flex items-center justify-between px-1 text-[11px] text-stone-500">
        <span>结构目录 (Outline)</span>
        <div class="flex items-center gap-2">
          <button type="button" class="hover:text-stone-900 dark:hover:text-stone-200" title="全部展开" @click="expandAll">展开</button>
          <span>/</span>
          <button type="button" class="hover:text-stone-900 dark:hover:text-stone-200" title="全部收起" @click="collapseAll">收起</button>
        </div>
      </div>
    </div>

    <!-- Tree Structure Area -->
    <div class="flex-1 overflow-y-auto p-1 space-y-1">
      <template v-if="filteredOutline">
        <!-- Arcs List -->
        <div v-for="arc in filteredOutline.arcs" :key="arc.arcId" class="space-y-0.5">
          <!-- Arc Node -->
          <div
            class="group flex items-center justify-between px-2 py-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-800 dark:text-stone-200 font-semibold cursor-pointer"
            @click="toggleCollapse(`arc_${arc.arcId}`)"
          >
            <div class="flex items-center gap-1.5 min-w-0">
              <ChevronDown v-if="!isCollapsed(`arc_${arc.arcId}`)" class="h-3.5 w-3.5 text-stone-400 shrink-0" />
              <ChevronRight v-else class="h-3.5 w-3.5 text-stone-400 shrink-0" />
              <Layers class="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span class="truncate">{{ arc.title }}</span>
            </div>
            <div class="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0" @click.stop>
              <button
                type="button"
                class="p-0.5 rounded hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-500"
                title="新增章节"
                @click="handleAddChapter(arc.arcId)"
              >
                <Plus class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <!-- Arc Body -->
          <div v-show="!isCollapsed(`arc_${arc.arcId}`)" class="pl-3 border-l border-stone-200 dark:border-stone-800 ml-3 space-y-0.5">
            <!-- Chapters in Arc -->
            <div v-for="ch in arc.chapters" :key="ch.chapterId" class="space-y-0.5">
              <!-- Chapter Node -->
              <div
                class="group flex items-center justify-between px-2 py-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300 font-medium cursor-pointer"
                @click="toggleCollapse(`ch_${ch.chapterId}`)"
              >
                <div class="flex items-center gap-1.5 min-w-0">
                  <ChevronDown v-if="!isCollapsed(`ch_${ch.chapterId}`)" class="h-3 w-3 text-stone-400 shrink-0" />
                  <ChevronRight v-else class="h-3 w-3 text-stone-400 shrink-0" />
                  <FolderOpen v-if="!isCollapsed(`ch_${ch.chapterId}`)" class="h-3.5 w-3.5 text-sky-500 shrink-0" />
                  <Folder v-else class="h-3.5 w-3.5 text-sky-500 shrink-0" />
                  <span class="truncate">{{ ch.title }}</span>
                </div>
                <div class="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0" @click.stop>
                  <button
                    type="button"
                    class="p-0.5 rounded hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-500"
                    title="新增任务"
                    @click="handleAddQuest(arc.arcId, ch.chapterId)"
                  >
                    <Plus class="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <!-- Quests in Chapter -->
              <div v-show="!isCollapsed(`ch_${ch.chapterId}`)" class="pl-3 border-l border-stone-200 dark:border-stone-800 ml-3 space-y-0.5">
                <div v-for="quest in ch.quests" :key="quest.questId" class="space-y-0.5">
                  <!-- Quest Node -->
                  <div
                    class="group flex items-center justify-between px-2 py-0.5 rounded hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-600 dark:text-stone-400 cursor-pointer"
                    @click="toggleCollapse(`q_${quest.questId}`)"
                  >
                    <div class="flex items-center gap-1.5 min-w-0">
                      <ChevronDown v-if="!isCollapsed(`q_${quest.questId}`)" class="h-2.5 w-2.5 text-stone-400 shrink-0" />
                      <ChevronRight v-else class="h-2.5 w-2.5 text-stone-400 shrink-0" />
                      <BookOpen class="h-3 w-3 text-emerald-500 shrink-0" />
                      <span class="truncate">{{ quest.title }}</span>
                    </div>
                    <div class="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0" @click.stop>
                      <button
                        type="button"
                        class="p-0.5 rounded hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-500"
                        title="新增场景"
                        @click="handleAddScene(arc.arcId, ch.chapterId, quest.questId)"
                      >
                        <Plus class="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  <!-- Scenes in Quest -->
                  <div v-show="!isCollapsed(`q_${quest.questId}`)" class="pl-3 space-y-0.5">
                    <div
                      v-for="sc in quest.scenes"
                      :key="sc.sceneId"
                      class="flex items-center justify-between px-2 py-1 rounded cursor-pointer transition-colors"
                      :class="[
                        selectedSceneId === sc.sceneId
                          ? 'bg-amber-500 text-white font-medium shadow-sm'
                          : 'hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300'
                      ]"
                      @click="handleSelectScene(sc)"
                    >
                      <div class="flex items-center gap-1.5 min-w-0">
                        <FileText class="h-3 w-3 shrink-0" :class="selectedSceneId === sc.sceneId ? 'text-white' : 'text-stone-400'" />
                        <span class="truncate">{{ sc.title }}</span>
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <AlertCircle v-if="getSceneDiagnostics(sc.sceneId).hasError" class="h-3 w-3 text-red-500" title="存在错误阻断" />
                        <AlertTriangle v-else-if="getSceneDiagnostics(sc.sceneId).hasWarning" class="h-3 w-3 text-amber-400" title="存在警告提示" />
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Loose Scenes in Chapter -->
                <div
                  v-for="sc in ch.looseScenes"
                  :key="sc.sceneId"
                  class="flex items-center justify-between px-2 py-1 rounded cursor-pointer transition-colors"
                  :class="[
                    selectedSceneId === sc.sceneId
                      ? 'bg-amber-500 text-white font-medium shadow-sm'
                      : 'hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300'
                  ]"
                  @click="handleSelectScene(sc)"
                >
                  <div class="flex items-center gap-1.5 min-w-0">
                    <FileText class="h-3 w-3 shrink-0" :class="selectedSceneId === sc.sceneId ? 'text-white' : 'text-stone-400'" />
                    <span class="truncate">{{ sc.title }}</span>
                  </div>
                  <div class="flex items-center gap-1 shrink-0">
                    <AlertCircle v-if="getSceneDiagnostics(sc.sceneId).hasError" class="h-3 w-3 text-red-500" />
                    <AlertTriangle v-else-if="getSceneDiagnostics(sc.sceneId).hasWarning" class="h-3 w-3 text-amber-400" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Loose Scenes in Arc -->
            <div
              v-for="sc in arc.looseScenes"
              :key="sc.sceneId"
              class="flex items-center justify-between px-2 py-1 rounded cursor-pointer transition-colors"
              :class="[
                selectedSceneId === sc.sceneId
                  ? 'bg-amber-500 text-white font-medium shadow-sm'
                  : 'hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300'
              ]"
              @click="handleSelectScene(sc)"
            >
              <div class="flex items-center gap-1.5 min-w-0">
                <FileText class="h-3 w-3 shrink-0" :class="selectedSceneId === sc.sceneId ? 'text-white' : 'text-stone-400'" />
                <span class="truncate">{{ sc.title }}</span>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <AlertCircle v-if="getSceneDiagnostics(sc.sceneId).hasError" class="h-3 w-3 text-red-500" />
                <AlertTriangle v-else-if="getSceneDiagnostics(sc.sceneId).hasWarning" class="h-3 w-3 text-amber-400" />
              </div>
            </div>
          </div>
        </div>

        <!-- Unassigned Scenes Section -->
        <div v-if="filteredOutline.unassignedScenes.length > 0" class="pt-2 border-t border-stone-200 dark:border-stone-800 space-y-0.5">
          <div class="px-2 py-1 text-stone-400 uppercase tracking-wider font-semibold text-[10px]">未归属独立场景</div>
          <div
            v-for="sc in filteredOutline.unassignedScenes"
            :key="sc.sceneId"
            class="flex items-center justify-between px-2 py-1 rounded cursor-pointer transition-colors"
            :class="[
              selectedSceneId === sc.sceneId
                ? 'bg-amber-500 text-white font-medium shadow-sm'
                : 'hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300'
            ]"
            @click="handleSelectScene(sc)"
          >
            <div class="flex items-center gap-1.5 min-w-0">
              <FileText class="h-3 w-3 shrink-0" :class="selectedSceneId === sc.sceneId ? 'text-white' : 'text-stone-400'" />
              <span class="truncate">{{ sc.title }}</span>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <AlertCircle v-if="getSceneDiagnostics(sc.sceneId).hasError" class="h-3 w-3 text-red-500" />
              <AlertTriangle v-else-if="getSceneDiagnostics(sc.sceneId).hasWarning" class="h-3 w-3 text-amber-400" />
            </div>
          </div>
        </div>
      </template>

      <div v-else-if="outlineStore.loading" class="p-4 text-center text-stone-400">
        <span>加载大纲中...</span>
      </div>

      <div v-else class="p-4 text-center text-stone-400">
        <span>暂无剧情大纲数据</span>
      </div>
    </div>
  </div>
</template>
