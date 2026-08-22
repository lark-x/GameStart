<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  ArrowLeft,
  Calendar,
  Compass,
  Image as ImageIcon,
  Menu,
  MessageSquare,
  Moon,
  Palette,
  Sun,
  Users,
  X,
} from "@lucide/vue";
import type {
  V2CompanionGalleryItemDto,
  V2CompanionMomentDto,
  V2CompanionRosterResponse,
} from "@living-network/contracts/v2";
import CompanionChat from "../companion/components/CompanionChat.vue";
import CompanionGallery from "../companion/components/CompanionGallery.vue";
import CompanionMoments from "../companion/components/CompanionMoments.vue";
import CompanionSchedule from "../companion/components/CompanionSchedule.vue";
import CompanionTavern from "../companion/components/CompanionTavern.vue";
import { createV2CompanionClient } from "../companion/client.ts";
import { useCompanionTheme } from "../companion/theme.ts";
import "../companion/companion-theme.css";

const router = useRouter();
const environment = import.meta.env as Record<string, string | undefined>;
const baseUrl = environment.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3003" : window.location.origin);
const client = createV2CompanionClient({ baseUrl });

const { theme, toggleTheme } = useCompanionTheme();

type ActiveTab = "chat" | "moments" | "schedule" | "gallery" | "tavern";
const activeTab = ref<ActiveTab>("chat");

// Companion data
const moments = ref<readonly V2CompanionMomentDto[]>([]);
const roster = ref<V2CompanionRosterResponse | null>(null);
const gallery = ref<readonly V2CompanionGalleryItemDto[]>([]);
const loading = ref(true);

// Selected focused character
const selectedCharacterId = ref<string>("character:furina");

// Image Lightbox
const previewImageUrl = ref<string | null>(null);

// Mobile Sidebar drawer
const mobileSidebarOpen = ref(false);

// Realtime Ambient Clock
const currentTime = ref("12:00");
const timeLabel = ref("午后时光");
const isDay = ref(true);
let clockTimer: ReturnType<typeof setInterval> | null = null;

function updateClock(): void {
  const d = new Date();
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  currentTime.value = `${String(h).padStart(2, "0")}:${m}`;

  if (h >= 6 && h < 12) {
    timeLabel.value = "清晨时光";
    isDay.value = true;
  } else if (h >= 12 && h < 18) {
    timeLabel.value = "午后漫步";
    isDay.value = true;
  } else if (h >= 18 && h < 22) {
    timeLabel.value = "温馨傍晚";
    isDay.value = false;
  } else {
    timeLabel.value = "静谧深夜";
    isDay.value = false;
  }
}

const focusedCharacter = computed(() => {
  if (!roster.value || roster.value.characters.length === 0) return null;
  return (
    roster.value.characters.find((c) => c.characterId === selectedCharacterId.value) ||
    roster.value.characters[0]
  );
});

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

    if (rosterData.characters.length > 0 && !rosterData.characters.some((c) => c.characterId === selectedCharacterId.value)) {
      selectedCharacterId.value = rosterData.characters[0]?.characterId ?? "character:furina";
    }
  } catch (error) {
    console.error("Failed to load companion data:", error);
  } finally {
    loading.value = false;
  }
}

function handleSelectCharacter(charId: string): void {
  selectedCharacterId.value = charId;
  mobileSidebarOpen.value = false;
}

function handleStartChat(charId?: string): void {
  if (charId) {
    selectedCharacterId.value = charId;
  }
  activeTab.value = "chat";
}

function openLightbox(url: string): void {
  previewImageUrl.value = url;
}

function avatarInitial(name: string): string {
  return [...name.trim()][0] ?? "?";
}

onMounted(() => {
  updateClock();
  clockTimer = setInterval(updateClock, 15000);
  void loadAll();
});

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer);
});
</script>

