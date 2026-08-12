<script setup lang="ts">
const props = defineProps<{
  modelValue: string;
  tabs: Array<{ value: string; label: string; disabled?: boolean }>;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();
</script>

<template>
  <div class="ui-tabs" :class="{ disabled: props.disabled }" role="tablist">
    <button
      v-for="tab in props.tabs"
      :key="tab.value"
      class="ui-tab"
      :class="{ active: props.modelValue === tab.value, disabled: tab.disabled }"
      role="tab"
      :aria-selected="props.modelValue === tab.value"
      :disabled="props.disabled || tab.disabled"
      @click="emit('update:modelValue', tab.value)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.ui-tabs {
  display: flex;
  gap: var(--space-1);
  border-bottom: 1px solid var(--border);
}
.ui-tabs.disabled {
  opacity: 0.5;
}
.ui-tab {
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--muted);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: var(--motion-fast);
}
.ui-tab:hover:not(:disabled) {
  color: var(--text);
}
.ui-tab.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}
.ui-tab.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
