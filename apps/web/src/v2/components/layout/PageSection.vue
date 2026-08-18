<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    description?: string;
  }>(),
  {},
);
</script>

<template>
  <section class="v2-page-section">
    <header v-if="title || description" class="v2-page-section-header">
      <h2 v-if="title">{{ title }}</h2>
      <p v-if="description">{{ description }}</p>
      <div v-if="$slots.actions" class="v2-page-section-actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="v2-page-section-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.v2-page-section {
  display: grid;
  gap: var(--space-3);
}

.v2-page-section-header {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

.v2-page-section-header h2 {
  margin: 0;
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--text);
}

.v2-page-section-header p {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--muted);
}

.v2-page-section-actions {
  margin-left: auto;
  display: flex;
  gap: var(--space-2);
  align-items: center;
}
</style>
