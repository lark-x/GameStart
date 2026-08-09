<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import Button from "../components/ui/Button.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import PageHeader from "../components/layout/PageHeader.vue";
import { useAppStore } from "../stores/app.js";
import { useTheme } from "../lib/theme";
import { errorMessage, type ApiMoment } from "../types";
const store = useAppStore();
const { currentThemeMeta } = useTheme();
const moments = ref<ApiMoment[]>([]);
const status = ref("准备加载动态……");
const isLoading = ref(false);
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
  } catch (e: unknown) {
    status.value = errorMessage(e);
  } finally {
    isLoading.value = false;
  }
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
onMounted(() => void loadFeed());
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
          <footer>
            <span>{{
              moment.visibility === "PUBLIC" ? "公开动态" : "仅好友可见"
            }}</span
            ><Button variant="ghost" size="sm">♡ 喜欢</Button>
          </footer>
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
</style>
