<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  modelValue: boolean;
  label?: string;
  disabled?: boolean;
  ariaLabel?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const accessibleLabel = computed(() => props.ariaLabel ?? props.label);
</script>

<template>
  <label class="ui-switch" :class="{ disabled: props.disabled }">
    <input
      type="checkbox"
      role="switch"
      :checked="props.modelValue"
      :disabled="props.disabled"
      :aria-label="accessibleLabel"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span class="ui-switch-track" aria-hidden="true">
      <span class="ui-switch-thumb" />
    </span>
    <span v-if="props.label || $slots.default" class="ui-switch-label">
      <slot>{{ props.label }}</slot>
    </span>
  </label>
</template>

<style scoped>
.ui-switch {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  user-select: none;
}

.ui-switch.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ui-switch input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
}

.ui-switch-track {
  position: relative;
  flex: 0 0 auto;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: var(--border-strong);
  transition: background var(--motion-fast);
}

.ui-switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  transition: transform var(--motion-fast);
}

.ui-switch input:checked + .ui-switch-track {
  background: var(--primary);
}

.ui-switch input:checked + .ui-switch-track .ui-switch-thumb {
  transform: translateX(16px);
}

.ui-switch input:focus-visible + .ui-switch-track {
  box-shadow: 0 0 0 2px var(--focus-ring);
}

.ui-switch-label {
  font-size: var(--text-base);
  color: var(--text);
}
</style>
