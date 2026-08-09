<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: "neutral" | "info" | "success" | "warning" | "danger";
  }>(),
  { tone: "neutral" },
);
</script>

<template>
  <span class="ui-badge" :class="`ui-badge-${tone}`"><slot /></span>
</template>
