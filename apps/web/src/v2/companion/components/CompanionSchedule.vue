<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Calendar,
  Clock,
  Heart,
  MapPin,
  RefreshCw,
  Search,
  Smile,
} from "@lucide/vue";
import type {
  V2CompanionRosterResponse,
} from "@living-network/contracts/v2";

type V2CompanionRosterCharacter = V2CompanionRosterResponse["characters"][number];

const props = defineProps<{
  roster: V2CompanionRosterResponse | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  "select-character": [characterId: string];
}>();

const searchQuery = ref("");
const selectedScheduleCharId = ref<string | null>(null);

const characters = computed(() => props.roster?.characters || []);

const activeCharacter = computed<V2CompanionRosterCharacter | null>(() => {
  if (!characters.value.length) return null;
  if (selectedScheduleCharId.value) {
    const found = characters.value.find((c) => c.characterId === selectedScheduleCharId.value);
    if (found) return found;
  }
  return characters.value[0] ?? null;
});

const filteredCharacters = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return characters.value;
  return characters.value.filter((c) =>
    c.name.toLowerCase().includes(query) ||
    c.schedule.currentActivity.locationName.toLowerCase().includes(query) ||
    c.schedule.currentActivity.activityName.toLowerCase().includes(query)
  );
});

function avatarInitial(name: string): string {
  return [...name.trim()][0] ?? "?";
}

function handleSelectChar(charId: string): void {
  selectedScheduleCharId.value = charId;
  emit("select-character", charId);
}
</script>

