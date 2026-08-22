<script setup lang="ts">
import { computed, ref } from "vue";
import { Heart, MessageCircle, Plus, Send, Sparkles, X } from "@lucide/vue";
import type {
  V2CharacterId,
  V2CompanionMomentDto,
  V2IdempotencyKey,
  V2MomentId,
} from "@living-network/contracts/v2";
import Button from "../../../components/ui/Button.vue";
import type { V2CompanionClient } from "../client.ts";

const props = defineProps<{
  client: V2CompanionClient;
  moments: readonly V2CompanionMomentDto[];
  loading: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  "preview-image": [url: string];
  "create-moment-click": [];
}>();

const commentDrafts = ref<Record<string, string>>({});
const commentSubmitting = ref<Record<string, boolean>>({});
const isLiking = ref<Record<string, boolean>>({});

// Create moment modal
const createModalOpen = ref(false);
const createCharacterId = ref<V2CharacterId>("character:furina" as V2CharacterId);
const createTopic = ref("");
const creatingMoment = ref(false);

const uniqueCharacters = computed(() => {
  const map = new Map<string, string>();
  for (const m of props.moments) {
    if (!map.has(m.characterId)) {
      map.set(m.characterId, m.characterName);
    }
  }
  if (!map.has("character:furina")) map.set("character:furina", "芙宁娜");
  if (!map.has("character:clorinde")) map.set("character:clorinde", "克洛琳德");
  if (!map.has("character:navia")) map.set("character:navia", "娜维娅");
  return Array.from(map.entries()).map(([id, name]) => ({ characterId: id as V2CharacterId, name }));
});

