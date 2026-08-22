<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { MessageSquare, RefreshCw, Search, Sparkles, Users } from "@lucide/vue";
import type {
  V2ChatContactDto,
  V2ChatConversationSummaryDto,
  V2IdempotencyKey,
} from "@living-network/contracts/v2";

import Button from "../../components/ui/Button.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import Input from "../../components/ui/Input.vue";
import PageHeader from "../../components/layout/PageHeader.vue";
import { createV2ChatClient } from "../chat/client.ts";

const router = useRouter();
const environment = import.meta.env as Record<string, string | undefined>;
const baseUrl = environment.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3003" : window.location.origin);
const client = createV2ChatClient({ baseUrl });

const conversations = ref<readonly V2ChatConversationSummaryDto[]>([]);
const contacts = ref<readonly V2ChatContactDto[]>([]);
const loading = ref(true);
const creating = ref(false);
const errorMessage = ref("");
const search = ref("");

const filteredConversations = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return conversations.value;
  return conversations.value.filter((item) =>
    (item.title ?? "").toLowerCase().includes(q) || item.characterName.toLowerCase().includes(q));
});

const filteredContacts = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return contacts.value;
  return contacts.value.filter((item) =>
    item.characterName.toLowerCase().includes(q) || item.storyWorldName.toLowerCase().includes(q));
});

function avatarInitial(name: string): string {
  return [...name.trim()][0] ?? "?";
}

function previewText(conversation: V2ChatConversationSummaryDto): string {
  if (conversation.lastMessagePreview) return conversation.lastMessagePreview;
  return "开始聊天吧";
}

