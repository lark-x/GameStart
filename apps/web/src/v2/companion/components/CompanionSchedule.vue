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
        <h2 class="schedule-page-title">日程</h2>
        <span class="schedule-subtitle">24 小时生活日程 · 伴侣根据真实时钟生活与行动</span>
      </div>

      <div class="topbar-actions">
        <div class="search-input-wrap">
          <Search :size="14" class="search-icon" aria-hidden="true" />
          <input
            v-model="searchQuery"
            type="text"
            class="search-input"
            placeholder="搜索角色或地点…"
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
      <span>正在同步角色全天生活日程…</span>
    </div>

    <div v-else-if="filteredCharacters.length === 0" class="schedule-empty-state">
      <Clock :size="32" class="text-primary" aria-hidden="true" />
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
            <MapPin :size="13" class="text-primary" aria-hidden="true" />
            <span class="info-bold">{{ c.schedule.currentActivity.locationName }}</span>
          </div>
          <div class="info-line">
            <Clock :size="13" class="text-primary" aria-hidden="true" />
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
            {{ expandedSchedule[c.characterId] ? '收起 24 小时作息' : '查看 24 小时全天作息时间线' }}
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
  gap: var(--space-4);
  width: 100%;
  max-width: 980px;
  margin: 0 auto;
}

/* 顶栏 */
.schedule-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  gap: var(--space-3);
  flex-wrap: wrap;
}

.topbar-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.schedule-page-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 900;
  color: var(--text-strong);
}

.schedule-subtitle {
  font-size: var(--text-xs);
  color: var(--muted);
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.search-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 10px;
  color: var(--muted);
}

.search-input {
  padding: 6px 12px 6px 30px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: var(--surface-soft);
  color: var(--text-strong);
  font-size: 12px;
  outline: none;
  width: 160px;
  transition: width var(--motion-fast);
}

.search-input:focus {
  width: 200px;
  border-color: var(--primary);
}

.btn-reset-schedule {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-strong);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: all var(--motion-fast);
}

.btn-reset-schedule:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.spin-icon {
  animation: spin 0.8s linear infinite;
}

/* 状态卡片网格 */
.status-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--space-4);
}

.status-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform var(--motion-fast), border-color var(--motion-fast);
}

.status-card:hover {
  transform: translateY(-2px);
  border-color: var(--primary);
}

/* 顶部 */
.card-top {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.avatar-box {
  padding: 2px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--primary), var(--secondary, #8b5cf6));
  flex-shrink: 0;
}

.avatar-inner {
  width: 46px;
  height: 46px;
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--primary);
  display: grid;
  place-items: center;
  font-size: var(--text-base);
  font-weight: 800;
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
  font-weight: 800;
  color: var(--text-strong);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 700;
}

.live-badge {
  background: rgb(16 185 129 / 10%);
  color: #10b981;
}

.tag-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tag-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: var(--radius-full);
}

.tag-green {
  background: var(--primary-soft);
  color: var(--primary);
}

.tag-orange {
  background: rgb(245 158 11 / 10%);
  color: #f59e0b;
}

/* 中部 */
.card-mid {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text);
}

.info-bold {
  font-weight: 700;
  color: var(--text-strong);
}

.activity-desc {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.4;
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
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

/* 时间线 */
.timeline-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-top: var(--space-3);
  border-top: 1px dashed var(--border);
  max-height: 280px;
  overflow-y: auto;
}

.timeline-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  font-size: 11px;
}

.timeline-dot-col {
  padding-top: 4px;
}

.t-dot {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--muted);
}

.timeline-row.is-current-active .t-dot {
  background: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}

.timeline-content {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.t-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.t-time {
  font-size: 10px;
  color: var(--muted);
  font-weight: 700;
}

.t-loc {
  font-size: 10px;
  color: var(--muted);
}

.t-act {
  font-weight: 700;
  color: var(--text-strong);
}

.timeline-row.is-current-active .t-act {
  color: var(--primary);
}

.t-desc {
  margin: 0;
  font-size: 10px;
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
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
}

.spinner-ring {
  width: 26px;
  height: 26px;
  border: 2px solid var(--border);
  border-top-color: var(--primary);
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
