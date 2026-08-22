<script setup lang="ts">
import { computed, ref } from "vue";
import { Heart, MessageCircle, Send, Share2, Sparkles, X } from "@lucide/vue";
import type {
  V2CharacterId,
  V2CompanionMomentDto,
  V2IdempotencyKey,
  V2MomentId,
} from "@living-network/contracts/v2";
import type { V2CompanionClient } from "../client.ts";

const props = defineProps<{
  client: V2CompanionClient;
  moments: readonly V2CompanionMomentDto[];
  loading: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  "preview-image": [url: string];
  "select-character": [characterId: string];
}>();

// Filter states: null = all, 'liked' = only liked, characterId = specific character
const activeFilter = ref<string | null>(null);
const filterLikedOnly = ref(false);

// Active post comment draft
const replyDrafts = ref<Record<string, string>>({});
const activeCommentPostId = ref<string | null>(null);
const submittingComment = ref<Record<string, boolean>>({});

// Trigger new post modal
const showGeneratePicker = ref(false);
const isGeneratingPost = ref(false);

// Unique characters with posts
const charactersWithPosts = computed(() => {
  const map = new Map<string, { characterId: string; characterName: string }>();
  for (const m of props.moments) {
    if (!map.has(m.characterId)) {
      map.set(m.characterId, { characterId: m.characterId, characterName: m.characterName });
    }
  }
  return Array.from(map.values());
});

const filteredMoments = computed(() => {
  let result = props.moments;
  if (filterLikedOnly.value) {
    result = result.filter((m) => m.isLiked);
  }
  if (activeFilter.value) {
    result = result.filter((m) => m.characterId === activeFilter.value);
  }
  return result;
});

