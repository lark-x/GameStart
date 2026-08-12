<script setup lang="ts">
const props = defineProps<{
  modelValue: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();
</script>

<template>
  <div class="ui-radio-group" :class="{ disabled: props.disabled }">
    <label
      v-for="option in props.options"
      :key="option.value"
      class="ui-radio"
      :class="{ disabled: option.disabled }"
    >
      <input
        type="radio"
        :value="option.value"
        :checked="props.modelValue === option.value"
        :disabled="props.disabled || option.disabled"
        @change="emit('update:modelValue', option.value)"
      />
      <span class="ui-radio-indicator" />
      <span class="ui-radio-label">{{ option.label }}</span>
    </label>
  </div>
</template>

<style scoped>
.ui-radio-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.ui-radio-group.disabled {
  opacity: 0.5;
}
.ui-radio {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  user-select: none;
}
.ui-radio.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ui-radio input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
}
.ui-radio-indicator {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-strong);
  border-radius: var(--radius-full);
  background: var(--surface);
  transition: var(--motion-fast);
}
.ui-radio input:checked + .ui-radio-indicator {
  border-color: var(--primary);
}
.ui-radio input:checked + .ui-radio-indicator::after {
  content: "";
  display: block;
  width: 10px;
  height: 10px;
  background: var(--primary);
  border-radius: var(--radius-full);
}
.ui-radio input:focus-visible + .ui-radio-indicator {
  box-shadow: 0 0 0 2px var(--focus-ring);
}
.ui-radio-label {
  font-size: var(--text-base);
  color: var(--text);
}
</style>
