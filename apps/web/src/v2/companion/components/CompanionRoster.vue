<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { Clock, Heart, MapPin, MessageSquare, Smile, Sparkles } from "@lucide/vue";
import type { V2CompanionRosterResponse } from "@living-network/contracts/v2";
import Button from "../../../components/ui/Button.vue";

defineProps<{
  roster: V2CompanionRosterResponse | null;
  loading: boolean;
}>();

const router = useRouter();
const expandedSchedule = ref<Record<string, boolean>>({});

function avatarInitial(name: string): string {
  return [...name.trim()][0] ?? "?";
}

function toggleSchedule(charId: string): void {
  expandedSchedule.value[charId] = !expandedSchedule.value[charId];
}

function goToChat(): void {
  void router.push("/v2/chat");
}
</script>

<template>
  <div class="roster-view-container">
    <div class="roster-view-header">
      <div class="header-icon-pill">
        <Sparkles :size="18" class="text-primary" aria-hidden="true" />
      </div>
      <div>
        <h3 class="roster-view-title">伴侣名册与生活状态</h3>
        <p class="roster-view-desc">实时感知角色的好感度羁绊、三维情绪（VAD）与 24 小时真实生活日程</p>
      </div>
    </div>

    <div v-if="loading && (!roster || roster.characters.length === 0)" class="roster-loading">
      <div class="loading-spinner" />
      <span>正在读取角色伴侣数据…</span>
    </div>

    <div v-else-if="!roster || roster.characters.length === 0" class="roster-empty">
      <Sparkles :size="28" class="text-primary" aria-hidden="true" />
      <p>暂无角色数据</p>
    </div>

    <div v-else class="roster-grid">
      <div
        v-for="char in roster.characters"
        :key="char.characterId"
        class="roster-card"
      >
        <!-- 角色头部 -->
        <div class="roster-card-top">
          <div class="avatar-ring-large">
            <div class="avatar-inner">
              {{ avatarInitial(char.name) }}
            </div>
          </div>
          <div class="char-details">
            <div class="name-status-row">
              <h4 class="char-display-name">{{ char.name }}</h4>
              <span class="mood-pill">
                <Smile :size="13" aria-hidden="true" />
                <span>{{ char.affinity.emotion.moodLabel }}</span>
              </span>
            </div>
            <p v-if="char.summary" class="char-intro">{{ char.summary }}</p>
          </div>
        </div>

        <!-- 好感度羁绊 -->
        <div class="section-box">
          <div class="section-title-row">
            <div class="affinity-badge">
              <Heart :size="13" class="fill-current text-danger" aria-hidden="true" />
              <span>Lv.{{ char.affinity.level }} · {{ char.affinity.levelTitle }}</span>
            </div>
            <span class="exp-counter">{{ char.affinity.currentExp }} / {{ char.affinity.maxExp }} EXP</span>
          </div>
          <div class="exp-bar">
            <div
              class="exp-bar-fill"
              :style="{ width: `${Math.min(100, Math.round((char.affinity.currentExp / char.affinity.maxExp) * 100))}%` }"
            />
          </div>
        </div>

        <!-- VAD 情绪仪表 -->
        <div class="section-box">
          <div class="vad-title">三维情绪状态 (VAD)</div>
          <div class="vad-grid">
            <div class="vad-col">
              <div class="vad-metric-head">
                <span>积极度</span>
                <strong>{{ Math.round((char.affinity.emotion.valence + 1) * 50) }}%</strong>
              </div>
              <div class="vad-track">
                <div
                  class="vad-thumb thumb-v"
                  :style="{ width: `${Math.round((char.affinity.emotion.valence + 1) * 50)}%` }"
                />
              </div>
            </div>

            <div class="vad-col">
              <div class="vad-metric-head">
                <span>兴奋度</span>
                <strong>{{ Math.round((char.affinity.emotion.arousal + 1) * 50) }}%</strong>
              </div>
              <div class="vad-track">
                <div
                  class="vad-thumb thumb-a"
                  :style="{ width: `${Math.round((char.affinity.emotion.arousal + 1) * 50)}%` }"
                />
              </div>
            </div>

            <div class="vad-col">
              <div class="vad-metric-head">
                <span>掌控感</span>
                <strong>{{ Math.round((char.affinity.emotion.dominance + 1) * 50) }}%</strong>
              </div>
              <div class="vad-track">
                <div
                  class="vad-thumb thumb-d"
                  :style="{ width: `${Math.round((char.affinity.emotion.dominance + 1) * 50)}%` }"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 当前生活作息 -->
        <div class="section-box">
          <div class="section-title-row">
            <div class="schedule-label">
              <Clock :size="13" class="text-primary" aria-hidden="true" />
              <span>当前生活日程</span>
            </div>
            <button
              type="button"
              class="expand-btn"
              @click="toggleSchedule(char.characterId)"
            >
              {{ expandedSchedule[char.characterId] ? '收起完整作息' : '查看全天作息' }}
            </button>
          </div>

          <div class="active-routine-card">
            <div class="routine-meta-row">
              <span class="live-status-pill">🟢 进行中</span>
              <span class="routine-time">{{ char.schedule.currentActivity.timeSlot }}</span>
            </div>
            <div class="routine-body">
              <span class="routine-name">{{ char.schedule.currentActivity.activityName }}</span>
              <div class="routine-loc">
                <MapPin :size="11" aria-hidden="true" />
                <span>{{ char.schedule.currentActivity.locationName }}</span>
              </div>
            </div>
            <p class="routine-desc">{{ char.schedule.currentActivity.description }}</p>
          </div>

          <!-- 全天作息 -->
          <div v-if="expandedSchedule[char.characterId]" class="timeline-list">
            <div
              v-for="(r, idx) in char.schedule.routines"
              :key="idx"
              class="timeline-slot"
              :class="{ 'is-active-slot': r.activityName === char.schedule.currentActivity.activityName }"
            >
              <div class="slot-dot" />
              <div class="slot-text">
                <div class="slot-time">{{ r.timeSlot }} · {{ r.locationName }}</div>
                <div class="slot-title">{{ r.activityName }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 动作操作 -->
        <Button variant="secondary" class="chat-action-btn" @click="goToChat">
          <MessageSquare :size="15" aria-hidden="true" />
          <span>进入故事对话与她互动</span>
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.roster-view-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
}

