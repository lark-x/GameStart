<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import Button from "../components/ui/Button.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import PageHeader from "../components/layout/PageHeader.vue";
import Textarea from "../components/ui/Textarea.vue";
import { useAppStore } from "../stores/app.js";
import { useTheme } from "../lib/theme";
import { errorMessage, type ApiMoment, type ApiMomentInteraction } from "../types";

const store = useAppStore();
const { currentThemeMeta } = useTheme();
const moments = ref<ApiMoment[]>([]);
const interactions = ref<Map<string, ApiMomentInteraction[]>>(new Map());
const status = ref("准备加载动态……");
const isLoading = ref(false);
const likingMoments = ref(new Set<string>());
const commentingMomentId = ref<string | null>(null);
const commentText = ref("");
const commentStatus = ref<"idle" | "loading" | "error">("idle");
const commentError = ref("");
let sseController: AbortController | null = null;

async function loadFeed() {
  if (!store.currentWorldId || !store.currentCharacterId) {
    status.value = "请先配置故事世界和当前角色。";
    return;
  }
  status.value = "正在读取动态……";
  isLoading.value = true;
  try {
    const result = await store.api.getMoments(
      store.currentWorldId,
      store.currentCharacterId,
    );
    moments.value = result.data ?? [];
    status.value = moments.value.length
      ? `最近 ${moments.value.length} 条社交动态`
      : "这个世界尚无记录";
    // Load interactions for each moment
    for (const moment of moments.value) {
      await loadMomentInteractions(moment.id);
    }
  } catch (e: unknown) {
    status.value = errorMessage(e);
  } finally {
    isLoading.value = false;
  }
}

async function loadMomentInteractions(momentId: string) {
  if (!store.currentCharacterId) return;
  try {
    const result = await store.api.getMomentInteractions(momentId, store.currentCharacterId);
    const data = result.data as { interactions?: ApiMomentInteraction[] } | undefined;
    interactions.value.set(momentId, data?.interactions ?? []);
  } catch {
    // Silently fail - interactions are optional
  }
}

function getLikes(momentId: string): ApiMomentInteraction[] {
  return (interactions.value.get(momentId) ?? []).filter((i) => i.kind === "LIKE");
}

function getComments(momentId: string): ApiMomentInteraction[] {
  return (interactions.value.get(momentId) ?? []).filter((i) => i.kind === "COMMENT" && !i.replyToInteractionId);
}

function getReplies(momentId: string, parentCommentId: string): ApiMomentInteraction[] {
  return (interactions.value.get(momentId) ?? []).filter((i) => i.replyToInteractionId === parentCommentId);
}

function isLikedByMe(momentId: string): boolean {
  if (!store.currentCharacterId) return false;
  return getLikes(momentId).some((i) => i.actorCharacterId === store.currentCharacterId);
}

async function toggleLike(moment: ApiMoment) {
  if (!store.currentCharacterId || likingMoments.value.has(moment.id)) return;
  likingMoments.value.add(moment.id);
  const momentId = moment.id;
  const actorId = store.currentCharacterId;
  try {
    if (isLikedByMe(momentId)) {
      // Optimistic unlike
      const prev = interactions.value.get(momentId) ?? [];
      interactions.value.set(momentId, prev.filter((i) => !(i.kind === "LIKE" && i.actorCharacterId === actorId)));
      const result = await store.api.unlikeMoment(momentId, actorId);
      if (!result.data?.deleted) {
        // Rollback on failure
        await loadMomentInteractions(momentId);
      }
    } else {
      // Optimistic like
      const optimisticLike: ApiMomentInteraction = {
        id: `optimistic-${Date.now()}`,
        momentId,
        storyWorldId: moment.storyWorldId,
        actorCharacterId: actorId,
        kind: "LIKE",
        createdAt: new Date().toISOString(),
        idempotencyKey: `like-${Date.now()}`,
      };
      const prev = interactions.value.get(momentId) ?? [];
      interactions.value.set(momentId, [...prev, optimisticLike]);
      const result = await store.api.likeMoment(momentId, actorId, optimisticLike.idempotencyKey);
      if (!result.data) {
        // Rollback on failure
        await loadMomentInteractions(momentId);
      }
    }
  } catch {
    // Rollback on error
    await loadMomentInteractions(momentId);
  } finally {
    likingMoments.value.delete(momentId);
  }
}

function startComment(momentId: string) {
  commentingMomentId.value = momentId;
  commentText.value = "";
  commentStatus.value = "idle";
  commentError.value = "";
}

function cancelComment() {
  commentingMomentId.value = null;
  commentText.value = "";
  commentStatus.value = "idle";
  commentError.value = "";
}

