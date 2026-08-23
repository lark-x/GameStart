<script setup lang="ts">
import { BookOpen, FileText, GitBranch, Sparkles } from "@lucide/vue";

export type NarrativeWorkbenchMode = "outline" | "script" | "flow" | "review";

defineProps<{
  mode: NarrativeWorkbenchMode;
  pendingReviewCount?: number | undefined;
}>();

const emit = defineEmits<{
  "update:mode": [mode: NarrativeWorkbenchMode];
}>();

const modes: readonly {
  id: NarrativeWorkbenchMode;
  label: string;
  icon: typeof BookOpen;
}[] = [
  { id: "outline", label: "大纲", icon: BookOpen },
  { id: "script", label: "剧本", icon: FileText },
  { id: "flow", label: "分支", icon: GitBranch },
  { id: "review", label: "AI 审核", icon: Sparkles },
];
</script>

<template>
  <div class="flex items-center gap-1 p-0.5 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700">
    <button
      v-for="item in modes"
      :key="item.id"
      type="button"
      class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all relative"
      :class="[
        mode === item.id
          ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-sm border border-stone-200/60 dark:border-stone-700'
          : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
      ]"
      @click="emit('update:mode', item.id)"
    >
      <component :is="item.icon" class="w-3.5 h-3.5" />
      <span>{{ item.label }}</span>
      <span
        v-if="item.id === 'review' && (pendingReviewCount ?? 0) > 0"
        class="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white leading-tight"
      >
        {{ pendingReviewCount }}
      </span>
    </button>
  </div>
</template>
