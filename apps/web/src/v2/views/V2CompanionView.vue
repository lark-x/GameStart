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
          <Sparkles :size="22" class="brand-sparkle" aria-hidden="true" />
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
            <Sun v-if="isDay" :size="12" aria-hidden="true" />
            <Moon v-else :size="12" aria-hidden="true" />
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
  background: #0d0b18;
  background-image:
    radial-gradient(circle at 10% 15%, rgba(99, 102, 241, 0.18) 0%, transparent 45%),
    radial-gradient(circle at 90% 85%, rgba(244, 63, 94, 0.15) 0%, transparent 45%),
    radial-gradient(circle at 50% 50%, rgba(30, 27, 75, 0.25) 0%, transparent 70%);
  color: #f1f5f9;
  font-family: inherit;
  position: relative;
}

/* ════ 1. 左侧 NavBar (80px) ════ */
.linshe-navbar {
  width: 80px;
  min-width: 80px;
  height: 100%;
  background: rgba(18, 15, 29, 0.95);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 24px 0;
  z-index: 30;
  user-select: none;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.3);
}

.navbar-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 100%;
}

.linshe-brand-mark {
  width: 48px;
  height: 48px;
  border-radius: 9999px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(244, 63, 94, 0.25));
  border: 1px solid rgba(255, 255, 255, 0.15);
  display: grid;
  place-items: center;
  margin-bottom: 8px;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3);
}

.brand-sparkle {
  color: #a5b4fc;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 10px 4px;
  border-radius: 16px;
  width: 64px;
  border: 1px solid transparent;
  background: transparent;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #f8fafc;
  transform: translateY(-1px);
}

.nav-item.active {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.4);
  color: #a5b4fc;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.3);
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
  border-radius: 9999px;
  background: #f43f5e;
  color: #fff;
  font-size: 9px;
  font-weight: 900;
  line-height: 16px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(244, 63, 94, 0.5);
}

.navbar-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.return-workspace-btn {
  color: #64748b;
}

.return-workspace-btn:hover {
  color: #f43f5e;
  background: rgba(244, 63, 94, 0.1);
  border-color: rgba(244, 63, 94, 0.2);
}

/* ════ 2. 中间 Sidebar 伴侣列表 (320px) ════ */
.linshe-sidebar {
  width: 320px;
  min-width: 320px;
  height: 100%;
  background: rgba(22, 19, 36, 0.9);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  z-index: 20;
  box-shadow: 6px 0 30px rgba(0, 0, 0, 0.25);
}

.sidebar-header {
  padding: 20px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.sidebar-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar-title {
  font-size: 16px;
  font-weight: 900;
  color: #f8fafc;
  letter-spacing: -0.01em;
}

.ambient-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 800;
  padding: 4px 10px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #94a3b8;
}

.ambient-tag.is-day {
  color: #fbbf24;
}

.ambient-tag.is-night {
  color: #818cf8;
}

.char-list-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.char-item-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.02);
  cursor: pointer;
  transition: all 0.2s ease;
}

.char-item-row:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateY(-1px);
}

.char-item-row.active {
  background: rgba(99, 102, 241, 0.18);
  border-color: rgba(99, 102, 241, 0.45);
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.2);
}

.char-avatar-ring {
  position: relative;
  padding: 2px;
  border-radius: 9999px;
  background: linear-gradient(135deg, #f43f5e, #6366f1);
  flex-shrink: 0;
}

.char-avatar-box {
  width: 44px;
  height: 44px;
  border-radius: 9999px;
  background: #181528;
  color: #a5b4fc;
  display: grid;
  place-items: center;
  font-size: 16px;
  font-weight: 900;
}

.live-status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 11px;
  height: 11px;
  border-radius: 9999px;
  background: #10b981;
  border: 2px solid #181528;
}

.char-info-col {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.char-name-time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.char-name-text {
  font-size: 14px;
  font-weight: 900;
  color: #f8fafc;
}

.char-mood-text {
  font-size: 11px;
  color: #fbbf24;
  font-weight: 800;
}

.char-schedule-preview {
  font-size: 12px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-loading {
  padding: 32px;
  text-align: center;
  color: #94a3b8;
  font-size: 12px;
}

.sidebar-bottom-focus {
  padding: 16px 20px;
  background: rgba(18, 15, 29, 0.95);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.focus-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.focus-title {
  font-size: 13px;
  font-weight: 900;
  color: #f8fafc;
}

.focus-level {
  font-size: 11px;
  font-weight: 800;
  color: #fb7185;
}

.focus-exp-bar {
  height: 6px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.focus-exp-fill {
  height: 100%;
  background: linear-gradient(90deg, #f43f5e, #6366f1);
  transition: width 0.3s ease;
}

.focus-chat-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgba(99, 102, 241, 0.4);
  background: rgba(99, 102, 241, 0.15);
  color: #e0e7ff;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s ease;
}

.focus-chat-btn:hover {
  background: #6366f1;
  color: #ffffff;
  transform: translateY(-1px);
}

/* ════ 3. 右侧主视口 (Page Host) ════ */
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
  padding: 12px 16px;
  background: rgba(22, 19, 36, 0.95);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.mobile-menu-btn,
.mobile-back-btn {
  width: 36px;
  height: 36px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.06);
  color: #f8fafc;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.mobile-page-name {
  font-size: 14px;
  font-weight: 800;
  color: #f8fafc;
}

.viewport-content-container {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  padding: 32px 40px 100px 40px;
  display: flex;
  flex-direction: column;
}

.viewport-content-container.is-chat-container {
  padding: 24px 32px;
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
  background: rgba(22, 19, 36, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  grid-template-columns: repeat(5, 1fr);
  padding: 10px 0;
  z-index: 50;
}

.dock-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  border: 0;
  background: transparent;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dock-item.active {
  color: #a5b4fc;
  transform: translateY(-1px);
}

/* 全屏 Lightbox */
.fullscreen-lightbox-modal {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: rgba(0, 0, 0, 0.92);
  backdrop-filter: blur(16px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.lightbox-close {
  position: absolute;
  top: 24px;
  right: 24px;
  width: 44px;
  height: 44px;
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
  background: #f43f5e;
  border-color: #f43f5e;
}

.lightbox-image {
  max-width: 90vw;
  max-height: 85vh;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
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
    bottom: 60px;
    width: 280px;
    min-width: 280px;
    transform: translateX(-100%);
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 90;
    box-shadow: 10px 0 40px rgba(0, 0, 0, 0.6);
  }

  .linshe-sidebar.mobile-open {
    transform: translateX(0);
  }

  .mobile-scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
    z-index: 80;
  }

  .viewport-content-container {
    padding: 16px 16px 80px 16px;
  }

  .viewport-content-container.is-chat-container {
    padding: 10px;
  }
}
</style>
