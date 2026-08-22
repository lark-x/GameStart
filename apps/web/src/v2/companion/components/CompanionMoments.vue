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
}>();

// Active comment inputs keyed by momentId
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
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
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
  <div class="companion-moments-view">
    <!-- 朋友圈顶部背景封面 -->
    <div class="moments-cover">
      <div class="moments-cover-overlay" />
      <div class="moments-cover-info">
        <div class="moments-user-avatar">
          <span>伴</span>
        </div>
        <div class="moments-user-text">
          <h3 class="moments-user-name">邻舍朋友圈</h3>
          <p class="moments-user-motto">记录与角色们在虚拟世界中的点滴日常与偶遇 ✨</p>
        </div>
      </div>
      <Button
        variant="primary"
        size="sm"
        class="moments-create-btn"
        @click="createModalOpen = true"
      >
        <Plus :size="15" aria-hidden="true" />
        <span>激发新动态</span>
      </Button>
    </div>

    <!-- 动态列表 -->
    <div v-if="loading && moments.length === 0" class="moments-status">
      正在载入朋友圈动态…
    </div>
    <div v-else-if="moments.length === 0" class="moments-empty">
      <Sparkles :size="28" class="text-primary" aria-hidden="true" />
      <p>暂无朋友圈动态</p>
      <small>点击右上角「激发新动态」，让心仪的角色为你发布一条生活瞬间吧！</small>
    </div>
    <div v-else class="moments-feed">
      <article
        v-for="moment in moments"
        :key="moment.momentId"
        class="moment-card"
      >
        <!-- 角色头像 -->
        <div class="moment-avatar" aria-hidden="true">
          {{ avatarInitial(moment.characterName) }}
        </div>

        <!-- 动态主体内容 -->
        <div class="moment-body">
          <div class="moment-header">
            <h4 class="moment-author">{{ moment.characterName }}</h4>
            <span class="moment-time">{{ formatRelativeTime(moment.createdAt) }}</span>
          </div>

          <p class="moment-content">{{ moment.content }}</p>

          <!-- ComfyUI 配图 -->
          <div v-if="moment.mediaRef" class="moment-image-box">
            <img
              :src="client.mediaUrl(moment.mediaRef)"
              :alt="moment.characterName + '的生活动态图片'"
              class="moment-image"
              loading="lazy"
              @error="(e) => (e.target as HTMLElement).style.display = 'none'"
              @click="emit('preview-image', client.mediaUrl(moment.mediaRef))"
            />
          </div>

          <!-- 交互栏：点赞与评论按钮 -->
          <div class="moment-actions-bar">
            <button
              type="button"
              class="moment-action-btn"
              :class="{ 'is-liked': moment.isLiked }"
              :disabled="isLiking[moment.momentId]"
              @click="handleLike(moment)"
            >
              <Heart
                :size="15"
                :class="{ 'fill-current': moment.isLiked }"
                aria-hidden="true"
              />
              <span>{{ moment.likesCount > 0 ? moment.likesCount : '赞' }}</span>
            </button>

            <button
              type="button"
              class="moment-action-btn"
              @click="commentDrafts[moment.momentId] = commentDrafts[moment.momentId] || ''"
            >
              <MessageCircle :size="15" aria-hidden="true" />
              <span>{{ moment.comments.length > 0 ? moment.comments.length : '评论' }}</span>
            </button>
          </div>

          <!-- 评论展示区 -->
          <div v-if="moment.comments.length > 0" class="moment-comments-box">
            <div
              v-for="comment in moment.comments"
              :key="comment.commentId"
              class="comment-row"
            >
              <span class="comment-author" :class="{ 'is-character': comment.authorType === 'character' }">
                {{ comment.authorName }}
                <span v-if="comment.replyToCommentId" class="comment-reply-tag">回复 我:</span>
                <span v-else>:</span>
              </span>
              <span class="comment-text">{{ comment.content }}</span>
            </div>
          </div>

          <!-- 快捷评论输入框 -->
          <form class="moment-comment-form" @submit.prevent="submitComment(moment.momentId)">
            <input
              v-model="commentDrafts[moment.momentId]"
              type="text"
              class="comment-input"
              placeholder="评论一下，角色会智能回复你哦…"
              :disabled="commentSubmitting[moment.momentId] ?? false"
            />
            <Button
              variant="ghost"
              size="sm"
              type="submit"
              class="comment-submit-btn"
              :loading="commentSubmitting[moment.momentId] ?? false"
              :disabled="!(commentDrafts[moment.momentId] || '').trim()"
            >
              <Send :size="13" aria-hidden="true" />
              <span>发送</span>
            </Button>
          </form>
        </div>
      </article>
    </div>

    <!-- 激发新动态 Modal -->
    <div v-if="createModalOpen" class="moments-modal-backdrop" @click="createModalOpen = false" />
    <div v-if="createModalOpen" class="moments-modal" role="dialog" aria-modal="true" aria-label="激发新动态">
      <div class="moments-modal-head">
        <div class="modal-title-row">
          <Sparkles :size="16" class="text-primary" aria-hidden="true" />
          <h3>激发角色朋友圈动态</h3>
        </div>
        <Button variant="ghost" size="icon" aria-label="关闭" @click="createModalOpen = false">
          <X :size="16" aria-hidden="true" />
        </Button>
      </div>

      <div class="moments-modal-body">
        <label class="modal-label">
          <span>选择角色</span>
          <select v-model="createCharacterId" class="modal-select">
            <option
              v-for="c in uniqueCharacters"
              :key="c.characterId"
              :value="c.characterId"
            >
              {{ c.name }}
            </option>
          </select>
        </label>

        <label class="modal-label">
          <span>指定话题（可选）</span>
          <input
            v-model="createTopic"
            type="text"
            class="modal-input"
            placeholder="例如：海边的黄昏、新学的烘焙、今天的舞台剧…"
          />
        </label>
      </div>

      <div class="moments-modal-foot">
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
.companion-moments-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  background: var(--background);
}

