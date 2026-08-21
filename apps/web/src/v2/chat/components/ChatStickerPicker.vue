<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { ImagePlus } from "@lucide/vue";
import type { V2ChatStickerDto } from "@living-network/contracts/v2";

import Button from "../../../components/ui/Button.vue";
import { createV2ChatClient } from "../client.ts";
import { shouldLoadStickerLibrary } from "../../views/chat-view-model.ts";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  select: [sticker: V2ChatStickerDto];
  close: [];
}>();

const environment = import.meta.env as Record<string, string | undefined>;
const baseUrl = environment.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3003" : window.location.origin);
const client = createV2ChatClient({ baseUrl });

const stickers = ref<readonly V2ChatStickerDto[]>([]);
const loading = ref(false);
const loaded = ref(false);
const error = ref("");
const importing = ref(false);
const importInput = ref<HTMLInputElement | null>(null);
const importLabel = ref("");

const visibleStickers = computed(() => stickers.value.slice(0, 30));

async function load(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    stickers.value = await client.listStickers();
    loaded.value = true;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "读取表情包失败";
  } finally {
    loading.value = false;
  }
}

async function importSticker(file: File): Promise<void> {
  importing.value = true;
  error.value = "";
  try {
    const media = await client.uploadMedia(file);
    await client.createSticker({ mediaId: media.mediaId, label: importLabel.value.trim() || "表情包" });
    importLabel.value = "";
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "导入表情包失败";
  } finally {
    importing.value = false;
  }
}

function onImportSelected(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file !== undefined) void importSticker(file);
}

function pick(sticker: V2ChatStickerDto): void {
  void client.touchStickerLastUsed(sticker.stickerId);
  emit("select", sticker);
}

function onKeyDown(event: KeyboardEvent): void {
  if (props.open && event.key === "Escape") {
    emit("close");
  }
}

onMounted(() => {
  document.addEventListener("keydown", onKeyDown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", onKeyDown);
});

watch(
  () => props.open,
  (open) => {
    if (shouldLoadStickerLibrary(open, loaded.value)) void load();
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="props.open" class="chat-sticker-popover-wrapper">
    <div class="chat-sticker-backdrop" aria-hidden="true" @click="emit('close')" />
    <div class="chat-sticker-picker" role="dialog" aria-label="选择表情包">
      <div class="chat-sticker-head">
        <span>表情包</span>
        <div class="chat-sticker-import">
          <input
            v-model="importLabel"
            class="chat-sticker-label"
            placeholder="名称（可选）"
            aria-label="表情包名称"
          />
          <input ref="importInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="chat-sticker-file" aria-hidden="true" tabindex="-1" @change="onImportSelected" />
          <Button variant="secondary" size="sm" :loading="importing" @click="importInput?.click()">
            <ImagePlus :size="14" aria-hidden="true" />
            导入
          </Button>
        </div>
      </div>
      <p v-if="error" class="chat-sticker-error" role="alert">{{ error }}</p>
      <p v-else-if="loading" class="chat-sticker-status">正在读取...</p>
      <div v-else-if="visibleStickers.length === 0" class="chat-sticker-empty">还没有表情包，导入一张本地图片开始。</div>
      <div v-else class="chat-sticker-grid">
        <button
          v-for="sticker in visibleStickers"
          :key="sticker.stickerId"
          type="button"
          class="chat-sticker-item"
          :title="sticker.label"
          @click="pick(sticker)"
        >
          <img :src="client.mediaUrl(sticker.mediaRef)" :alt="sticker.label" loading="lazy" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-sticker-popover-wrapper {
  position: absolute;
  bottom: calc(100% + var(--space-2));
  left: 0;
  z-index: 35;
}

.chat-sticker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 34;
  background: transparent;
}

.chat-sticker-picker {
  position: relative;
  z-index: 35;
  width: 350px;
  max-height: 360px;
  overflow-y: auto;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(12px);
  animation: popoverFade 0.16s ease-out;
}

@keyframes popoverFade {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.chat-sticker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border);
  color: var(--text-strong);
  font-size: var(--text-sm);
  font-weight: 700;
}

.chat-sticker-import {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.chat-sticker-label {
  width: 100px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
  color: var(--text);
  font-size: var(--text-xs);
}

.chat-sticker-label:focus {
  outline: none;
  border-color: var(--primary);
}

.chat-sticker-file {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.chat-sticker-error,
.chat-sticker-status,
.chat-sticker-empty {
  padding: var(--space-3) 0;
  color: var(--muted);
  font-size: var(--text-sm);
  text-align: center;
}

.chat-sticker-error {
  color: var(--danger);
}

.chat-sticker-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2);
  padding-top: var(--space-3);
}

.chat-sticker-item {
  display: grid;
  place-items: center;
  padding: var(--space-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  cursor: pointer;
  transition: border-color var(--motion-fast), transform var(--motion-fast);
}

.chat-sticker-item:hover {
  border-color: var(--primary);
  transform: scale(1.05);
}

.chat-sticker-item img {
  max-width: 100%;
  max-height: 64px;
  object-fit: contain;
  border-radius: var(--radius-sm);
}

@media (max-width: 640px) {
  .chat-sticker-popover-wrapper {
    position: fixed;
    inset: auto 0 0 0;
    width: 100%;
    z-index: 50;
  }

  .chat-sticker-backdrop {
    background: rgb(0 0 0 / 28%);
  }

  .chat-sticker-picker {
    width: 100%;
    max-height: 50vh;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    border-bottom: none;
  }
}
</style>
