<script setup lang="ts">
import { ref } from "vue";
import { Check, Edit3, Heart, MessageSquare, Smile, Sparkles, User } from "@lucide/vue";
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
        <span class="tavern-subtitle">设定你的个人外貌与人设，并感知伴侣角色的好感羁绊与情感模型</span>
      </div>
    </div>

    <!-- 玩家个人信息档案卡 -->
    <section class="user-profile-card">
      <div class="card-header-row">
        <div class="card-title-wrap">
          <div class="user-avatar-icon">
            <User :size="18" class="text-indigo-400" aria-hidden="true" />
          </div>
          <div>
            <h3 class="card-title">玩家自身档案设定</h3>
            <span class="card-desc">用于 ComfyUI 生图与 AI 对话时的外貌与性格感知</span>
          </div>
        </div>
        <button
          type="button"
          class="edit-toggle-btn"
          @click="isEditingProfile ? saveProfile() : (isEditingProfile = true)"
        >
          <Check v-if="isEditingProfile" :size="14" aria-hidden="true" />
          <Edit3 v-else :size="14" aria-hidden="true" />
          <span>{{ isEditingProfile ? '完成保存' : '编辑档案' }}</span>
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
          <div v-else class="field-value-box">
            <span class="field-val-text highlight">{{ userProfile.nickname }}</span>
          </div>
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
          <div v-else class="field-value-box">
            <span class="field-val-text">{{ userProfile.gender }}</span>
          </div>
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
          <div v-else class="field-value-box block">
            <p class="field-val-text">{{ userProfile.appearance }}</p>
          </div>
        </div>

        <!-- 性格人设说明 -->
        <div class="field-item full-width">
          <span class="field-label">性格与背景人设</span>
          <textarea
            v-if="isEditingProfile"
            v-model="userProfile.persona"
            class="field-textarea"
            rows="2"
            placeholder="描述你的性格、习惯与设定…"
          />
          <div v-else class="field-value-box block">
            <p class="field-val-text">{{ userProfile.persona }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 伴侣角色羁绊与好感度卡片列表 -->
    <section class="roster-section">
      <div class="section-head-title">
        <Sparkles :size="18" class="text-indigo-400" aria-hidden="true" />
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
                <Heart :size="13" class="fill-current text-rose-500" aria-hidden="true" />
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
            <MessageSquare :size="15" aria-hidden="true" />
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
  gap: 24px;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding-bottom: 60px;
}

.tavern-topbar {
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
}

.topbar-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tavern-page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 900;
  color: #f8fafc;
  letter-spacing: -0.02em;
}

.tavern-subtitle {
  font-size: 13px;
  color: #94a3b8;
}

/* 玩家卡 */
.user-profile-card {
  background: rgba(26, 23, 40, 0.75);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
}

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-avatar-icon {
  width: 40px;
  height: 40px;
  border-radius: 9999px;
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.3);
  display: grid;
  place-items: center;
}

.card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: #f8fafc;
}

.card-desc {
  font-size: 12px;
  color: #94a3b8;
}

.edit-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border-radius: 9999px;
  border: 1px solid rgba(99, 102, 241, 0.4);
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s ease;
}

.edit-toggle-btn:hover {
  background: rgba(99, 102, 241, 0.3);
  color: #ffffff;
  transform: translateY(-1px);
}

.profile-fields-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.field-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-item.full-width {
  grid-column: span 2;
}

.field-label {
  font-size: 12px;
  font-weight: 800;
  color: #94a3b8;
}

.field-value-box {
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  min-height: 42px;
  display: flex;
  align-items: center;
}

.field-value-box.block {
  align-items: flex-start;
}

.field-val-text {
  font-size: 14px;
  color: #e2e8f0;
  margin: 0;
  line-height: 1.6;
}

.field-val-text.highlight {
  font-weight: 800;
  color: #f8fafc;
}

.field-input,
.field-textarea {
  padding: 10px 14px;
  background: #141220;
  border: 1px solid #6366f1;
  border-radius: 12px;
  color: #f8fafc;
  font-size: 14px;
  outline: none;
  font-family: inherit;
}

.field-textarea {
  resize: vertical;
}

/* 伴侣羁绊列表 */
.roster-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-head-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #f8fafc;
}

.section-head-title h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 900;
  letter-spacing: -0.01em;
}

.characters-roster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 20px;
}

.character-tavern-card {
  background: rgba(26, 23, 40, 0.75);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s ease, border-color 0.2s ease;
}

.character-tavern-card:hover {
  transform: translateY(-2px);
  border-color: rgba(99, 102, 241, 0.4);
}

.char-card-header {
  display: flex;
  align-items: center;
  gap: 14px;
}

.char-avatar-ring {
  padding: 3px;
  border-radius: 9999px;
  background: linear-gradient(135deg, #f43f5e, #6366f1);
  flex-shrink: 0;
}

.char-avatar-inner {
  width: 48px;
  height: 48px;
  border-radius: 9999px;
  background: #181528;
  color: #a5b4fc;
  display: grid;
  place-items: center;
  font-size: 17px;
  font-weight: 900;
}

.char-meta-info {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.char-name-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.char-name {
  margin: 0;
  font-size: 17px;
  font-weight: 900;
  color: #f8fafc;
}

.mood-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: 9999px;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #fbbf24;
}

.char-desc {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.4;
}

/* 进阶与 VAD */
.box-segment {
  background: rgba(20, 18, 32, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.segment-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.affinity-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 800;
  color: #fb7185;
}

.exp-text {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 700;
}

.progress-bar {
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #f43f5e, #8b5cf6);
  border-radius: 9999px;
  transition: width 0.3s ease;
}

.segment-label {
  font-size: 11px;
  font-weight: 800;
  color: #64748b;
}

.vad-triple-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vad-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.vad-name {
  width: 78px;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.vad-bar {
  flex: 1 1 auto;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  overflow: hidden;
}

.vad-fill {
  height: 100%;
  border-radius: 9999px;
}

.fill-v { background: linear-gradient(90deg, #10b981, #34d399); }
.fill-a { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
.fill-d { background: linear-gradient(90deg, #6366f1, #818cf8); }

.vad-val {
  width: 36px;
  text-align: right;
  font-size: 12px;
  font-weight: 800;
  color: #e2e8f0;
  flex-shrink: 0;
}

.start-chat-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(99, 102, 241, 0.4);
  background: rgba(99, 102, 241, 0.15);
  color: #e0e7ff;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s ease;
}

.start-chat-btn:hover {
  background: #6366f1;
  color: #ffffff;
  transform: translateY(-1px);
}

.tavern-loading,
.tavern-empty {
  padding: 40px;
  text-align: center;
  color: #94a3b8;
  background: rgba(26, 23, 40, 0.75);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.spinner-ring {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #6366f1;
  border-radius: 9999px;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 12px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .profile-fields-grid {
    grid-template-columns: 1fr;
  }
  .field-item.full-width {
    grid-column: span 1;
  }
  .characters-roster-grid {
    grid-template-columns: 1fr;
  }
}
</style>
