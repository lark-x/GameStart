<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import {
  Search,
  Loader2,
  FileText,
  User,
  MapPin,
  BookOpen,
  CornerDownLeft,
} from "@lucide/vue";
import { useNarrativeSearchStore } from "../../stores/useNarrativeSearchStore.ts";
import type { V2NarrativeSearchResultItem } from "@living-network/contracts/v2";

const props = defineProps<{
  storyWorldId: string;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  selectItem: [item: V2NarrativeSearchResultItem];
}>();

const searchStore = useNarrativeSearchStore();
const searchInput = ref("");
const inputRef = ref<HTMLInputElement | null>(null);
const selectedIndex = ref(0);
let searchTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      selectedIndex.value = 0;
      nextTick(() => {
        inputRef.value?.focus();
      });
    } else {
      searchInput.value = "";
      searchStore.clear();
    }
  },
);

function handleInput(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  searchInput.value = val;
  selectedIndex.value = 0;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    void searchStore.search(props.storyWorldId, val);
  }, 150);
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    emit("close");
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    if (searchStore.results.length > 0) {
      selectedIndex.value = (selectedIndex.value + 1) % searchStore.results.length;
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (searchStore.results.length > 0) {
      selectedIndex.value =
        (selectedIndex.value - 1 + searchStore.results.length) % searchStore.results.length;
    }
  } else if (e.key === "Enter") {
    e.preventDefault();
    const item = searchStore.results[selectedIndex.value];
    if (item) {
      emit("selectItem", item);
      emit("close");
    }
  }
}

function handleItemClick(item: V2NarrativeSearchResultItem) {
  emit("selectItem", item);
  emit("close");
}

function getKindLabel(kind: string): string {
  switch (kind) {
    case "scene": return "场景";
    case "scene_block": return "分块";
    case "character": return "角色";
    case "location": return "地点";
    case "lore": return "世界观";
    default: return kind;
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 bg-black/50 backdrop-blur-xs transition-opacity"
    @click.self="emit('close')"
    @keydown="handleKeyDown"
  >
    <div
      class="w-full max-w-xl bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xl overflow-hidden flex flex-col transition-all text-sm"
    >
      <!-- Search Input Header -->
      <div class="p-3.5 border-b border-stone-200 dark:border-stone-800 flex items-center gap-3">
        <Loader2 v-if="searchStore.loading" class="h-5 w-5 text-amber-500 animate-spin shrink-0" />
        <Search v-else class="h-5 w-5 text-stone-400 shrink-0" />

        <input
          ref="inputRef"
          :value="searchInput"
          type="text"
          placeholder="搜索剧本、分块、角色、地点与世界观正典..."
          class="flex-1 bg-transparent text-stone-900 dark:text-stone-100 placeholder-stone-400 outline-none text-sm font-medium"
          @input="handleInput"
        />

        <kbd class="px-1.5 py-0.5 text-[11px] font-mono rounded bg-stone-100 dark:bg-stone-800 text-stone-500 border border-stone-200 dark:border-stone-700">
          ESC
        </kbd>
      </div>

      <!-- Search Results Body -->
      <div class="max-h-96 overflow-y-auto p-2 space-y-1">
        <template v-if="searchStore.results.length > 0">
          <button
            v-for="(item, idx) in searchStore.results"
            :key="item.id + item.kind"
            type="button"
            class="w-full p-2.5 rounded-xl text-left flex items-center justify-between gap-3 transition-colors"
            :class="[
              selectedIndex === idx
                ? 'bg-amber-500/10 text-amber-900 dark:text-amber-100'
                : 'hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-800 dark:text-stone-200'
            ]"
            @click="handleItemClick(item)"
            @mouseenter="selectedIndex = idx"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div
                class="p-2 rounded-lg shrink-0"
                :class="[
                  item.kind === 'scene' || item.kind === 'scene_block'
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                    : item.kind === 'character'
                    ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400'
                    : item.kind === 'location'
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                    : 'bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400'
                ]"
              >
                <FileText v-if="item.kind === 'scene' || item.kind === 'scene_block'" class="h-4 w-4" />
                <User v-else-if="item.kind === 'character'" class="h-4 w-4" />
                <MapPin v-else-if="item.kind === 'location'" class="h-4 w-4" />
                <BookOpen v-else class="h-4 w-4" />
              </div>

              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-bold truncate">{{ item.title }}</span>
                  <span
                    class="text-[10px] font-medium px-1.5 py-0.2 rounded-full"
                    :class="[
                      item.kind === 'scene' || item.kind === 'scene_block'
                        ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                        : item.kind === 'character'
                        ? 'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300'
                        : item.kind === 'location'
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                        : 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                    ]"
                  >
                    {{ getKindLabel(item.kind) }}
                  </span>
                </div>
                <p v-if="item.snippet" class="text-xs text-stone-400 truncate mt-0.5">
                  {{ item.snippet }}
                </p>
              </div>
            </div>

            <div class="flex items-center gap-1 text-xs text-stone-400 shrink-0">
              <CornerDownLeft class="h-3.5 w-3.5" />
              <span class="hidden sm:inline">跳转</span>
            </div>
          </button>
        </template>

        <div v-else-if="searchInput && !searchStore.loading" class="p-8 text-center text-stone-400">
          未找到与「{{ searchInput }}」相符的正典内容
        </div>
        <div v-else class="p-8 text-center text-stone-400 space-y-1">
          <p class="font-medium">全局正典检索</p>
          <p class="text-xs text-stone-500">输入关键字快速定位全篇场景、台词文本、角色与地点</p>
        </div>
      </div>

      <!-- Footer Help Hints -->
      <div class="p-2.5 border-t border-stone-100 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-950/40 flex items-center justify-between text-xs text-stone-400 px-4">
        <div class="flex items-center gap-3">
          <span><kbd class="font-mono text-[10px] bg-stone-200 dark:bg-stone-800 px-1 py-0.5 rounded">↑</kbd> <kbd class="font-mono text-[10px] bg-stone-200 dark:bg-stone-800 px-1 py-0.5 rounded">↓</kbd> 切换选项</span>
          <span><kbd class="font-mono text-[10px] bg-stone-200 dark:bg-stone-800 px-1 py-0.5 rounded">↵</kbd> 跳转</span>
        </div>
        <span>Living Network</span>
      </div>
    </div>
  </div>
</template>
