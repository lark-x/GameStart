<script setup lang="ts">
import { ChevronRight } from "@lucide/vue";

defineProps<{
  worldName?: string | undefined;
  arcTitle?: string | undefined;
  chapterTitle?: string | undefined;
  questTitle?: string | undefined;
  sceneTitle?: string | undefined;
}>();
</script>

<template>
  <nav class="flex items-center gap-1 text-xs text-stone-600 dark:text-stone-300 select-none overflow-hidden text-ellipsis whitespace-nowrap">
    <span class="font-medium text-stone-900 dark:text-stone-100">{{ worldName || "世界正典" }}</span>

    <template v-if="arcTitle">
      <ChevronRight class="w-3.5 h-3.5 text-stone-400 shrink-0" />
      <span class="text-stone-600 dark:text-stone-400 truncate max-w-[120px]">{{ arcTitle }}</span>
    </template>

    <template v-if="chapterTitle">
      <ChevronRight class="w-3.5 h-3.5 text-stone-400 shrink-0" />
      <span class="text-stone-600 dark:text-stone-400 truncate max-w-[120px]">{{ chapterTitle }}</span>
    </template>

    <template v-if="questTitle">
      <ChevronRight class="w-3.5 h-3.5 text-stone-400 shrink-0" />
      <span class="text-stone-600 dark:text-stone-400 truncate max-w-[120px]">{{ questTitle }}</span>
    </template>

    <template v-if="sceneTitle">
      <ChevronRight class="w-3.5 h-3.5 text-stone-400 shrink-0" />
      <span class="font-semibold text-amber-600 dark:text-amber-400 truncate max-w-[140px]">{{ sceneTitle }}</span>
    </template>
  </nav>
</template>
