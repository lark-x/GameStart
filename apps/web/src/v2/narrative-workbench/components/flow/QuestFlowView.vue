<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  GitFork,
  ArrowRight,
  Plus,
  Lock,
  Zap,
  Edit3,
  FileText,
} from "@lucide/vue";
import { useNarrativeOutlineStore } from "../../../story/stores/useNarrativeOutlineStore.ts";
import { useNarrativeChoiceStore } from "../../stores/useNarrativeChoiceStore.ts";
import type { V2ChoiceDto } from "@living-network/contracts/v2";

interface SceneOptionItem {
  sceneId: string;
  title: string;
  arcId?: string;
  arcTitle?: string;
  chapterId?: string;
  chapterTitle?: string;
  questId?: string;
  questTitle?: string;
  ordinal?: number;
  isEntry?: boolean;
}

interface ScopeOptionItem {
  id: string;
  type: "quest" | "chapter" | "arc" | "unassigned";
  title: string;
  badge: string;
  sceneCount: number;
}

const props = defineProps<{
  storyWorldId: string;
  selectedSceneId: string | null;
  activeQuestId?: string | null;
  selectedChoiceId?: string | null;
}>();

const emit = defineEmits<{
  selectScene: [sceneId: string];
  openScript: [sceneId: string];
  createScene: [payload?: { arcId?: string; chapterId?: string; questId?: string }];
  selectQuest: [questId: string];
  selectChoice: [choice: V2ChoiceDto | null];
}>();

const outlineStore = useNarrativeOutlineStore();
const choiceStore = useNarrativeChoiceStore();

// Selected Scope state (e.g. "quest:q1", "chapter:c1", "arc:a1", "unassigned")
const selectedScopeKey = ref<string>("");

// New choice modal state
const creatingChoice = ref(false);
const newChoiceSourceSceneId = ref<string>("");
const newChoiceLabel = ref("");
const newChoiceTargetSceneId = ref("");

// Available Scopes for Flow Isolation
const availableScopes = computed<ScopeOptionItem[]>(() => {
  if (!outlineStore.outline) return [];
  const list: ScopeOptionItem[] = [];

  for (const arc of outlineStore.outline.arcs) {
    // Check if arc has loose scenes
    if (arc.looseScenes.length > 0) {
      list.push({
        id: `arc:${arc.arcId}`,
        type: "arc",
        title: `${arc.title} (篇章直接场景)`,
        badge: "篇章",
        sceneCount: arc.looseScenes.length,
      });
    }

    for (const chapter of arc.chapters) {
      if (chapter.looseScenes.length > 0) {
        list.push({
          id: `chapter:${chapter.chapterId}`,
          type: "chapter",
          title: `${arc.title} > ${chapter.title}`,
          badge: "章节",
          sceneCount: chapter.looseScenes.length,
        });
      }

      for (const quest of chapter.quests) {
        list.push({
          id: `quest:${quest.questId}`,
          type: "quest",
          title: `${arc.title} > ${quest.title}`,
          badge: "任务",
          sceneCount: quest.scenes.length,
        });
      }
    }

    for (const quest of arc.looseQuests) {
      list.push({
        id: `quest:${quest.questId}`,
        type: "quest",
        title: `${arc.title} > ${quest.title}`,
        badge: "任务",
        sceneCount: quest.scenes.length,
      });
    }
  }

  if (outlineStore.outline.unassignedScenes.length > 0) {
    list.push({
      id: "unassigned",
      type: "unassigned",
      title: "未归类场景",
      badge: "未归类",
      sceneCount: outlineStore.outline.unassignedScenes.length,
    });
  }

  return list;
});