function relativeTime(value: string | undefined): string {
  if (value === undefined) return "";
  const delta = Date.now() - Date.parse(value);
  if (Number.isNaN(delta) || delta < 0) return "";
  if (delta < 60_000) return "刚刚";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`;
  return `${Math.floor(delta / 86_400_000)} 天前`;
}

function openConversation(conversationId: string): void {
  void router.push(`/v2/chat/${encodeURIComponent(conversationId)}`);
}

async function openCharacter(contact: V2ChatContactDto): Promise<void> {
  if (creating.value) return;
  if (contact.latestConversationId) {
    openConversation(contact.latestConversationId);
    return;
  }
  creating.value = true;
  errorMessage.value = "";
  try {
    const result = await client.createConversation({
      storyWorldId: contact.storyWorldId,
      characterId: contact.characterId,
      idempotencyKey: `conv:${contact.characterId}:${Date.now()}` as V2IdempotencyKey,
    });
    openConversation(result.conversation.conversationId);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "发起聊天失败";
  } finally {
    creating.value = false;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [nextConversations, nextContacts] = await Promise.all([
      client.listConversationSummaries(),
      client.listContacts(),
    ]);
    conversations.value = nextConversations;
    contacts.value = nextContacts;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "加载聊天失败";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="chat-home">
    <PageHeader
      title="故事对话"
      description="与你的 AI 故事角色展开即时对话。角色将结合当前人设设定与长期记忆记忆库进行回应。"
    >
      <template #actions>
        <Button variant="secondary" size="md" :loading="loading" @click="load">
          <RefreshCw :size="14" aria-hidden="true" />
          <span>刷新</span>
        </Button>
        <RouterLink to="/v2/start" class="chat-home-quick">
          <Button variant="primary" size="md">
            <Sparkles :size="15" aria-hidden="true" />
            快速创建角色
          </Button>
        </RouterLink>
      </template>
    </PageHeader>

    <div v-if="errorMessage" class="chat-home-error" role="alert">{{ errorMessage }}</div>

    <div class="chat-home-search">
      <Search :size="16" class="chat-home-search-icon" aria-hidden="true" />
      <Input v-model="search" placeholder="搜索角色或会话..." aria-label="搜索角色或会话" class="chat-home-search-input" />
    </div>

    <div v-if="loading" class="chat-home-status" role="status">正在加载聊天...</div>

    <template v-else>
      <div class="chat-home-layout">
        <section class="chat-home-section" aria-labelledby="chat-conversations-title">
          <div class="chat-home-section-head">
            <MessageSquare :size="17" class="chat-section-icon" aria-hidden="true" />
            <h2 id="chat-conversations-title">最近会话</h2>
            <span class="chat-section-count">{{ filteredConversations.length }}</span>
          </div>
          <EmptyState
            v-if="filteredConversations.length === 0"
            title="还没有会话"
            description="从右侧选择一个角色，开启一段生动的故事对话。"
          />
          <div v-else class="chat-home-list">
            <button
              v-for="conversation in filteredConversations"
              :key="conversation.conversationId"
              type="button"
              class="chat-home-row"
              @click="openConversation(conversation.conversationId)"
            >
              <span class="chat-avatar" aria-hidden="true">{{ avatarInitial(conversation.characterName) }}</span>
              <span class="chat-row-main">
                <span class="chat-row-title">{{ conversation.characterName }}</span>
                <span class="chat-row-preview">{{ previewText(conversation) }}</span>
              </span>
              <span class="chat-row-meta">
                <span class="chat-row-world">{{ conversation.storyWorldName }}</span>
                <span class="chat-row-time">{{ relativeTime(conversation.lastMessageAt) }}</span>
              </span>
            </button>
          </div>
        </section>

        <section class="chat-home-section" aria-labelledby="chat-contacts-title">
          <div class="chat-home-section-head">
            <Users :size="17" class="chat-section-icon" aria-hidden="true" />
            <h2 id="chat-contacts-title">全部角色</h2>
            <span class="chat-section-count">{{ filteredContacts.length }}</span>
          </div>
          <EmptyState
            v-if="filteredContacts.length === 0"
            title="还没有角色"
            description="点击上方“快速创建角色”，在当前世界中添加第一位角色。"
          >
            <template #icon><Users :size="23" aria-hidden="true" /></template>
          </EmptyState>
          <div v-else class="chat-home-list">
            <button
              v-for="contact in filteredContacts"
              :key="`${contact.storyWorldId}:${contact.characterId}`"
              type="button"
              class="chat-home-row"
              :disabled="creating"
              @click="openCharacter(contact)"
            >
              <span class="chat-avatar" aria-hidden="true">{{ avatarInitial(contact.characterName) }}</span>
              <span class="chat-row-main">
                <span class="chat-row-title">{{ contact.characterName }}</span>
                <span class="chat-row-preview">{{ contact.characterSummary ?? contact.storyWorldName }}</span>
              </span>
              <span class="chat-row-meta">
                <span class="chat-row-world">{{ contact.storyWorldName }}</span>
                <span v-if="contact.activeMemoryCount > 0" class="chat-row-pill">{{ contact.activeMemoryCount }} 条记忆</span>
              </span>
            </button>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.chat-home {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}

.chat-home-quick {
  text-decoration: none;
}

.chat-home-error {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-sm);
  border: 1px solid var(--danger);
}

.chat-home-status {
  padding: var(--space-8);
  color: var(--muted);
  text-align: center;
}

.chat-home-search {
  position: relative;
  display: flex;
  align-items: center;
}

.chat-home-search-icon {
  position: absolute;
  left: 12px;
  color: var(--muted);
  pointer-events: none;
}

.chat-home-search-input {
  width: 100%;
  padding-left: 36px !important;
  background: var(--surface);
  border-radius: var(--radius-md);
}

.chat-home-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-5);
  align-items: start;
}

.chat-home-section {
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.chat-home-section-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border);
}

.chat-section-icon {
  color: var(--primary);
}

.chat-home-section-head h2 {
  margin: 0;
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--text-strong);
  flex: 1;
}

.chat-section-count {
  font-size: 11px;
  color: var(--muted);
  background: var(--surface-soft);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
}

.chat-home-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.chat-home-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  color: var(--text);
  cursor: pointer;
  text-align: left;
  transition: transform var(--motion-fast), border-color var(--motion-fast), box-shadow var(--motion-fast);
}

.chat-home-row:hover,
.chat-home-row:focus-visible {
  border-color: var(--primary);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.chat-home-row:disabled {
  opacity: 0.6;
  cursor: wait;
}

.chat-avatar {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 800;
  font-size: var(--text-base);
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.chat-row-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.chat-row-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-strong);
  font-weight: 700;
  font-size: var(--text-sm);
}

.chat-row-preview {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: var(--text-xs);
  line-height: 1.4;
}

.chat-row-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  min-width: 0;
  flex-shrink: 0;
}

.chat-row-world {
  color: var(--muted);
  font-size: 11px;
  white-space: nowrap;
}

.chat-row-time {
  color: var(--faint);
  font-size: 11px;
  white-space: nowrap;
}

.chat-row-pill {
  font-size: 10px;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 1px 6px;
  border-radius: var(--radius-full);
  white-space: nowrap;
}

@media (max-width: 820px) {
  .chat-home-layout {
    grid-template-columns: 1fr;
  }
}
</style>
