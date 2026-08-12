<script setup lang="ts">
const props = defineProps<{
  modelValue: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: number];
}>();
</script>

<template>
  <label class="ui-range" :class="{ disabled: props.disabled }">
    <span v-if="props.label || $slots.default" class="ui-range-label">
      <slot>{{ props.label }}</slot>
    </span>
    <div class="ui-range-track">
      <input
        type="range"
        :value="props.modelValue"
        :min="props.min ?? 0"
        :max="props.max ?? 100"
        :step="props.step ?? 1"
        :disabled="props.disabled"
        @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
      />
      <span class="ui-range-value">{{ props.modelValue }}</span>
    </div>
  </label>
</template>

<style scoped>
.ui-range {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.ui-range.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ui-range-label {
  font-size: var(--text-sm);
  color: var(--muted);
}
.ui-range-track {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.ui-range-track input {
  flex: 1;
  height: 6px;
  appearance: none;
  background: var(--border);
  border-radius: var(--radius-full);
  outline: none;
}
.ui-range-track input::-webkit-slider-thumb {
  appearance: none;
  width: 18px;
  height: 18px;
  background: var(--primary);
  border-radius: var(--radius-full);
  cursor: pointer;
}
.ui-range-track input:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 2px var(--focus-ring);
}
.ui-range-value {
  min-width: 32px;
  font-size: var(--text-sm);
  color: var(--text);
  text-align: right;
}
</style>
