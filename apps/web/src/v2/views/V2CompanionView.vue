<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  ArrowLeft,
  Clock,
  Compass,
  Heart,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  MessageSquare,
  Moon,
  RefreshCw,
  Smile,
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

// Focus character for left sidebar
const selectedCharacterId = ref<string>("character:furina");

// Image preview modal
const previewUrl = ref<string | null>(null);

// Ambient real time & Day/Night badge
const currentTime = ref("12:00");
const timePeriodLabel = ref("午后时光");
const isDayTime = ref(true);

let timerHandle: ReturnType<typeof setInterval> | null = null;

function updateTime(): void {
  const d = new Date();
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  currentTime.value = `${String(h).padStart(2, "0")}:${m}`;

  if (h >= 6 && h < 11) {
    timePeriodLabel.value = "清晨时光";
    isDayTime.value = true;
  } else if (h >= 11 && h < 14) {
    timePeriodLabel.value = "午间小憩";
    isDayTime.value = true;
  } else if (h >= 14 && h < 18) {
    timePeriodLabel.value = "午后漫步";
    isDayTime.value = true;
  } else if (h >= 18 && h < 22) {
    timePeriodLabel.value = "温馨傍晚";
    isDayTime.value = false;
  } else {
    timePeriodLabel.value = "静谧深夜";
    isDayTime.value = false;
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

function openPreview(url: string): void {
  previewUrl.value = url;
}

function avatarInitial(name: string): string {
  return [...name.trim()][0] ?? "?";
}

onMounted(() => {
  updateTime();
  timerHandle = setInterval(updateTime, 15000);
  void loadAll();
});

onUnmounted(() => {
  if (timerHandle) clearInterval(timerHandle);
});
</script>

<template>
  <div class="standalone-companion-page">
    <!-- 独立全屏顶栏 Navigation Header -->
    <header class="standalone-companion-header">
      <div class="header-left">
        <Button
          variant="ghost"
          size="sm"
          class="back-workspace-btn"
          @click="router.push('/v2/workspace/project')"
        >
          <ArrowLeft :size="15" aria-hidden="true" />
          <span>创作工作区</span>
        </Button>

        <div class="brand-divider" />

        <div class="brand-title-wrap">
          <div class="brand-icon">
            <Sparkles :size="16" class="text-primary" aria-hidden="true" />
          </div>
          <div class="brand-texts">
            <h1 class="brand-name">邻舍 · 角色陪伴生活</h1>
            <span class="brand-tagline">Living Companion</span>
          </div>
        </div>
      </div>

      <!-- 中间实时环境时钟与日夜氛围 -->
      <div class="header-center-ambient">
        <div class="ambient-pill" :class="{ 'is-day': isDayTime, 'is-night': !isDayTime }">
          <Sun v-if="isDayTime" :size="13" class="text-amber-500" aria-hidden="true" />
          <Moon v-else :size="13" class="text-indigo-400" aria-hidden="true" />
          <span>{{ timePeriodLabel }} · {{ currentTime }}</span>
        </div>
      </div>

      <!-- 右侧快捷动作栏 -->
      <div class="header-right">
        <!-- 桌面端切换 Tab -->
        <nav class="desktop-header-tabs" aria-label="陪伴视图切换">
          <button
            type="button"
            class="header-tab-btn"
            :class="{ active: currentTab === 'moments' }"
            @click="currentTab = 'moments'"
          >
            <Compass :size="15" aria-hidden="true" />
            <span>朋友圈</span>
          </button>
          <button
            type="button"
            class="header-tab-btn"
            :class="{ active: currentTab === 'roster' }"
            @click="currentTab = 'roster'"
          >
            <Users :size="15" aria-hidden="true" />
            <span>伴侣名册</span>
          </button>
          <button
            type="button"
            class="header-tab-btn"
            :class="{ active: currentTab === 'gallery' }"
            @click="currentTab = 'gallery'"
          >
            <ImageIcon :size="15" aria-hidden="true" />
            <span>回忆画廊</span>
          </button>
        </nav>

        <div class="header-actions">
          <Button
            variant="ghost"
            size="icon"
            :loading="loading"
            aria-label="刷新"
            @click="loadAll"
          >
            <RefreshCw :size="15" aria-hidden="true" />
          </Button>

          <Button
            variant="primary"
            size="sm"
            class="header-chat-btn"
            @click="router.push('/v2/chat')"
          >
            <MessageSquare :size="14" aria-hidden="true" />
            <span>故事对话</span>
          </Button>
        </div>
      </div>
    </header>

    <!-- 独立主视口内容区 -->
    <main class="standalone-companion-body">
      <!-- 桌面端三栏式综合工作台 (currentTab === 'moments') -->
      <div v-if="currentTab === 'moments'" class="desktop-workspace-grid">
        <!-- 左侧栏：当前专注伴侣 Hero 卡 + 角色切换 -->
        <aside class="left-companion-sidebar">
          <div v-if="focusedCharacter" class="focused-companion-card">
            <div class="focused-card-top">
              <div class="focused-avatar-wrap">
                <div class="focused-avatar">
                  {{ avatarInitial(focusedCharacter.name) }}
                </div>
                <div class="focused-live-dot" />
              </div>
              <div class="focused-info">
                <div class="focused-name-row">
                  <h3 class="focused-name">{{ focusedCharacter.name }}</h3>
                  <span class="focused-mood-pill">
                    <Smile :size="12" aria-hidden="true" />
                    <span>{{ focusedCharacter.affinity.emotion.moodLabel }}</span>
                  </span>
                </div>
                <p class="focused-summary">{{ focusedCharacter.summary || '温柔陪伴在你的身旁' }}</p>
              </div>
            </div>

            <!-- 好感度进度 -->
            <div class="sidebar-box">
              <div class="sidebar-box-head">
                <div class="affinity-title">
                  <Heart :size="13" class="fill-current text-danger" aria-hidden="true" />
                  <span>Lv.{{ focusedCharacter.affinity.level }} · {{ focusedCharacter.affinity.levelTitle }}</span>
                </div>
                <span class="affinity-val">
                  {{ focusedCharacter.affinity.currentExp }} / {{ focusedCharacter.affinity.maxExp }} EXP
                </span>
              </div>
              <div class="sidebar-progress">
                <div
                  class="sidebar-progress-fill"
                  :style="{ width: `${Math.min(100, Math.round((focusedCharacter.affinity.currentExp / focusedCharacter.affinity.maxExp) * 100))}%` }"
                />
              </div>
            </div>

            <!-- VAD 情绪仪表 -->
            <div class="sidebar-box">
              <div class="sidebar-box-title">三维情绪状态 (VAD)</div>
              <div class="vad-sidebar-list">
                <div class="vad-sidebar-row">
                  <span>积极度 (V)</span>
                  <div class="vad-sidebar-bar">
                    <div
                      class="vad-bar-v"
                      :style="{ width: `${Math.round((focusedCharacter.affinity.emotion.valence + 1) * 50)}%` }"
                    />
                  </div>
                  <strong>{{ Math.round((focusedCharacter.affinity.emotion.valence + 1) * 50) }}%</strong>
                </div>

                <div class="vad-sidebar-row">
                  <span>兴奋度 (A)</span>
                  <div class="vad-sidebar-bar">
                    <div
                      class="vad-bar-a"
                      :style="{ width: `${Math.round((focusedCharacter.affinity.emotion.arousal + 1) * 50)}%` }"
                    />
                  </div>
                  <strong>{{ Math.round((focusedCharacter.affinity.emotion.arousal + 1) * 50) }}%</strong>
                </div>

                <div class="vad-sidebar-row">
                  <span>掌控感 (D)</span>
                  <div class="vad-sidebar-bar">
                    <div
                      class="vad-bar-d"
                      :style="{ width: `${Math.round((focusedCharacter.affinity.emotion.dominance + 1) * 50)}%` }"
                    />
                  </div>
                  <strong>{{ Math.round((focusedCharacter.affinity.emotion.dominance + 1) * 50) }}%</strong>
                </div>
              </div>
            </div>

            <!-- 当前作息 -->
            <div class="sidebar-box">
              <div class="sidebar-box-head">
                <div class="schedule-head-pill">
                  <Clock :size="12" class="text-primary" aria-hidden="true" />
                  <span>生活日程</span>
                </div>
                <span class="schedule-time-tag">{{ focusedCharacter.schedule.currentActivity.timeSlot }}</span>
              </div>
              <div class="current-routine-content">
                <span class="routine-title-text">{{ focusedCharacter.schedule.currentActivity.activityName }}</span>
                <div class="routine-location-text">
                  <MapPin :size="11" aria-hidden="true" />
                  <span>{{ focusedCharacter.schedule.currentActivity.locationName }}</span>
                </div>
                <p class="routine-desc-text">{{ focusedCharacter.schedule.currentActivity.description }}</p>
              </div>
            </div>

            <!-- 对话快捷按钮 -->
            <Button
              variant="secondary"
              size="sm"
              class="sidebar-chat-btn"
              @click="router.push('/v2/chat')"
            >
              <MessageSquare :size="14" aria-hidden="true" />
              <span>与 {{ focusedCharacter.name }} 对话</span>
            </Button>
          </div>

          <!-- 角色快速切换列表 -->
          <div v-if="roster && roster.characters.length > 1" class="companion-switcher-panel">
            <h4 class="switcher-title">快速切换伴侣</h4>
            <div class="switcher-list">
              <button
                v-for="c in roster.characters"
                :key="c.characterId"
                type="button"
                class="switcher-item"
                :class="{ 'is-selected': c.characterId === selectedCharacterId }"
                @click="selectedCharacterId = c.characterId"
              >
                <div class="switcher-avatar">{{ avatarInitial(c.name) }}</div>
                <div class="switcher-info">
                  <span class="switcher-name">{{ c.name }}</span>
                  <span class="switcher-mood">{{ c.affinity.emotion.moodLabel }}</span>
                </div>
              </button>
            </div>
          </div>
        </aside>

        <!-- 中间主栏：朋友圈 Feed 流 -->
        <section class="center-feed-stream">
          <CompanionMoments
            :client="client"
            :moments="moments"
            :loading="loading"
            @refresh="loadAll"
            @preview-image="openPreview"
          />
        </section>

        <!-- 右侧栏：全天日程看板 + 最新写真画廊小部件 -->
        <aside class="right-companion-sidebar">
          <!-- 全员当前生活看板 -->
          <div v-if="roster && roster.characters.length > 0" class="right-widget-box">
            <div class="widget-header">
              <div class="widget-title-wrap">
                <Clock :size="15" class="text-primary" aria-hidden="true" />
                <h4 class="widget-title">此刻伴侣作息看板</h4>
              </div>
              <button type="button" class="widget-link-btn" @click="currentTab = 'roster'">
                详情
              </button>
            </div>

            <div class="roster-mini-list">
              <div
                v-for="c in roster.characters"
                :key="c.characterId"
                class="roster-mini-item"
              >
                <div class="mini-avatar">{{ avatarInitial(c.name) }}</div>
                <div class="mini-info">
                  <div class="mini-top">
                    <span class="mini-name">{{ c.name }}</span>
                    <span class="mini-loc">{{ c.schedule.currentActivity.locationName }}</span>
                  </div>
                  <span class="mini-act">{{ c.schedule.currentActivity.activityName }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 回忆相册预览 -->
          <div class="right-widget-box">
            <div class="widget-header">
              <div class="widget-title-wrap">
                <ImageIcon :size="15" class="text-primary" aria-hidden="true" />
                <h4 class="widget-title">回忆写真相册</h4>
              </div>
              <button type="button" class="widget-link-btn" @click="currentTab = 'gallery'">
                全部 ({{ gallery.length }})
              </button>
            </div>

            <div v-if="gallery.length === 0" class="widget-empty">
              <Sparkles :size="20" class="text-primary" aria-hidden="true" />
              <span>暂无回忆照片</span>
            </div>
            <div v-else class="gallery-mini-grid">
              <div
                v-for="photo in gallery.slice(0, 6)"
                :key="photo.mediaId"
                class="gallery-mini-card"
                @click="openPreview(client.mediaUrl(photo.mediaRef))"
              >
                <img
                  :src="client.mediaUrl(photo.mediaRef)"
                  :alt="photo.title"
                  class="gallery-mini-img"
                  loading="lazy"
                  @error="(e) => (e.target as HTMLElement).style.display = 'none'"
                />
              </div>
            </div>
          </div>
        </aside>
      </div>

      <!-- 单独 Tab 视口：名册 (currentTab === 'roster') -->
      <div v-else-if="currentTab === 'roster'" class="standalone-tab-content">
        <CompanionRoster
          :roster="roster"
          :loading="loading"
        />
      </div>

      <!-- 单独 Tab 视口：相册 (currentTab === 'gallery') -->
      <div v-else-if="currentTab === 'gallery'" class="standalone-tab-content">
        <CompanionGallery
          :client="client"
          :gallery="gallery"
          :loading="loading"
          @preview-image="openPreview"
        />
      </div>
    </main>

    <!-- 移动端底部固定毛玻璃 Dock -->
    <nav class="mobile-bottom-dock" aria-label="移动端导航">
      <button
        type="button"
        class="mobile-dock-btn"
        :class="{ active: currentTab === 'moments' }"
        @click="currentTab = 'moments'"
      >
        <Compass :size="20" aria-hidden="true" />
        <span>朋友圈</span>
      </button>

      <button
        type="button"
        class="mobile-dock-btn"
        :class="{ active: currentTab === 'roster' }"
        @click="currentTab = 'roster'"
      >
        <Users :size="20" aria-hidden="true" />
        <span>伴侣名册</span>
      </button>

      <button
        type="button"
        class="mobile-dock-btn"
        :class="{ active: currentTab === 'gallery' }"
        @click="currentTab = 'gallery'"
      >
        <ImageIcon :size="20" aria-hidden="true" />
        <span>回忆相册</span>
      </button>

      <button
        type="button"
        class="mobile-dock-btn mobile-dock-chat"
        @click="router.push('/v2/chat')"
      >
        <MessageCircle :size="20" aria-hidden="true" />
        <span>故事对话</span>
      </button>
    </nav>

    <!-- 全屏大图预览弹窗 -->
    <div
      v-if="previewUrl"
      class="fullscreen-lightbox-backdrop"
      @click="previewUrl = null"
    >
      <button
        type="button"
        class="lightbox-close-btn"
        aria-label="关闭预览"
        @click="previewUrl = null"
      >
        <X :size="20" aria-hidden="true" />
      </button>
      <img
        :src="previewUrl"
        alt="大图全屏预览"
        class="lightbox-img"
        @click.stop
      />
    </div>
  </div>
</template>

<style scoped>
.standalone-companion-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--background);
  color: var(--text-strong);
}

/* 顶部独立 Header */
.standalone-companion-header {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-6);
  background: var(--surface-glass);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.back-workspace-btn {
  font-size: var(--text-xs);
}

.brand-divider {
  width: 1px;
  height: 20px;
  background: var(--border);
}

.brand-title-wrap {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.brand-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  display: grid;
  place-items: center;
}

.brand-name {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 900;
  color: var(--text-strong);
  line-height: 1.2;
}

.brand-tagline {
  font-size: 10px;
  color: var(--muted);
  font-weight: 600;
}

/* 中间环境指示 */
.header-center-ambient {
  display: flex;
  align-items: center;
}

.ambient-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 14px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 700;
  border: 1px solid var(--border);
  background: var(--surface);
}

