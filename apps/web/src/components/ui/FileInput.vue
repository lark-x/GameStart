<script setup lang="ts">
const props = defineProps<{
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  change: [files: File[]];
}>();

function onChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  emit("change", files);
}
</script>

<template>
  <label class="ui-file-input" :class="{ disabled: props.disabled }">
    <input
      type="file"
      :accept="props.accept"
      :multiple="props.multiple"
      :disabled="props.disabled"
      @change="onChange"
    />
    <slot />
  </label>
</template>

<style scoped>
.ui-file-input {
  display: inline-flex;
  cursor: pointer;
}
.ui-file-input.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ui-file-input input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
}
</style>
