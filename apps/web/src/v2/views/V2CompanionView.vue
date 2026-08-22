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
  Sparkles,
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

const router = useRouter();
const environment = import.meta.env as Record<string, string | undefined>;
const baseUrl = environment.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3003" : window.location.origin);
const client = createV2CompanionClient({ baseUrl });

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
  <div class="linshe-standalone-root">
    <!-- 移动端抽屉遮罩 (Scrim) -->
    <div
      v-if="mobileSidebarOpen"
      class="mobile-scrim"
      @click="mobileSidebarOpen = false"
    />

    <!-- ═══ 1. 左侧 NavBar 导航栏 (80px, 经典玻璃拟态) ═══ -->
    <nav class="linshe-navbar" aria-label="邻舍主导航">
      <div class="navbar-top">
        <div class="linshe-brand-mark" title="邻舍 · 角色陪伴生活">
          <Sparkles :size="22" class="text-primary brand-sparkle" aria-hidden="true" />
        </div>

        <button
          type="button"
          class="nav-item"
          :class="{ active: activeTab === 'chat' }"
          title="聊天"
          @click="activeTab = 'chat'"
        >
          <div class="nav-icon-wrap">
            <MessageSquare :size="22" aria-hidden="true" />
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
            <Compass :size="22" aria-hidden="true" />
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
            <Calendar :size="22" aria-hidden="true" />
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
            <ImageIcon :size="22" aria-hidden="true" />
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
            <Users :size="22" aria-hidden="true" />
          </div>
          <span class="nav-label">酒馆</span>
        </button>
      </div>

      <div class="navbar-bottom">
        <button
          type="button"
          class="nav-item return-workspace-btn"
          title="返回创作工作台"
          @click="router.push('/v2/workspace/project')"
        >
          <div class="nav-icon-wrap">
            <ArrowLeft :size="20" aria-hidden="true" />
          </div>
          <span class="nav-label">工作台</span>
        </button>
      </div>
    </nav>

    <!-- ═══ 2. 中间 Sidebar 伴侣列表与作息抽屉 (320px) ═══ -->
    <aside
      class="linshe-sidebar"
      :class="{ 'mobile-open': mobileSidebarOpen }"
      aria-label="伴侣角色列表"
    >
      <div class="sidebar-header">
        <div class="sidebar-title-row">
          <span class="sidebar-title">伴侣名册</span>
          <div class="ambient-tag" :class="{ 'is-day': isDay, 'is-night': !isDay }">
            <Sun v-if="isDay" :size="12" class="text-amber-500" aria-hidden="true" />
            <Moon v-else :size="12" class="text-indigo-400" aria-hidden="true" />
            <span>{{ timeLabel }} {{ currentTime }}</span>
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
              <span class="char-mood-text">{{ c.affinity.emotion.moodLabel }}</span>
            </div>
            <div class="char-schedule-preview">
              {{ c.schedule.currentActivity.locationName }} · {{ c.schedule.currentActivity.activityName }}
            </div>
          </div>
        </div>

        <div v-if="loading && (!roster || roster.characters.length === 0)" class="sidebar-loading">
          正在读取伴侣数据…
        </div>
      </div>

      <!-- 选中伴侣的快捷 mini card -->
      <div v-if="focusedCharacter" class="sidebar-bottom-focus">
        <div class="focus-head">
          <span class="focus-title">{{ focusedCharacter.name }} 的羁绊</span>
          <span class="focus-level">Lv.{{ focusedCharacter.affinity.level }} · {{ focusedCharacter.affinity.levelTitle }}</span>
        </div>
        <div class="focus-exp-bar">
          <div
            class="focus-exp-fill"
            :style="{ width: `${Math.min(100, Math.round((focusedCharacter.affinity.currentExp / focusedCharacter.affinity.maxExp) * 100))}%` }"
          />
        </div>
        <button
          v-if="activeTab !== 'chat'"
          type="button"
          class="focus-chat-btn"
          @click="handleStartChat(focusedCharacter.characterId)"
        >
          <MessageSquare :size="14" aria-hidden="true" />
          <span>与 {{ focusedCharacter.name }} 开启对话</span>
        </button>
      </div>
    </aside>

    <!-- ═══ 3. 右侧主视口区 (Page Host) ═══ -->
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
          {{ activeTab === 'chat' ? `对话 · ${focusedCharacter?.name || '伴侣'}` : activeTab === 'moments' ? '朋友圈' : activeTab === 'schedule' ? '24h 生活日程' : activeTab === 'gallery' ? '回忆相册' : '酒馆档案' }}
        </span>
        <button
          type="button"
          class="mobile-back-btn"
          title="返回创作工作台"
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
        <MessageSquare :size="20" aria-hidden="true" />
        <span>聊天</span>
      </button>

      <button
        type="button"
        class="dock-item"
        :class="{ active: activeTab === 'moments' }"
        @click="activeTab = 'moments'"
      >
        <Compass :size="20" aria-hidden="true" />
        <span>朋友圈</span>
      </button>

      <button
        type="button"
        class="dock-item"
        :class="{ active: activeTab === 'schedule' }"
        @click="activeTab = 'schedule'"
      >
        <Calendar :size="20" aria-hidden="true" />
        <span>日程</span>
      </button>

      <button
        type="button"
        class="dock-item"
        :class="{ active: activeTab === 'gallery' }"
        @click="activeTab = 'gallery'"
      >
        <ImageIcon :size="20" aria-hidden="true" />
        <span>相册</span>
      </button>

      <button
        type="button"
        class="dock-item"
        :class="{ active: activeTab === 'tavern' }"
        @click="activeTab = 'tavern'"
      >
        <Users :size="20" aria-hidden="true" />
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
  background: var(--background);
  color: var(--text-strong);
  font-family: inherit;
}

