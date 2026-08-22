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

const activeFilter = ref<string | null>(null);

const availableCharacters = [
  { id: "character:furina", name: "芙宁娜" },
  { id: "character:clorinde", name: "克洛琳德" },
  { id: "character:navia", name: "娜维娅" },
];

const filteredGallery = computed(() => {
  if (!activeFilter.value) return props.gallery;
  return props.gallery.filter((g) => g.characterId === activeFilter.value);
});

function avatarInitial(name: string): string {
  return [...name.trim()][0] ?? "?";
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}
</script>

<template>
  <div class="gallery-view-layout">
    <!-- 顶栏：标题 + 照片计数 + 筛选 -->
    <div class="gallery-topbar">
      <div class="topbar-left">
        <div class="title-row">
          <h2 class="gallery-page-title">回忆相册写真</h2>
          <span class="photo-count-pill">{{ filteredGallery.length }} 张珍藏</span>
        </div>
        <span class="gallery-subtitle">与伴侣在不同场景下留存的高清写真与生活瞬间</span>
      </div>

      <!-- 角色筛选 -->
      <div class="gallery-filter-chips">
        <button
          type="button"
          class="chip-btn"
          :class="{ active: activeFilter === null }"
          @click="activeFilter = null"
        >
          全部写真
        </button>

        <button
          v-for="char in availableCharacters"
          :key="char.id"
          type="button"
          class="chip-btn"
          :class="{ active: activeFilter === char.id }"
          @click="activeFilter = char.id"
        >
          {{ char.name }}
        </button>
      </div>
    </div>

    <!-- 加载中 -->
    <div v-if="loading && gallery.length === 0" class="gallery-loading">
      <div class="spinner-ring" />
      <span>正在读取相册写真…</span>
    </div>

    <!-- 空态 -->
    <div v-else-if="filteredGallery.length === 0" class="gallery-empty">
      <ImageIcon :size="36" class="text-primary" aria-hidden="true" />
      <p>相册里还没有照片哦，前往聊天向伴侣索要即时自拍，或让伴侣在朋友圈发布新动态吧！</p>
    </div>

    <!-- 照片网格 -->
    <div v-else class="gallery-grid">
      <article
        v-for="item in filteredGallery"
        :key="item.mediaRef"
        class="photo-card"
        @click="emit('preview-image', client.mediaUrl(item.mediaRef))"
      >
        <img
          :src="client.mediaUrl(item.mediaRef)"
          :alt="item.title || '伴侣写真'"
          class="photo-img"
          loading="lazy"
        />

        <div class="photo-overlay">
          <div class="photo-top-tags">
            <span class="char-pill">
              <span class="char-avatar-dot">{{ avatarInitial(item.characterName) }}</span>
              <span>{{ item.characterName }}</span>
            </span>
            <span class="date-tag">{{ formatDate(item.createdAt) }}</span>
          </div>

          <div class="photo-bottom-info">
            <p v-if="item.title" class="photo-caption">{{ item.title }}</p>
            <div class="photo-meta-line">
              <span class="meta-item">
                <span>{{ item.source === 'chat' ? '💬 对话合影' : '📸 动态写真' }}</span>
              </span>
            </div>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.gallery-view-layout {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
  padding-bottom: 60px;
}

.gallery-topbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 24px;
  background: var(--cmp-surface, #ffffff);
  border: 1px solid var(--cmp-border, #ebdcd1);
  border-radius: 18px;
  box-shadow: var(--cmp-shadow-sm, 0 2px 8px rgba(120, 80, 60, 0.05));
}

.topbar-left {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.gallery-page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 900;
  color: var(--cmp-text-strong, #2c221e);
  letter-spacing: -0.01em;
}

.photo-count-pill {
  font-size: 11px;
  color: var(--cmp-primary, #e06d53);
  background: var(--cmp-primary-soft, #fcedea);
  padding: 2px 10px;
  border-radius: 9999px;
  font-weight: 800;
}

.gallery-subtitle {
  font-size: 12px;
  color: var(--cmp-text-muted, #8c7d74);
}

.gallery-filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip-btn {
  padding: 5px 14px;
  border-radius: 9999px;
  border: 1px solid var(--cmp-border-light, #f3eae2);
  background: var(--cmp-surface-soft, #f6f1ea);
  color: var(--cmp-text-muted, #8c7d74);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.18s ease;
}

.chip-btn:hover {
  background: var(--cmp-surface, #ffffff);
  color: var(--cmp-text-strong, #2c221e);
}

.chip-btn.active {
  background: var(--cmp-primary, #e06d53);
  color: #fff;
  border-color: var(--cmp-primary, #e06d53);
}

/* 照片网格 */
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

.photo-card {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--cmp-border, #ebdcd1);
  box-shadow: var(--cmp-shadow-sm, 0 2px 8px rgba(120, 80, 60, 0.05));
  cursor: zoom-in;
  background: var(--cmp-surface-soft, #f6f1ea);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.photo-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--cmp-shadow-md, 0 8px 24px rgba(120, 80, 60, 0.08));
}

.photo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.photo-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.1) 50%, rgba(0, 0, 0, 0.4) 100%);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 12px;
  color: #ffffff;
  opacity: 0.95;
  transition: opacity 0.2s ease;
}

.photo-card:hover .photo-overlay {
  opacity: 1;
}

.photo-top-tags {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.char-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  font-size: 11px;
  font-weight: 800;
}

.char-avatar-dot {
  width: 16px;
  height: 16px;
  border-radius: 9999px;
  background: var(--cmp-primary, #e06d53);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 9px;
  font-weight: 900;
}

.date-tag {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.8);
}

.photo-bottom-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.photo-caption {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.photo-meta-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.85);
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.gallery-loading,
.gallery-empty {
  padding: 40px;
  text-align: center;
  color: var(--cmp-text-muted, #8c7d74);
  background: var(--cmp-surface, #ffffff);
  border-radius: 18px;
  border: 1px solid var(--cmp-border, #ebdcd1);
}

.spinner-ring {
  width: 28px;
  height: 28px;
  border: 2px solid var(--cmp-border-light, #f3eae2);
  border-top-color: var(--cmp-primary, #e06d53);
  border-radius: 9999px;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 10px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
