<script setup lang="ts">
import { computed, ref } from "vue";
import { Heart, MessageCircle, Send, Share2, Sparkles, X } from "@lucide/vue";
import type {
  V2CompanionMomentDto,
  V2IdempotencyKey,
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

// Filter states
const activeFilter = ref<string | null>(null);
const filterLikedOnly = ref(false);

// Comment inputs
const activeCommentPostId = ref<string | null>(null);
const replyDrafts = ref<Record<string, string>>({});
const isSubmittingComment = ref(false);

// "Disturb Worldline" trigger modal
const showPickerPopover = ref(false);
const isGenerating = ref(false);

const availableCharacters = [
  { id: "character:furina", name: "芙宁娜" },
  { id: "character:clorinde", name: "克洛琳德" },
  { id: "character:navia", name: "娜维娅" },
];

const filteredMoments = computed(() => {
  return props.moments.filter((m) => {
    if (activeFilter.value && m.characterId !== activeFilter.value) return false;
    if (filterLikedOnly.value && !m.isLiked) return false;
    return true;
  });
});

function avatarInitial(name: string): string {
  return [...name.trim()][0] ?? "?";
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return "刚刚";
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}小时前`;
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  } catch {
    return iso;
  }
}

async function handleLike(moment: V2CompanionMomentDto): Promise<void> {
  try {
    await props.client.toggleLikeMoment(moment.momentId);
    emit("refresh");
  } catch (error) {
    console.error("Failed to like moment:", error);
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
  const content = replyDrafts.value[momentId]?.trim();
  if (!content || isSubmittingComment.value) return;

  isSubmittingComment.value = true;
  try {
    const idempotencyKey = `comment:${momentId}:${Date.now()}` as V2IdempotencyKey;
    await props.client.addComment(momentId as never, { content, idempotencyKey });
    replyDrafts.value[momentId] = "";
    activeCommentPostId.value = null;
    emit("refresh");
  } catch (error) {
    console.error("Failed to comment on moment:", error);
  } finally {
    isSubmittingComment.value = false;
  }
}

async function triggerDisturb(characterId: string): Promise<void> {
  if (isGenerating.value) return;
  isGenerating.value = true;
  showPickerPopover.value = false;
  try {
    const idempotencyKey = `moment:${characterId}:${Date.now()}` as V2IdempotencyKey;
    await props.client.createMoment({
      characterId: characterId as never,
      idempotencyKey,
    });
    emit("refresh");
  } catch (error) {
    console.error("Failed to trigger companion moment:", error);
  } finally {
    isGenerating.value = false;
  }
}
</script>

<template>
  <div class="moments-view-layout">
    <!-- 顶栏：标题 + 扰动世界线按钮 -->
    <div class="moments-topbar">
      <div class="topbar-title-group">
        <h2 class="moments-page-title">朋友圈动态</h2>
        <span class="moments-subtitle">伴侣会根据当下的作息与心情，在这里分享生活日常与写真照片</span>
      </div>

      <div class="topbar-actions">
        <button
          type="button"
          class="btn-disturb"
          :disabled="isGenerating"
          @click="showPickerPopover = !showPickerPopover"
        >
          <Sparkles :size="15" class="text-primary" aria-hidden="true" />
          <span>{{ isGenerating ? '正在生成新动态…' : '🎬 扰动世界线' }}</span>
        </button>
      </div>
    </div>

    <!-- 角色选择气泡 (用于扰动世界线) -->
    <div v-if="showPickerPopover" class="picker-popover-backdrop" @click="showPickerPopover = false">
      <div class="picker-popover" @click.stop>
        <div class="picker-header">
          <span>选择要扰动世界线的伴侣：</span>
          <button type="button" class="picker-close" @click="showPickerPopover = false"><X :size="14" /></button>
        </div>
        <div class="picker-list">
          <button
            v-for="char in availableCharacters"
            :key="char.id"
            type="button"
            class="picker-btn"
            @click="triggerDisturb(char.id)"
          >
            <div class="picker-btn-avatar">{{ avatarInitial(char.name) }}</div>
            <span>由 {{ char.name }} 发送一条新朋友圈</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 筛选轴：全部 / 我赞过的 / 单角色筛选 -->
    <div class="moments-filter-bar">
      <button
        type="button"
        class="filter-chip-btn"
        :class="{ active: activeFilter === null && !filterLikedOnly }"
        @click="activeFilter = null; filterLikedOnly = false;"
      >
        <span>全部动态</span>
      </button>

      <button
        type="button"
        class="filter-chip-btn"
        :class="{ active: filterLikedOnly }"
        @click="filterLikedOnly = !filterLikedOnly; activeFilter = null;"
      >
        <Heart :size="13" class="fill-current text-rose-500" aria-hidden="true" />
        <span>特别关心</span>
      </button>

      <div class="filter-divider" />

      <div class="filter-avatar-scroll">
        <button
          v-for="char in availableCharacters"
          :key="char.id"
          type="button"
          class="filter-avatar-btn"
          :class="{ active: activeFilter === char.id }"
          @click="activeFilter = activeFilter === char.id ? null : char.id; filterLikedOnly = false;"
        >
          <div class="filter-avatar-circle">{{ avatarInitial(char.name) }}</div>
          <span class="filter-avatar-label">{{ char.name }}</span>
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
            <Heart :size="16" :class="{ 'fill-current text-rose-500': moment.isLiked }" aria-hidden="true" />
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
              class="comment-submit-btn"
              :disabled="!replyDrafts[moment.momentId]?.trim() || isSubmittingComment"
              @click="submitComment(moment.momentId)"
            >
              <Send :size="13" aria-hidden="true" />
              <span>回复</span>
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
  gap: 20px;
  width: 100%;
  max-width: 820px;
  margin: 0 auto;
  padding-bottom: 60px;
}

/* 顶栏 */
.moments-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  background: var(--cmp-surface, #ffffff);
  border: 1px solid var(--cmp-border, #ebdcd1);
  border-radius: 18px;
  box-shadow: var(--cmp-shadow-sm, 0 2px 8px rgba(120, 80, 60, 0.05));
}

.topbar-title-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.moments-page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 900;
  color: var(--cmp-text-strong, #2c221e);
  letter-spacing: -0.01em;
}

.moments-subtitle {
  font-size: 12px;
  color: var(--cmp-text-muted, #8c7d74);
}

.btn-disturb {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border-radius: 9999px;
  border: 1px solid var(--cmp-border, #ebdcd1);
  background: var(--cmp-surface-soft, #f6f1ea);
  color: var(--cmp-text-strong, #2c221e);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: var(--cmp-shadow-sm, 0 2px 8px rgba(120, 80, 60, 0.05));
  transition: all 0.18s ease;
}

.btn-disturb:hover {
  border-color: var(--cmp-primary, #e06d53);
  color: var(--cmp-primary, #e06d53);
  background: var(--cmp-surface, #ffffff);
  transform: translateY(-1px);
}

/* 角色选择气泡 */
.picker-popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.2);
}

.picker-popover {
  position: absolute;
  top: 140px;
  right: calc(50% - 410px + 24px);
  width: 260px;
  background: var(--cmp-surface, #ffffff);
  border: 1px solid var(--cmp-border, #ebdcd1);
  border-radius: 16px;
  box-shadow: var(--cmp-shadow-lg, 0 16px 36px rgba(120, 80, 60, 0.12));
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  color: var(--cmp-text-muted, #8c7d74);
}

.picker-close {
  border: 0;
  background: transparent;
  color: var(--cmp-text-muted, #8c7d74);
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
  gap: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--cmp-border-light, #f3eae2);
  background: var(--cmp-surface-soft, #f6f1ea);
  color: var(--cmp-text-strong, #2c221e);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.18s ease;
}

.picker-btn:hover {
  background: var(--cmp-primary-soft, #fcedea);
  border-color: var(--cmp-primary, #e06d53);
  color: var(--cmp-primary, #e06d53);
}

.picker-btn-avatar {
  width: 26px;
  height: 26px;
  border-radius: 9999px;
  background: var(--cmp-primary, #e06d53);
  color: #fff;
  font-size: 12px;
  font-weight: 900;
  display: grid;
  place-items: center;
}

/* 筛选栏 */
.moments-filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  background: var(--cmp-surface, #ffffff);
  border: 1px solid var(--cmp-border, #ebdcd1);
  border-radius: 9999px;
  box-shadow: var(--cmp-shadow-sm, 0 2px 8px rgba(120, 80, 60, 0.05));
  overflow-x: auto;
}

.filter-chip-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 14px;
  border-radius: 9999px;
  border: 1px solid var(--cmp-border-light, #f3eae2);
  background: var(--cmp-surface-soft, #f6f1ea);
  color: var(--cmp-text-muted, #8c7d74);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;
}

.filter-chip-btn:hover {
  background: var(--cmp-surface, #ffffff);
  color: var(--cmp-text-strong, #2c221e);
}

.filter-chip-btn.active {
  background: var(--cmp-primary, #e06d53);
  color: #fff;
  border-color: var(--cmp-primary, #e06d53);
}

.filter-divider {
  width: 1px;
  height: 20px;
  background: var(--cmp-border, #ebdcd1);
  flex-shrink: 0;
}

.filter-avatar-scroll {
  display: flex;
  align-items: center;
  gap: 6px;
}

.filter-avatar-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 12px 3px 3px;
  border-radius: 9999px;
  border: 1px solid var(--cmp-border-light, #f3eae2);
  background: var(--cmp-surface-soft, #f6f1ea);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.18s ease;
}

.filter-avatar-btn.active {
  border-color: var(--cmp-primary, #e06d53);
  background: var(--cmp-primary-soft, #fcedea);
}

.filter-avatar-circle {
  width: 26px;
  height: 26px;
  border-radius: 9999px;
  background: var(--cmp-primary, #e06d53);
  color: #fff;
  font-size: 12px;
  font-weight: 900;
  display: grid;
  place-items: center;
}

.filter-avatar-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--cmp-text-strong, #2c221e);
}

/* 动态流 */
.moments-stream {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.moment-card {
  background: var(--cmp-surface, #ffffff);
  border: 1px solid var(--cmp-border, #ebdcd1);
  border-radius: 18px;
  padding: 22px 26px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: var(--cmp-shadow-sm, 0 2px 8px rgba(120, 80, 60, 0.05));
  transition: transform 0.18s ease;
}

.moment-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.moment-avatar-ring {
  cursor: pointer;
  padding: 2px;
  border-radius: 9999px;
  background: linear-gradient(135deg, var(--cmp-primary, #e06d53), var(--cmp-accent, #f59e0b));
}

.moment-avatar {
  width: 44px;
  height: 44px;
  border-radius: 9999px;
  background: var(--cmp-surface, #ffffff);
  color: var(--cmp-primary, #e06d53);
  display: grid;
  place-items: center;
  font-size: 16px;
  font-weight: 900;
}

.moment-author-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.moment-author-name {
  font-size: 15px;
  font-weight: 900;
  color: var(--cmp-text-strong, #2c221e);
  cursor: pointer;
}

.moment-time-tag {
  font-size: 11px;
  color: var(--cmp-text-muted, #8c7d74);
}

.moment-text-content {
  font-size: 14px;
  line-height: 1.7;
  color: var(--cmp-text-strong, #2c221e);
  white-space: pre-wrap;
}

.moment-media-container {
  border-radius: 14px;
  overflow: hidden;
  max-width: 520px;
}

.moment-media-wrap {
  aspect-ratio: 16 / 10;
  max-height: 380px;
  border-radius: 14px;
  overflow: hidden;
  cursor: zoom-in;
  border: 1px solid var(--cmp-border, #ebdcd1);
}

.moment-media-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.moment-action-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border-radius: 9999px;
  border: 1px solid var(--cmp-border-light, #f3eae2);
  background: var(--cmp-surface-soft, #f6f1ea);
  color: var(--cmp-text-muted, #8c7d74);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.18s ease;
}

.action-btn:hover {
  background: var(--cmp-surface, #ffffff);
  color: var(--cmp-text-strong, #2c221e);
}

.action-btn.active {
  background: var(--cmp-primary-soft, #fcedea);
  color: var(--cmp-primary, #e06d53);
  border-color: var(--cmp-primary, #e06d53);
}

/* 评论区 */
.moment-comments-area {
  background: var(--cmp-surface-soft, #f6f1ea);
  border: 1px solid var(--cmp-border-light, #f3eae2);
  border-radius: 14px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.comments-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.comment-item {
  font-size: 13px;
  line-height: 1.5;
}

.comment-author {
  font-weight: 800;
  color: var(--cmp-primary, #e06d53);
}

.is-char-comment .comment-author {
  color: var(--cmp-accent, #d97706);
}

.comment-colon {
  color: var(--cmp-text-muted, #8c7d74);
}

.comment-text {
  color: var(--cmp-text, #4a3e39);
}

.comment-input-box {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.comment-input-field {
  flex: 1 1 auto;
  padding: 7px 12px;
  border-radius: 9999px;
  border: 1px solid var(--cmp-border, #ebdcd1);
  background: var(--cmp-surface, #ffffff);
  color: var(--cmp-text-strong, #2c221e);
  font-size: 13px;
  outline: none;
}

.comment-submit-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 14px;
  border-radius: 9999px;
  border: 0;
  background: var(--cmp-primary, #e06d53);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.moments-loading-state,
.moments-empty-state {
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