.roster-view-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.header-icon-pill {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.roster-view-title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 800;
  color: var(--text-strong);
}

.roster-view-desc {
  margin: 2px 0 0;
  font-size: var(--text-xs);
  color: var(--muted);
}

.roster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--space-4);
}

.roster-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  box-shadow: var(--shadow-sm);
}

/* 头部 */
.roster-card-top {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.avatar-ring-large {
  padding: 3px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--primary), var(--secondary, #8b5cf6));
  flex-shrink: 0;
}

.avatar-inner {
  width: 50px;
  height: 50px;
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--primary);
  display: grid;
  place-items: center;
  font-size: var(--text-lg);
  font-weight: 800;
}

.char-details {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.name-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.char-display-name {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 800;
  color: var(--text-strong);
}

.mood-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 11px;
  font-weight: 700;
}

.char-intro {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--muted);
  line-height: 1.4;
}

/* 模块 Box */
.section-box {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.affinity-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-strong);
}

.exp-counter {
  font-size: 11px;
  color: var(--muted);
  font-weight: 600;
}

.exp-bar {
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--surface);
  overflow: hidden;
}

.exp-bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: linear-gradient(90deg, #f43f5e, var(--primary));
  transition: width 0.3s ease;
}

/* VAD */
.vad-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
}

.vad-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
}

.vad-col {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.vad-metric-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  color: var(--text);
}

.vad-track {
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--surface);
  overflow: hidden;
}

.vad-thumb {
  height: 100%;
  border-radius: var(--radius-full);
}

.thumb-v { background: #10b981; }
.thumb-a { background: #f59e0b; }
.thumb-d { background: #6366f1; }

/* 日程 */
.schedule-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-strong);
}

.expand-btn {
  border: 0;
  background: transparent;
  color: var(--primary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.active-routine-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.routine-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.live-status-pill {
  font-size: 11px;
  font-weight: 700;
  color: #10b981;
}

.routine-time {
  font-size: 11px;
  color: var(--muted);
}

.routine-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.routine-name {
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--text-strong);
}

.routine-loc {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  color: var(--muted);
}

.routine-desc {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.4;
}

.timeline-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px dashed var(--border);
}

.timeline-slot {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  font-size: 11px;
}

.slot-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--muted);
  margin-top: 4px;
}

.timeline-slot.is-active-slot .slot-dot {
  background: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}

.slot-time {
  font-size: 10px;
  color: var(--muted);
}

.slot-title {
  color: var(--text);
  font-weight: 600;
}

.timeline-slot.is-active-slot .slot-title {
  color: var(--primary);
  font-weight: 700;
}

.chat-action-btn {
  width: 100%;
}

.roster-loading,
.roster-empty {
  padding: var(--space-10);
  text-align: center;
  color: var(--muted);
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border);
  border-top-color: var(--primary);
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
  margin: 0 auto var(--space-2);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
