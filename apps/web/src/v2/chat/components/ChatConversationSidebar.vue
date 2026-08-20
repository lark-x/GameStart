<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Plus, Search } from "@lucide/vue";
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
      <span class="chat-sidebar-title">会话</span>
      <RouterLink to="/v2/chat" class="chat-sidebar-new">
        <Button variant="ghost" size="icon" aria-label="返回聊天首页"><Plus :size="16" aria-hidden="true" /></Button>
      </RouterLink>
    </div>
    <div class="chat-sidebar-search">
      <Search :size="14" aria-hidden="true" />
      <Input v-model="search" placeholder="搜索角色..." aria-label="搜索角色" />
    </div>
    <p v-if="error" class="chat-sidebar-error" role="alert">{{ error }}</p>
    <div v-else-if="loading" class="chat-sidebar-status">正在读取...</div>
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
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  gap: var(--space-2);
  height: 100%;
  min-height: 0;
}

.chat-sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2);
}

.chat-sidebar-title {
  color: var(--text-strong);
  font-weight: 700;
}

.chat-sidebar-new {
  text-decoration: none;
}

.chat-sidebar-search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  color: var(--muted);
}

.chat-sidebar-error,
.chat-sidebar-status {
  color: var(--muted);
  font-size: var(--text-sm);
  padding: var(--space-2);
}

.chat-sidebar-error {
  color: var(--danger);
}

.chat-sidebar-list {
  display: grid;
  gap: var(--space-1);
  min-height: 0;
  overflow-y: auto;
}

.chat-sidebar-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text);
  cursor: pointer;
  text-align: left;
}

.chat-sidebar-item:hover,
.chat-sidebar-item.active {
  background: var(--surface-soft);
}

.chat-sidebar-item.active {
  border-color: var(--primary);
}

.chat-sidebar-avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 800;
}

.chat-sidebar-main {
  display: grid;
  gap: 2px;
  min-width: 0;
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

.chat-sidebar-preview {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: var(--text-xs);
}
</style>