function avatarInitial(name: string): string {
  return [...name.trim()][0] ?? "?";
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "刚刚";
    if (diffMins < 60) return `${diffMins}分钟前`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}小时前`;
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  } catch {
    return "";
  }
}

async function handleLike(moment: V2CompanionMomentDto): Promise<void> {
  try {
    await props.client.toggleLikeMoment(moment.momentId);
    emit("refresh");
  } catch (err) {
    console.error("Like failed:", err);
  }
}

function toggleCommentBox(momentId: string): void {
  if (activeCommentPostId.value === momentId) {
    activeCommentPostId.value = null;
  } else {
    activeCommentPostId.value = momentId;
    if (!replyDrafts.value[momentId]) {
      replyDrafts.value[momentId] = "";
    }
  }
}

async function submitComment(momentId: string): Promise<void> {
  const text = replyDrafts.value[momentId]?.trim();
  if (!text || submittingComment.value[momentId]) return;

  submittingComment.value[momentId] = true;
  try {
    const idempotencyKey = `comment:${momentId}:${Date.now()}` as V2IdempotencyKey;
    await props.client.addComment(momentId as V2MomentId, {
      content: text,
      idempotencyKey,
    });
    replyDrafts.value[momentId] = "";
    activeCommentPostId.value = null;
    emit("refresh");
  } catch (err) {
    console.error("Comment failed:", err);
  } finally {
    submittingComment.value[momentId] = false;
  }
}

async function triggerNewPost(characterId: string): Promise<void> {
  showGeneratePicker.value = false;
  isGeneratingPost.value = true;
  try {
    const idempotencyKey = `gen:moment:${characterId}:${Date.now()}` as V2IdempotencyKey;
    await props.client.createMoment({
      characterId: characterId as V2CharacterId,
      idempotencyKey,
    });
    emit("refresh");
  } catch (err) {
    console.error("Trigger moment failed:", err);
  } finally {
    isGeneratingPost.value = false;
  }
}

function toggleLikedFilter(): void {
  filterLikedOnly.value = !filterLikedOnly.value;
}

function selectCharacterFilter(charId: string | null): void {
  activeFilter.value = activeFilter.value === charId ? null : charId;
}
</script>

<template>
  <div class="moments-view-layout">
    <!-- 顶栏：标题 + 扰动世界线操作 -->
    <div class="moments-topbar">
      <div class="topbar-title-group">
        <h2 class="moments-page-title">朋友圈</h2>
        <span class="moments-subtitle">Moments · 伴侣自发动态与真实生活互动</span>
      </div>

      <div class="topbar-actions">
        <button
          type="button"
          class="btn-disturb"
          :disabled="isGeneratingPost"
          @click.stop="showGeneratePicker = !showGeneratePicker"
        >
          <Sparkles :size="15" class="btn-sparkle" aria-hidden="true" />
          <span>{{ isGeneratingPost ? '扰动中…' : '🎬 扰动世界线' }}</span>
        </button>
      </div>
    </div>

    <!-- 角色选择下拉气泡 (选择发朋友圈的角色) -->
    <div v-if="showGeneratePicker" class="picker-popover-backdrop" @click="showGeneratePicker = false">
      <div class="picker-popover" @click.stop>
        <div class="picker-header">
          <span>选择激发动态的角色：</span>
          <button type="button" class="picker-close" @click="showGeneratePicker = false">
            <X :size="14" aria-hidden="true" />
          </button>
        </div>
        <div class="picker-list">
          <button
            v-for="c in charactersWithPosts"
            :key="c.characterId"
            type="button"
            class="picker-btn"
            @click="triggerNewPost(c.characterId)"
          >
            <div class="picker-avatar">{{ avatarInitial(c.characterName) }}</div>
            <span>{{ c.characterName }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 角色过滤轴 (全部 / ❤️ 赞过 / 各角色头像) -->
    <div class="filter-bar">
      <button
        type="button"
        class="filter-chip filter-all"
        :class="{ active: activeFilter === null && !filterLikedOnly }"
        @click="activeFilter = null; filterLikedOnly = false;"
      >
        全部
      </button>

      <button
        type="button"
        class="filter-chip filter-heart"
        :class="{ active: filterLikedOnly }"
        title="只看赞过的"
        @click="toggleLikedFilter"
      >
        <Heart :size="14" :class="{ 'fill-current': filterLikedOnly }" aria-hidden="true" />
        <span>赞过</span>
      </button>

      <div class="filter-divider" />

      <div class="filter-avatar-scroll">
        <button
          v-for="ch in charactersWithPosts"
          :key="ch.characterId"
          type="button"
          class="filter-avatar-btn"
          :class="{ active: activeFilter === ch.characterId }"
          :title="ch.characterName"
          @click="selectCharacterFilter(ch.characterId)"
        >
          <div class="filter-avatar-circle">
            {{ avatarInitial(ch.characterName) }}
          </div>
          <span class="filter-avatar-label">{{ ch.characterName }}</span>
        </button>
      </div>
    </div>

    <!-- 动态卡片流列表 -->
    <div v-if="loading && moments.length === 0" class="moments-loading-state">
      <div class="spinner-ring" />
      <span>正在读取伴侣朋友圈…</span>
    </div>

    <div v-else-if="filteredMoments.length === 0" class="moments-empty-state">
      <Sparkles :size="32" class="text-primary" aria-hidden="true" />
      <p v-if="filterLikedOnly">还没有赞过的帖子</p>
      <p v-else-if="activeFilter">Ta 还没有发过朋友圈</p>
      <p v-else>暂无朋友圈动态，点击右上角「🎬 扰动世界线」让伴侣发布新动态！</p>
    </div>

    <div v-else class="moments-stream">
      <article
        v-for="moment in filteredMoments"
        :key="moment.momentId"
        class="moment-card"
      >
        <!-- 动态头部：发布角色信息 -->
        <div class="moment-header">
          <div
            class="moment-avatar-ring"
            @click="emit('select-character', moment.characterId)"
          >
            <div class="moment-avatar">
              {{ avatarInitial(moment.characterName) }}
            </div>
          </div>

          <div class="moment-author-info">
            <div class="moment-name-row">
              <span class="moment-author-name" @click="emit('select-character', moment.characterId)">
                {{ moment.characterName }}
              </span>
            </div>
            <span class="moment-time-tag">{{ formatTime(moment.createdAt) }}</span>
          </div>
        </div>

        <!-- 动态正文内容 -->
        <div class="moment-text-content">
          {{ moment.content }}
        </div>

        <!-- ComfyUI 高清插画配图 -->
        <div v-if="moment.mediaRef" class="moment-media-container">
          <div
            class="moment-media-wrap"
            @click="emit('preview-image', client.mediaUrl(moment.mediaRef))"
          >
            <img
              :src="client.mediaUrl(moment.mediaRef)"
              :alt="moment.content"
              class="moment-media-img"
              loading="lazy"
              @error="(e) => (e.target as HTMLElement).style.display = 'none'"
            />
          </div>
        </div>

        <!-- 底部互动操作栏 (点赞 / 评论 / 分享) -->
        <div class="moment-action-row">
          <button
            type="button"
            class="action-btn action-like"
            :class="{ active: moment.isLiked }"
            @click="handleLike(moment)"
          >
            <Heart :size="16" :class="{ 'fill-current text-danger': moment.isLiked }" aria-hidden="true" />
            <span v-if="moment.likesCount > 0" class="like-count">{{ moment.likesCount }}</span>
            <span v-else>赞</span>
          </button>

          <button
            type="button"
            class="action-btn action-reply"
            :class="{ active: activeCommentPostId === moment.momentId }"
            @click="toggleCommentBox(moment.momentId)"
          >
            <MessageCircle :size="16" aria-hidden="true" />
            <span v-if="moment.comments.length > 0">{{ moment.comments.length }}</span>
            <span v-else>评论</span>
          </button>

          <button type="button" class="action-btn action-share" title="分享">
            <Share2 :size="15" aria-hidden="true" />
          </button>
        </div>

        <!-- 评论区列表与即时回复输入框 -->
        <div v-if="moment.comments.length > 0 || activeCommentPostId === moment.momentId" class="moment-comments-area">
          <!-- 评论列表 -->
          <div v-if="moment.comments.length > 0" class="comments-list">
            <div
              v-for="c in moment.comments"
              :key="c.commentId"
              class="comment-item"
              :class="{ 'is-char-comment': c.authorType === 'character' }"
            >
              <span class="comment-author">{{ c.authorName }}</span>
              <span class="comment-colon">：</span>
              <span class="comment-text">{{ c.content }}</span>
            </div>
          </div>

          <!-- 评论输入框 -->
          <div v-if="activeCommentPostId === moment.momentId" class="comment-input-box">
            <input
              v-model="replyDrafts[moment.momentId]"
              type="text"
              class="comment-input-field"
              placeholder="回复一条温暖的话吧…"
              maxlength="200"
              @keydown.enter="submitComment(moment.momentId)"
            />
            <button
              type="button"
              class="comment-send-btn"
              :disabled="!replyDrafts[moment.momentId]?.trim() || submittingComment[moment.momentId]"
              @click="submitComment(moment.momentId)"
            >
              <Send :size="14" aria-hidden="true" />
              <span>发送</span>
            </button>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.moments-view-layout {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
}

/* 顶栏 */
.moments-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-5) var(--space-6);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-2xl, 24px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
}

.topbar-title-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.moments-page-title {
  margin: 0;
  font-size: var(--text-xl, 20px);
  font-weight: 900;
  color: var(--text-strong);
  letter-spacing: -0.02em;
}

.moments-subtitle {
  font-size: var(--text-xs);
  color: var(--muted);
}

.btn-disturb {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 20px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: linear-gradient(135deg, var(--surface-soft), var(--surface));
  color: var(--text-strong);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: all var(--motion-fast);
}

.btn-disturb:hover {
  border-color: var(--primary);
  color: var(--primary);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.btn-sparkle {
  color: #f59e0b;
}

/* 角色选择气泡 */
.picker-popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: transparent;
}

.picker-popover {
  position: absolute;
  top: 140px;
  right: calc(50% - 430px + 24px);
  width: 260px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-2xl);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

@media (max-width: 900px) {
  .picker-popover {
    right: 24px;
  }
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 800;
  color: var(--muted);
}

.picker-close {
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.picker-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.picker-btn {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 0;
  background: var(--surface-soft);
  color: var(--text-strong);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--motion-fast);
}

.picker-btn:hover {
  background: var(--primary-soft);
  color: var(--primary);
}

.picker-avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background: var(--primary);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  display: grid;
  place-items: center;
}

/* 过滤轴 */
.filter-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-2xl, 24px);
  overflow-x: auto;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.02);
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 16px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: var(--surface-soft);
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--motion-fast);
}

.filter-chip.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

.filter-divider {
  width: 1px;
  height: 28px;
  background: var(--border);
  flex-shrink: 0;
}

.filter-avatar-scroll {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.filter-avatar-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 14px 4px 4px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: var(--surface-soft);
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--motion-fast);
}

.filter-avatar-btn.active {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.filter-avatar-circle {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-full);
  background: var(--primary);
  color: #fff;
  font-size: 12px;
  font-weight: 900;
  display: grid;
  place-items: center;
}

.filter-avatar-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-strong);
}

/* 动态流 */
.moments-stream {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.moment-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-2xl, 24px);
  padding: var(--space-6) var(--space-7);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
  transition: transform var(--motion-fast), box-shadow var(--motion-fast);
}

.moment-card:hover {
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.06);
}

.moment-header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.moment-avatar-ring {
  cursor: pointer;
  padding: 3px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, #f43f5e, var(--primary, #6366f1));
  box-shadow: 0 3px 10px rgba(99, 102, 241, 0.2);
}

.moment-avatar {
  width: 50px;
  height: 50px;
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--primary);
  display: grid;
  place-items: center;
  font-size: var(--text-lg);
  font-weight: 900;
}

.moment-author-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.moment-name-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.moment-author-name {
  font-size: var(--text-base);
  font-weight: 900;
  color: var(--text-strong);
  cursor: pointer;
}

.moment-author-name:hover {
  color: var(--primary);
}

.moment-time-tag {
  font-size: 12px;
  color: var(--muted);
}

.moment-text-content {
  font-size: var(--text-base);
  color: var(--text);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 配图 */
.moment-media-container {
  border-radius: var(--radius-xl, 18px);
  overflow: hidden;
}

.moment-media-wrap {
  aspect-ratio: 16 / 10;
  max-height: 440px;
  background: var(--surface-soft);
  cursor: zoom-in;
  overflow: hidden;
  border-radius: var(--radius-xl, 18px);
  border: 1px solid var(--border);
}

.moment-media-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform var(--motion-fast);
}

.moment-media-wrap:hover .moment-media-img {
  transform: scale(1.03);
}

/* 互动栏 */
.moment-action-row {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: var(--radius-full);
  transition: all var(--motion-fast);
}

.action-btn:hover {
  background: var(--surface-soft);
  color: var(--text-strong);
}

.action-btn.active {
  color: var(--primary);
}

.action-like.active {
  color: var(--danger, #f43f5e);
}

/* 评论区 */
.moment-comments-area {
  background: var(--surface-soft);
  border-radius: var(--radius-xl, 18px);
  padding: var(--space-4) var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.comments-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.comment-item {
  font-size: 12px;
  line-height: 1.5;
}

.comment-author {
  font-weight: 800;
  color: var(--primary);
}

.is-char-comment .comment-author {
  color: var(--primary);
}

.comment-colon {
  color: var(--muted);
}

.comment-text {
  color: var(--text-strong);
}

.comment-input-box {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.comment-input-field {
  flex: 1 1 auto;
  min-width: 0;
  padding: 6px 12px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-strong);
  font-size: 12px;
  outline: none;
}

.comment-input-field:focus {
  border-color: var(--primary);
}

.comment-send-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: var(--radius-full);
  border: 0;
  background: var(--primary);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity var(--motion-fast);
}

.comment-send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.moments-loading-state,
.moments-empty-state {
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