async function submitComment(momentId: string) {
  if (!store.currentCharacterId || !commentText.value.trim()) return;
  commentStatus.value = "loading";
  commentError.value = "";
  try {
    const idempotencyKey = `comment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await store.api.createMomentInteraction(momentId, {
      id: idempotencyKey,
      actorCharacterId: store.currentCharacterId,
      kind: "COMMENT",
      text: commentText.value.trim(),
      idempotencyKey,
    });
    commentingMomentId.value = null;
    commentText.value = "";
    commentStatus.value = "idle";
    await loadMomentInteractions(momentId);
  } catch (e: unknown) {
    commentStatus.value = "error";
    commentError.value = errorMessage(e);
  }
}

function connectSse() {
  if (!store.currentWorldId) return;
  sseController?.abort();
  sseController = new AbortController();
  const url = `/v1/worlds/${encodeURIComponent(store.currentWorldId)}/feed/stream`;
  void store.api.request(url, { signal: sseController.signal }).catch(() => undefined);
  // Use EventSource-like approach via fetch + ReadableStream
  const eventSource = new EventSource(url);
  eventSource.addEventListener("feed", (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.momentId) {
        void loadMomentInteractions(data.momentId);
      }
    } catch {
      // Ignore parse errors
    }
  });
  eventSource.onerror = () => {
    // Reconnect after 5 seconds
    eventSource.close();
    setTimeout(() => connectSse(), 5000);
  };
}

function author(id: string) {
  return (
    store.characters.find((c) => c.id === id)?.displayName || id.slice(0, 6)
  );
}
watch(
  () => store.currentCharacterId,
  () => void loadFeed(),
);
onMounted(() => {
  void loadFeed();
  connectSse();
});
onUnmounted(() => { sseController?.abort(); });
</script>
<template>
  <section class="page">
    <PageHeader
      eyebrow="生活记录"
      title="朋友圈"
      description="看看这个世界刚刚发生的事。"
      :status="status"
    >
      <template #actions>
        <Button @click="loadFeed" :disabled="isLoading">{{
          isLoading ? "刷新中…" : "刷新动态"
        }}</Button>
      </template>
    </PageHeader>
    <div class="feed-banner" :data-decor="currentThemeMeta.decoration">
      <span class="feed-banner-symbol" aria-hidden="true">{{ currentThemeMeta.symbol }}</span>
      <div class="feed-banner-copy">
        <strong>{{ currentThemeMeta.label }} · 生活记录</strong>
        <p>{{ currentThemeMeta.tagline }}</p>
      </div>
      <span class="feed-banner-spark one" aria-hidden="true" />
      <span class="feed-banner-spark two" aria-hidden="true" />
    </div>
    <div v-if="moments.length" class="moment-grid">
      <article v-for="moment in moments" :key="moment.id" class="moment-card">
        <img
          v-if="moment.imageMediaRef"
          :src="moment.imageMediaRef"
          class="moment-image"
          loading="lazy"
          :alt="`${author(moment.authorCharacterId)} 的动态配图`"
        />
        <div class="moment-body">
          <div class="author-line">
            <span class="mini-avatar">{{
              author(moment.authorCharacterId).slice(0, 1)
            }}</span>
            <div>
              <strong>{{ author(moment.authorCharacterId) }}</strong
              ><time>{{
                new Date(moment.publishedAt).toLocaleDateString()
              }}</time>
            </div>
          </div>
          <p class="moment-text">{{ moment.body }}</p>
          <footer class="moment-actions">
            <span class="visibility-label">{{
              moment.visibility === "PUBLIC" ? "公开动态" : "仅好友可见"
            }}</span>
            <div class="action-buttons">
              <Button
                variant="ghost"
                size="sm"
                :aria-pressed="isLikedByMe(moment.id)"
                :aria-label="isLikedByMe(moment.id) ? '取消喜欢' : '喜欢'"
                :disabled="likingMoments.has(moment.id)"
                @click="toggleLike(moment)"
              >
                {{ isLikedByMe(moment.id) ? '♥' : '♡' }}
                {{ getLikes(moment.id).length || '' }}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label="评论"
                @click="startComment(moment.id)"
              >
                💬 {{ getComments(moment.id).length || '' }}
              </Button>
            </div>
          </footer>
          <!-- Comments section -->
          <div v-if="getComments(moment.id).length > 0 || commentingMomentId === moment.id" class="comments-section">
            <div v-for="comment in getComments(moment.id)" :key="comment.id" class="comment-thread">
              <div class="comment">
                <span class="comment-avatar">{{ author(comment.actorCharacterId).slice(0, 1) }}</span>
                <div class="comment-content">
                  <strong class="comment-author">{{ author(comment.actorCharacterId) }}</strong>
                  <p class="comment-text">{{ comment.text }}</p>
                </div>
              </div>
              <!-- Replies -->
              <div v-for="reply in getReplies(moment.id, comment.id)" :key="reply.id" class="comment reply">
                <span class="comment-avatar">{{ author(reply.actorCharacterId).slice(0, 1) }}</span>
                <div class="comment-content">
                  <strong class="comment-author">{{ author(reply.actorCharacterId) }}</strong>
                  <p class="comment-text">{{ reply.text }}</p>
                </div>
              </div>
            </div>
            <!-- Comment input -->
            <form
              v-if="commentingMomentId === moment.id"
              class="comment-form"
              @submit.prevent="submitComment(moment.id)"
            >
              <Textarea
                v-model="commentText"
                placeholder="写一条评论……"
                :disabled="commentStatus === 'loading'"
                aria-label="评论内容"
                :rows="2"
              />
              <div class="comment-form-actions">
                <Button
                  type="submit"
                  size="sm"
                  :disabled="!commentText.trim() || commentStatus === 'loading'"
                >
                  {{ commentStatus === 'loading' ? '发送中…' : '发送' }}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  @click="cancelComment"
                >
                  取消
                </Button>
              </div>
              <p v-if="commentStatus === 'error'" class="comment-error" role="alert">
                {{ commentError }}
                <Button variant="ghost" size="sm" @click="submitComment(moment.id)">重试</Button>
              </p>
            </form>
          </div>
        </div>
      </article>
    </div>
    <EmptyState v-else
      title="还没有新的生活记录"
      description="当角色开始生活，这里会慢慢热闹起来。"
      ><template #icon>✦</template></EmptyState
    >
  </section>
</template>
<style scoped>
/* 主题横幅：随皮肤切换符号、标语与渐变氛围 */
.feed-banner {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
  padding: var(--space-5) var(--space-6);
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 88% -30%, var(--decor-soft), transparent 58%),
    linear-gradient(115deg, var(--primary-faint), var(--primary-soft) 62%, var(--surface));
  box-shadow: var(--shadow-sm);
}
.feed-banner-symbol {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  flex: 0 0 auto;
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--primary);
  font-size: 26px;
  box-shadow: var(--shadow-sm);
}
.feed-banner-copy strong {
  color: var(--text-strong);
  font-size: var(--text-lg);
}
.feed-banner-copy p {
  margin-top: 4px;
  color: var(--muted);
  font-size: var(--text-sm);
}
.feed-banner-spark {
  position: absolute;
  border-radius: var(--radius-full);
  background: var(--decor);
  opacity: 0.5;
  pointer-events: none;
}
.feed-banner-spark.one {
  width: 90px;
  height: 90px;
  right: -28px;
  top: -38px;
  filter: blur(2px);
  opacity: 0.22;
}
.feed-banner-spark.two {
  width: 34px;
  height: 34px;
  right: 64px;
  bottom: -14px;
  opacity: 0.3;
}
/* 瀑布流：列宽随视口流体变化，列数自动增减 */
.moment-grid {
  columns: clamp(230px, 24vw, 300px);
  column-gap: var(--space-5);
}
.moment-card {
  break-inside: avoid;
  margin: 0 0 var(--space-5);
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
/* 卡片顶部的主题装饰条，呼应当前皮肤 */
.moment-card::before {
  content: "";
  display: block;
  height: 4px;
  background: linear-gradient(90deg, var(--primary), var(--decor) 70%, transparent);
}
.moment-image {
  display: block;
  width: 100%;
  max-height: 350px;
  object-fit: cover;
}
.moment-body {
  padding: var(--space-4);
}
.author-line {
  display: flex;
  gap: 9px;
  align-items: center;
}
.mini-avatar {
  display: grid;
  place-items: center;
  width: 31px;
  height: 31px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: var(--text-sm);
  font-weight: 700;
}
.author-line div {
  display: grid;
  gap: 2px;
}
.author-line strong {
  font-size: var(--text-base);
}
.author-line time {
  color: var(--faint);
  font-size: var(--text-xs);
}
.moment-text {
  margin: var(--space-4) 0;
  color: var(--text);
  font-size: var(--text-base);
  line-height: 1.7;
  white-space: pre-wrap;
}
.moment-body footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: var(--text-xs);
}
.moment-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: var(--text-xs);
}
.visibility-label {
  color: var(--muted);
}
.action-buttons {
  display: flex;
  gap: var(--space-2);
}
.comments-section {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}
.comment-thread {
  margin-bottom: var(--space-3);
}
.comment {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
  margin-bottom: var(--space-2);
}
.comment.reply {
  margin-left: var(--space-6);
  padding-left: var(--space-3);
  border-left: 2px solid var(--border);
}
.comment-avatar {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 700;
}
.comment-content {
  flex: 1;
  min-width: 0;
}
.comment-author {
  font-size: var(--text-sm);
  color: var(--text-strong);
}
.comment-text {
  margin: 2px 0 0;
  font-size: var(--text-sm);
  color: var(--text);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.comment-form {
  margin-top: var(--space-3);
}
.comment-form-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
.comment-error {
  margin-top: var(--space-2);
  color: var(--error, #ef4444);
  font-size: var(--text-sm);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
/* 360px responsive: single column, no horizontal overflow */
@media (max-width: 360px) {
  .moment-grid {
    columns: 1;
  }
  .feed-banner {
    flex-direction: column;
    text-align: center;
    gap: var(--space-3);
    padding: var(--space-4);
  }
  .comment.reply {
    margin-left: var(--space-4);
  }
}
</style>