/* ════ 1. 左侧 NavBar (80px) ════ */
.linshe-navbar {
  width: 80px;
  min-width: 80px;
  height: 100%;
  background: var(--surface-glass, rgba(255, 255, 255, 0.75));
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-5) 0;
  z-index: 30;
  user-select: none;
}

.navbar-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
}

.linshe-brand-mark {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(244, 63, 94, 0.15));
  border: 1px solid var(--border);
  display: grid;
  place-items: center;
  margin-bottom: var(--space-3);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
}

.brand-sparkle {
  color: #6366f1;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px;
  border-radius: var(--radius-xl, 16px);
  width: 64px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  transition: all var(--motion-fast);
  position: relative;
}

.nav-item:hover {
  background: var(--surface-soft);
  color: var(--text-strong);
  transform: translateY(-1px);
}

.nav-item.active {
  background: var(--primary-soft);
  color: var(--primary);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
}

.nav-icon-wrap {
  position: relative;
  display: flex;
}

.nav-dot {
  position: absolute;
  top: -4px;
  right: -10px;
  padding: 0 5px;
  min-width: 16px;
  height: 16px;
  border-radius: var(--radius-full);
  background: #f43f5e;
  color: #fff;
  font-size: 9px;
  font-weight: 900;
  line-height: 16px;
  text-align: center;
  box-shadow: 0 2px 6px rgba(244, 63, 94, 0.4);
}

.navbar-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.return-workspace-btn {
  color: var(--muted);
}

.return-workspace-btn:hover {
  color: var(--primary);
  background: var(--primary-soft);
}

/* ════ 2. 中间 Sidebar 伴侣列表 (320px) ════ */
.linshe-sidebar {
  width: 320px;
  min-width: 320px;
  height: 100%;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  z-index: 20;
}

.sidebar-header {
  padding: var(--space-5) var(--space-5);
  border-bottom: 1px solid var(--border);
}

.sidebar-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar-title {
  font-size: var(--text-base);
  font-weight: 900;
  color: var(--text-strong);
  letter-spacing: -0.01em;
}

.ambient-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 800;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  background: var(--surface-soft);
  border: 1px solid var(--border);
  color: var(--muted);
}

.ambient-tag.is-day {
  color: var(--text-strong);
}

