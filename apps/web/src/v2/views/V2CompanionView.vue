<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  Compass,
  Image as ImageIcon,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Users,
  Wifi,
  X,
} from "@lucide/vue";
import type {
  V2CompanionGalleryItemDto,
  V2CompanionMomentDto,
  V2CompanionRosterResponse,
} from "@living-network/contracts/v2";
import Button from "../../components/ui/Button.vue";
import CompanionGallery from "../companion/components/CompanionGallery.vue";
import CompanionMoments from "../companion/components/CompanionMoments.vue";
import CompanionRoster from "../companion/components/CompanionRoster.vue";
import { createV2CompanionClient } from "../companion/client.ts";

const router = useRouter();
const environment = import.meta.env as Record<string, string | undefined>;
const baseUrl = environment.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3003" : window.location.origin);
const client = createV2CompanionClient({ baseUrl });

type CompanionTab = "moments" | "roster" | "gallery";
const currentTab = ref<CompanionTab>("moments");

const moments = ref<readonly V2CompanionMomentDto[]>([]);
const roster = ref<V2CompanionRosterResponse | null>(null);
const gallery = ref<readonly V2CompanionGalleryItemDto[]>([]);
const loading = ref(true);

// Image preview modal
const previewUrl = ref<string | null>(null);

// Current simulated time for phone status bar
const currentTime = ref("12:00");
function updateTime(): void {
  const d = new Date();
  currentTime.value = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

async function loadAll(): Promise<void> {
  loading.value = true;
  try {
    const [momentsData, rosterData, galleryData] = await Promise.all([
      client.listMoments(),
      client.getRoster(),
      client.getGallery(),
    ]);
    moments.value = momentsData;
    roster.value = rosterData;
    gallery.value = galleryData.gallery;
  } catch (error) {
    console.error("Failed to load companion data:", error);
  } finally {
    loading.value = false;
  }
}

function openPreview(url: string): void {
  previewUrl.value = url;
}

onMounted(() => {
  updateTime();
  const timer = setInterval(updateTime, 30000);
  void loadAll();
  return () => clearInterval(timer);
});
</script>

<template>
  <div class="companion-page-wrapper">
    <!-- 拟真社交 App 手机/平板外壳 -->
    <div class="companion-device-frame">
      <!-- 手机顶部状态栏 -->
      <div class="device-status-bar">
        <span class="status-time">{{ currentTime }}</span>
        <div class="device-notch" />
        <div class="status-icons">
          <Wifi :size="12" aria-hidden="true" />
          <span class="status-signal">5G</span>
          <span class="status-battery">100%</span>
        </div>
      </div>

      <!-- App 顶部 Header -->
      <header class="companion-app-header">
        <div class="app-header-title">
          <Sparkles :size="16" class="text-primary" aria-hidden="true" />
          <h2>邻舍 · 虚拟社交伴侣</h2>
        </div>
        <div class="app-header-actions">
          <Button
            variant="ghost"
            size="icon"
            :loading="loading"
            aria-label="刷新动态"
            @click="loadAll"
          >
            <RefreshCw :size="15" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="app-header-chat-btn"
            @click="router.push('/v2/chat')"
          >
            <MessageSquare :size="14" aria-hidden="true" />
            <span>进入故事对话</span>
          </Button>
        </div>
      </header>

      <!-- 主视口内容区 -->
      <main class="companion-app-main">
        <Transition name="fade-fast" mode="out-in">
          <CompanionMoments
            v-if="currentTab === 'moments'"
            key="moments"
            :client="client"
            :moments="moments"
            :loading="loading"
            @refresh="loadAll"
            @preview-image="openPreview"
          />
          <CompanionRoster
            v-else-if="currentTab === 'roster'"
            key="roster"
            :roster="roster"
            :loading="loading"
          />
          <CompanionGallery
            v-else-if="currentTab === 'gallery'"
            key="gallery"
            :client="client"
            :gallery="gallery"
            :loading="loading"
            @preview-image="openPreview"
          />
        </Transition>
      </main>

      <!-- 底部拟真社交 Navigation Dock -->
      <nav class="companion-app-dock" aria-label="社交导航">
        <button
          type="button"
          class="dock-item"
          :class="{ active: currentTab === 'moments' }"
          @click="currentTab = 'moments'"
        >
          <Compass :size="20" aria-hidden="true" />
          <span>朋友圈</span>
        </button>

        <button
          type="button"
          class="dock-item"
          :class="{ active: currentTab === 'roster' }"
          @click="currentTab = 'roster'"
        >
          <Users :size="20" aria-hidden="true" />
          <span>伴侣与日程</span>
        </button>

        <button
          type="button"
          class="dock-item"
          :class="{ active: currentTab === 'gallery' }"
          @click="currentTab = 'gallery'"
        >
          <ImageIcon :size="20" aria-hidden="true" />
          <span>回忆相册</span>
        </button>

        <button
          type="button"
          class="dock-item dock-item-chat"
          @click="router.push('/v2/chat')"
        >
          <MessageCircle :size="20" aria-hidden="true" />
          <span>故事对话</span>
        </button>
      </nav>
    </div>

    <!-- 全屏大图预览弹窗 -->
    <div
      v-if="previewUrl"
      class="image-preview-backdrop"
      @click="previewUrl = null"
    >
      <button
        type="button"
        class="image-preview-close"
        aria-label="关闭大图预览"
        @click="previewUrl = null"
      >
        <X :size="20" aria-hidden="true" />
      </button>
      <img
        :src="previewUrl"
        alt="全屏预览图片"
        class="image-preview-content"
        @click.stop
      />
    </div>
  </div>
</template>

<style scoped>
.companion-page-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: var(--space-4) var(--space-2);
  background: var(--surface-soft);
  overflow: hidden;
}

