<script setup lang="ts">
import { computed } from "vue";
import { cn } from "../../lib/utils";

const props = withDefaults(
  defineProps<{
    as?: string;
    hoverable?: boolean;
    padded?: boolean;
    class?: string;
  }>(),
  {
    as: "div",
    hoverable: false,
    padded: true,
    class: "",
  },
);

const classes = computed(() =>
  cn(
    "ui-card",
    {
      "ui-card-hoverable": props.hoverable,
      "ui-card-unpadded": !props.padded,
    },
    props.class,
  ),
);
</script>

<template>
  <component :is="as" :class="classes">
    <slot />
  </component>
</template>

<style scoped>
.ui-card-hoverable {
  transition: transform var(--motion-fast), border-color var(--motion-fast), box-shadow var(--motion-fast);
  cursor: pointer;
}

.ui-card-hoverable:hover {
  transform: translateY(-2px);
  border-color: var(--primary);
  box-shadow: var(--shadow-md);
}

.ui-card-unpadded {
  padding: 0;
}
</style>
