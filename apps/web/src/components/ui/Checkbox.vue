<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean;
  label?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();
</script>

<template>
  <label class="ui-checkbox" :class="{ disabled: props.disabled }">
    <input
      type="checkbox"
      :checked="props.modelValue"
      :disabled="props.disabled"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span class="ui-checkbox-indicator" />
    <span v-if="props.label || $slots.default" class="ui-checkbox-label">
      <slot>{{ props.label }}</slot>
    </span>
  </label>
</template>

<style scoped>
.ui-checkbox {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  user-select: none;
}
.ui-checkbox.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ui-checkbox input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
}
.ui-checkbox-indicator {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  transition: var(--motion-fast);
}
.ui-checkbox input:checked + .ui-checkbox-indicator {
  background: var(--primary);
  border-color: var(--primary);
}
.ui-checkbox input:checked + .ui-checkbox-indicator::after {
  content: "";
  display: block;
  width: 10px;
  height: 10px;
  background: var(--on-primary);
  border-radius: 2px;
}
.ui-checkbox input:focus-visible + .ui-checkbox-indicator {
  box-shadow: 0 0 0 2px var(--focus-ring);
}
.ui-checkbox-label {
  font-size: var(--text-base);
  color: var(--text);
}
</style>