/* 拟真设备外壳 */
.companion-device-frame {
  display: flex;
  flex-direction: column;
  width: min(540px, 100%);
  height: 100%;
  max-height: 900px;
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: clamp(16px, 3vw, 32px);
  box-shadow: var(--shadow-lg), 0 20px 40px rgb(0 0 0 / 20%);
  overflow: hidden;
  position: relative;
}

/* 顶部状态栏 */
.device-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px 4px;
  background: var(--surface);
  font-size: 11px;
  font-weight: 700;
  color: var(--text-strong);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  user-select: none;
}

.device-notch {
  width: 90px;
  height: 14px;
  background: var(--surface-soft);
  border-radius: var(--radius-full);
}

.status-icons {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
}

/* 标题栏 */
.companion-app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-4);
  background: var(--surface-glass);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  z-index: 10;
}

.app-header-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.app-header-title h2 {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 800;
  color: var(--text-strong);
}

.app-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.app-header-chat-btn {
  font-size: var(--text-xs);
}

/* 主内容区域 */
.companion-app-main {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  position: relative;
  background: var(--background);
}

/* 底部 Dock 导航 */
.companion-app-dock {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 6px 8px;
  background: var(--surface-glass);
  backdrop-filter: blur(16px);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  z-index: 10;
}

.dock-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: all var(--motion-fast);
}

.dock-item:hover {
  color: var(--text-strong);
}

.dock-item.active {
  color: var(--primary);
  transform: translateY(-1px);
}

.dock-item-chat {
  color: var(--primary);
}

/* 全屏大图预览 */
.image-preview-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 85%);
  backdrop-filter: blur(8px);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  cursor: zoom-out;
}

.image-preview-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: rgb(255 255 255 / 20%);
  color: #fff;
  border: 0;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background var(--motion-fast);
}

.image-preview-close:hover {
  background: rgb(255 255 255 / 40%);
}

.image-preview-content {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xl);
  cursor: default;
}

/* 动效 */
.fade-fast-enter-active,
.fade-fast-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.fade-fast-enter-from,
.fade-fast-leave-to {
  opacity: 0;
  transform: scale(0.98);
}
</style>
