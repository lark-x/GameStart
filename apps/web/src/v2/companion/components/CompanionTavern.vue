<script setup lang="ts">
import { ref } from "vue";
import { Edit3, Heart, MessageSquare, Smile, Sparkles, User } from "@lucide/vue";
import type { V2CompanionRosterResponse } from "@living-network/contracts/v2";

defineProps<{
  roster: V2CompanionRosterResponse | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  "start-chat": [characterId: string];
}>();

// User local profile states (persisted in localStorage)
const STORAGE_KEY = "linshe_companion_user_profile";

function loadSavedProfile(): { nickname: string; gender: string; appearance: string; persona: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    nickname: "旅行者",
    gender: "男",
    appearance: "黑色短发，随性而温和的气质，常着深色风衣",
    persona: "温柔、善解人意，喜欢在傍晚漫步并倾听伴侣的心事",
  };
}

const userProfile = ref(loadSavedProfile());
const isEditingProfile = ref(false);

function saveProfile(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userProfile.value));
  } catch {}
  isEditingProfile.value = false;
}

function avatarInitial(name: string): string {
  return [...name.trim()][0] ?? "?";
}
</script>

<template>
  <div class="tavern-view-layout">
    <!-- 顶栏 -->
    <div class="tavern-topbar">
      <div class="topbar-left">
        <h2 class="tavern-page-title">酒馆 · 伴侣与玩家档案</h2>
        <span class="tavern-subtitle">管理你的个人外貌与人设，并感知伴侣角色的好感羁绊与情感模型</span>
      </div>
    </div>

    <!-- 玩家个人信息档案卡 (对标 TavernView User Card) -->
    <section class="user-profile-card">
      <div class="card-header-row">
        <div class="card-title-wrap">
          <User :size="16" class="text-primary" aria-hidden="true" />
          <h3 class="card-title">玩家自身档案设定</h3>
        </div>
        <button
          type="button"
          class="edit-toggle-btn"
          @click="isEditingProfile ? saveProfile() : (isEditingProfile = true)"
        >
          <Edit3 :size="13" aria-hidden="true" />
          <span>{{ isEditingProfile ? '保存设定' : '编辑档案' }}</span>
        </button>
      </div>

      <div class="profile-fields-grid">
        <!-- 称呼 -->
        <div class="field-item">
          <span class="field-label">称呼 / 昵称</span>
          <input
            v-if="isEditingProfile"
            v-model="userProfile.nickname"
            type="text"
            class="field-input"
            placeholder="输入你的称呼…"
          />
          <span v-else class="field-value">{{ userProfile.nickname }}</span>
        </div>

        <!-- 性别 -->
        <div class="field-item">
          <span class="field-label">性别</span>
          <input
            v-if="isEditingProfile"
            v-model="userProfile.gender"
            type="text"
            class="field-input"
            placeholder="男 / 女 / …"
          />
          <span v-else class="field-value">{{ userProfile.gender }}</span>
        </div>

        <!-- 外貌描述 (生图与对话感知) -->
        <div class="field-item full-width">
          <span class="field-label">外观特征描述（ComfyUI 插画与对话感知）</span>
          <textarea
            v-if="isEditingProfile"
            v-model="userProfile.appearance"
            class="field-textarea"
            rows="2"
            placeholder="描述你的外貌特征…"
          />
          <p v-else class="field-value text-block">{{ userProfile.appearance }}</p>
        </div>

        <!-- 其他人设说明 -->
        <div class="field-item full-width">
          <span class="field-label">性格与背景人设</span>
          <textarea
            v-if="isEditingProfile"
            v-model="userProfile.persona"
            class="field-textarea"
            rows="2"
            placeholder="描述你的性格、习惯与设定…"
          />
          <p v-else class="field-value text-block">{{ userProfile.persona }}</p>
        </div>
      </div>
    </section>

    <!-- 伴侣角色羁绊与好感度卡片列表 -->
    <section class="roster-section">
      <div class="section-head-title">
        <Sparkles :size="16" class="text-primary" aria-hidden="true" />
        <h3>伴侣角色羁绊与三维情绪状态</h3>
      </div>

      <div v-if="loading && (!roster || roster.characters.length === 0)" class="tavern-loading">
        <div class="spinner-ring" />
        <span>正在读取伴侣情感模型…</span>
      </div>

      <div v-else-if="!roster || roster.characters.length === 0" class="tavern-empty">
        <p>暂无角色伴侣数据</p>
      </div>

      <div v-else class="characters-roster-grid">
        <article
          v-for="c in roster.characters"
          :key="c.characterId"
          class="character-tavern-card"
        >
          <!-- 头部 -->
          <div class="char-card-header">
            <div class="char-avatar-ring">
              <div class="char-avatar-inner">{{ avatarInitial(c.name) }}</div>
            </div>
            <div class="char-meta-info">
              <div class="char-name-line">
                <h4 class="char-name">{{ c.name }}</h4>
                <span class="mood-pill">
                  <Smile :size="12" aria-hidden="true" />
                  <span>{{ c.affinity.emotion.moodLabel }}</span>
                </span>
              </div>
              <p class="char-desc">{{ c.summary || '温柔陪伴在你的身旁' }}</p>
            </div>
          </div>

          <!-- 好感度羁绊进阶 -->
          <div class="box-segment">
            <div class="segment-head">
              <div class="affinity-tag">
                <Heart :size="13" class="fill-current text-danger" aria-hidden="true" />
                <span>Lv.{{ c.affinity.level }} · {{ c.affinity.levelTitle }}</span>
              </div>
              <span class="exp-text">{{ c.affinity.currentExp }} / {{ c.affinity.maxExp }} EXP</span>
            </div>
            <div class="progress-bar">
              <div
                class="progress-fill"
                :style="{ width: `${Math.min(100, Math.round((c.affinity.currentExp / c.affinity.maxExp) * 100))}%` }"
              />
            </div>
          </div>

          <!-- VAD 三维情绪仪表 -->
          <div class="box-segment">
            <span class="segment-label">三维情绪模型 (VAD)</span>
            <div class="vad-triple-row">
              <div class="vad-cell">
                <span class="vad-name">积极度 (V)</span>
                <div class="vad-bar"><div class="vad-fill fill-v" :style="{ width: `${Math.round((c.affinity.emotion.valence + 1) * 50)}%` }" /></div>
                <strong class="vad-val">{{ Math.round((c.affinity.emotion.valence + 1) * 50) }}%</strong>
              </div>

              <div class="vad-cell">
                <span class="vad-name">兴奋度 (A)</span>
                <div class="vad-bar"><div class="vad-fill fill-a" :style="{ width: `${Math.round((c.affinity.emotion.arousal + 1) * 50)}%` }" /></div>
                <strong class="vad-val">{{ Math.round((c.affinity.emotion.arousal + 1) * 50) }}%</strong>
              </div>

              <div class="vad-cell">
                <span class="vad-name">掌控感 (D)</span>
                <div class="vad-bar"><div class="vad-fill fill-d" :style="{ width: `${Math.round((c.affinity.emotion.dominance + 1) * 50)}%` }" /></div>
                <strong class="vad-val">{{ Math.round((c.affinity.emotion.dominance + 1) * 50) }}%</strong>
              </div>
            </div>
          </div>

          <!-- 进入私聊 -->
          <button
            type="button"
            class="start-chat-btn"
            @click="emit('start-chat', c.characterId)"
          >
            <MessageSquare :size="14" aria-hidden="true" />
            <span>进入私聊与 {{ c.name }} 对话</span>
          </button>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tavern-view-layout {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
}

