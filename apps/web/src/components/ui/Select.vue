<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue?: string;
    disabled?: boolean;
    required?: boolean;
    id?: string;
    ariaLabel?: string;
  }>(),
  { disabled: false, required: false },
);
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
</script>

<template>
  <select
    :id="id"
    class="ui-select"
    :value="modelValue"
    :disabled="disabled"
    :required="required"
    :aria-label="ariaLabel"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <slot />
  </select>
</template>
