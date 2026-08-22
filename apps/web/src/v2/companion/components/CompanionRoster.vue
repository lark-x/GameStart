<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { Clock, Heart, MapPin, MessageSquare, Smile, Sparkles } from "@lucide/vue";
import type { V2CompanionRosterResponse } from "@living-network/contracts/v2";
import Button from "../../../components/ui/Button.vue";
import Card from "../../../components/ui/Card.vue";

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
  <div class="companion-roster-view">
    <div class="roster-header">
      <div class="roster-header-text">
        <h3 class="roster-title">伴侣名册与生活状态</h3>
        <p class="roster-desc">实时查看角色的好感度羁绊、三维情绪（VAD）与 24 小时生活日程</p>
      </div>
    </div>

    <div v-if="loading && (!roster || roster.characters.length === 0)" class="roster-status">
      正在读取角色生活状态…
    </div>
    <div v-else-if="!roster || roster.characters.length === 0" class="roster-empty">
      <Sparkles :size="24" class="text-primary" aria-hidden="true" />
      <p>暂无角色数据</p>
    </div>
    <div v-else class="roster-list">
      <Card
        v-for="char in roster.characters"
        :key="char.characterId"
        class="char-roster-card"
      >
        <!-- 角色基础信息 -->
        <div class="char-top-row">
          <div class="char-avatar-ring">
            <div class="char-avatar" aria-hidden="true">
              {{ avatarInitial(char.name) }}
            </div>
          </div>
          <div class="char-meta">
            <div class="char-name-row">
              <h4 class="char-name">{{ char.name }}</h4>
              <span class="char-mood-badge">
                <Smile :size="12" aria-hidden="true" />
                <span>{{ char.affinity.emotion.moodLabel }}</span>
              </span>
            </div>
            <p v-if="char.summary" class="char-summary">{{ char.summary }}</p>
          </div>
        </div>

        <!-- 好感度进度条 -->
        <div class="char-affinity-section">
          <div class="affinity-title-row">
            <span class="affinity-level-tag">
              <Heart :size="12" class="fill-current text-danger" aria-hidden="true" />
              <span>Lv.{{ char.affinity.level }} · {{ char.affinity.levelTitle }}</span>
            </span>
            <span class="affinity-exp-text">
              {{ char.affinity.currentExp }} / {{ char.affinity.maxExp }} EXP
            </span>
          </div>
          <div class="affinity-progress-bar">
            <div
              class="affinity-progress-fill"
              :style="{ width: `${Math.min(100, Math.round((char.affinity.currentExp / char.affinity.maxExp) * 100))}%` }"
            />
          </div>
        </div>

        <!-- VAD 三维情绪指示器 -->
        <div class="char-vad-section">
          <div class="vad-metric">
            <div class="vad-label-row">
              <span class="vad-name">积极度 (Valence)</span>
              <span class="vad-val">{{ Math.round((char.affinity.emotion.valence + 1) * 50) }}%</span>
            </div>
            <div class="vad-bar">
              <div
                class="vad-bar-fill vad-fill-v"
                :style="{ width: `${Math.round((char.affinity.emotion.valence + 1) * 50)}%` }"
              />
            </div>
          </div>

          <div class="vad-metric">
            <div class="vad-label-row">
              <span class="vad-name">兴奋度 (Arousal)</span>
              <span class="vad-val">{{ Math.round((char.affinity.emotion.arousal + 1) * 50) }}%</span>
            </div>
            <div class="vad-bar">
              <div
                class="vad-bar-fill vad-fill-a"
                :style="{ width: `${Math.round((char.affinity.emotion.arousal + 1) * 50)}%` }"
              />
            </div>
          </div>

          <div class="vad-metric">
            <div class="vad-label-row">
              <span class="vad-name">掌控感 (Dominance)</span>
              <span class="vad-val">{{ Math.round((char.affinity.emotion.dominance + 1) * 50) }}%</span>
            </div>
            <div class="vad-bar">
              <div
                class="vad-bar-fill vad-fill-d"
                :style="{ width: `${Math.round((char.affinity.emotion.dominance + 1) * 50)}%` }"
              />
            </div>
          </div>
        </div>

        <!-- 24 小时当前日程与时间表 -->
        <div class="char-schedule-section">
          <div class="schedule-head">
            <div class="schedule-head-left">
              <Clock :size="13" class="text-primary" aria-hidden="true" />
              <span class="schedule-head-title">当前生活日程</span>
            </div>
            <button
              type="button"
              class="schedule-toggle-btn"
              @click="toggleSchedule(char.characterId)"
            >
              {{ expandedSchedule[char.characterId] ? '收起完整作息' : '查看全天作息' }}
            </button>
          </div>

          <div class="schedule-current-card">
            <div class="schedule-current-top">
              <span class="current-badge">🟢 进行中</span>
              <span class="current-time">{{ char.schedule.currentActivity.timeSlot }}</span>
            </div>
            <div class="schedule-current-body">
              <div class="current-act-title">{{ char.schedule.currentActivity.activityName }}</div>
              <div class="current-act-loc">
                <MapPin :size="11" aria-hidden="true" />
                <span>{{ char.schedule.currentActivity.locationName }}</span>
              </div>
              <p class="current-act-desc">{{ char.schedule.currentActivity.description }}</p>
            </div>
          </div>

          <!-- 展开全天作息列表 -->
          <div v-if="expandedSchedule[char.characterId]" class="schedule-timeline">
            <div
              v-for="(r, idx) in char.schedule.routines"
              :key="idx"
              class="timeline-item"
              :class="{ 'is-current': r.activityName === char.schedule.currentActivity.activityName }"
            >
              <div class="timeline-dot" />
              <div class="timeline-info">
                <div class="timeline-time">{{ r.timeSlot }} · {{ r.locationName }}</div>
                <div class="timeline-act">{{ r.activityName }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 操作区：直达对话 -->
        <div class="char-card-actions">
          <Button variant="secondary" size="sm" class="char-chat-btn" @click="goToChat">
            <MessageSquare :size="14" aria-hidden="true" />
            <span>进入故事对话与她互动</span>
          </Button>
        </div>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.companion-roster-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: var(--space-4) var(--space-3);
  gap: var(--space-4);
  background: var(--background);
}

