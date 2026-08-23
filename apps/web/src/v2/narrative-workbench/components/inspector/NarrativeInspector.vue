<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  MapPin,
  User,
  BookOpen,
  Sparkles,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  GitFork,
  Plus,
} from "@lucide/vue";
import { useSceneDocumentStore } from "../../../story/stores/useSceneDocumentStore.ts";
import { useNarrativeReferenceStore } from "../../../story/stores/useNarrativeReferenceStore.ts";
import { useNarrativeChoiceStore } from "../../stores/useNarrativeChoiceStore.ts";
import CanonEntityPicker, { type EntityType } from "./CanonEntityPicker.vue";
import type { V2CharacterSummary, V2LocationSummary } from "../../../adapters/types.ts";
import type {
  V2NarrativeGenerationContextResponse,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
import { V2NarrativeClient } from "../../../story/client.ts";

const props = defineProps<{
  storyWorldId: string;
  sceneId: string;
  characters: readonly V2CharacterSummary[];
  locations: readonly V2LocationSummary[];
}>();

const emit = defineEmits<{
  openFlow: [];
}>();

const docStore = useSceneDocumentStore();
const refStore = useNarrativeReferenceStore();
const choiceStore = useNarrativeChoiceStore();

const activeTab = ref<"refs" | "choices" | "context">("refs");
const advancedExpanded = ref(false);
const idCopied = ref(false);

// Entity Picker state
const pickerOpen = ref(false);
const pickerType = ref<EntityType>("character");

function openPicker(type: EntityType) {
  pickerType.value = type;
  pickerOpen.value = true;
}

function handlePickerSelect(id: string) {
  if (!docStore.document) return;
  const currentSceneId = docStore.document.sceneId;

  if (pickerType.value === "character") {
    refStore.addParticipant(props.storyWorldId, currentSceneId, id);
  } else if (pickerType.value === "location") {
    refStore.setMainLocation(props.storyWorldId, currentSceneId, id);
  } else if (pickerType.value === "lore") {
    refStore.addLoreItem(props.storyWorldId, currentSceneId, id);
  }
  pickerOpen.value = false;
}

// Scene Choices for current scene
const sceneChoices = computed(() => choiceStore.choicesForScene(props.sceneId));

// Context Preview state
const loadingContext = ref(false);
const contextPreview = ref<V2NarrativeGenerationContextResponse | null>(null);
const userPromptInput = ref("");

async function loadContextPreview() {
  if (!docStore.document) return;
  loadingContext.value = true;
  try {
    const client = new V2NarrativeClient();
    contextPreview.value = await client.previewContext(props.storyWorldId, {
      storyWorldId: props.storyWorldId as V2StoryWorldId,
      task: "continue_scene",
      targetSceneId: docStore.document.sceneId,
      ...(docStore.document.questId ? { targetQuestId: docStore.document.questId } : {}),
      ...(userPromptInput.value.trim() ? { prompt: userPromptInput.value.trim() } : {}),
    });
  } catch (err) {
    console.error("Failed to preview narrative context:", err);
  } finally {
    loadingContext.value = false;
  }
}

watch(
  () => props.sceneId,
  (newId) => {
    if (newId) {
      refStore.fetchReferences(props.storyWorldId, newId);
      choiceStore.fetchChoices(props.storyWorldId);
      contextPreview.value = null;
    }
  },
  { immediate: true },
);

// Main Location Details
const mainLocation = computed(() => {
  if (!refStore.mainLocationId) return null;
  return props.locations.find((l) => l.locationId === refStore.mainLocationId) || null;
});

// Participating characters details
const participatingCharacters = computed(() => {
  return refStore.participantCharacterIds.map((id) => {
    const found = props.characters.find((c) => c.characterId === id);
    return {
      characterId: id,
      name: found?.name || id,
      isSpeaker: docStore.speakerCharacterIds.includes(id),
    };
  });
});

function copySceneId() {
  void navigator.clipboard.writeText(props.sceneId);
  idCopied.value = true;
  setTimeout(() => { idCopied.value = false; }, 1500);
}
</script>

<template>
  <div class="h-full flex flex-col bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-800 text-xs">
    <!-- Header Tabs -->
    <div class="flex items-center border-b border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-950/40 p-1">
      <button
        type="button"
        class="flex-1 py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors"
        :class="[
          activeTab === 'refs'
            ? 'bg-white dark:bg-stone-800 text-amber-600 dark:text-amber-400 shadow-xs'
            : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
        ]"
        @click="activeTab = 'refs'"
      >
        <MapPin class="h-3.5 w-3.5" />
        <span>正典引用</span>
        <span
          v-if="refStore.participantCharacterIds.length + (refStore.mainLocationId ? 1 : 0) > 0"
          class="px-1.5 py-0.2 rounded-full text-[10px] bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 font-mono"
        >
          {{ refStore.participantCharacterIds.length + (refStore.mainLocationId ? 1 : 0) }}
        </span>
      </button>

      <button
        type="button"
        class="flex-1 py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors"
        :class="[
          activeTab === 'choices'
            ? 'bg-white dark:bg-stone-800 text-amber-600 dark:text-amber-400 shadow-xs'
            : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
        ]"
        @click="activeTab = 'choices'"
      >
        <GitFork class="h-3.5 w-3.5" />
        <span>出口分支</span>
        <span
          v-if="sceneChoices.length > 0"
          class="px-1.5 py-0.2 rounded-full text-[10px] bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-300 font-mono"
        >
          {{ sceneChoices.length }}
        </span>
      </button>

      <button
        type="button"
        class="flex-1 py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors"
        :class="[
          activeTab === 'context'
            ? 'bg-white dark:bg-stone-800 text-amber-600 dark:text-amber-400 shadow-xs'
            : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
        ]"
        @click="activeTab = 'context'"
      >
        <Sparkles class="h-3.5 w-3.5" />
        <span>AI 上下文</span>
      </button>
    </div>

    <!-- Tab Content -->
    <div class="flex-1 overflow-y-auto p-4 space-y-5">
      <!-- 1. References Tab (Location, Characters, Lore) -->
      <template v-if="activeTab === 'refs'">
        <!-- Main Location -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-stone-700 dark:text-stone-300">主场景地点</span>
            <button
              type="button"
              class="text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5 text-[11px]"
              @click="openPicker('location')"
            >
              <Plus class="h-3 w-3" />
              <span>{{ mainLocation ? '更换地点' : '绑定地点' }}</span>
            </button>
          </div>

          <div v-if="mainLocation" class="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 flex items-center justify-between">
            <div class="flex items-center gap-2 min-w-0">
              <MapPin class="h-4 w-4 text-amber-500 shrink-0" />
              <span class="font-medium text-stone-900 dark:text-stone-100 truncate">{{ mainLocation.name }}</span>
            </div>
            <button
              type="button"
              class="p-1 text-stone-400 hover:text-red-500 rounded"
              title="解绑地点"
              @click="refStore.setMainLocation(storyWorldId, sceneId, null)"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </button>
          </div>
          <p v-else class="text-stone-400 italic">未指定主场景地点</p>
        </div>

        <!-- Participating Characters -->
        <div class="space-y-2 pt-3 border-t border-stone-100 dark:border-stone-800">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5">
              <span class="font-semibold text-stone-700 dark:text-stone-300">出场角色</span>
              <span class="font-mono text-stone-400">({{ participatingCharacters.length }})</span>
            </div>
            <button
              type="button"
              class="text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5 text-[11px]"
              @click="openPicker('character')"
            >
              <Plus class="h-3 w-3" />
              <span>添加角色</span>
            </button>
          </div>

          <div v-if="participatingCharacters.length > 0" class="space-y-1.5">
            <div
              v-for="char in participatingCharacters"
              :key="char.characterId"
              class="p-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 flex items-center justify-between"
            >
              <div class="flex items-center gap-2 min-w-0">
                <User class="h-3.5 w-3.5 text-sky-500 shrink-0" />
                <span class="font-medium text-stone-900 dark:text-stone-100 truncate">{{ char.name }}</span>
                <span v-if="char.isSpeaker" class="px-1.5 py-0.2 rounded text-[10px] bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-mono">
                  发言中
                </span>
              </div>
              <button
                type="button"
                class="p-1 text-stone-400 hover:text-red-500 rounded"
                title="移除出场角色"
                @click="refStore.removeParticipant(storyWorldId, sceneId, char.characterId)"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p v-else class="text-stone-400 italic">暂无出场角色关联</p>
        </div>

        <!-- Lore Items -->
        <div class="space-y-2 pt-3 border-t border-stone-100 dark:border-stone-800">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5">
              <span class="font-semibold text-stone-700 dark:text-stone-300">世界观设定引用</span>
              <span class="font-mono text-stone-400">({{ refStore.loreItemIds.length }})</span>
            </div>
            <button
              type="button"
              class="text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5 text-[11px]"
              @click="openPicker('lore')"
            >
              <Plus class="h-3 w-3" />
              <span>关联设定</span>
            </button>
          </div>

          <div v-if="refStore.loreItemIds.length > 0" class="space-y-1.5">
            <div
              v-for="loreId in refStore.loreItemIds"
              :key="loreId"
              class="p-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 flex items-center justify-between"
            >
              <div class="flex items-center gap-2 min-w-0">
                <BookOpen class="h-3.5 w-3.5 text-purple-500 shrink-0" />
                <span class="font-mono text-stone-800 dark:text-stone-200 truncate">{{ loreId }}</span>
              </div>
              <button
                type="button"
                class="p-1 text-stone-400 hover:text-red-500 rounded"
                @click="refStore.removeLoreItem(storyWorldId, sceneId, loreId)"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <p v-else class="text-stone-400 italic">未关联额外世界观正典条目</p>
        </div>
      </template>

      <!-- 2. Choices Tab -->
      <template v-else-if="activeTab === 'choices'">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-stone-700 dark:text-stone-300">场景出口分支 ({{ sceneChoices.length }})</span>
            <button
              type="button"
              class="text-amber-600 dark:text-amber-400 hover:underline text-[11px]"
              @click="emit('openFlow')"
            >
              在流图中编辑 →
            </button>
          </div>

          <div v-if="sceneChoices.length > 0" class="space-y-2">
            <div
              v-for="c in sceneChoices"
              :key="c.choiceId"
              class="p-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60 space-y-1"
            >
              <div class="flex items-center justify-between font-semibold text-stone-800 dark:text-stone-200">
                <span>{{ c.label }}</span>
                <span v-if="c.targetSceneId" class="font-mono text-[10px] text-stone-400">→ {{ c.targetSceneId }}</span>
              </div>
              <div v-if="c.consequences && c.consequences.length > 0" class="text-[11px] text-emerald-600 dark:text-emerald-400">
                {{ c.consequences.length }} 项状态变更
              </div>
            </div>
          </div>
          <p v-else class="text-stone-400 italic">当前场景无后续出口分支</p>
        </div>
      </template>

      <!-- 3. AI Context Tab -->
      <template v-else>
        <div class="space-y-3">
          <div class="space-y-1.5">
            <label class="font-semibold text-stone-700 dark:text-stone-300">生成提示词 (Prompt)</label>
            <textarea
              v-model="userPromptInput"
              rows="3"
              placeholder="输入给 AI 的场景创作引导提示..."
              class="w-full p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 outline-none focus:border-amber-500 text-xs"
            />
          </div>

          <button
            type="button"
            class="w-full py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-semibold flex items-center justify-center gap-1.5 transition-all shadow-xs"
            :disabled="loadingContext"
            @click="loadContextPreview"
          >
            <Sparkles class="h-3.5 w-3.5" :class="{ 'animate-spin': loadingContext }" />
            <span>预览组装上下文</span>
          </button>

          <div v-if="contextPreview" class="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 space-y-2">
            <div class="font-bold text-stone-800 dark:text-stone-200">装配完成的上下文：</div>
            <pre class="p-2 rounded bg-white dark:bg-stone-900 font-mono text-[11px] text-stone-600 dark:text-stone-300 overflow-x-auto max-h-48">{{ JSON.stringify(contextPreview, null, 2) }}</pre>
          </div>
        </div>
      </template>
    </div>

    <!-- Collapsible Advanced Technical Information Section at the Bottom -->
    <div class="border-t border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-950/60 shrink-0">
      <button
        type="button"
        class="w-full px-4 py-2 flex items-center justify-between text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 font-semibold"
        @click="advancedExpanded = !advancedExpanded"
      >
        <span>高级技术信息</span>
        <ChevronUp v-if="advancedExpanded" class="h-3.5 w-3.5" />
        <ChevronDown v-else class="h-3.5 w-3.5" />
      </button>

      <div v-if="advancedExpanded" class="p-4 pt-1 space-y-2 border-t border-stone-100 dark:border-stone-800 text-[11px]">
        <div class="flex items-center justify-between">
          <span class="text-stone-400">场景 ID</span>
          <div class="flex items-center gap-1">
            <span class="font-mono text-stone-700 dark:text-stone-300">{{ sceneId }}</span>
            <button
              type="button"
              class="p-1 hover:text-amber-500 text-stone-400"
              title="复制 ID"
              @click="copySceneId"
            >
              <Check v-if="idCopied" class="h-3 w-3 text-emerald-500" />
              <Copy v-else class="h-3 w-3" />
            </button>
          </div>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-stone-400">版本号</span>
          <span class="font-mono text-stone-700 dark:text-stone-300">v{{ docStore.document?.revision ?? 1 }}</span>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-stone-400">起始场景</span>
          <span class="font-mono font-bold" :class="docStore.document?.isEntry ? 'text-emerald-600' : 'text-stone-400'">
            {{ docStore.document?.isEntry ? '是 (Entry)' : '否' }}
          </span>
        </div>
      </div>
    </div>

    <!-- Entity Picker Modal -->
    <CanonEntityPicker
      :story-world-id="storyWorldId"
      :open="pickerOpen"
      :type="pickerType"
      @close="pickerOpen = false"
      @select="handlePickerSelect"
    />
  </div>
</template>
