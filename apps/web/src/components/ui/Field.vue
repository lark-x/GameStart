<script setup lang="ts">
const props = defineProps<{
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
}>();
</script>

<template>
  <div class="ui-field" :class="{ disabled: props.disabled, error: props.error }">
    <label v-if="props.label || $slots.label" class="ui-field-label">
      <slot name="label">{{ props.label }}</slot>
      <span v-if="props.required" class="ui-field-required">*</span>
    </label>
    <p v-if="props.hint && !props.error" class="ui-field-hint">{{ props.hint }}</p>
    <p v-if="props.error" class="ui-field-error">{{ props.error }}</p>
    <div class="ui-field-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.ui-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.ui-field.disabled {
  opacity: 0.5;
}
.ui-field-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-strong);
}
.ui-field-required {
  color: var(--danger);
  margin-left: 2px;
}
.ui-field-hint {
  font-size: var(--text-xs);
  color: var(--muted);
  margin: 0;
}
.ui-field-error {
  font-size: var(--text-xs);
  color: var(--danger);
  margin: 0;
}
.ui-field-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
</style>