.ambient-pill.is-day {
  color: var(--text-strong);
}

.ambient-pill.is-night {
  color: #818cf8;
  background: rgb(99 102 241 / 10%);
  border-color: rgb(99 102 241 / 30%);
}

/* 右侧 */
.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.desktop-header-tabs {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  background: var(--surface-soft);
  padding: 3px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
}

.header-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 14px;
  border-radius: var(--radius-full);
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--motion-fast);
}

.header-tab-btn:hover {
  color: var(--text-strong);
}

.header-tab-btn.active {
  background: var(--surface);
  color: var(--primary);
  box-shadow: var(--shadow-sm);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.header-chat-btn {
  box-shadow: var(--shadow-sm);
}

/* 主内容视口 */
.standalone-companion-body {
  flex: 1 1 auto;
  padding: var(--space-6) var(--space-6) var(--space-12);
  width: 100%;
  max-width: 1560px;
  margin: 0 auto;
}

/* 桌面端三栏网格 */
.desktop-workspace-grid {
  display: grid;
  grid-template-columns: 310px minmax(0, 1fr) 310px;
  gap: var(--space-6);
  align-items: start;
}

/* 左侧栏 */
.left-companion-sidebar {
  position: sticky;
  top: 76px;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.focused-companion-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  box-shadow: var(--shadow-sm);
}

.focused-card-top {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.focused-avatar-wrap {
  position: relative;
}

.focused-avatar {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--primary), var(--secondary, #8b5cf6));
  color: #fff;
  display: grid;
  place-items: center;
  font-size: var(--text-lg);
  font-weight: 800;
  box-shadow: var(--shadow-sm);
}

.focused-live-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 13px;
  height: 13px;
  border-radius: var(--radius-full);
  background: #10b981;
  border: 2px solid var(--surface);
}

.focused-info {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.focused-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.focused-name {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 800;
  color: var(--text-strong);
}

.focused-mood-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 11px;
  font-weight: 700;
}

.focused-summary {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.3;
}

.sidebar-box {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.sidebar-box-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.affinity-title {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-strong);
}

.affinity-val {
  font-size: 10px;
  color: var(--muted);
  font-weight: 600;
}

.sidebar-progress {
  height: 5px;
  border-radius: var(--radius-full);
  background: var(--surface);
  overflow: hidden;
}

.sidebar-progress-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: linear-gradient(90deg, #f43f5e, var(--primary));
  transition: width 0.3s ease;
}

.sidebar-box-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
}