.tavern-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-5) var(--space-6);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-2xl, 24px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
}

.topbar-left {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.tavern-page-title {
  margin: 0;
  font-size: var(--text-xl, 20px);
  font-weight: 900;
  color: var(--text-strong);
  letter-spacing: -0.02em;
}

.tavern-subtitle {
  font-size: var(--text-xs);
  color: var(--muted);
}

/* 玩家卡 */
.user-profile-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-2xl, 24px);
  padding: var(--space-6) var(--space-7);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.03);
}

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.card-title {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 800;
  color: var(--text-strong);
}

.edit-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: var(--surface-soft);
  color: var(--primary);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--motion-fast);
}

.edit-toggle-btn:hover {
  background: var(--primary-soft);
}

.profile-fields-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
}

.field-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.field-item.full-width {
  grid-column: 1 / -1;
}

.field-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
}

.field-value {
  font-size: 12px;
  color: var(--text-strong);
  font-weight: 600;
}

.field-value.text-block {
  line-height: 1.4;
  margin: 0;
}

.field-input,
.field-textarea {
  padding: 6px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface-soft);
  color: var(--text-strong);
  font-size: 12px;
  outline: none;
}

.field-input:focus,
.field-textarea:focus {
  border-color: var(--primary);
}

/* 伴侣卡 */
.roster-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.section-head-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.section-head-title h3 {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 800;
  color: var(--text-strong);
}

.characters-roster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--space-4);
}

.character-tavern-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  box-shadow: var(--shadow-sm);
}

.char-card-header {
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

.char-avatar-inner {
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

.char-meta-info {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.char-name-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.char-name {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 800;
  color: var(--text-strong);
}

.mood-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 10px;
  font-weight: 700;
}

.char-desc {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.3;
}

.box-segment {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.segment-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.affinity-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-strong);
}

.exp-text {
  font-size: 10px;
  color: var(--muted);
}

.progress-bar {
  height: 5px;
  border-radius: var(--radius-full);
  background: var(--surface);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: linear-gradient(90deg, #f43f5e, var(--primary));
  transition: width 0.3s ease;
}

.segment-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--muted);
}

.vad-triple-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.vad-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  color: var(--text);
  gap: 6px;
}

.vad-name {
  width: 70px;
  flex-shrink: 0;
}

.vad-bar {
  flex: 1 1 auto;
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--surface);
  overflow: hidden;
}

.vad-fill { height: 100%; }
.fill-v { background: #10b981; }
.fill-a { background: #f59e0b; }
.fill-d { background: #6366f1; }

.vad-val {
  width: 32px;
  text-align: right;
}

.start-chat-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface-soft);
  color: var(--text-strong);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--motion-fast);
}

.start-chat-btn:hover {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.tavern-loading,
.tavern-empty {
  padding: var(--space-8);
  text-align: center;
  color: var(--muted);
}

.spinner-ring {
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

@media (max-width: 600px) {
  .profile-fields-grid {
    grid-template-columns: 1fr;
  }
}
</style>
