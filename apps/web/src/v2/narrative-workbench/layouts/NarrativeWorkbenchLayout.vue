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
  publish: [];
  refresh: [];
}>();
</script>

<template>
  <div class="h-dvh w-full flex flex-col bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 overflow-hidden font-sans">
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
      @publish="emit('publish')"
      @refresh="emit('refresh')"
    />

    <!-- Main 3-Column Working Grid with Responsive Drawers -->
    <div class="flex-1 min-h-0 flex overflow-hidden relative">
      <!-- Backdrop for small-screen open drawers -->
      <div
        v-if="!explorerCollapsed"
        class="lg:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-xs transition-opacity"
        @click="emit('toggle:explorer')"
      />
      <div
        v-if="!inspectorCollapsed"
        class="xl:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-xs transition-opacity"
        @click="emit('toggle:inspector')"
      />

      <!-- Left Column: Narrative Explorer (260px desktop, slide-over drawer on mobile/tablet) -->
      <aside
        class="w-[280px] lg:w-[260px] shrink-0 border-r border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex flex-col overflow-hidden transition-all duration-200 max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:shadow-2xl"
        :class="[
          explorerCollapsed
            ? 'max-lg:-translate-x-full lg:hidden'
            : 'max-lg:translate-x-0'
        ]"
      >
        <slot name="explorer" />
      </aside>

      <!-- Center Column: Primary Work Surface (minmax(720px, 1fr)) -->
      <main class="flex-1 min-w-[320px] md:min-w-[600px] flex flex-col overflow-hidden bg-stone-100/50 dark:bg-stone-950">
        <slot name="main" />
      </main>

      <!-- Right Column: Context Inspector (320px desktop, slide-over drawer on <1280px) -->
      <aside
        class="w-[340px] xl:w-[320px] shrink-0 border-l border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex flex-col overflow-hidden transition-all duration-200 max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-40 max-xl:shadow-2xl"
        :class="[
          inspectorCollapsed
            ? 'max-xl:translate-x-full xl:hidden'
            : 'max-xl:translate-x-0'
        ]"
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
