<script setup lang="ts">
import { computed, ref } from "vue";
import { Image as ImageIcon } from "@lucide/vue";
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
  <div class="companion-gallery-view">
    <div class="gallery-header">
      <div class="gallery-title-row">
        <h3 class="gallery-title">伴侣自拍与回忆相册</h3>
        <span class="gallery-count">{{ filteredGallery.length }} 张照片</span>
      </div>
      <p class="gallery-desc">汇集与角色在日常对话和朋友圈中生成的所有精美插画与瞬间</p>

      <!-- 角色分类标签 -->
      <div v-if="availableCharacters.length > 2" class="gallery-filter-tabs">
        <button
          v-for="char in availableCharacters"
          :key="char"
          type="button"
          class="filter-tab-btn"
          :class="{ active: selectedCharacter === char }"
          @click="selectedCharacter = char"
        >
          {{ char === 'ALL' ? '全部角色' : char }}
        </button>
      </div>
    </div>

    <div v-if="loading && gallery.length === 0" class="gallery-status">
      正在载入回忆相册…
    </div>
    <div v-else-if="filteredGallery.length === 0" class="gallery-empty">
      <ImageIcon :size="28" class="text-primary" aria-hidden="true" />
      <p>暂无回忆照片</p>
      <small>在朋友圈或对话中与角色互动，角色会主动为你生成带有精美配图的生活瞬间！</small>
    </div>
    <div v-else class="gallery-grid">
      <div
        v-for="item in filteredGallery"
        :key="item.mediaId"
        class="gallery-card"
        @click="emit('preview-image', client.mediaUrl(item.mediaRef))"
      >
        <img
          :src="client.mediaUrl(item.mediaRef)"
          :alt="item.title"
          class="gallery-image"
          loading="lazy"
          @error="(e) => (e.target as HTMLElement).style.display = 'none'"
        />
        <div class="gallery-card-overlay">
          <span class="gallery-char-badge">{{ item.characterName }}</span>
          <span class="gallery-card-date">{{ formatDate(item.createdAt) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.companion-gallery-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: var(--space-4) var(--space-3);
  gap: var(--space-3);
  background: var(--background);
}

.gallery-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.gallery-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.gallery-title {
  margin: 0;
  font-size: var(--text-md);
  font-weight: 800;
  color: var(--text-strong);
}

.gallery-count {
  font-size: 11px;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-weight: 700;
}

.gallery-desc {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--muted);
}

.gallery-filter-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.filter-tab-btn {
  padding: 4px 10px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--motion-fast);
}

.filter-tab-btn:hover {
  color: var(--text-strong);
  border-color: var(--border-strong);
}

.filter-tab-btn.active {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: var(--space-2);
}

.gallery-card {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border);
  cursor: pointer;
  background: var(--surface-soft);
}

.gallery-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform var(--motion-fast);
}

.gallery-card:hover .gallery-image {
  transform: scale(1.05);
}

.gallery-card-overlay {
  position: absolute;
  inset: auto 0 0 0;
  padding: var(--space-2);
  background: linear-gradient(to top, rgb(0 0 0 / 70%), transparent);
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #fff;
}

.gallery-char-badge {
  font-size: 10px;
  font-weight: 700;
  background: rgb(255 255 255 / 20%);
  backdrop-filter: blur(4px);
  padding: 1px 6px;
  border-radius: var(--radius-full);
}

.gallery-card-date {
  font-size: 10px;
  opacity: 0.85;
}

.gallery-status,
.gallery-empty {
  padding: var(--space-8);
  text-align: center;
  color: var(--muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.gallery-empty p {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--text-strong);
}
</style>
