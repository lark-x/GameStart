<script setup lang="ts">
import { computed, ref } from "vue";
import { Clock, MapPin, RefreshCw, Search, Sun } from "@lucide/vue";
import type { V2CompanionRosterResponse } from "@living-network/contracts/v2";

const props = defineProps<{
  roster: V2CompanionRosterResponse | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  "select-character": [characterId: string];
}>();

const searchQuery = ref("");
const expandedSchedule = ref<Record<string, boolean>>({});
const isResetting = ref(false);

const filteredCharacters = computed(() => {
  if (!props.roster) return [];
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return props.roster.characters;
  return props.roster.characters.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.schedule.currentActivity.activityName.toLowerCase().includes(q) ||
      c.schedule.currentActivity.locationName.toLowerCase().includes(q),
  );
});

function avatarInitial(name: string): string {
  return [...name.trim()][0] ?? "?";
}

function toggleSchedule(charId: string): void {
  expandedSchedule.value[charId] = !expandedSchedule.value[charId];
}

async function handleResetAll(): Promise<void> {
  isResetting.value = true;
  try {
    emit("refresh");
  } finally {
    setTimeout(() => {
      isResetting.value = false;
    }, 600);
  }
}
</script>

<template>
  <div class="schedule-view-layout">
    <!-- 顶栏：标题 + 搜索 + 全部重置 -->
    <div class="schedule-topbar">
      <div class="topbar-left">
        <h2 class="schedule-page-title">伴侣生活日程</h2>
        <span class="schedule-subtitle">24 小时作息模型 · 伴侣根据现实时钟在不同场景生活、漫步与休憩</span>
      </div>

      <div class="topbar-actions">
        <div class="search-input-wrap">
          <Search :size="14" class="search-icon" aria-hidden="true" />
          <input
            v-model="searchQuery"
            type="text"
            class="search-input"
            placeholder="搜索伴侣或地点…"
          />
        </div>

        <button
          type="button"
          class="btn-reset-schedule"
          :class="{ 'is-resetting': isResetting }"
          :disabled="isResetting || loading"
          @click="handleResetAll"
        >
          <RefreshCw :size="14" :class="{ 'spin-icon': isResetting || loading }" aria-hidden="true" />
          <span>{{ isResetting || loading ? '刷新中…' : '全部刷新' }}</span>
        </button>
      </div>
    </div>

    <!-- 角色状态卡片网格 (对标 CharacterStatusCard) -->
    <div v-if="loading && (!roster || roster.characters.length === 0)" class="schedule-loading-state">
      <div class="spinner-ring" />
      <span>正在同步伴侣全天生活作息…</span>
    </div>

    <div v-else-if="filteredCharacters.length === 0" class="schedule-empty-state">
      <Clock :size="36" class="text-primary" aria-hidden="true" />
      <p>没有找到相关角色的生活日程</p>
    </div>

    <div v-else class="status-card-grid">
      <article
        v-for="c in filteredCharacters"
        :key="c.characterId"
        class="status-card"
        @click="emit('select-character', c.characterId)"
      >
        <!-- 顶部：头像 + 名字 + 状态徽章 -->
        <div class="card-top">
          <div class="avatar-box">
            <div class="avatar-inner">{{ avatarInitial(c.name) }}</div>
          </div>

          <div class="name-row">
            <div class="name-badge-line">
              <h3 class="char-name">{{ c.name }}</h3>
              <span class="status-badge live-badge">
                <Sun :size="11" class="text-amber-500" aria-hidden="true" />
                <span>进行中</span>
              </span>
            </div>
            <div class="tag-row">
              <span class="tag-badge tag-green">{{ c.schedule.currentActivity.timeSlot }}</span>
              <span class="tag-badge tag-orange">{{ c.affinity.emotion.moodLabel }}</span>
            </div>
          </div>
        </div>

        <!-- 中部：地点 + 行为描述 -->
        <div class="card-mid">
          <div class="info-line">
            <MapPin :size="14" class="text-primary" aria-hidden="true" />
            <span class="info-bold">{{ c.schedule.currentActivity.locationName }}</span>
          </div>
          <div class="info-line">
            <Clock :size="14" class="text-primary" aria-hidden="true" />
            <span>{{ c.schedule.currentActivity.activityName }}</span>
          </div>
          <p class="activity-desc">{{ c.schedule.currentActivity.description }}</p>
        </div>

        <!-- 底部：展开 24h 时间轴 -->
        <div class="card-footer-action">
          <button
            type="button"
            class="expand-timeline-btn"
            @click.stop="toggleSchedule(c.characterId)"
          >
            {{ expandedSchedule[c.characterId] ? '收起 24 小时作息 ▲' : '查看 24 小时生活时间线 ▼' }}
          </button>
        </div>

        <!-- 全天作息列表 -->
        <div v-if="expandedSchedule[c.characterId]" class="timeline-container" @click.stop>
          <div
            v-for="(r, idx) in c.schedule.routines"
            :key="idx"
            class="timeline-row"
            :class="{ 'is-current-active': r.activityName === c.schedule.currentActivity.activityName }"
          >
            <div class="timeline-dot-col">
              <span class="t-dot" />
            </div>
            <div class="timeline-content">
              <div class="t-meta">
                <span class="t-time">{{ r.timeSlot }}</span>
                <span class="t-loc">{{ r.locationName }}</span>
              </div>
              <div class="t-act">{{ r.activityName }}</div>
              <p class="t-desc">{{ r.description }}</p>
            </div>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.schedule-view-layout {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
}