.roster-header {
  padding: 0 var(--space-1);
}

.roster-title {
  margin: 0;
  font-size: var(--text-md);
  font-weight: 800;
  color: var(--text-strong);
}

.roster-desc {
  margin: 2px 0 0;
  font-size: var(--text-xs);
  color: var(--muted);
}

.roster-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.char-roster-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--border);
}

.char-top-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.char-avatar-ring {
  padding: 2px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--primary), var(--secondary, #8b5cf6));
  flex-shrink: 0;
}

.char-avatar {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--primary);
  display: grid;
  place-items: center;
  font-size: var(--text-base);
  font-weight: 800;
}

.char-meta {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.char-name-row {
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

.char-mood-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 11px;
  font-weight: 700;
}

.char-summary {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--muted);
  line-height: 1.4;
}

/* 好感度 */
.char-affinity-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--surface-soft);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

.affinity-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.affinity-level-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-strong);
}

.affinity-exp-text {
  font-size: 11px;
  color: var(--muted);
  font-weight: 600;
}

.affinity-progress-bar {
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--surface);
  overflow: hidden;
}

.affinity-progress-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: linear-gradient(90deg, var(--danger, #f43f5e), var(--primary));
  transition: width 0.3s ease;
}

/* VAD 情绪指示 */
.char-vad-section {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
  background: var(--surface-soft);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

.vad-metric {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.vad-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.vad-name {
  font-size: 10px;
  color: var(--muted);
}

.vad-val {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-strong);
}

.vad-bar {
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--surface);
  overflow: hidden;
}

.vad-bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width 0.3s ease;
}

.vad-fill-v { background: #10b981; }
.vad-fill-a { background: #f59e0b; }
.vad-fill-d { background: #6366f1; }

/* 日程 */
.char-schedule-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.schedule-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.schedule-head-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.schedule-head-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-strong);
}

.schedule-toggle-btn {
  border: 0;
  background: transparent;
  color: var(--primary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.schedule-current-card {
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.schedule-current-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.current-badge {
  font-size: 11px;
  font-weight: 700;
  color: var(--success, #10b981);
}

.current-time {
  font-size: 11px;
  color: var(--muted);
  font-weight: 600;
}

.current-act-title {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--text-strong);
}

.current-act-loc {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--muted);
}

.current-act-desc {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--text);
  line-height: 1.4;
}

.schedule-timeline {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
  border: 1px dashed var(--border);
}

.timeline-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  font-size: 11px;
}

.timeline-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--muted);
  margin-top: 4px;
}

.timeline-item.is-current .timeline-dot {
  background: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}

.timeline-info {
  display: flex;
  flex-direction: column;
}

.timeline-time {
  color: var(--muted);
  font-size: 10px;
}

.timeline-act {
  color: var(--text);
  font-weight: 600;
}

.timeline-item.is-current .timeline-act {
  color: var(--primary);
  font-weight: 700;
}

.char-card-actions {
  margin-top: var(--space-1);
}

.char-chat-btn {
  width: 100%;
}

.roster-status,
.roster-empty {
  padding: var(--space-8);
  text-align: center;
  color: var(--muted);
}
</style>
