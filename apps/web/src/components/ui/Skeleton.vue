<script setup lang="ts">
import { computed } from "vue";
import { cn } from "../../lib/utils";

const props = withDefaults(
  defineProps<{
    width?: string;
    height?: string;
    rounded?: "none" | "xs" | "sm" | "md" | "lg" | "full";
    class?: string;
  }>(),
  {
    width: "100%",
    height: "1rem",
    rounded: "md",
    class: "",
  },
);

const classes = computed(() =>
  cn("ui-skeleton", `ui-skeleton-rounded-${props.rounded}`, props.class),
);

const styles = computed(() => ({
  width: props.width,
  height: props.height,
}));
</script>

<template>
  <div :class="classes" :style="styles" aria-hidden="true" />
</template>

<style scoped>
.ui-skeleton {
  background: var(--surface-muted);
  animation: ui-skeleton-pulse 1.6s ease-in-out infinite;
  flex-shrink: 0;
}

.ui-skeleton-rounded-none { border-radius: 0; }
.ui-skeleton-rounded-xs { border-radius: var(--radius-xs); }
.ui-skeleton-rounded-sm { border-radius: var(--radius-sm); }
.ui-skeleton-rounded-md { border-radius: var(--radius-md); }
.ui-skeleton-rounded-lg { border-radius: var(--radius-lg); }
.ui-skeleton-rounded-full { border-radius: var(--radius-full); }

@keyframes ui-skeleton-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}
</style>