<template>
  <div class="schedule-view-layout">
    <!-- 顶栏 -->
    <div class="schedule-topbar">
      <div class="topbar-left">
        <h2 class="schedule-page-title">伴侣 24h 生活日程</h2>
        <span class="schedule-subtitle">角色拥有基于现实时间的 24 小时真实作息与自主活动轨迹</span>
      </div>

      <div class="topbar-actions">
        <div class="search-input-wrap">
          <Search :size="14" class="search-icon" aria-hidden="true" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索角色 / 地点…"
            class="search-input"
          />
        </div>

        <button
          type="button"
          class="btn-refresh-schedule"
          :disabled="loading"
          @click="emit('refresh')"
        >
          <RefreshCw :size="14" :class="{ 'spin-icon': loading }" aria-hidden="true" />
          <span>刷新</span>
        </button>
      </div>
    </div>

    <!-- 伴侣当前实时动态卡片矩阵 -->
    <div v-if="loading && characters.length === 0" class="schedule-loading">
      <div class="spinner-ring" />
      <span>正在读取伴侣 24 小时生活日程…</span>
    </div>

    <div v-else-if="filteredCharacters.length === 0" class="schedule-empty">
      <p>没有匹配的伴侣日程</p>
    </div>

    <div v-else class="status-card-grid">
      <div
        v-for="c in filteredCharacters"
        :key="c.characterId"
        class="status-card"
        :class="{ active: activeCharacter?.characterId === c.characterId }"
        @click="handleSelectChar(c.characterId)"
      >
        <!-- 头部 -->
        <div class="card-top">
          <div class="avatar-box">
            <div class="avatar-inner">{{ avatarInitial(c.name) }}</div>
          </div>
          <div class="meta-box">
            <div class="name-row">
              <h3 class="char-name">{{ c.name }}</h3>
              <span class="affinity-pill">
                <Heart :size="11" class="fill-current text-rose-500" aria-hidden="true" />
                <span>Lv.{{ c.affinity.level }} · {{ c.affinity.levelTitle }}</span>
              </span>
            </div>
            <div class="mood-row">
              <Smile :size="12" class="text-amber-500" aria-hidden="true" />
              <span>当前心情：<strong>{{ c.affinity.emotion.moodLabel }}</strong></span>
            </div>
          </div>
        </div>

        <!-- 实时地点与活动 -->
        <div class="current-activity-box">
          <div class="activity-head">
            <span class="activity-tag">📍 正在进行</span>
            <span class="time-range">{{ c.schedule.currentActivity.startHour }}:00 - {{ c.schedule.currentActivity.endHour }}:00</span>
          </div>
          <div class="activity-content">
            <h4 class="activity-name">{{ c.schedule.currentActivity.activityName }}</h4>
            <div class="activity-loc">
              <MapPin :size="13" class="text-primary" aria-hidden="true" />
              <span>{{ c.schedule.currentActivity.locationName }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 24 小时作息详情时间轴 -->
    <div v-if="activeCharacter" class="timeline-detail-section">
      <div class="timeline-head">
        <div class="timeline-title-wrap">
          <Calendar :size="18" class="text-primary" aria-hidden="true" />
          <h3>{{ activeCharacter.name }} 的完整 24 小时作息安排</h3>
        </div>
        <span class="timeline-desc">日程会随时间自然流转，并驱动朋友圈与聊天情境</span>
      </div>

      <div class="timeline-list">
        <div
          v-for="(slot, idx) in activeCharacter.schedule.routines"
          :key="idx"
          class="timeline-row-item"
        >
          <div class="time-badge">
            <Clock :size="12" aria-hidden="true" />
            <span>{{ String(slot.startHour).padStart(2, '0') }}:00 - {{ String(slot.endHour).padStart(2, '0') }}:00</span>
          </div>

          <div class="slot-body">
            <div class="slot-name-loc">
              <strong class="slot-act-name">{{ slot.activityName }}</strong>
              <span class="slot-loc-tag">{{ slot.locationName }}</span>
            </div>
            <span class="slot-type-badge">{{ slot.timeSlot }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.schedule-view-layout {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
  padding-bottom: 60px;
}

.schedule-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  background: var(--cmp-surface, #ffffff);
  border: 1px solid var(--cmp-border, #ebdcd1);
  border-radius: 18px;
  box-shadow: var(--cmp-shadow-sm, 0 2px 8px rgba(120, 80, 60, 0.05));
  gap: 12px;
  flex-wrap: wrap;
}

.topbar-left {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.schedule-page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 900;
  color: var(--cmp-text-strong, #2c221e);
  letter-spacing: -0.01em;
}

.schedule-subtitle {
  font-size: 12px;
  color: var(--cmp-text-muted, #8c7d74);
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 10px;
  color: var(--cmp-text-muted, #8c7d74);
}

.search-input {
  padding: 6px 12px 6px 30px;
  border-radius: 9999px;
  border: 1px solid var(--cmp-border, #ebdcd1);
  background: var(--cmp-surface-soft, #f6f1ea);
  color: var(--cmp-text-strong, #2c221e);
  font-size: 12px;
  outline: none;
  width: 160px;
}

.btn-refresh-schedule {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: 9999px;
  border: 1px solid var(--cmp-border, #ebdcd1);
  background: var(--cmp-surface-soft, #f6f1ea);
  color: var(--cmp-text-strong, #2c221e);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.18s ease;
}

.btn-refresh-schedule:hover {
  background: var(--cmp-primary, #e06d53);
  color: #ffffff;
  border-color: var(--cmp-primary, #e06d53);
}

/* 卡片网格 */
.status-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.status-card {
  background: var(--cmp-surface, #ffffff);
  border: 1px solid var(--cmp-border, #ebdcd1);
  border-radius: 18px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: var(--cmp-shadow-sm, 0 2px 8px rgba(120, 80, 60, 0.05));
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease;
}

.status-card:hover,
.status-card.active {
  transform: translateY(-2px);
  border-color: var(--cmp-primary, #e06d53);
}

.card-top {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar-box {
  padding: 2px;
  border-radius: 9999px;
  background: linear-gradient(135deg, var(--cmp-primary, #e06d53), var(--cmp-accent, #f59e0b));
  flex-shrink: 0;
}

.avatar-inner {
  width: 42px;
  height: 42px;
  border-radius: 9999px;
  background: var(--cmp-surface, #ffffff);
  color: var(--cmp-primary, #e06d53);
  display: grid;
  place-items: center;
  font-size: 15px;
  font-weight: 900;
}

.meta-box {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.char-name {
  margin: 0;
  font-size: 15px;
  font-weight: 900;
  color: var(--cmp-text-strong, #2c221e);
}

.affinity-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 9999px;
  background: var(--cmp-primary-soft, #fcedea);
  color: var(--cmp-primary, #e06d53);
}

.mood-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--cmp-text-muted, #8c7d74);
}

.current-activity-box {
  background: var(--cmp-surface-soft, #f6f1ea);
  border: 1px solid var(--cmp-border-light, #f3eae2);
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.activity-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.activity-tag {
  font-size: 11px;
  font-weight: 800;
  color: var(--cmp-primary, #e06d53);
}

.time-range {
  font-size: 11px;
  color: var(--cmp-text-muted, #8c7d74);
}

.activity-name {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  color: var(--cmp-text-strong, #2c221e);
}

.activity-loc {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--cmp-text-muted, #8c7d74);
}

/* 时间轴 */
.timeline-detail-section {
  background: var(--cmp-surface, #ffffff);
  border: 1px solid var(--cmp-border, #ebdcd1);
  border-radius: 18px;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: var(--cmp-shadow-sm, 0 2px 8px rgba(120, 80, 60, 0.05));
}

.timeline-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.timeline-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timeline-title-wrap h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 900;
  color: var(--cmp-text-strong, #2c221e);
}

.timeline-desc {
  font-size: 11px;
  color: var(--cmp-text-muted, #8c7d74);
}

.timeline-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.timeline-row-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--cmp-surface-soft, #f6f1ea);
  border: 1px solid var(--cmp-border-light, #f3eae2);
}

.time-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 9999px;
  background: var(--cmp-surface, #ffffff);
  border: 1px solid var(--cmp-border, #ebdcd1);
  color: var(--cmp-text-muted, #8c7d74);
  width: 120px;
}

.slot-body {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.slot-name-loc {
  display: flex;
  align-items: center;
  gap: 8px;
}

.slot-act-name {
  font-size: 13px;
  color: var(--cmp-text-strong, #2c221e);
}

.slot-loc-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--cmp-primary-soft, #fcedea);
  color: var(--cmp-primary, #e06d53);
}

.slot-type-badge {
  font-size: 11px;
  color: var(--cmp-text-muted, #8c7d74);
}

.schedule-loading,
.schedule-empty {
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