.vad-sidebar-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.vad-sidebar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  color: var(--text);
  gap: 6px;
}

.vad-sidebar-bar {
  flex: 1 1 auto;
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--surface);
  overflow: hidden;
}

.vad-bar-v { height: 100%; background: #10b981; }
.vad-bar-a { height: 100%; background: #f59e0b; }
.vad-bar-d { height: 100%; background: #6366f1; }

.schedule-head-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-strong);
}

.schedule-time-tag {
  font-size: 10px;
  color: var(--muted);
}

.current-routine-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.routine-title-text {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-strong);
}

.routine-location-text {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  color: var(--muted);
}

.routine-desc-text {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.35;
}

.sidebar-chat-btn {
  width: 100%;
}

.companion-switcher-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.switcher-title {
  margin: 0;
  font-size: var(--text-xs);
  font-weight: 800;
  color: var(--muted);
}

.switcher-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.switcher-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 8px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: all var(--motion-fast);
}

.switcher-item:hover {
  background: var(--surface-soft);
}

.switcher-item.is-selected {
  background: var(--surface-soft);
  border-color: var(--primary);
}

.switcher-avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 11px;
  font-weight: 800;
  display: grid;
  place-items: center;
}

.switcher-name {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-strong);
  display: block;
}

.switcher-mood {
  font-size: 10px;
  color: var(--muted);
  display: block;
}

