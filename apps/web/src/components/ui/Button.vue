<script setup lang="ts">
import { computed } from "vue";
import { cn } from "../../lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "lg" | "icon";

const props = withDefaults(
  defineProps<{
    variant?: Variant;
    size?: Size;
    type?: "button" | "submit" | "reset";
    loading?: boolean;
    disabled?: boolean;
    form?: string;
  }>(),
  {
    variant: "primary",
    size: "md",
    type: "button",
    loading: false,
    disabled: false,
  },
);

const classes = computed(() =>
  cn("ui-button", `ui-button-${props.variant}`, `ui-button-${props.size}`, {
    "ui-button-loading": props.loading,
  }),
);
</script>

<template>
  <button :class="classes" :disabled="disabled || loading" :type="type" :form="form">
    <span v-if="loading" class="ui-spinner" aria-hidden="true" />
    <slot />
  </button>
</template>
