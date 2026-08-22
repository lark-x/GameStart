<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { X } from "@lucide/vue";

import Button from "./Button.vue";

const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  description?: string;
}>(), { description: "" });

const emit = defineEmits<{
  close: [];
  "update:open": [value: boolean];
}>();

function handleClose(): void {
  emit("close");
  emit("update:open", false);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && props.open) handleClose();
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="ui-drawer-backdrop" role="presentation" @click.self="handleClose">
      <aside class="ui-drawer" role="dialog" aria-modal="true" aria-labelledby="ui-drawer-title">
        <header class="ui-drawer-header">
          <div>
            <p class="ui-drawer-eyebrow">创作编辑</p>
            <h2 id="ui-drawer-title">{{ title }}</h2>
            <p v-if="description">{{ description }}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="关闭编辑面板" title="关闭" @click="handleClose">
            <X :size="18" />
          </Button>
        </header>
        <div class="ui-drawer-body"><slot /></div>
        <footer v-if="$slots.footer" class="ui-drawer-footer"><slot name="footer" /></footer>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.ui-drawer-backdrop { position: fixed; inset: 0; z-index: 50; display: flex; justify-content: flex-end; background: rgb(10 12 24 / 42%); }
.ui-drawer { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; width: min(100%, 520px); height: 100%; overflow: hidden; border-left: 1px solid var(--border); background: var(--surface); box-shadow: var(--shadow-lg); }
.ui-drawer-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); padding: var(--space-5); border-bottom: 1px solid var(--border); }
.ui-drawer-header h2 { margin: 3px 0 4px; color: var(--text-strong); font-size: var(--text-xl); }
.ui-drawer-header p { margin: 0; color: var(--muted); font-size: var(--text-sm); line-height: 1.6; }
.ui-drawer-header .ui-drawer-eyebrow { color: var(--primary); font-size: var(--text-xs); font-weight: 700; }
.ui-drawer-body { min-height: 0; overflow-y: auto; padding: var(--space-5); scrollbar-color: var(--scrollbar) transparent; }
.ui-drawer-footer { display: flex; justify-content: flex-end; gap: var(--space-2); padding: var(--space-3) var(--space-5); border-top: 1px solid var(--border); }
@media (max-width: 640px) { .ui-drawer { width: 100%; } .ui-drawer-header, .ui-drawer-body, .ui-drawer-footer { padding: var(--space-4); } }
</style>
