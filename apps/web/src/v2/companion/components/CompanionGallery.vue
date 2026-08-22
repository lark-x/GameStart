<script setup lang="ts">
import { computed, ref } from "vue";
import { Image as ImageIcon, Sparkles } from "@lucide/vue";
import type { V2CompanionGalleryItemDto } from "@living-network/contracts/v2";
import type { V2CompanionClient } from "../client.ts";

const props = defineProps<{
  client: V2CompanionClient;
  gallery: readonly V2CompanionGalleryItemDto[];
  loading: boolean;
}>();

const emit = defineEmits<{
  "preview-image": [url: string];
}>();

const selectedCharacter = ref<string>("ALL");

const availableCharacters = computed(() => {
  const set = new Set<string>();
  for (const item of props.gallery) {
    set.add(item.characterName);
  }
  return ["ALL", ...Array.from(set)];
});

const filteredGallery = computed(() => {
  if (selectedCharacter.value === "ALL") return props.gallery;
  return props.gallery.filter((item) => item.characterName === selectedCharacter.value);
});

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  } catch {
    return "";
  }
}
</script>

<template>
  <div class="gallery-view-container">
    <div class="gallery-view-header">
      <div class="gallery-header-left">
        <div class="header-icon-pill">
          <ImageIcon :size="18" class="text-primary" aria-hidden="true" />
        </div>
        <div>
          <div class="title-counter-row">
            <h3 class="gallery-view-title">伴侣写真与回忆画廊</h3>
            <span class="gallery-badge">{{ filteredGallery.length }} 张照片</span>
          </div>
          <p class="gallery-view-desc">汇集与伴侣角色在对话、朋友圈互动中生成的所有高清自拍与珍贵插画瞬间</p>
        </div>
      </div>

      <!-- 角色分类 -->
      <div v-if="availableCharacters.length > 2" class="gallery-filter-chips">
        <button
          v-for="char in availableCharacters"
          :key="char"
          type="button"
          class="chip-btn"
          :class="{ 'is-active-chip': selectedCharacter === char }"
          @click="selectedCharacter = char"
        >
          {{ char === 'ALL' ? '全部角色' : char }}
        </button>
      </div>
    </div>

    <div v-if="loading && gallery.length === 0" class="gallery-loading">
      <div class="loading-spinner" />
      <span>正在载入回忆相册…</span>
    </div>

    <div v-else-if="filteredGallery.length === 0" class="gallery-empty-state">
      <Sparkles :size="32" class="text-primary" aria-hidden="true" />
      <h4>暂无写真照片</h4>
      <p>在朋友圈或故事对话中与角色互动，角色会主动为你生成带有精美配图的生活瞬间！</p>
    </div>

    <div v-else class="gallery-photo-grid">
      <div
        v-for="item in filteredGallery"
        :key="item.mediaId"
        class="photo-card"
        @click="emit('preview-image', client.mediaUrl(item.mediaRef))"
      >
        <img
          :src="client.mediaUrl(item.mediaRef)"
          :alt="item.title"
          class="photo-img"
          loading="lazy"
          @error="(e) => (e.target as HTMLElement).style.display = 'none'"
        />
        <div class="photo-overlay">
          <span class="photo-char-tag">{{ item.characterName }}</span>
          <span class="photo-date-tag">{{ formatDate(item.createdAt) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gallery-view-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
}

.gallery-view-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.gallery-header-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.header-icon-pill {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.title-counter-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.gallery-view-title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 800;
  color: var(--text-strong);
}

.gallery-badge {
  font-size: 11px;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-weight: 700;
}

.gallery-view-desc {
  margin: 2px 0 0;
  font-size: var(--text-xs);
  color: var(--muted);
}

.gallery-filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.chip-btn {
  padding: 4px 12px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: var(--surface-soft);
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--motion-fast);
}

.chip-btn:hover {
  background: var(--surface);
  color: var(--text-strong);
}

.chip-btn.is-active-chip {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

/* 照片网格 */
.gallery-photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-3);
}

.photo-card {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border);
  cursor: zoom-in;
  background: var(--surface-soft);
  box-shadow: var(--shadow-sm);
}

.photo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform var(--motion-fast);
}

.photo-card:hover .photo-img {
  transform: scale(1.06);
}

.photo-overlay {
  position: absolute;
  inset: auto 0 0 0;
  padding: var(--space-2) var(--space-3);
  background: linear-gradient(to top, rgb(0 0 0 / 75%), transparent);
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #fff;
}

.photo-char-tag {
  font-size: 11px;
  font-weight: 700;
  background: rgb(255 255 255 / 20%);
  backdrop-filter: blur(4px);
  padding: 1px 7px;
  border-radius: var(--radius-full);
}

.photo-date-tag {
  font-size: 10px;
  opacity: 0.9;
}

.gallery-loading,
.gallery-empty-state {
  padding: var(--space-12) var(--space-4);
  text-align: center;
  color: var(--muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  background: var(--surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
}

.gallery-empty-state h4 {
  margin: 0;
  font-size: var(--text-base);
  color: var(--text-strong);
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border);
  border-top-color: var(--primary);
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