// All scenes in world for cross-link target selection
const allScenes = computed<SceneOptionItem[]>(() => {
  if (!outlineStore.outline) return [];
  const scenes: SceneOptionItem[] = [];
  for (const arc of outlineStore.outline.arcs) {
    for (const chapter of arc.chapters) {
      for (const quest of chapter.quests) {
        for (const scene of quest.scenes) {
          scenes.push({
            sceneId: scene.sceneId,
            title: scene.title,
            arcId: arc.arcId,
            arcTitle: arc.title,
            chapterId: chapter.chapterId,
            chapterTitle: chapter.title,
            questId: quest.questId,
            questTitle: quest.title,
            ordinal: scene.ordinal,
            isEntry: scene.isEntry,
          });
        }
      }
      for (const scene of chapter.looseScenes) {
        scenes.push({
          sceneId: scene.sceneId,
          title: scene.title,
          arcId: arc.arcId,
          arcTitle: arc.title,
          chapterId: chapter.chapterId,
          chapterTitle: chapter.title,
          ordinal: scene.ordinal,
          isEntry: scene.isEntry,
        });
      }
    }
    for (const quest of arc.looseQuests) {
      for (const scene of quest.scenes) {
        scenes.push({
          sceneId: scene.sceneId,
          title: scene.title,
          arcId: arc.arcId,
          arcTitle: arc.title,
          questId: quest.questId,
          questTitle: quest.title,
          ordinal: scene.ordinal,
          isEntry: scene.isEntry,
        });
      }
    }
    for (const scene of arc.looseScenes) {
      scenes.push({
        sceneId: scene.sceneId,
        title: scene.title,
        arcId: arc.arcId,
        arcTitle: arc.title,
        ordinal: scene.ordinal,
        isEntry: scene.isEntry,
      });
    }
  }
  for (const scene of outlineStore.outline.unassignedScenes) {
    scenes.push({
      sceneId: scene.sceneId,
      title: scene.title,
      ordinal: scene.ordinal,
      isEntry: scene.isEntry,
    });
  }
  return scenes;
});

// Auto-select initial scope based on activeQuestId or selectedSceneId
watch(
  () => [props.activeQuestId, props.selectedSceneId, availableScopes.value],
  () => {
    if (props.activeQuestId && availableScopes.value.some((s) => s.id === `quest:${props.activeQuestId}`)) {
      selectedScopeKey.value = `quest:${props.activeQuestId}`;
      return;
    }
    if (props.selectedSceneId) {
      const match = allScenes.value.find((s) => s.sceneId === props.selectedSceneId);
      if (match) {
        if (match.questId) {
          selectedScopeKey.value = `quest:${match.questId}`;
          return;
        } else if (match.chapterId) {
          selectedScopeKey.value = `chapter:${match.chapterId}`;
          return;
        } else if (match.arcId) {
          selectedScopeKey.value = `arc:${match.arcId}`;
          return;
        } else {
          selectedScopeKey.value = "unassigned";
          return;
        }
      }
    }
    if (!selectedScopeKey.value && availableScopes.value.length > 0) {
      selectedScopeKey.value = availableScopes.value[0]?.id || "";
    }
  },
  { immediate: true },
);

// Scoped Scenes (Strictly isolated by current selected scope)
const currentScopeScenes = computed<SceneOptionItem[]>(() => {
  const scopeKey = selectedScopeKey.value;
  if (!scopeKey) return [];

  if (scopeKey.startsWith("quest:")) {
    const qId = scopeKey.replace("quest:", "");
    return allScenes.value.filter((s) => s.questId === qId);
  } else if (scopeKey.startsWith("chapter:")) {
    const cId = scopeKey.replace("chapter:", "");
    return allScenes.value.filter((s) => s.chapterId === cId && !s.questId);
  } else if (scopeKey.startsWith("arc:")) {
    const aId = scopeKey.replace("arc:", "");
    return allScenes.value.filter((s) => s.arcId === aId && !s.chapterId && !s.questId);
  } else if (scopeKey === "unassigned") {
    return allScenes.value.filter((s) => !s.arcId && !s.chapterId && !s.questId);
  }
  return [];
});

function getOutgoingChoices(sceneId: string): readonly V2ChoiceDto[] {
  return choiceStore.choicesForScene(sceneId);
}

