<script setup lang="ts">
import { ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    disabled?: boolean;
    rows?: number;
    id?: string;
    variant?: "default" | "composer";
    autoGrow?: boolean;
  }>(),
  { rows: 4, variant: "default", autoGrow: false },
);
const emit = defineEmits<{
  "update:modelValue": [value: string];
  input: [event: Event];
}>();

const el = ref<HTMLTextAreaElement | null>(null);

function onInput(event: Event) {
  emit("update:modelValue", (event.target as HTMLTextAreaElement).value);
  emit("input", event);
  if (props.autoGrow) resize();
}

function resize() {
  if (!el.value) return;
  el.value.style.height = "auto";
  el.value.style.height = `${Math.min(el.value.scrollHeight, 160)}px`;
}

watch(() => props.modelValue, () => {
  if (props.autoGrow) resize();
});
</script>

<template>
  <textarea
    ref="el"
    :id="id"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :rows="rows"
    :class="['ui-input ui-textarea', variant === 'composer' ? 'ui-textarea-composer' : '']"
    @input="onInput"
  />
</template>

<style scoped>
.ui-textarea-composer {
  min-height: 44px;
  max-height: 160px;
  resize: none;
  overflow-y: auto;
  line-height: 1.5;
  padding-block: 10px;
}
</style>
