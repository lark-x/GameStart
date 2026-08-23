<script setup lang="ts">
import { ref } from "vue";
import {
  ArrowLeft,
  Check,
  Eye,
  MoreVertical,
  RefreshCw,
  Search,
  Sparkles,
  TriangleAlert,
  Wand2,
} from "@lucide/vue";
import Button from "../../../../components/ui/Button.vue";
import NarrativeBreadcrumb from "./NarrativeBreadcrumb.vue";
import NarrativeModeTabs, { type NarrativeWorkbenchMode } from "./NarrativeModeTabs.vue";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";

defineProps<{
  worldName?: string | undefined;
  arcTitle?: string | undefined;
  chapterTitle?: string | undefined;
  questTitle?: string | undefined;
  sceneTitle?: string | undefined;
  mode: NarrativeWorkbenchMode;
  saveStatus?: SaveStatus | undefined;
  saveErrorMessage?: string | undefined;
  pendingReviewCount?: number | undefined;
  previewActive?: boolean | undefined;
}>();

const emit = defineEmits<{
  "update:mode": [mode: NarrativeWorkbenchMode];
  back: [];
  search: [];
  preview: [];
  aiAssist: [];
  template: [];
  refresh: [];
}>();

const moreMenuOpen = ref(false);
</script>

<template>
  <header class="h-12 border-b border-stone-200 dark:border-stone-800 bg-white/95 dark:bg-stone-900/95 backdrop-blur px-3 flex items-center justify-between shrink-0 select-none z-20">
    <!-- Left: Back & Breadcrumbs -->
    <div class="flex items-center gap-3 min-w-0">
      <Button
        variant="ghost"
        size="sm"
        class="h-8 px-2 text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white"
        @click="emit('back')"
      >
        <ArrowLeft class="w-4 h-4 mr-1" />
        <span class="text-xs">返回</span>
      </Button>

      <div class="h-4 w-px bg-stone-200 dark:border-stone-700" />

      <NarrativeBreadcrumb
        :world-name="worldName"
        :arc-title="arcTitle"
        :chapter-title="chapterTitle"
        :quest-title="questTitle"
        :scene-title="sceneTitle"
      />
    </div>

    <!-- Center: Modes -->
    <div class="flex items-center">
      <NarrativeModeTabs
        :mode="mode"
        :pending-review-count="pendingReviewCount"
        @update:mode="emit('update:mode', $event)"
      />
    </div>

    <!-- Right: Status, AI, Search, Actions -->
    <div class="flex items-center gap-2">
      <!-- Save Status Indicator -->
      <div class="flex items-center gap-1.5 text-xs mr-2">
        <template v-if="saveStatus === 'saving'">
          <RefreshCw class="w-3.5 h-3.5 animate-spin text-amber-500" />
          <span class="text-stone-500">保存中...</span>
        </template>
        <template v-else-if="saveStatus === 'saved' || saveStatus === 'idle'">
          <Check class="w-3.5 h-3.5 text-emerald-500" />
          <span class="text-stone-500">已保存</span>
        </template>
        <template v-else-if="saveStatus === 'dirty'">
          <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span class="text-stone-500">有修改</span>
        </template>
        <template v-else-if="saveStatus === 'conflict'">
          <TriangleAlert class="w-3.5 h-3.5 text-red-500" />
          <span class="text-red-600 font-medium">版本冲突</span>
        </template>
        <template v-else-if="saveStatus === 'error'">
          <TriangleAlert class="w-3.5 h-3.5 text-red-500" />
          <span class="text-red-600">{{ saveErrorMessage || "保存失败" }}</span>
        </template>
      </div>

      <!-- Quick Search (⌘K) -->
      <Button
        variant="ghost"
        size="sm"
        class="h-8 px-2 text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800"
        @click="emit('search')"
      >
        <Search class="w-3.5 h-3.5 mr-1.5 text-stone-400" />
        <span class="text-xs mr-1 text-stone-500">搜索</span>
        <kbd class="text-[10px] px-1 py-0.2 rounded bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300">⌘K</kbd>
      </Button>

      <!-- AI Assist Button -->
      <Button
        variant="secondary"
        size="sm"
        class="h-8 px-2.5 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800"
        @click="emit('aiAssist')"
      >
        <Sparkles class="w-3.5 h-3.5 mr-1 text-amber-500" />
        <span>AI 创作</span>
      </Button>

      <!-- Preview Button -->
      <Button
        :variant="previewActive ? 'primary' : 'ghost'"
        size="sm"
        class="h-8 px-2 text-xs"
        @click="emit('preview')"
      >
        <Eye class="w-3.5 h-3.5 mr-1" />
        <span>预览</span>
      </Button>

      <!-- More Menu / Actions -->
      <div class="relative">
        <Button
          variant="ghost"
          size="sm"
          class="h-8 w-8 p-0 text-stone-600 dark:text-stone-300"
          @click="moreMenuOpen = !moreMenuOpen"
        >
          <MoreVertical class="w-4 h-4" />
        </Button>

        <div
          v-if="moreMenuOpen"
          class="absolute right-0 mt-1 w-44 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-lg py-1 z-30 text-xs text-stone-700 dark:text-stone-200"
          @click="moreMenuOpen = false"
        >
          <button
            type="button"
            class="w-full text-left px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center gap-2"
            @click="emit('template')"
          >
            <Wand2 class="w-3.5 h-3.5 text-stone-500" />
            <span>套用故事大纲模板</span>
          </button>
          <button
            type="button"
            class="w-full text-left px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center gap-2"
            @click="emit('refresh')"
          >
            <RefreshCw class="w-3.5 h-3.5 text-stone-500" />
            <span>刷新大纲与诊断</span>
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
