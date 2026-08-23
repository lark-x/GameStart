<script setup lang="ts">
import { computed, ref } from "vue";
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
import ChoiceInspector from "./ChoiceInspector.vue";
import type { V2ChoiceDto } from "@living-network/contracts/v2";

const props = defineProps<{
  storyWorldId: string;
  selectedSceneId: string | null;
}>();

const emit = defineEmits<{
  selectScene: [sceneId: string];
  openScript: [sceneId: string];
  createScene: [questId?: string];
}>();

const outlineStore = useNarrativeOutlineStore();
const choiceStore = useNarrativeChoiceStore();

// Selected Choice for Inspection
const selectedChoice = ref<V2ChoiceDto | null>(null);

// New choice modal state
const creatingChoice = ref(false);
const newChoiceSourceSceneId = ref<string>("");
const newChoiceLabel = ref("");
const newChoiceTargetSceneId = ref("");

// Flattened list of all scenes in the current narrative hierarchy
const allScenes = computed(() => {
  if (!outlineStore.outline) return [];
  const scenes: { sceneId: string; title: string; arcTitle?: string; questTitle?: string; ordinal?: number; isEntry?: boolean }[] = [];
  for (const arc of outlineStore.outline.arcs) {
    for (const chapter of arc.chapters) {
      for (const quest of chapter.quests) {
        for (const scene of quest.scenes) {
          scenes.push({
            sceneId: scene.sceneId,
            title: scene.title,
            arcTitle: arc.title,
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
          arcTitle: arc.title,
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
          arcTitle: arc.title,
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
        arcTitle: arc.title,
        ordinal: scene.ordinal,
        isEntry: scene.isEntry,
      });
    }
  }
  return scenes;
});

function getOutgoingChoices(sceneId: string): readonly V2ChoiceDto[] {
  return choiceStore.choicesForScene(sceneId);
}

function handleSelectChoice(choice: V2ChoiceDto) {
  selectedChoice.value = choice;
}

function openCreateChoiceModal(sourceSceneId: string) {
  newChoiceSourceSceneId.value = sourceSceneId;
  newChoiceLabel.value = "";
  newChoiceTargetSceneId.value = "";
  creatingChoice.value = true;
}

async function submitCreateChoice() {
  if (!newChoiceSourceSceneId.value || !newChoiceLabel.value.trim()) return;
  try {
    const choiceId = `choice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await choiceStore.createChoice(props.storyWorldId, {
      choiceId,
      sourceSceneId: newChoiceSourceSceneId.value,
      targetSceneId: newChoiceTargetSceneId.value || undefined,
      label: newChoiceLabel.value.trim(),
    });
    creatingChoice.value = false;
  } catch (err) {
    console.error("Failed to create choice:", err);
  }
}
</script>

<template>
  <div class="h-full flex flex-row overflow-hidden bg-stone-50/50 dark:bg-stone-950/20 text-xs">
    <!-- Flow Graph Visual Area -->
    <div class="flex-1 overflow-y-auto p-6 space-y-6">
      <!-- Toolbar Header -->
      <div class="p-4 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <GitFork class="h-4 w-4" />
          </div>
          <div>
            <h2 class="font-bold text-stone-900 dark:text-stone-100 text-sm">剧情分支图 (Story Flow & Choices)</h2>
            <p class="text-[11px] text-stone-400">查看并管理场景流向、出口选项与状态门禁条件</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-all"
            @click="emit('createScene')"
          >
            <Plus class="h-3.5 w-3.5" />
            <span>新建场景</span>
          </button>
        </div>
      </div>

      <!-- Scenes & Choices Grid Flow -->
      <div v-if="allScenes.length > 0" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <div
          v-for="scene in allScenes"
          :key="scene.sceneId"
          class="p-4 rounded-xl border transition-all duration-150 flex flex-col justify-between"
          :class="[
            selectedSceneId === scene.sceneId
              ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/10 shadow-md ring-1 ring-amber-500/30'
              : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-stone-300 dark:hover:border-stone-700 shadow-sm'
          ]"
          @click="emit('selectScene', scene.sceneId)"
        >
          <!-- Scene Node Header -->
          <div class="space-y-2 pb-3 border-b border-stone-100 dark:border-stone-800">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 min-w-0">
                <span
                  v-if="scene.isEntry"
                  class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300"
                >
                  START
                </span>
                <h3 class="font-bold text-stone-900 dark:text-stone-100 truncate text-xs">
                  {{ scene.title }}
                </h3>
              </div>
              <button
                type="button"
                class="p-1 rounded text-stone-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors shrink-0"
                title="打开剧本编辑器"
                @click.stop="emit('openScript', scene.sceneId)"
              >
                <Edit3 class="h-3.5 w-3.5" />
              </button>
            </div>

            <div class="flex items-center gap-2 text-[10px] text-stone-400 font-mono">
              <span>{{ scene.sceneId }}</span>
              <span v-if="scene.questTitle">· {{ scene.questTitle }}</span>
            </div>
          </div>

          <!-- Outgoing Choices in Scene -->
          <div class="pt-3 space-y-2 flex-1">
            <div class="flex items-center justify-between text-[11px] text-stone-500 font-semibold">
              <span>分支选项 ({{ getOutgoingChoices(scene.sceneId).length }})</span>
              <button
                type="button"
                class="text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
                @click.stop="openCreateChoiceModal(scene.sceneId)"
              >
                <Plus class="h-3 w-3" />
                <span>选项</span>
              </button>
            </div>

            <!-- Choice Pills -->
            <div v-if="getOutgoingChoices(scene.sceneId).length > 0" class="space-y-1.5">
              <button
                v-for="choice in getOutgoingChoices(scene.sceneId)"
                :key="choice.choiceId"
                type="button"
                class="w-full p-2 rounded-lg text-left border transition-all flex items-center justify-between gap-2"
                :class="[
                  selectedChoice?.choiceId === choice.choiceId
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                    : 'border-stone-200/80 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-950/40 text-stone-700 dark:text-stone-300 hover:border-amber-400'
                ]"
                @click.stop="handleSelectChoice(choice)"
              >
                <div class="min-w-0 flex items-center gap-1.5">
                  <span class="font-medium truncate">{{ choice.label }}</span>
                  <Lock v-if="choice.gates.length > 0" class="h-3 w-3 text-amber-500 shrink-0" />
                  <Zap v-if="choice.consequences.length > 0" class="h-3 w-3 text-emerald-500 shrink-0" />
                </div>
                <div class="flex items-center gap-1 text-[10px] font-mono text-stone-400 shrink-0">
                  <ArrowRight class="h-3 w-3" />
                  <span>{{ choice.targetSceneId ? choice.targetSceneId.slice(0, 10) : 'END' }}</span>
                </div>
              </button>
            </div>
            <p v-else class="text-stone-400 italic text-[11px] py-1">无后继分支</p>
          </div>
        </div>
      </div>

      <div v-else class="p-12 text-center text-stone-400 bg-white dark:bg-stone-900 rounded-xl border border-dashed border-stone-200 dark:border-stone-800 space-y-3">
        <FileText class="h-8 w-8 mx-auto text-stone-300" />
        <p>当前故事大纲中尚未创建任何场景</p>
        <button
          type="button"
          class="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg text-xs"
          @click="emit('createScene')"
        >
          创建第一个场景
        </button>
      </div>
    </div>

    <!-- Choice Inspector Side Drawer -->
    <div v-if="selectedChoice" class="w-80 border-l border-stone-200 dark:border-stone-800 shrink-0">
      <ChoiceInspector
        :story-world-id="storyWorldId"
        :choice="selectedChoice"
        :available-scenes="allScenes"
        @close="selectedChoice = null"
        @updated="choiceStore.fetchChoices(storyWorldId)"
      />
    </div>

    <!-- Create Choice Modal -->
    <div
      v-if="creatingChoice"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <div class="w-full max-w-md bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xl p-5 space-y-4">
        <h3 class="font-bold text-stone-900 dark:text-stone-100 text-sm">创建分支选项</h3>

        <div class="space-y-3">
          <div>
            <label class="font-medium text-stone-600 dark:text-stone-400 block mb-1">选项文案</label>
            <input
              v-model="newChoiceLabel"
              type="text"
              placeholder="例如：进入密室 / 拒绝邀请"
              class="w-full px-3 py-1.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 outline-none text-stone-900 dark:text-stone-100"
            />
          </div>

          <div>
            <label class="font-medium text-stone-600 dark:text-stone-400 block mb-1">后继目标场景</label>
            <select
              v-model="newChoiceTargetSceneId"
              class="w-full px-3 py-1.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 outline-none text-stone-900 dark:text-stone-100"
            >
              <option value="">(无目标场景 / 结束)</option>
              <option v-for="s in allScenes" :key="s.sceneId" :value="s.sceneId">
                {{ s.title }} ({{ s.sceneId }})
              </option>
            </select>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
          <button
            type="button"
            class="px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300"
            @click="creatingChoice = false"
          >
            取消
          </button>
          <button
            type="button"
            class="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold"
            :disabled="!newChoiceLabel.trim()"
            @click="submitCreateChoice"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
