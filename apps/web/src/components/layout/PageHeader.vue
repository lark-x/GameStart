<script setup lang="ts">
defineProps<{
  eyebrow?: string;
  title: string;
  description?: string;
  status?: string;
}>();
</script>

<template>
  <header class="page-header">
    <div class="page-header-copy">
      <p v-if="eyebrow">{{ eyebrow }}</p>
      <h1>{{ title }}</h1>
      <span v-if="description">{{ description }}</span>
    </div>
    <div v-if="$slots.actions || status" class="header-right">
      <small v-if="status">{{ status }}</small>
      <slot name="actions" />
    </div>
  </header>
</template>