function avatarInitial(name: string): string {
  return [...name.trim()][0] ?? "?";
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

async function handleLike(moment: V2CompanionMomentDto): Promise<void> {
  if (isLiking.value[moment.momentId]) return;
  isLiking.value[moment.momentId] = true;
  try {
    await props.client.toggleLikeMoment(moment.momentId);
    emit("refresh");
  } finally {
    isLiking.value[moment.momentId] = false;
  }
}

async function submitComment(momentId: V2MomentId): Promise<void> {
  const text = (commentDrafts.value[momentId] || "").trim();
  if (!text || commentSubmitting.value[momentId]) return;

  commentSubmitting.value[momentId] = true;
  try {
    await props.client.addComment(momentId, {
      content: text,
      idempotencyKey: `comment:${Date.now()}` as V2IdempotencyKey,
    });
    commentDrafts.value[momentId] = "";
    emit("refresh");
  } finally {
    commentSubmitting.value[momentId] = false;
  }
}

async function handleCreateMoment(): Promise<void> {
  if (creatingMoment.value) return;
  creatingMoment.value = true;
  try {
    await props.client.createMoment({
      characterId: createCharacterId.value,
      ...(createTopic.value.trim() ? { topic: createTopic.value.trim() } : {}),
      idempotencyKey: `moment:${Date.now()}` as V2IdempotencyKey,
    });
    createTopic.value = "";
    createModalOpen.value = false;
    emit("refresh");
  } finally {
    creatingMoment.value = false;
  }
}
</script>

<template>
  <div class="moments-stream-container">
    <!-- 动态发布与氛围 Banner -->
    <div class="moments-publish-card">
      <div class="publish-card-left">
        <div class="publish-icon-box">
          <Sparkles :size="20" class="text-primary" aria-hidden="true" />
        </div>
        <div class="publish-text">
          <h3 class="publish-title">邻舍朋友圈</h3>
          <p class="publish-subtitle">记录你与陪伴角色在日常相伴中的美好瞬间与自拍 ✨</p>
        </div>
      </div>
      <Button
        variant="primary"
        size="sm"
        class="publish-trigger-btn"
        @click="createModalOpen = true"
      >
        <Plus :size="15" aria-hidden="true" />
        <span>激发新动态</span>
      </Button>
    </div>

    <!-- 动态列表 -->
    <div v-if="loading && moments.length === 0" class="moments-loading-state">
      <div class="loading-spinner" />
      <span>正在加载朋友圈动态…</span>
    </div>

    <div v-else-if="moments.length === 0" class="moments-empty-card">
      <Sparkles :size="32" class="text-primary" aria-hidden="true" />
      <h4>暂无生活动态</h4>
      <p>点击上方「激发新动态」，让心仪的角色为你发布专属的生活朋友圈！</p>
      <Button variant="primary" size="sm" @click="createModalOpen = true">
        <Plus :size="14" aria-hidden="true" />
        <span>立即生成动态</span>
      </Button>
    </div>

    <div v-else class="moments-feed-list">
      <article
        v-for="moment in moments"
        :key="moment.momentId"
        class="moment-feed-card"
      >
        <!-- 头部作者信息 -->
        <div class="moment-card-header">
          <div class="author-avatar-wrap">
            <div class="author-avatar">
              {{ avatarInitial(moment.characterName) }}
            </div>
            <div class="author-online-dot" />
          </div>
          <div class="author-info">
            <div class="author-name-row">
              <span class="author-name">{{ moment.characterName }}</span>
              <span class="author-badge">AI 伴侣</span>
            </div>
            <span class="moment-timestamp">{{ formatRelativeTime(moment.createdAt) }}</span>
          </div>
        </div>

        <!-- 动态文本 -->
        <p class="moment-text-content">{{ moment.content }}</p>

        <!-- ComfyUI 配图 -->
        <div v-if="moment.mediaRef" class="moment-media-wrapper">
          <div
            class="moment-media-card"
            @click="emit('preview-image', client.mediaUrl(moment.mediaRef))"
          >
            <img
              :src="client.mediaUrl(moment.mediaRef)"
              :alt="moment.characterName + '的生活动态图片'"
              class="moment-media-image"
              loading="lazy"
              @error="(e) => (e.target as HTMLElement).style.display = 'none'"
            />
            <div class="media-hover-overlay">
              <span class="media-zoom-hint">点击查看高清大图 🔍</span>
            </div>
          </div>
        </div>

        <!-- 交互工具栏 -->
        <div class="moment-interaction-bar">
          <button
            type="button"
            class="interact-btn"
            :class="{ 'is-active-like': moment.isLiked }"
            :disabled="isLiking[moment.momentId] ?? false"
            @click="handleLike(moment)"
          >
            <Heart
              :size="16"
              :class="{ 'fill-current': moment.isLiked }"
              aria-hidden="true"
            />
            <span>{{ moment.likesCount > 0 ? moment.likesCount : '赞' }}</span>
          </button>

          <button
            type="button"
            class="interact-btn"
            @click="commentDrafts[moment.momentId] = commentDrafts[moment.momentId] || ''"
          >
            <MessageCircle :size="16" aria-hidden="true" />
            <span>{{ moment.comments.length > 0 ? moment.comments.length : '评论' }}</span>
          </button>
        </div>

        <!-- 评论列表 -->
        <div v-if="moment.comments.length > 0" class="moment-comments-panel">
          <div
            v-for="comment in moment.comments"
            :key="comment.commentId"
            class="comment-entry"
          >
            <span
              class="comment-user"
              :class="{ 'is-char': comment.authorType === 'character' }"
            >
              {{ comment.authorName }}
              <span v-if="comment.replyToCommentId" class="reply-indicator">回复 我:</span>
              <span v-else>:</span>
            </span>
            <span class="comment-msg">{{ comment.content }}</span>
          </div>
        </div>

        <!-- 快捷评论输入 -->
        <form class="quick-comment-form" @submit.prevent="submitComment(moment.momentId)">
          <input
            v-model="commentDrafts[moment.momentId]"
            type="text"
            class="quick-comment-input"
            placeholder="写下你的评论，角色会智能回复你…"
            :disabled="commentSubmitting[moment.momentId] ?? false"
          />
          <Button
            variant="ghost"
            size="sm"
            type="submit"
            class="quick-comment-btn"
            :loading="commentSubmitting[moment.momentId] ?? false"
            :disabled="!(commentDrafts[moment.momentId] || '').trim()"
          >
            <Send :size="14" aria-hidden="true" />
            <span>发送</span>
          </Button>
        </form>
      </article>
    </div>

    <!-- 激发新动态 Modal -->
    <div v-if="createModalOpen" class="modal-backdrop" @click="createModalOpen = false" />
    <div v-if="createModalOpen" class="modal-container" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="modal-title-group">
          <Sparkles :size="18" class="text-primary" aria-hidden="true" />
          <h3>激发角色朋友圈动态</h3>
        </div>
        <Button variant="ghost" size="icon" aria-label="关闭" @click="createModalOpen = false">
          <X :size="16" aria-hidden="true" />
        </Button>
      </div>

      <div class="modal-content-body">
        <div class="form-group">
          <label class="form-label">选择伴侣角色</label>
          <select v-model="createCharacterId" class="form-select">
            <option
              v-for="c in uniqueCharacters"
              :key="c.characterId"
              :value="c.characterId"
            >
              {{ c.name }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">指定话题或场景（可选）</label>
          <input
            v-model="createTopic"
            type="text"
            class="form-input"
            placeholder="例如：海边的黄昏、新学的烘焙、舞台剧排练…"
          />
        </div>
      </div>

      <div class="modal-footer">
        <Button variant="ghost" @click="createModalOpen = false">取消</Button>
        <Button
          variant="primary"
          :loading="creatingMoment"
          @click="handleCreateMoment"
        >
          <Sparkles :size="14" aria-hidden="true" />
          <span>立即生成动态</span>
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.moments-stream-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
}

/* 发布卡片 */
.moments-publish-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.publish-card-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.publish-icon-box {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.publish-title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 800;
  color: var(--text-strong);
}

.publish-subtitle {
  margin: 2px 0 0;
  font-size: var(--text-xs);
  color: var(--muted);
}

.publish-trigger-btn {
  flex-shrink: 0;
}

/* 动态列表 */
.moments-feed-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.moment-feed-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-4) var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--motion-fast);
}

