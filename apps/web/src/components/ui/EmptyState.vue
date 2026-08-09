<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <div class="ui-empty-state">
    <div class="ui-empty-icon"><slot name="icon">·</slot></div>
    <strong>{{ title }}</strong>
    <p v-if="description">{{ description }}</p>
    <div v-if="$slots.action" class="ui-empty-action">
      <slot name="action" />
    </div>
  </div>
</template>
