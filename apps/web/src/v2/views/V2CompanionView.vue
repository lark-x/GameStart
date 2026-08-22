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
const activeTab = ref<ActiveTab>("moments");

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
  void router.push("/v2/chat");
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

    <!-- ═══ 1. 左侧 NavBar 导航栏 (72px, 经典玻璃拟态) ═══ -->
    <nav class="linshe-navbar" aria-label="邻舍主导航">
      <div class="navbar-top">
        <div class="linshe-brand-mark" title="邻舍 · 角色陪伴生活">
          <Sparkles :size="20" class="text-primary" aria-hidden="true" />
        </div>

        <button
          type="button"
          class="nav-item"
          :class="{ active: activeTab === 'chat' }"
          title="聊天"
          @click="handleStartChat()"
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

    <!-- ═══ 2. 中间 Sidebar 伴侣列表与作息抽屉 (280px) ═══ -->
    <aside
      class="linshe-sidebar"
      :class="{ 'mobile-open': mobileSidebarOpen }"
      aria-label="伴侣角色列表"
    >
      <div class="sidebar-header">
        <div class="sidebar-title-row">
          <span class="sidebar-title">伴侣角色</span>
          <div class="ambient-tag" :class="{ 'is-day': isDay, 'is-night': !isDay }">
            <Sun v-if="isDay" :size="11" class="text-amber-500" aria-hidden="true" />
            <Moon v-else :size="11" class="text-indigo-400" aria-hidden="true" />
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
          正在加载伴侣列表…
        </div>
      </div>

      <!-- 选中伴侣的快捷 mini card -->
      <div v-if="focusedCharacter" class="sidebar-bottom-focus">
        <div class="focus-head">
          <span class="focus-title">{{ focusedCharacter.name }} 的好感羁绊</span>
          <span class="focus-level">Lv.{{ focusedCharacter.affinity.level }}</span>
        </div>
        <div class="focus-exp-bar">
          <div
            class="focus-exp-fill"
            :style="{ width: `${Math.min(100, Math.round((focusedCharacter.affinity.currentExp / focusedCharacter.affinity.maxExp) * 100))}%` }"
          />
        </div>
        <button
          type="button"
          class="focus-chat-btn"
          @click="handleStartChat(focusedCharacter.characterId)"
        >
          <MessageSquare :size="13" aria-hidden="true" />
          <span>与 {{ focusedCharacter.name }} 开启私聊</span>
        </button>
      </div>
    </aside>

    <!-- ═══ 3. 右侧主视口区 (Page Host) ═══ -->
    <main class="linshe-main-viewport">
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
          {{ activeTab === 'moments' ? '朋友圈' : activeTab === 'schedule' ? '24h 生活日程' : activeTab === 'gallery' ? '回忆相册' : activeTab === 'tavern' ? '酒馆档案' : '角色陪伴' }}
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
      <div class="viewport-content-container">
        <!-- 朋友圈视图 -->
        <CompanionMoments
          v-if="activeTab === 'moments'"
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
        @click="handleStartChat()"
      >
        <MessageSquare :size="19" aria-hidden="true" />
        <span>聊天</span>
      </button>

      <button
        type="button"
        class="dock-item"
        :class="{ active: activeTab === 'moments' }"
        @click="activeTab = 'moments'"
      >
        <Compass :size="19" aria-hidden="true" />
        <span>朋友圈</span>
      </button>

      <button
        type="button"
        class="dock-item"
        :class="{ active: activeTab === 'schedule' }"
        @click="activeTab = 'schedule'"
      >
        <Calendar :size="19" aria-hidden="true" />
        <span>日程</span>
      </button>

      <button
        type="button"
        class="dock-item"
        :class="{ active: activeTab === 'gallery' }"
        @click="activeTab = 'gallery'"
      >
        <ImageIcon :size="19" aria-hidden="true" />
        <span>相册</span>
      </button>

      <button
        type="button"
        class="dock-item"
        :class="{ active: activeTab === 'tavern' }"
        @click="activeTab = 'tavern'"
      >
        <Users :size="19" aria-hidden="true" />
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
        <X :size="22" aria-hidden="true" />
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
}