.moment-feed-card:hover {
  border-color: var(--border-strong);
}

/* 头部 */
.moment-card-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.author-avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.author-avatar {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--primary), var(--secondary, #8b5cf6));
  color: #fff;
  display: grid;
  place-items: center;
  font-size: var(--text-base);
  font-weight: 800;
  box-shadow: var(--shadow-sm);
}

.author-online-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
  background: #10b981;
  border: 2px solid var(--surface);
}

.author-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.author-name-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.author-name {
  font-size: var(--text-sm);
  font-weight: 800;
  color: var(--text-strong);
}

.author-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 700;
}

.moment-timestamp {
  font-size: 11px;
  color: var(--muted);
}

/* 文本 */
.moment-text-content {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.65;
  color: var(--text-strong);
  word-break: break-word;
}

/* 配图 */
.moment-media-wrapper {
  margin-top: 2px;
}

.moment-media-card {
  position: relative;
  max-width: 480px;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border);
  cursor: zoom-in;
  background: var(--surface-soft);
}

.moment-media-image {
  width: 100%;
  max-height: 380px;
  object-fit: cover;
  display: block;
  transition: transform var(--motion-fast);
}

.moment-media-card:hover .moment-media-image {
  transform: scale(1.02);
}

.media-hover-overlay {
  position: absolute;
  inset: auto 0 0 0;
  padding: 8px 12px;
  background: linear-gradient(to top, rgb(0 0 0 / 70%), transparent);
  display: flex;
  justify-content: flex-end;
  opacity: 0;
  transition: opacity var(--motion-fast);
}

.moment-media-card:hover .media-hover-overlay {
  opacity: 1;
}

.media-zoom-hint {
  font-size: 11px;
  color: #fff;
  font-weight: 600;
}

/* 交互栏 */
.moment-interaction-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-top: var(--space-1);
}

.interact-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: var(--surface-soft);
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--motion-fast);
}

.interact-btn:hover {
  background: var(--surface);
  color: var(--text-strong);
  border-color: var(--border-strong);
}

.interact-btn.is-active-like {
  color: var(--danger, #f43f5e);
  background: rgb(244 63 94 / 10%);
  border-color: rgb(244 63 94 / 30%);
}

.fill-current {
  fill: currentColor;
}

/* 评论区 */
.moment-comments-panel {
  background: var(--surface-soft);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: var(--text-xs);
  border: 1px solid var(--border);
}

.comment-entry {
  line-height: 1.5;
  word-break: break-word;
}

.comment-user {
  font-weight: 700;
  color: var(--primary);
  margin-right: 4px;
}

.comment-user.is-char {
  color: var(--secondary, #8b5cf6);
}

.reply-indicator {
  color: var(--muted);
  font-weight: normal;
  margin-left: 2px;
}

.comment-msg {
  color: var(--text);
}

/* 评论输入 */
.quick-comment-form {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.quick-comment-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 7px 14px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: var(--surface-soft);
  color: var(--text-strong);
  font-size: var(--text-xs);
  outline: none;
  transition: border-color var(--motion-fast);
}

.quick-comment-input:focus {
  border-color: var(--primary);
  background: var(--surface);
}

/* Loading & Empty */
.moments-loading-state,
.moments-empty-card {
  padding: var(--space-10) var(--space-4);
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

.moments-empty-card h4 {
  margin: 0;
  font-size: var(--text-base);
  color: var(--text-strong);
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border);
  border-top-color: var(--primary);
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 50%);
  backdrop-filter: blur(4px);
  z-index: 100;
}

.modal-container {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(480px, 92vw);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  z-index: 101;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border);
}

.modal-title-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.modal-title-group h3 {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 800;
  color: var(--text-strong);
}

.modal-content-body {
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.form-label {
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--text);
}

.form-select,
.form-input {
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface-soft);
  color: var(--text-strong);
  font-size: var(--text-sm);
  outline: none;
}

.form-select:focus,
.form-input:focus {
  border-color: var(--primary);
  background: var(--surface);
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  background: var(--surface-soft);
  border-top: 1px solid var(--border);
}
</style>
