<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { MessageSquare, Sparkles } from "@lucide/vue";
import type { V2ChatConversationDto, V2IdempotencyKey } from "@living-network/contracts/v2";

import Button from "../../components/ui/Button.vue";
import Input from "../../components/ui/Input.vue";
import Textarea from "../../components/ui/Textarea.vue";
import PageHeader from "../../components/layout/PageHeader.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import { createV2ChatClient } from "../chat/client.ts";

const router = useRouter();
const environment = import.meta.env as Record<string, string | undefined>;
const baseUrl = environment.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3002" : window.location.origin);
const client = createV2ChatClient({ baseUrl });

const persona = ref("");
const displayName = ref("");
const loading = ref(false);
const errorMessage = ref("");
const recentConversations = ref<readonly V2ChatConversationDto[]>([]);
const loadingRecent = ref(false);
const recentError = ref("");

const recentList = computed(() => [...recentConversations.value]
  .sort((a, b) => (b.lastMessageAt ?? b.updatedAt).localeCompare(a.lastMessageAt ?? a.updatedAt)));

function relativeTime(value: string | undefined): string {
  if (value === undefined) return "";
  const delta = Date.now() - Date.parse(value);
  if (Number.isNaN(delta) || delta < 0) return "";
  if (delta < 60_000) return "刚刚";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`;
  return `${Math.floor(delta / 86_400_000)} 天前`;
}

onMounted(async () => {
  await loadRecentStories();
});

async function loadRecentStories(): Promise<void> {
  loadingRecent.value = true;
  try {
    const list = await client.listConversations();
    recentConversations.value = list;
  } catch (error) {
    recentError.value = error instanceof Error ? error.message : "加载最近故事失败";
  } finally {
    loadingRecent.value = false;
  }
}

async function startStory(): Promise<void> {
  const personaText = persona.value.trim();
  if (!personaText) {
    errorMessage.value = "请先描述你想遇到的角色。";
    return;
  }
  loading.value = true;
  errorMessage.value = "";
  try {
    const result = await client.createInstantStory({
      persona: personaText,
      ...(displayName.value.trim() ? { displayName: displayName.value.trim() } : {}),
      idempotencyKey: `instant:${Date.now()}:${crypto.randomUUID()}` as V2IdempotencyKey,
    });
    await router.push(`/v2/chat/${encodeURIComponent(result.conversation.conversationId)}`);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "创建故事失败";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="v2-start-page">
    <PageHeader
      eyebrow="即时故事"
      title="创建新的故事"
      description="只需要描述你想遇到的角色，马上就能开始聊天。世界会随着故事自然生长。"
    />

    <div class="v2-start-layout">
      <section class="v2-start-card">
        <div class="v2-start-icon"><Sparkles :size="24" aria-hidden="true" /></div>
        <h2>描述你想遇到的角色</h2>
        <p class="v2-start-hint">可以写性格、说话方式、与你的关系，以及任何你希望 AI 记住的细节。</p>
        <form class="v2-start-form" @submit.prevent="startStory">
          <label for="v2-persona">角色人设</label>
          <Textarea
            id="v2-persona"
            v-model="persona"
            placeholder="花火是一个……\n性格……\n说话方式……\n与我的关系……"
            :rows="6"
            :disabled="loading"
          />
          <label for="v2-display-name">角色名称（可选）</label>
          <Input id="v2-display-name" v-model="displayName" placeholder="例如：花火" :disabled="loading" />
          <p v-if="errorMessage" class="v2-start-error">{{ errorMessage }}</p>
          <Button variant="primary" size="lg" type="submit" :loading="loading" :disabled="!persona.trim()">
            开始故事
          </Button>
        </form>
      </section>

      <section v-if="!loadingRecent && recentError" class="v2-recent-card">
        <div class="v2-recent-header">
          <MessageSquare :size="20" aria-hidden="true" />
          <h3>进行中的故事</h3>
        </div>
        <p class="v2-recent-error">{{ recentError }}</p>
      </section>

      <section v-else-if="loadingRecent" class="v2-recent-card">
        <div class="v2-recent-header">
          <MessageSquare :size="20" aria-hidden="true" />
          <h3>进行中的故事</h3>
        </div>
        <div class="v2-recent-skeleton" aria-label="正在加载最近故事">
          <span />
          <span />
          <span />
        </div>
      </section>

      <section v-else-if="recentList.length === 0" class="v2-recent-card">
        <div class="v2-recent-header">
          <MessageSquare :size="20" aria-hidden="true" />
          <h3>进行中的故事</h3>
        </div>
        <EmptyState title="还没有进行中的故事" description="创建第一个故事后，它会出现在这里。" />
      </section>

      <section v-else class="v2-recent-card">
        <div class="v2-recent-header">
          <MessageSquare :size="20" aria-hidden="true" />
          <h3>进行中的故事</h3>
        </div>
        <div class="v2-recent-list">
          <RouterLink
            v-for="conv in recentList"
            :key="conv.conversationId"
            :to="`/v2/chat/${encodeURIComponent(conv.conversationId)}`"
            class="v2-recent-item"
          >
            <div class="v2-recent-info">
              <h4>{{ conv.title || "故事对话" }}</h4>
              <p v-if="relativeTime(conv.lastMessageAt ?? conv.updatedAt)">最后活跃于 {{ relativeTime(conv.lastMessageAt ?? conv.updatedAt) }}</p>
            </div>
            <span class="v2-recent-continue">继续</span>
          </RouterLink>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.v2-start-page {
  display: grid;
  gap: var(--space-5);
}

.v2-start-layout {
  display: grid;
  grid-template-columns: minmax(320px, 640px) minmax(280px, 400px);
  gap: var(--space-5);
  align-items: start;
  justify-content: center;
}

@media (max-width: 900px) {
  .v2-start-layout {
    grid-template-columns: 1fr;
  }
}

.v2-start-card {
  width: 100%;
  padding: var(--space-6);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  display: grid;
  gap: var(--space-4);
}

.v2-start-icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  color: var(--primary);
}

.v2-start-card h2 {
  margin: 0;
  font-size: var(--text-lg);
  color: var(--text);
}

.v2-start-hint {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-sm);
}

.v2-start-form {
  display: grid;
  gap: var(--space-3);
}

.v2-start-form label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text);
}

.v2-start-error {
  margin: 0;
  color: var(--danger);
  font-size: var(--text-sm);
}

.v2-recent-card {
  padding: var(--space-5);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  display: grid;
  gap: var(--space-3);
}

.v2-recent-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text);
}

.v2-recent-header h3 {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 600;
}

.v2-recent-list {
  display: grid;
  gap: var(--space-2);
  max-height: 420px;
  overflow-y: auto;
}

.v2-recent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--background);
  color: inherit;
  text-decoration: none;
  transition: border-color 0.15s ease;
}

.v2-recent-item:hover {
  border-color: var(--primary);
}

.v2-recent-item:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.v2-recent-info h4 {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text);
}

.v2-recent-info p {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.v2-recent-continue {
  flex: 0 0 auto;
  color: var(--primary);
  font-size: var(--text-sm);
  font-weight: 700;
}

.v2-recent-error {
  margin: 0;
  color: var(--danger);
  font-size: var(--text-sm);
}

.v2-recent-skeleton {
  display: grid;
  gap: var(--space-2);
}

.v2-recent-skeleton span {
  height: 48px;
  border-radius: var(--radius-md);
  background: linear-gradient(90deg, var(--surface-soft) 25%, var(--border) 50%, var(--surface-soft) 75%);
  background-size: 200% 100%;
  animation: v2-recent-shimmer 1.4s ease infinite;
}

@keyframes v2-recent-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
