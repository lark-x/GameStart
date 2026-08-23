<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Settings,
  MapPin,
  Users,
  User,
  BookOpen,
  Sparkles,
  Trash2,
  RefreshCw,
} from "@lucide/vue";
import { useSceneDocumentStore } from "../../../story/stores/useSceneDocumentStore.ts";
import { useNarrativeReferenceStore } from "../../../story/stores/useNarrativeReferenceStore.ts";
import { useNarrativeCanonLookupStore } from "../../stores/useNarrativeCanonLookupStore.ts";
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

const docStore = useSceneDocumentStore();
const refStore = useNarrativeReferenceStore();
const canonStore = useNarrativeCanonLookupStore();
const choiceStore = useNarrativeChoiceStore();

const activeTab = ref<"meta" | "refs" | "context">("meta");

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
</script>

<template>
  <div class="h-full flex flex-col bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-800 text-xs">
    <!-- Header Tabs -->
    <div class="flex items-center border-b border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-950/40 p-1">
      <button
        type="button"
        class="flex-1 py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors"
        :class="[
          activeTab === 'meta'
            ? 'bg-white dark:bg-stone-800 text-amber-600 dark:text-amber-400 shadow-sm'
            : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
        ]"
        @click="activeTab = 'meta'"
      >
        <Settings class="h-3.5 w-3.5" />
        <span>属性</span>
      </button>
      <button
        type="button"
        class="flex-1 py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors"
        :class="[
          activeTab === 'refs'
            ? 'bg-white dark:bg-stone-800 text-amber-600 dark:text-amber-400 shadow-sm'
            : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
        ]"
        @click="activeTab = 'refs'"
      >
        <MapPin class="h-3.5 w-3.5" />
        <span>引用</span>
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
          activeTab === 'context'
            ? 'bg-white dark:bg-stone-800 text-amber-600 dark:text-amber-400 shadow-sm'
            : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
        ]"
        @click="activeTab = 'context'"
      >
        <Sparkles class="h-3.5 w-3.5" />
        <span>AI 上下文</span>
      </button>
    </div>

    <!-- Tab Content -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      <!-- 1. Metadata Tab -->
      <template v-if="activeTab === 'meta'">
        <div class="space-y-4">
          <!-- Title & ID -->
          <div class="space-y-1.5">
            <label class="font-semibold text-stone-500">场景标题</label>
            <input
              :value="docStore.document?.title ?? ''"
              type="text"
              class="w-full px-2.5 py-1.5 rounded-lg bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 font-medium outline-none focus:border-amber-500"
              @input="(e) => {
                if (docStore.document) {
                  docStore.document = { ...docStore.document, title: (e.target as HTMLInputElement).value };
                  docStore.isDirty = true;
                }
              }"
            />
          </div>

          <!-- Hierarchy & Status -->
          <div class="p-3 bg-stone-50/60 dark:bg-stone-950/40 rounded-xl border border-stone-100 dark:border-stone-800/80 space-y-2">
            <div class="flex items-center justify-between text-stone-500">
              <span>场景 ID</span>
              <span class="font-mono text-stone-800 dark:text-stone-200 font-semibold">{{ sceneId }}</span>
            </div>
            <div class="flex items-center justify-between text-stone-500">
              <span>版本号</span>
              <span class="font-mono text-stone-800 dark:text-stone-200">v{{ docStore.document?.revision ?? 1 }}</span>
            </div>
            <div class="flex items-center justify-between text-stone-500">
              <span>分块数量</span>
              <span class="font-mono text-stone-800 dark:text-stone-200">{{ docStore.blocks.length }}</span>
            </div>
            <div class="flex items-center justify-between text-stone-500">
              <span>起始场景 (isEntry)</span>
              <span
                class="px-1.5 py-0.5 rounded text-[10px] font-bold"
                :class="docStore.document?.isEntry ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300' : 'bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-400'"
              >
                {{ docStore.document?.isEntry ? '是' : '否' }}
              </span>
            </div>
          </div>

          <!-- Outgoing Choices -->
          <div class="space-y-2 pt-2 border-t border-stone-100 dark:border-stone-800">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-stone-700 dark:text-stone-300">出口分支 (Choices)</span>
              <span class="font-mono text-stone-400">({{ sceneChoices.length }})</span>
            </div>

            <div v-if="sceneChoices.length > 0" class="space-y-1.5">
              <div
                v-for="c in sceneChoices"
                :key="c.choiceId"
                class="p-2 rounded-lg bg-stone-50 dark:bg-stone-800/50 border border-stone-200/60 dark:border-stone-700/60 space-y-1"
              >
                <div class="flex items-center justify-between">
                  <span class="font-medium text-stone-800 dark:text-stone-200">{{ c.label }}</span>
                  <span class="font-mono text-[10px] text-stone-400">→ {{ c.targetSceneId }}</span>
                </div>
                <p v-if="c.gates && c.gates.length > 0" class="text-[10px] font-mono text-amber-600 dark:text-amber-400">
                  门禁: {{ c.gates.map((g) => `${g.stateKey} ${g.operator} ${g.value}`).join(' & ') }}
                </p>
              </div>
            </div>
            <p v-else class="text-stone-400 italic">当前场景无后继分支选项</p>
          </div>
        </div>
      </template>

      <!-- 2. References Tab -->
      <template v-else-if="activeTab === 'refs'">
        <div class="space-y-5">
          <!-- Main Location -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5 font-semibold text-stone-700 dark:text-stone-300">
                <MapPin class="h-3.5 w-3.5 text-amber-500" />
                <span>主地点 (Main Location)</span>
              </div>
              <button
                type="button"
                class="text-amber-600 dark:text-amber-400 hover:underline font-medium text-[11px]"
                @click="openPicker('location')"
              >
                {{ refStore.mainLocationId ? '更改' : '+ 选择地点' }}
              </button>
            </div>

            <div
              v-if="mainLocation"
              class="p-2.5 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 flex items-center justify-between"
            >
              <div class="min-w-0">
                <h4 class="font-bold text-stone-900 dark:text-stone-100 truncate">{{ mainLocation.name }}</h4>
                <p v-if="mainLocation.summary" class="text-[11px] text-stone-500 truncate">{{ mainLocation.summary }}</p>
              </div>
              <button
                type="button"
                class="p-1 text-stone-400 hover:text-red-500 rounded transition-colors shrink-0"
                title="清除地点"
                @click="refStore.setMainLocation(storyWorldId, sceneId, null)"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
            <div v-else class="p-3 text-center border border-dashed border-stone-200 dark:border-stone-800 rounded-xl text-stone-400">
              未指定主地点
            </div>
          </div>

          <!-- Participating Characters -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5 font-semibold text-stone-700 dark:text-stone-300">
                <Users class="h-3.5 w-3.5 text-sky-500" />
                <span>出场角色 (Characters)</span>
                <span class="font-mono text-stone-400">({{ participatingCharacters.length }})</span>
              </div>
              <button
                type="button"
                class="text-amber-600 dark:text-amber-400 hover:underline font-medium text-[11px]"
                @click="openPicker('character')"
              >
                + 添加角色
              </button>
            </div>

            <div v-if="participatingCharacters.length > 0" class="space-y-1.5">
              <div
                v-for="char in participatingCharacters"
                :key="char.characterId"
                class="p-2 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/60 dark:border-stone-700/60 flex items-center justify-between gap-2"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <div
                    class="w-6 h-6 rounded-full flex items-center justify-center shrink-0 border border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 text-sky-500"
                  >
                    <User class="h-3.5 w-3.5" />
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5">
                      <span class="font-medium text-stone-800 dark:text-stone-200 truncate">{{ char.name }}</span>
                      <span
                        v-if="char.isSpeaker"
                        class="px-1 py-0.2 rounded text-[9px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                      >
                        说话中
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  class="p-1 text-stone-400 hover:text-red-500 rounded transition-colors shrink-0"
                  title="移除角色"
                  @click="refStore.removeParticipant(storyWorldId, sceneId, char.characterId)"
                >
                  <Trash2 class="h-3 w-3" />
                </button>
              </div>
            </div>
            <div v-else class="p-3 text-center border border-dashed border-stone-200 dark:border-stone-800 rounded-xl text-stone-400">
              尚无出场角色
            </div>
          </div>

          <!-- Lore Items -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5 font-semibold text-stone-700 dark:text-stone-300">
                <BookOpen class="h-3.5 w-3.5 text-purple-500" />
                <span>关联世界观 (Lore)</span>
                <span class="font-mono text-stone-400">({{ refStore.loreItemIds.length }})</span>
              </div>
              <button
                type="button"
                class="text-amber-600 dark:text-amber-400 hover:underline font-medium text-[11px]"
                @click="openPicker('lore')"
              >
                + 关联设定
              </button>
            </div>

            <div v-if="refStore.loreItemIds.length > 0" class="flex flex-wrap gap-1.5">
              <span
                v-for="loreId in refStore.loreItemIds"
                :key="loreId"
                class="px-2 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200/60 dark:border-purple-900/60 text-purple-800 dark:text-purple-300 text-[11px] font-medium flex items-center gap-1.5"
              >
                <span>{{ loreId }}</span>
                <button
                  type="button"
                  class="hover:text-red-500"
                  @click="refStore.removeLoreItem(storyWorldId, sceneId, loreId)"
                >
                  &times;
                </button>
              </span>
            </div>
            <div v-else class="p-3 text-center border border-dashed border-stone-200 dark:border-stone-800 rounded-xl text-stone-400">
              尚未关联世界观设定
            </div>
          </div>
        </div>
      </template>

      <!-- 3. AI Context Preview Tab -->
      <template v-else-if="activeTab === 'context'">
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-stone-700 dark:text-stone-300">生成提示词预览</span>
            <button
              type="button"
              class="px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-stone-700 dark:text-stone-300 font-medium flex items-center gap-1 transition-colors"
              :disabled="loadingContext"
              @click="loadContextPreview"
            >
              <RefreshCw class="h-3 w-3" :class="{ 'animate-spin': loadingContext }" />
              <span>刷新预览</span>
            </button>
          </div>

          <div class="space-y-2">
            <label class="text-stone-500 font-medium">额外生成指令 (Prompt)</label>
            <textarea
              v-model="userPromptInput"
              rows="2"
              placeholder="输入针对本场景生成的补充要求..."
              class="w-full p-2 rounded-lg bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 outline-none text-stone-900 dark:text-stone-100"
            />
          </div>

          <div v-if="contextPreview" class="p-3 rounded-xl bg-stone-50 dark:bg-stone-950/60 border border-stone-200 dark:border-stone-800 space-y-3 font-mono text-[11px]">
            <div>
              <span class="text-stone-400 block mb-1 font-sans font-semibold">组装上下文预估</span>
              <div class="text-stone-600 dark:text-stone-400">
                Token 预估: ~{{ contextPreview.totalTokensEstimate }} | 段落数: {{ contextPreview.sections.length }} | 哈希: {{ contextPreview.contextHash.slice(0, 8) }}
              </div>
            </div>

            <div v-for="sec in contextPreview.sections" :key="sec.title" class="space-y-1">
              <div class="flex items-center justify-between text-stone-400 font-sans font-semibold text-[10px]">
                <span>{{ sec.title }}</span>
                <span>~{{ sec.tokenEstimate }} tokens</span>
              </div>
              <pre class="whitespace-pre-wrap text-stone-700 dark:text-stone-300 bg-white dark:bg-stone-900 p-2 rounded border border-stone-200 dark:border-stone-800 max-h-32 overflow-y-auto">{{ sec.content }}</pre>
            </div>
          </div>
          <div v-else-if="!loadingContext" class="p-6 text-center text-stone-400 border border-dashed border-stone-200 dark:border-stone-800 rounded-xl">
            点击“刷新预览”查看当前场景下 AI 组装的上下文
          </div>
        </div>
      </template>
    </div>

    <!-- Entity Picker Modal -->
    <CanonEntityPicker
      v-if="pickerOpen"
      :type="pickerType"
      :characters="characters"
      :locations="locations"
      :lore-items="canonStore.loreItems"
      :selected-ids="
        pickerType === 'character'
          ? refStore.participantCharacterIds
          : pickerType === 'location'
          ? (refStore.mainLocationId ? [refStore.mainLocationId] : [])
          : refStore.loreItemIds
      "
      @select="handlePickerSelect"
      @close="pickerOpen = false"
    />
  </div>
</template>