<template>
  <div class="linshe-standalone-root" :data-companion-theme="theme">
    <!-- 移动端抽屉遮罩 (Scrim) -->
    <div
      v-if="mobileSidebarOpen"
      class="mobile-scrim"
      @click="mobileSidebarOpen = false"
    />

    <!-- ═══ 1. 左侧 NavBar 导航栏 (56px 极致轻巧) ═══ -->
    <nav class="linshe-navbar" aria-label="邻舍主导航">
      <div class="navbar-top">
        <div class="linshe-brand-mark" title="邻舍 · 角色陪伴生活">
          <span class="brand-heart">💖</span>
        </div>

        <button
          type="button"
          class="nav-item"
          :class="{ active: activeTab === 'chat' }"
          title="聊天"
          @click="activeTab = 'chat'"
        >
          <div class="nav-icon-wrap">
            <MessageSquare :size="20" aria-hidden="true" />
          </div>
          <span class="nav-label">聊天</span>
        </button>

        <button
          type="button"
          class="nav-item"
          :class="{ active: activeTab === 'moments' }"
          title="朋友圈"
          @click="activeTab = 'moments'"
        >
          <div class="nav-icon-wrap">
            <Compass :size="20" aria-hidden="true" />
            <span v-if="moments.length > 0" class="nav-dot">{{ moments.length }}</span>
          </div>
          <span class="nav-label">朋友圈</span>
        </button>

        <button
          type="button"
          class="nav-item"
          :class="{ active: activeTab === 'schedule' }"
          title="日程"
          @click="activeTab = 'schedule'"
        >
          <div class="nav-icon-wrap">
            <Calendar :size="20" aria-hidden="true" />
          </div>
          <span class="nav-label">日程</span>
        </button>

        <button
          type="button"
          class="nav-item"
          :class="{ active: activeTab === 'gallery' }"
          title="相册"
          @click="activeTab = 'gallery'"
        >
          <div class="nav-icon-wrap">
            <ImageIcon :size="20" aria-hidden="true" />
          </div>
          <span class="nav-label">相册</span>
        </button>

        <button
          type="button"
          class="nav-item"
          :class="{ active: activeTab === 'tavern' }"
          title="酒馆"
          @click="activeTab = 'tavern'"
        >
          <div class="nav-icon-wrap">
            <Users :size="20" aria-hidden="true" />
          </div>
          <span class="nav-label">酒馆</span>
        </button>
      </div>

      <div class="navbar-bottom">
        <!-- 独立暖色主题切换 -->
        <button
          type="button"
          class="nav-item theme-toggle-btn"
          :title="theme === 'cream' ? '当前：暖阳奶油（点击切为落日暖咖）' : '当前：落日暖咖（点击切为暖阳奶油）'"
          @click="toggleTheme"
        >
          <div class="nav-icon-wrap">
            <Palette :size="18" aria-hidden="true" />
          </div>
          <span class="nav-label">{{ theme === 'cream' ? '奶油' : '暖咖' }}</span>
        </button>

        <!-- 返回创作工作台 -->
        <button
          type="button"
          class="nav-item return-workspace-btn"
          title="返回创作工作台"
          @click="router.push('/v2/workspace/project')"
        >
          <div class="nav-icon-wrap">
            <ArrowLeft :size="18" aria-hidden="true" />
          </div>
          <span class="nav-label">工作台</span>
        </button>
      </div>
    </nav>

    <!-- ═══ 2. 中间 Sidebar 伴侣精简列表 (240px) ═══ -->
    <aside
      class="linshe-sidebar"
      :class="{ 'mobile-open': mobileSidebarOpen }"
      aria-label="伴侣角色列表"
    >
      <div class="sidebar-header">
        <div class="sidebar-title-row">
          <span class="sidebar-title">伴侣名册</span>
          <div class="ambient-tag" :class="{ 'is-day': isDay, 'is-night': !isDay }">
            <Sun v-if="isDay" :size="11" class="text-amber-500" aria-hidden="true" />
            <Moon v-else :size="11" class="text-indigo-400" aria-hidden="true" />
            <span>{{ timeLabel }}</span>
          </div>
        </div>
      </div>

      <div class="char-list-scroll">
        <div
          v-for="c in roster?.characters || []"
          :key="c.characterId"
          class="char-item-row"
          :class="{ active: c.characterId === selectedCharacterId }"
          @click="handleSelectCharacter(c.characterId)"
        >
          <div class="char-avatar-ring">
            <div class="char-avatar-box">
              {{ avatarInitial(c.name) }}
            </div>
            <div class="live-status-dot" />
          </div>

          <div class="char-info-col">
            <div class="char-name-time-row">
              <span class="char-name-text">{{ c.name }}</span>
            </div>
            <div class="char-schedule-preview">
              {{ c.schedule.currentActivity.locationName }}
            </div>
          </div>
        </div>

        <div v-if="loading && (!roster || roster.characters.length === 0)" class="sidebar-loading">
          正在读取伴侣数据…
        </div>
      </div>
    </aside>

    <!-- ═══ 3. 右侧主视口区 (Page Host 占据 75%+ 宽屏主舞台) ═══ -->
    <main class="linshe-main-viewport" :class="{ 'is-chat-layout': activeTab === 'chat' }">
      <!-- 移动端顶部 Header -->
      <div class="mobile-topbar-header">
        <button
          type="button"
          class="mobile-menu-btn"
          aria-label="打开角色抽屉"
          @click="mobileSidebarOpen = true"
        >
          <Menu :size="18" aria-hidden="true" />
        </button>
        <span class="mobile-page-name">
          {{ activeTab === 'chat' ? `对话 · ${focusedCharacter?.name || '伴侣'}` : activeTab === 'moments' ? '朋友圈' : activeTab === 'schedule' ? '生活日程' : activeTab === 'gallery' ? '相册写真' : '酒馆档案' }}
        </span>
        <button
          type="button"
          class="mobile-back-btn"
          title="返回工作台"
          @click="router.push('/v2/workspace/project')"
        >
          <ArrowLeft :size="16" aria-hidden="true" />
        </button>
      </div>

      <!-- 视口内容根据 activeTab 渲染 -->
      <div class="viewport-content-container" :class="{ 'is-chat-container': activeTab === 'chat' }">
        <!-- 专属私密聊天视图 -->
        <CompanionChat
          v-if="activeTab === 'chat' && focusedCharacter"
          :character="focusedCharacter"
          :companion-client="client"
          @preview-image="openLightbox"
          @affinity-change="loadAll"
        />

        <!-- 朋友圈视图 -->
        <CompanionMoments
          v-else-if="activeTab === 'moments'"
          :client="client"
          :moments="moments"
          :loading="loading"
          @refresh="loadAll"
          @preview-image="openLightbox"
          @select-character="handleSelectCharacter"
        />

        <!-- 日程视图 -->
        <CompanionSchedule
          v-else-if="activeTab === 'schedule'"
          :roster="roster"
          :loading="loading"
          @refresh="loadAll"
          @select-character="handleSelectCharacter"
        />

        <!-- 相册视图 -->
        <CompanionGallery
          v-else-if="activeTab === 'gallery'"
          :client="client"
          :gallery="gallery"
          :loading="loading"
          @preview-image="openLightbox"
        />

        <!-- 酒馆视图 -->
        <CompanionTavern
          v-else-if="activeTab === 'tavern'"
          :roster="roster"
          :loading="loading"
          @start-chat="handleStartChat"
        />
      </div>
    </main>

    <!-- 移动端底部固定毛玻璃 Dock -->
    <nav class="mobile-bottom-dock" aria-label="移动端底部导航">
      <button
        type="button"
        class="dock-item"
        :class="{ active: activeTab === 'chat' }"
        @click="activeTab = 'chat'"
      >
        <MessageSquare :size="18" aria-hidden="true" />
        <span>聊天</span>
      </button>

      <button
        type="button"
        class="dock-item"
        :class="{ active: activeTab === 'moments' }"
        @click="activeTab = 'moments'"
      >
        <Compass :size="18" aria-hidden="true" />
        <span>朋友圈</span>
      </button>

      <button
        type="button"
        class="dock-item"
        :class="{ active: activeTab === 'schedule' }"
        @click="activeTab = 'schedule'"
      >
        <Calendar :size="18" aria-hidden="true" />
        <span>日程</span>
      </button>

      <button
        type="button"
        class="dock-item"
        :class="{ active: activeTab === 'gallery' }"
        @click="activeTab = 'gallery'"
      >
        <ImageIcon :size="18" aria-hidden="true" />
        <span>相册</span>
      </button>

      <button
        type="button"
        class="dock-item"
        :class="{ active: activeTab === 'tavern' }"
        @click="activeTab = 'tavern'"
      >
        <Users :size="18" aria-hidden="true" />
        <span>酒馆</span>
      </button>
    </nav>

    <!-- 全屏大图 Lightbox 预览 -->
    <div
      v-if="previewImageUrl"
      class="fullscreen-lightbox-modal"
      @click="previewImageUrl = null"
    >
      <button
        type="button"
        class="lightbox-close"
        aria-label="关闭预览"
        @click="previewImageUrl = null"
      >
        <X :size="24" aria-hidden="true" />
      </button>
      <img
        :src="previewImageUrl"
        alt="高清大图全屏预览"
        class="lightbox-image"
        @click.stop
      />
    </div>
  </div>