.ambient-tag.is-night {
  color: #818cf8;
}

.char-list-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.char-item-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 12px 14px;
  border-radius: var(--radius-xl, 18px);
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  transition: all var(--motion-fast);
}

.char-item-row:hover {
  background: var(--surface-soft);
}

.char-item-row.active {
  background: var(--surface-soft);
  border-color: var(--primary);
  box-shadow: var(--shadow-sm);
}

.char-avatar-ring {
  position: relative;
  padding: 2px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, #f43f5e, var(--primary, #6366f1));
  flex-shrink: 0;
}

.char-avatar-box {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--primary);
  display: grid;
  place-items: center;
  font-size: var(--text-base);
  font-weight: 900;
}

.live-status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 11px;
  height: 11px;
  border-radius: var(--radius-full);
  background: #10b981;
  border: 2px solid var(--surface);
}

.char-info-col {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.char-name-time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.char-name-text {
  font-size: 14px;
  font-weight: 800;
  color: var(--text-strong);
}

.char-mood-text {
  font-size: 11px;
  color: #f59e0b;
  font-weight: 800;
}

.char-schedule-preview {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-loading {
  padding: var(--space-8);
  text-align: center;
  color: var(--muted);
  font-size: 12px;
}

.sidebar-bottom-focus {
  padding: var(--space-4) var(--space-5);
  background: var(--surface-soft);
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.focus-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.focus-title {
  font-size: 12px;
  font-weight: 900;
  color: var(--text-strong);
}

.focus-level {
  font-size: 11px;
  font-weight: 800;
  color: #f43f5e;
}

.focus-exp-bar {
  height: 5px;
  border-radius: var(--radius-full);
  background: var(--surface);
  overflow: hidden;
}

.focus-exp-fill {
  height: 100%;
  background: linear-gradient(90deg, #f43f5e, var(--primary));
  transition: width 0.3s ease;
}

.focus-chat-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-strong);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: all var(--motion-fast);
}

.focus-chat-btn:hover {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

/* ════ 3. 右侧主视口 (Page Host) ════ */
.linshe-main-viewport {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--background);
  position: relative;
}

.mobile-topbar-header {
  display: none;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  background: var(--surface-glass);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border);
}

.mobile-menu-btn,
.mobile-back-btn {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-strong);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.mobile-page-name {
  font-size: var(--text-sm);
  font-weight: 800;
  color: var(--text-strong);
}

.viewport-content-container {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--space-8) var(--space-8) var(--space-12);
  display: flex;
  flex-direction: column;
}

.viewport-content-container.is-chat-container {
  padding: var(--space-6);
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
  background: var(--surface-glass);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid var(--border);
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
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  transition: all var(--motion-fast);
}

.dock-item.active {
  color: var(--primary);
  transform: translateY(-1px);
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
  padding: var(--space-6);
  cursor: zoom-out;
}

.lightbox-close {
  position: absolute;
  top: 24px;
  right: 24px;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  border: 0;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.lightbox-close:hover {
  background: rgba(255, 255, 255, 0.4);
}

.lightbox-image {
  max-width: 92vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-2xl);
  cursor: default;
}

/* ════ 响应式适配 (Mobile < 768px) ════ */
@media (max-width: 767px) {
  .linshe-navbar {
    display: none;
  }

  .linshe-sidebar {
    position: fixed;
    top: 0;
    bottom: 0;
    left: -330px;
    width: 320px;
    box-shadow: var(--shadow-2xl);
    transition: left var(--motion-fast);
    z-index: 60;
  }

  .linshe-sidebar.mobile-open {
    left: 0;
  }

  .mobile-scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    z-index: 55;
  }

  .mobile-topbar-header {
    display: flex;
  }

  .viewport-content-container {
    padding: var(--space-4) var(--space-3) 76px;
  }

  .viewport-content-container.is-chat-container {
    padding: var(--space-2) var(--space-2) 76px;
  }

  .mobile-bottom-dock {
    display: grid;
  }
}
</style>