/* 顶栏 */
.schedule-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px;
  background: rgba(26, 23, 40, 0.75);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
  gap: 16px;
  flex-wrap: wrap;
}

.topbar-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.schedule-page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 900;
  color: #f8fafc;
  letter-spacing: -0.02em;
}

.schedule-subtitle {
  font-size: 13px;
  color: #94a3b8;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: #94a3b8;
}

.search-input {
  padding: 8px 14px 8px 34px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: #141220;
  color: #f8fafc;
  font-size: 13px;
  outline: none;
  width: 180px;
  transition: width 0.2s ease, border-color 0.2s ease;
}

.search-input:focus {
  width: 240px;
  border-color: #6366f1;
}

.btn-reset-schedule {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border-radius: 9999px;
  border: 1px solid rgba(99, 102, 241, 0.4);
  background: rgba(99, 102, 241, 0.15);
  color: #e0e7ff;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.3);
  transition: all 0.2s ease;
}

.btn-reset-schedule:hover {
  background: #6366f1;
  color: #ffffff;
  transform: translateY(-1px);
}

.spin-icon {
  animation: spin 0.8s linear infinite;
}

/* 状态卡片网格 */
.status-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 20px;
}

.status-card {
  background: rgba(26, 23, 40, 0.75);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.status-card:hover {
  transform: translateY(-3px);
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
}

/* 顶部 */
.card-top {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.avatar-box {
  padding: 3px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, #f43f5e, var(--primary, #6366f1));
  flex-shrink: 0;
  box-shadow: 0 3px 10px rgba(99, 102, 241, 0.2);
}

.avatar-inner {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--primary);
  display: grid;
  place-items: center;
  font-size: var(--text-base);
  font-weight: 900;
}

.name-row {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.name-badge-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.char-name {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 900;
  color: var(--text-strong);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 9px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 800;
}

.live-badge {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}

.tag-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tag-badge {
  font-size: 11px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

.tag-green {
  background: var(--primary-soft);
  color: var(--primary);
}

.tag-orange {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}

/* 中部 */
.card-mid {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl, 18px);
  padding: var(--space-4) var(--space-5);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
}

.info-bold {
  font-weight: 800;
  color: var(--text-strong);
}

.activity-desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
}

/* 底部操作 */
.card-footer-action {
  display: flex;
  justify-content: flex-end;
}

.expand-timeline-btn {
  border: 0;
  background: transparent;
  color: var(--primary);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.expand-timeline-btn:hover {
  text-decoration: underline;
}

/* 时间线 */
.timeline-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px dashed var(--border);
  max-height: 320px;
  overflow-y: auto;
}

.timeline-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  font-size: 12px;
}

.timeline-dot-col {
  padding-top: 5px;
}

.t-dot {
  display: block;
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full);
  background: var(--muted);
}

.timeline-row.is-current-active .t-dot {
  background: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

.timeline-content {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.t-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.t-time {
  font-size: 11px;
  color: var(--muted);
  font-weight: 800;
}

.t-loc {
  font-size: 11px;
  color: var(--muted);
}

.t-act {
  font-weight: 800;
  color: var(--text-strong);
}

.timeline-row.is-current-active .t-act {
  color: var(--primary);
}

.t-desc {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
}

.schedule-loading-state,
.schedule-empty-state {
  padding: var(--space-12) var(--space-4);
  text-align: center;
  color: var(--muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  background: var(--surface);
  border-radius: var(--radius-2xl, 24px);
  border: 1px solid var(--border);
}

.spinner-ring {
  width: 28px;
  height: 28px;
  border: 2px solid var(--border);
  border-top-color: var(--primary);
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