</template>

<style scoped>
.linshe-standalone-root {
  display: flex;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--cmp-bg, #faf7f2);
  background-image: var(--cmp-bg-gradient);
  color: var(--cmp-text, #4a3e39);
  font-family: inherit;
  position: relative;
}

/* ════ 1. 左侧 NavBar (56px 极致轻量) ════ */
.linshe-navbar {
  width: 56px;
  min-width: 56px;
  height: 100%;
  background: var(--cmp-surface-glass, rgba(255, 255, 255, 0.95));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-right: 1px solid var(--cmp-border-light, #f3eae2);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 16px 0 12px 0;
  z-index: 30;
  user-select: none;
  box-shadow: var(--cmp-shadow-sm, 0 2px 8px rgba(120, 80, 60, 0.05));
}

.navbar-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.linshe-brand-mark {
  width: 38px;
  height: 38px;
  border-radius: 9999px;
  background: var(--cmp-primary-soft, #fcedea);
  border: 1px solid var(--cmp-border, #ebdcd1);
  display: grid;
  place-items: center;
  margin-bottom: 6px;
  font-size: 16px;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 2px;
  border-radius: 12px;
  width: 46px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--cmp-text-muted, #8c7d74);
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.18s ease;
  position: relative;
}

.nav-item:hover {
  background: var(--cmp-surface-soft, #f6f1ea);
  color: var(--cmp-text-strong, #2c221e);
}

.nav-item.active {
  background: var(--cmp-primary-soft, #fcedea);
  border-color: var(--cmp-primary, #e06d53);
  color: var(--cmp-primary, #e06d53);
}

.nav-icon-wrap {
  position: relative;
  display: flex;
}

.nav-dot {
  position: absolute;
  top: -3px;
  right: -8px;
  padding: 0 4px;
  min-width: 14px;
  height: 14px;
  border-radius: 9999px;
  background: var(--cmp-danger, #e11d48);
  color: #fff;
  font-size: 9px;
  font-weight: 900;
  line-height: 14px;
  text-align: center;
}

.navbar-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.theme-toggle-btn {
  color: var(--cmp-accent, #d97706);
}

.theme-toggle-btn:hover {
  background: var(--cmp-accent-soft, #fef3c7);
  color: var(--cmp-accent, #d97706);
}

.return-workspace-btn {
  color: var(--cmp-text-muted, #8c7d74);
}

.return-workspace-btn:hover {
  color: var(--cmp-primary, #e06d53);
  background: var(--cmp-primary-soft, #fcedea);
}

/* ════ 2. 中间 Sidebar 伴侣列表 (240px 精简) ════ */
.linshe-sidebar {
  width: 240px;
  min-width: 240px;
  height: 100%;
  background: var(--cmp-surface, #ffffff);
  border-right: 1px solid var(--cmp-border-light, #f3eae2);
  display: flex;
  flex-direction: column;
  z-index: 20;
  box-shadow: var(--cmp-shadow-sm, 0 2px 8px rgba(120, 80, 60, 0.05));
}

.sidebar-header {
  padding: 16px 18px;
  border-bottom: 1px solid var(--cmp-border-light, #f3eae2);
}

.sidebar-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar-title {
  font-size: 15px;
  font-weight: 900;
  color: var(--cmp-text-strong, #2c221e);
  letter-spacing: -0.01em;
}

.ambient-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 9999px;
  background: var(--cmp-surface-soft, #f6f1ea);
  border: 1px solid var(--cmp-border-light, #f3eae2);
  color: var(--cmp-text-muted, #8c7d74);
}

.ambient-tag.is-day {
  color: var(--cmp-accent, #d97706);
}

.ambient-tag.is-night {
  color: #6366f1;
}

.char-list-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.char-item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  transition: all 0.18s ease;
}

.char-item-row:hover {
  background: var(--cmp-surface-soft, #f6f1ea);
  border-color: var(--cmp-border-light, #f3eae2);
}

.char-item-row.active {
  background: var(--cmp-primary-soft, #fcedea);
  border-color: var(--cmp-primary, #e06d53);
  box-shadow: var(--cmp-shadow-sm, 0 2px 8px rgba(120, 80, 60, 0.05));
}

.char-avatar-ring {
  position: relative;
  padding: 2px;
  border-radius: 9999px;
  background: linear-gradient(135deg, var(--cmp-primary, #e06d53), var(--cmp-accent, #f59e0b));
  flex-shrink: 0;
}

.char-avatar-box {
  width: 36px;
  height: 36px;
  border-radius: 9999px;
  background: var(--cmp-surface, #ffffff);
  color: var(--cmp-primary, #e06d53);
  display: grid;
  place-items: center;
  font-size: 14px;
  font-weight: 900;
}

.live-status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 9px;
  height: 9px;
  border-radius: 9999px;
  background: var(--cmp-success, #10b981);
  border: 2px solid var(--cmp-surface, #ffffff);
}

.char-info-col {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.char-name-time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.char-name-text {
  font-size: 14px;
  font-weight: 900;
  color: var(--cmp-text-strong, #2c221e);
}

.char-schedule-preview {
  font-size: 11px;
  color: var(--cmp-text-muted, #8c7d74);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-loading {
  padding: 24px;
  text-align: center;
  color: var(--cmp-text-muted, #8c7d74);
  font-size: 12px;
}

/* ════ 3. 右侧主视口 (75%+ 宽屏主舞台) ════ */
.linshe-main-viewport {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
  position: relative;
}

.mobile-topbar-header {
  display: none;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--cmp-surface-glass, rgba(255, 255, 255, 0.95));
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--cmp-border-light, #f3eae2);
}

.mobile-menu-btn,
.mobile-back-btn {
  width: 34px;
  height: 34px;
  border-radius: 9999px;
  border: 1px solid var(--cmp-border, #ebdcd1);
  background: var(--cmp-surface, #ffffff);
  color: var(--cmp-text-strong, #2c221e);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.mobile-page-name {
  font-size: 14px;
  font-weight: 800;
  color: var(--cmp-text-strong, #2c221e);
}

.viewport-content-container {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  padding: 24px 32px 80px 32px;
  display: flex;
  flex-direction: column;
}

.viewport-content-container.is-chat-container {
  padding: 18px 24px;
  height: 100%;
  overflow: hidden;
}

/* 移动端底部 Dock */
.mobile-bottom-dock {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--cmp-surface-glass, rgba(255, 255, 255, 0.95));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid var(--cmp-border-light, #f3eae2);
  grid-template-columns: repeat(5, 1fr);
  padding: 8px 0;
  z-index: 50;
}

.dock-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  border: 0;
  background: transparent;
  color: var(--cmp-text-muted, #8c7d74);
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.18s ease;
}

.dock-item.active {
  color: var(--cmp-primary, #e06d53);
}

/* 全屏 Lightbox */
.fullscreen-lightbox-modal {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: rgba(0, 0, 0, 0.88);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.lightbox-close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 40px;
  height: 40px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.lightbox-close:hover {
  background: var(--cmp-danger, #e11d48);
  border-color: var(--cmp-danger, #e11d48);
}

.lightbox-image {
  max-width: 90vw;
  max-height: 85vh;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.15);
  object-fit: contain;
}

/* ════ 4. 移动端断点适配 ════ */
@media (max-width: 768px) {
  .linshe-navbar {
    display: none;
  }

  .mobile-topbar-header {
    display: flex;
  }

  .mobile-bottom-dock {
    display: grid;
  }

  .linshe-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 56px;
    width: 240px;
    min-width: 240px;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    z-index: 90;
    box-shadow: var(--cmp-shadow-lg, 0 16px 36px rgba(120, 80, 60, 0.12));
  }

  .linshe-sidebar.mobile-open {
    transform: translateX(0);
  }

  .mobile-scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(3px);
    z-index: 80;
  }

  .viewport-content-container {
    padding: 14px 14px 70px 14px;
  }

  .viewport-content-container.is-chat-container {
    padding: 10px;
  }
}
</style>
