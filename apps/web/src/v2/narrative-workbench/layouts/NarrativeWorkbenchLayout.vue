<script setup lang="ts">
import type { NarrativeWorkbenchMode } from "../components/topbar/NarrativeModeTabs.vue";
import type { SaveStatus } from "../components/topbar/NarrativeTopBar.vue";
import NarrativeTopBar from "../components/topbar/NarrativeTopBar.vue";

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
  explorerCollapsed?: boolean | undefined;
  inspectorCollapsed?: boolean | undefined;
  previewActive?: boolean | undefined;
}>();

const emit = defineEmits<{
  "update:mode": [mode: NarrativeWorkbenchMode];
  "toggle:explorer": [];
  "toggle:inspector": [];
  back: [];
  search: [];
  preview: [];
  aiAssist: [];
  template: [];
  refresh: [];
}>();
</script>

<template>
  <div class="h-screen w-screen flex flex-col bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 overflow-hidden font-sans">
    <!-- Focus Header / TopBar -->
    <NarrativeTopBar
      :world-name="worldName"
      :arc-title="arcTitle"
      :chapter-title="chapterTitle"
      :quest-title="questTitle"
      :scene-title="sceneTitle"
      :mode="mode"
      :save-status="saveStatus"
      :save-error-message="saveErrorMessage"
      :pending-review-count="pendingReviewCount"
      :preview-active="previewActive"
      @update:mode="emit('update:mode', $event)"
      @back="emit('back')"
      @search="emit('search')"
      @preview="emit('preview')"
      @ai-assist="emit('aiAssist')"
      @template="emit('template')"
      @refresh="emit('refresh')"
    />

    <!-- Main 3-Column Working Grid -->
    <div class="flex-1 min-h-0 flex overflow-hidden relative">
      <!-- Left Column: Narrative Explorer (260px) -->
      <aside
        v-show="!explorerCollapsed"
        class="w-[260px] shrink-0 border-r border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/60 flex flex-col overflow-hidden"
      >
        <slot name="explorer" />
      </aside>

      <!-- Center Column: Primary Work Surface (minmax(720px, 1fr)) -->
      <main class="flex-1 min-w-[360px] md:min-w-[640px] lg:min-w-[720px] flex flex-col overflow-hidden bg-stone-100/50 dark:bg-stone-950">
        <slot name="main" />
      </main>

      <!-- Right Column: Context Inspector (320px) -->
      <aside
        v-show="!inspectorCollapsed"
        class="w-[320px] shrink-0 border-l border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/60 flex flex-col overflow-hidden"
      >
        <slot name="inspector" />
      </aside>
    </div>

    <!-- Bottom Status / Drawer Container -->
    <footer class="shrink-0 border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 z-10">
      <slot name="bottom" />
    </footer>

    <!-- Global Floating Modals & Overlays -->
    <slot name="overlays" />
  </div>
</template>