/* 中间主栏 */
.center-feed-stream {
  min-width: 0;
}

/* 右侧栏 */
.right-companion-sidebar {
  position: sticky;
  top: 76px;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.right-widget-box {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  box-shadow: var(--shadow-sm);
}

.widget-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.widget-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.widget-title {
  margin: 0;
  font-size: var(--text-xs);
  font-weight: 800;
  color: var(--text-strong);
}

.widget-link-btn {
  border: 0;
  background: transparent;
  color: var(--primary);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.roster-mini-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.roster-mini-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 8px;
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  border: 1px solid var(--border);
}

.mini-avatar {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 12px;
  font-weight: 800;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.mini-info {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.mini-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mini-name {
  font-size: 11px;
  font-weight: 800;
  color: var(--text-strong);
}

.mini-loc {
  font-size: 10px;
  color: var(--muted);
}

.mini-act {
  font-size: 11px;
  color: var(--text);
}

.gallery-mini-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.gallery-mini-card {
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border);
  cursor: zoom-in;
  background: var(--surface-soft);
}

.gallery-mini-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform var(--motion-fast);
}

.gallery-mini-card:hover .gallery-mini-img {
  transform: scale(1.1);
}

.widget-empty {
  padding: var(--space-4);
  text-align: center;
  color: var(--muted);
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

/* 单独 Tab 视口 */
.standalone-tab-content {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
}

/* 移动端底部 Dock */
.mobile-bottom-dock {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--surface-glass);
  backdrop-filter: blur(16px);
  border-top: 1px solid var(--border);
  grid-template-columns: repeat(4, 1fr);
  padding: 6px 8px;
  z-index: 50;
}

.mobile-dock-btn {
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
  transition: all var(--motion-fast);
}

.mobile-dock-btn.active {
  color: var(--primary);
  transform: translateY(-1px);
}

.mobile-dock-chat {
  color: var(--primary);
}

/* 全屏大图 Lightbox */
.fullscreen-lightbox-backdrop {
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

.lightbox-close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-full);
  background: rgb(255 255 255 / 20%);
  color: #fff;
  border: 0;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background var(--motion-fast);
}

.lightbox-close-btn:hover {
  background: rgb(255 255 255 / 40%);
}

.lightbox-img {
  max-width: 92vw;
  max-height: 88vh;
  object-fit: contain;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-2xl);
  cursor: default;
}

/* 响应式断点 */
@media (max-width: 1180px) {
  .desktop-workspace-grid {
    grid-template-columns: 280px minmax(0, 1fr);
  }
  .right-companion-sidebar {
    display: none;
  }
}

@media (max-width: 860px) {
  .standalone-companion-header {
    padding: var(--space-3) var(--space-4);
  }
  .desktop-header-tabs {
    display: none;
  }
  .header-center-ambient {
    display: none;
  }
  .desktop-workspace-grid {
    grid-template-columns: 1fr;
  }
  .left-companion-sidebar {
    display: none;
  }
  .standalone-companion-body {
    padding: var(--space-4) var(--space-3) 72px;
  }
  .mobile-bottom-dock {
    display: grid;
  }
}
</style>