/* ════ 1. 左侧 NavBar (72px) ════ */
.linshe-navbar {
  width: 72px;
  min-width: 72px;
  height: 100%;
  background: var(--surface-glass);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) 0;
  z-index: 30;
  user-select: none;
}

.navbar-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
}

.linshe-brand-mark {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  display: grid;
  place-items: center;
  margin-bottom: var(--space-2);
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 4px;
  border-radius: var(--radius-md);
  width: 58px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--motion-fast);
}

.nav-item:hover {
  background: var(--surface-soft);
  color: var(--text-strong);
}

.nav-item.active {
  background: var(--primary-soft);
  color: var(--primary);
}

.nav-icon-wrap {
  position: relative;
  display: flex;
}

.nav-dot {
  position: absolute;
  top: -4px;
  right: -8px;
  padding: 0 4px;
  min-width: 15px;
  height: 15px;
  border-radius: var(--radius-full);
  background: var(--primary);
  color: #fff;
  font-size: 9px;
  font-weight: 800;
  line-height: 15px;
  text-align: center;
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
}

/* ════ 2. 中间 Sidebar 伴侣列表 (280px) ════ */
.linshe-sidebar {
  width: 280px;
  min-width: 280px;
  height: 100%;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  z-index: 20;
}

.sidebar-header {
  padding: var(--space-4) var(--space-4);
  border-bottom: 1px solid var(--border);
}

.sidebar-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar-title {
  font-size: var(--text-sm);
  font-weight: 900;
  color: var(--text-strong);
}

.ambient-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
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
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.char-item-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 8px 10px;
  border-radius: var(--radius-md);
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
}

.char-avatar-ring {
  position: relative;
  padding: 2px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--primary), var(--secondary, #8b5cf6));
  flex-shrink: 0;
}

.char-avatar-box {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--primary);
  display: grid;
  place-items: center;
  font-size: var(--text-sm);
  font-weight: 800;
}

.live-status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
  background: #10b981;
  border: 2px solid var(--surface);
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
  font-size: 13px;
  font-weight: 800;
  color: var(--text-strong);
}

.char-mood-text {
  font-size: 10px;
  color: var(--primary);
  font-weight: 700;
}

.char-schedule-preview {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-loading {
  padding: var(--space-6);
  text-align: center;
  color: var(--muted);
  font-size: 12px;
}

.sidebar-bottom-focus {
  padding: var(--space-3) var(--space-4);
  background: var(--surface-soft);
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.focus-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.focus-title {
  font-size: 11px;
  font-weight: 800;
  color: var(--text-strong);
}

.focus-level {
  font-size: 10px;
  font-weight: 700;
  color: var(--primary);
}

.focus-exp-bar {
  height: 4px;
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
  gap: 5px;
  padding: 6px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-strong);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
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
  width: 34px;
  height: 34px;
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
  padding: var(--space-6) var(--space-6) var(--space-10);
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
  padding: 6px 0;
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
  font-size: 10px;
  font-weight: 700;
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
  background: rgb(0 0 0 / 88%);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  cursor: zoom-out;
}

.lightbox-close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-full);
  background: rgb(255 255 255 / 20%);
  color: #fff;
  border: 0;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.lightbox-close:hover {
  background: rgb(255 255 255 / 40%);
}

.lightbox-image {
  max-width: 92vw;
  max-height: 88vh;
  object-fit: contain;
  border-radius: var(--radius-md);
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
    left: -290px;
    width: 280px;
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
    background: rgb(0 0 0 / 50%);
    backdrop-filter: blur(4px);
    z-index: 55;
  }

  .mobile-topbar-header {
    display: flex;
  }

  .viewport-content-container {
    padding: var(--space-4) var(--space-3) 72px;
  }

  .mobile-bottom-dock {
    display: grid;
  }
}
</style>