.moments-cover {
  position: relative;
  height: 140px;
  background: linear-gradient(135deg, var(--primary), var(--secondary, #8b5cf6));
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: var(--space-4);
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
}

.moments-cover-overlay {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 80% 20%, rgb(255 255 255 / 20%), transparent);
  pointer-events: none;
}

.moments-cover-info {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  position: relative;
  z-index: 1;
}

.moments-user-avatar {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--primary);
  display: grid;
  place-items: center;
  font-size: var(--text-lg);
  font-weight: 900;
  box-shadow: var(--shadow-md);
  border: 2px solid var(--surface);
}

.moments-user-text {
  color: #fff;
  text-shadow: 0 1px 3px rgb(0 0 0 / 40%);
}

.moments-user-name {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 800;
}

.moments-user-motto {
  margin: 2px 0 0;
  font-size: 11px;
  opacity: 0.9;
}

.moments-create-btn {
  position: relative;
  z-index: 1;
  box-shadow: var(--shadow-md);
}

.moments-feed {
  display: flex;
  flex-direction: column;
  padding: var(--space-4) var(--space-3);
  gap: var(--space-4);
}

.moment-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--border);
}

.moment-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--primary);
  border: 1px solid var(--border-strong);
  display: grid;
  place-items: center;
  font-size: var(--text-sm);
  font-weight: 800;
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
}

.moment-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.moment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.moment-author {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--primary);
}

.moment-time {
  font-size: 11px;
  color: var(--muted);
}

.moment-content {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--text-strong);
  word-break: break-word;
}

.moment-image-box {
  max-width: 320px;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border);
  cursor: pointer;
}

.moment-image {
  width: 100%;
  height: auto;
  max-height: 260px;
  object-fit: cover;
  display: block;
  transition: transform var(--motion-fast);
}

.moment-image:hover {
  transform: scale(1.02);
}

.moment-actions-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: 2px;
}

.moment-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  transition: color var(--motion-fast), background var(--motion-fast);
}

.moment-action-btn:hover {
  background: var(--surface-soft);
  color: var(--text-strong);
}

.moment-action-btn.is-liked {
  color: var(--danger);
}

.fill-current {
  fill: currentColor;
}

.moment-comments-box {
  background: var(--surface-soft);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--text-xs);
  line-height: 1.5;
  border: 1px solid var(--border);
}

.comment-row {
  word-break: break-word;
}

.comment-author {
  font-weight: 700;
  color: var(--primary);
  margin-right: 4px;
}

.comment-author.is-character {
  color: var(--secondary, var(--primary));
}

.comment-reply-tag {
  color: var(--muted);
  font-weight: 400;
  margin-left: 2px;
}

.comment-text {
  color: var(--text);
}

.moment-comment-form {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: 2px;
}

.comment-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 6px var(--space-3);
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-strong);
  font-size: var(--text-xs);
  outline: none;
  transition: border-color var(--motion-fast);
}

.comment-input:focus {
  border-color: var(--primary);
}

.comment-submit-btn {
  flex-shrink: 0;
}

.moments-status,
.moments-empty {
  padding: var(--space-8) var(--space-4);
  text-align: center;
  color: var(--muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.moments-empty p {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--text-strong);
}

/* Modal */
.moments-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 45%);
  z-index: 50;
}

.moments-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(440px, 92vw);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  z-index: 51;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.moments-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
}

.modal-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.modal-title-row h3 {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 800;
  color: var(--text-strong);
}

.moments-modal-body {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.modal-label {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text);
}

.modal-select,
.modal-input {
  padding: 8px var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface-soft);
  color: var(--text-strong);
  font-size: var(--text-sm);
  outline: none;
}

.modal-select:focus,
.modal-input:focus {
  border-color: var(--primary);
}

.moments-modal-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--surface-soft);
  border-top: 1px solid var(--border);
}
</style>
