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

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && props.open) handleClose();
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="ui-modal-backdrop" role="presentation" @click.self="handleClose">
      <section class="ui-modal" role="dialog" aria-modal="true" aria-labelledby="ui-modal-title">
        <header class="ui-modal-header">
          <div>
            <p class="ui-modal-eyebrow">内容设置</p>
            <h2 id="ui-modal-title">{{ title }}</h2>
            <p v-if="description">{{ description }}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="关闭弹窗" title="关闭" @click="handleClose">
            <X :size="18" />
          </Button>
        </header>
        <div class="ui-modal-body"><slot /></div>
        <footer v-if="$slots.footer" class="ui-modal-footer"><slot name="footer" /></footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.ui-modal-backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 16px; background: rgb(10 12 24 / 62%); }
.ui-modal { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; width: min(100%, 620px); max-height: min(88vh, 820px); overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-lg); }
.ui-modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); padding: var(--space-5); border-bottom: 1px solid var(--border); }
.ui-modal-header h2 { margin: 3px 0 4px; color: var(--text-strong); font-size: var(--text-xl); }
.ui-modal-header p { margin: 0; color: var(--muted); font-size: var(--text-sm); line-height: 1.6; }
.ui-modal-eyebrow { color: var(--primary); font-size: var(--text-xs); font-weight: 700; }
.ui-modal-body { min-height: 0; overflow-y: auto; padding: var(--space-5); }
.ui-modal-footer { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-2); padding: var(--space-3) var(--space-5); border-top: 1px solid var(--border); background: var(--surface); }
@media (max-width: 640px) {
  .ui-modal-backdrop { padding: 8px; }
  .ui-modal { max-height: calc(100vh - 16px); }
  .ui-modal-header { padding: var(--space-4); }
  .ui-modal-body { padding: var(--space-4); }
  .ui-modal-footer { padding: var(--space-3) var(--space-4); }
}
</style>
