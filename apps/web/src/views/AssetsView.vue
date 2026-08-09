<script setup lang="ts">
import { ref, watch } from "vue";
import Button from "../components/ui/Button.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import PageHeader from "../components/layout/PageHeader.vue";
import { useAppStore } from "../stores/app.js";
import { errorMessage, type ApiStickerPack } from "../types";
const store = useAppStore();
const packs = ref<ApiStickerPack[]>([]);
const status = ref("准备加载表情包……");
async function loadAssets() {
  if (!store.currentWorldId) return;
  status.value = "正在读取表情包……";
  try {
    const result = await store.api.getStickerPacks(store.currentWorldId);
    packs.value = result.data ?? [];
    for (const pack of packs.value) {
      const stickers = await store.api.getStickers(pack.id);
      pack._stickers = stickers.data ?? [];
    }
    status.value = `${packs.value.length} 个表情包`;
  } catch (e: unknown) {
    status.value = errorMessage(e);
  }
}
watch(
  () => store.currentWorldId,
  () => void loadAssets(),
  { immediate: true },
);
</script>
<template>
  <section class="page">
    <PageHeader
      eyebrow="收藏与素材"
      title="表情相册"
      description="把故事里有趣的瞬间，收进自己的小小相册。"
      :status="status"
    >
      <template #actions>
        <Button @click="loadAssets">刷新</Button>
      </template>
    </PageHeader>
    <div v-if="packs.length" class="page-stack">
      <article v-for="pack in packs" :key="pack.id" class="pack-card">
        <header>
          <div class="pack-cover">✦</div>
          <div>
            <p>表情包</p>
            <h2>{{ pack.name }}</h2>
          </div>
          <span>{{ (pack._stickers || []).length }} 张</span>
        </header>
        <div class="sticker-grid">
          <figure v-for="sticker in pack._stickers || []" :key="sticker.id">
            <div>
              <img
                :src="sticker.mediaRef"
                :alt="sticker.label"
                loading="lazy"
              />
            </div>
            <figcaption>{{ sticker.label }}</figcaption>
          </figure>
        </div>
      </article>
    </div>
    <EmptyState
      title="相册还是空的"
      description="导入表情包后，收藏会显示在这里。"
      ><template #icon>▱</template></EmptyState
    >
  </section>
</template>
<style scoped>
.pack-card {
  padding: var(--space-5);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
.pack-card header {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: var(--space-5);
}
.pack-cover {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 18px;
}
.pack-card header div:nth-child(2) {
  flex: 1;
}
.pack-card header p {
  color: var(--muted);
  font-size: var(--text-xs);
}
.pack-card h2 {
  color: var(--text-strong);
  font-size: var(--text-lg);
}
.pack-card header span {
  padding: 5px 9px;
  border-radius: var(--radius-full);
  background: var(--primary-faint);
  color: var(--primary);
  font-size: var(--text-xs);
}
/* 贴纸网格：随宽度自动增减列数 */
.sticker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: var(--space-3);
}
.sticker-grid figure {
  margin: 0;
  padding: var(--space-2);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  text-align: center;
  transition: var(--motion-fast);
}
.sticker-grid figure:hover {
  transform: translateY(-2px);
  background: var(--primary-faint);
}
.sticker-grid figure > div {
  display: grid;
  place-items: center;
  height: 86px;
}
.sticker-grid img {
  max-width: 100%;
  max-height: 82px;
  object-fit: contain;
  border-radius: var(--radius-sm);
}
.sticker-grid figcaption {
  overflow: hidden;
  margin-top: 6px;
  color: var(--muted);
  font-size: var(--text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