function handleScopeChange(e: Event) {
  const key = (e.target as HTMLSelectElement).value;
  selectedScopeKey.value = key;
  if (key.startsWith("quest:")) {
    emit("selectQuest", key.replace("quest:", ""));
  }
}

function openCreateChoiceModal(sourceSceneId: string) {
  newChoiceSourceSceneId.value = sourceSceneId;
  newChoiceLabel.value = "";
  newChoiceTargetSceneId.value = "";
  creatingChoice.value = true;
}

async function submitCreateChoice() {
  if (!newChoiceSourceSceneId.value || !newChoiceLabel.value.trim()) return;
  const choiceId = `choice_${Math.random().toString(36).slice(2, 9)}`;
  const created = await choiceStore.createChoice(props.storyWorldId, {
    choiceId,
    sourceSceneId: newChoiceSourceSceneId.value,
    label: newChoiceLabel.value.trim(),
    targetSceneId: newChoiceTargetSceneId.value || undefined,
  });
  if (created) {
    emit("selectChoice", created);
  }
  creatingChoice.value = false;
}
</script>

<template>
  <div class="h-full flex flex-col space-y-4 select-none text-sm max-w-5xl mx-auto w-full">
    <!-- Flow Header & Scope Selector Bar -->
    <div class="p-3.5 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-xs flex items-center justify-between gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <div class="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
          <GitFork class="h-4.5 w-4.5" />
        </div>

        <div class="min-w-0 flex items-center gap-2">
          <label class="font-bold text-stone-900 dark:text-stone-100 shrink-0">流图范围：</label>
          <select
            :value="selectedScopeKey"
            class="px-3 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 font-medium outline-none focus:border-amber-500 cursor-pointer text-xs"
            @change="handleScopeChange"
          >
            <option v-for="scope in availableScopes" :key="scope.id" :value="scope.id">
              [{{ scope.badge }}] {{ scope.title }} ({{ scope.sceneCount }} 场景)
            </option>
          </select>
        </div>
      </div>

      <div class="flex items-center gap-2 text-xs text-stone-400 shrink-0">
        <span>点击选项卡片可在右侧检查器中编辑分支与条件</span>
      </div>
    </div>

    <!-- Scoped Scenes & Connections Flow Surface -->
    <div class="flex-1 overflow-y-auto space-y-4 pr-1">
      <template v-if="currentScopeScenes.length > 0">
        <div
          v-for="scene in currentScopeScenes"
          :key="scene.sceneId"
          class="p-4 rounded-xl border transition-all bg-white dark:bg-stone-900"
          :class="[
            selectedSceneId === scene.sceneId
              ? 'border-amber-500 ring-1 ring-amber-500/30 shadow-xs'
              : 'border-stone-200 dark:border-stone-800'
          ]"
        >
          <!-- Scene Node Header -->
          <div class="flex items-center justify-between pb-2.5 border-b border-stone-100 dark:border-stone-800">
            <div
              class="flex items-center gap-2.5 cursor-pointer group min-w-0"
              @click="emit('selectScene', scene.sceneId)"
            >
              <FileText class="h-4 w-4 text-amber-500 shrink-0" />
              <h3 class="font-bold text-stone-900 dark:text-stone-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors truncate">
                {{ scene.title }}
              </h3>
              <span
                v-if="scene.isEntry"
                class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-mono"
              >
                起始
              </span>
            </div>

            <div class="flex items-center gap-1.5">
              <button
                type="button"
                class="px-2 py-1 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 flex items-center gap-1"
                @click="openCreateChoiceModal(scene.sceneId)"
              >
                <Plus class="h-3 w-3 text-amber-500" />
                <span>添加分支选项</span>
              </button>
              <button
                type="button"
                class="p-1 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                title="打开剧本编辑器"
                @click="emit('openScript', scene.sceneId)"
              >
                <Edit3 class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <!-- Outgoing Choices Flow -->
          <div class="pt-3 space-y-2">
            <div
              v-if="getOutgoingChoices(scene.sceneId).length === 0"
              class="text-xs text-stone-400 italic py-1"
            >
              (当前场景无后续分支出口，为流程终点)
            </div>

            <div
              v-for="choice in getOutgoingChoices(scene.sceneId)"
              :key="choice.choiceId"
              class="p-2.5 rounded-lg border flex items-center justify-between gap-3 cursor-pointer transition-all text-xs group"
              :class="[
                selectedChoiceId === choice.choiceId
                  ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 shadow-2xs ring-1 ring-amber-500/20'
                  : 'border-stone-200 dark:border-stone-800 hover:border-amber-400/80 bg-stone-50/50 dark:bg-stone-950/40'
              ]"
              @click="emit('selectChoice', choice)"
            >
              <div class="flex items-center gap-2 min-w-0">
                <GitFork class="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span class="font-semibold text-stone-800 dark:text-stone-200 truncate">{{ choice.label }}</span>
                <span v-if="choice.gates && choice.gates.length > 0" class="flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-100 dark:bg-amber-950 px-1 py-0.2 rounded font-mono">
                  <Lock class="h-2.5 w-2.5" /> 条件
                </span>
                <span v-if="choice.consequences && choice.consequences.length > 0" class="flex items-center gap-0.5 text-[10px] text-purple-600 bg-purple-100 dark:bg-purple-950 px-1 py-0.2 rounded font-mono">
                  <Zap class="h-2.5 w-2.5" /> 状态
                </span>
              </div>

              <div class="flex items-center gap-1.5 text-stone-500 shrink-0">
                <span class="text-stone-400">导向：</span>
                <span class="font-medium text-stone-800 dark:text-stone-200">
                  {{ allScenes.find((s) => s.sceneId === choice.targetSceneId)?.title || choice.targetSceneId || '(未连接目标场景)' }}
                </span>
                <ArrowRight class="h-3.5 w-3.5 text-amber-500" />
              </div>
            </div>
          </div>
        </div>
      </template>

      <div
        v-else
        class="p-12 text-center bg-white dark:bg-stone-900 rounded-xl border border-dashed border-stone-200 dark:border-stone-800 text-stone-400 space-y-2"
      >
        <p class="font-medium">当前范围无场景</p>
        <p class="text-xs text-stone-500">可在上方切换其他篇章/任务范围，或在左侧故事树中创建场景</p>
      </div>
    </div>

    <!-- Create Choice Modal Dialog -->
    <div
      v-if="creatingChoice"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
      @click.self="creatingChoice = false"
    >
      <div class="w-full max-w-md bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xl p-5 space-y-4 text-xs">
        <h3 class="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
          <GitFork class="h-4 w-4 text-amber-500" />
          <span>新建分支选项</span>
        </h3>

        <div class="space-y-3">
          <div class="space-y-1">
            <label class="font-semibold text-stone-600 dark:text-stone-300">选项文本</label>
            <input
              v-model="newChoiceLabel"
              type="text"
              placeholder="例如：跟随派蒙前往低语森林"
              class="w-full px-3 py-1.5 rounded-lg bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 outline-none focus:border-amber-500"
              autoFocus
            />
          </div>

          <div class="space-y-1">
            <label class="font-semibold text-stone-600 dark:text-stone-300">目标导向场景</label>
            <select
              v-model="newChoiceTargetSceneId"
              class="w-full px-3 py-1.5 rounded-lg bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 outline-none focus:border-amber-500"
            >
              <option value="">(暂不连接目标场景)</option>
              <option v-for="sc in allScenes" :key="sc.sceneId" :value="sc.sceneId">
                {{ sc.title }} {{ sc.questTitle ? `(${sc.questTitle})` : '' }}
              </option>
            </select>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 font-medium"
            @click="creatingChoice = false"
          >
            取消
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold"
            :disabled="!newChoiceLabel.trim()"
            @click="submitCreateChoice"
          >
            创建选项
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
