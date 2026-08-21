<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { MessageSquare, Plus, Search } from "@lucide/vue";
import { RouterLink } from "vue-router";
import type { V2ChatConversationSummaryDto } from "@living-network/contracts/v2";

import Button from "../../../components/ui/Button.vue";
import Input from "../../../components/ui/Input.vue";
import { createV2ChatClient } from "../client.ts";

defineProps<{
  activeConversationId: string;
}>();

const emit = defineEmits<{
  select: [conversationId: string];
}>();

const environment = import.meta.env as Record<string, string | undefined>;
const baseUrl = environment.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3003" : window.location.origin);
const client = createV2ChatClient({ baseUrl });

const conversations = ref<readonly V2ChatConversationSummaryDto[]>([]);
const loading = ref(true);
const error = ref("");
const search = ref("");

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return conversations.value;
  return conversations.value.filter((item) => item.characterName.toLowerCase().includes(q));
});

function avatarInitial(name: string): string {
  return [...name.trim()][0] ?? "?";
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    conversations.value = await client.listConversationSummaries();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "读取会话失败";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="chat-sidebar">
    <div class="chat-sidebar-head">
      <div class="chat-sidebar-title-group">
        <MessageSquare :size="16" class="chat-sidebar-icon" aria-hidden="true" />
        <span class="chat-sidebar-title">会话</span>
      </div>
      <RouterLink to="/v2/chat" class="chat-sidebar-new">
        <Button variant="ghost" size="icon" aria-label="返回聊天首页">
          <Plus :size="16" aria-hidden="true" />
        </Button>
      </RouterLink>
    </div>

    <div class="chat-sidebar-search">
      <Search :size="14" class="chat-sidebar-search-icon" aria-hidden="true" />
      <Input
        v-model="search"
        placeholder="搜索角色..."
        aria-label="搜索角色"
        class="chat-sidebar-search-input"
      />
    </div>

    <p v-if="error" class="chat-sidebar-error" role="alert">{{ error }}</p>
    <div v-else-if="loading" class="chat-sidebar-status">正在读取会话…</div>
    <div v-else-if="filtered.length === 0" class="chat-sidebar-empty">
      <span>{{ search ? "未找到匹配会话" : "暂无历史会话" }}</span>
    </div>
    <div v-else class="chat-sidebar-list">
      <button
        v-for="conversation in filtered"
        :key="conversation.conversationId"
        type="button"
        class="chat-sidebar-item"
        :class="{ active: conversation.conversationId === activeConversationId }"
        @click="emit('select', conversation.conversationId)"
      >
        <span class="chat-sidebar-avatar" aria-hidden="true">{{ avatarInitial(conversation.characterName) }}</span>
        <span class="chat-sidebar-main">
          <span class="chat-sidebar-name">{{ conversation.characterName }}</span>
          <span class="chat-sidebar-preview">{{ conversation.lastMessagePreview ?? "开始聊天吧" }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  height: 100%;
  min-height: 0;
  padding: var(--space-3);
}

.chat-sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-1);
}

.chat-sidebar-title-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.chat-sidebar-icon {
  color: var(--primary);
}

.chat-sidebar-title {
  color: var(--text-strong);
  font-weight: 700;
  font-size: var(--text-md);
}

.chat-sidebar-new {
  text-decoration: none;
}

.chat-sidebar-search {
  position: relative;
  display: flex;
  align-items: center;
}

.chat-sidebar-search-icon {
  position: absolute;
  left: 10px;
  color: var(--muted);
  pointer-events: none;
  z-index: 1;
}

.chat-sidebar-search-input {
  width: 100%;
  padding-left: 32px !important;
  font-size: var(--text-sm);
  background: var(--surface-soft);
  border-radius: var(--radius-md);
}

.chat-sidebar-error,
.chat-sidebar-status,
.chat-sidebar-empty {
  color: var(--muted);
  font-size: var(--text-xs);
  padding: var(--space-4) var(--space-2);
  text-align: center;
}

.chat-sidebar-error {
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: var(--radius-sm);
}

.chat-sidebar-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.chat-sidebar-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  transition: background var(--motion-fast), border-color var(--motion-fast);
}

.chat-sidebar-item:hover {
  background: var(--surface-soft);
}

.chat-sidebar-item.active {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
}

.chat-sidebar-avatar {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  background: var(--surface-soft);
  border: 1px solid var(--border);
  color: var(--primary);
  font-weight: 700;
  font-size: var(--text-sm);
  flex-shrink: 0;
}

.chat-sidebar-item.active .chat-sidebar-avatar {
  background: var(--primary);
  color: var(--on-primary);
  border-color: transparent;
}

.chat-sidebar-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}

.chat-sidebar-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-strong);
  font-size: var(--text-sm);
  font-weight: 700;
}

.chat-sidebar-item.active .chat-sidebar-name {
  color: var(--primary);
}

.chat-sidebar-preview {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: var(--text-xs);
  line-height: 1.3;
}
</style>
