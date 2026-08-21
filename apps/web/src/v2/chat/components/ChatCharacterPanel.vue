<script setup lang="ts">
import { Brain, Globe, Sparkles } from "@lucide/vue";
import type { V2ChatContextResponse } from "@living-network/contracts/v2";

defineProps<{
  context: V2ChatContextResponse | null;
  loading: boolean;
  error: string | null;
}>();

function avatarInitial(name: string): string {
  return [...name.trim()][0] ?? "?";
}
</script>

<template>
  <div class="chat-character-panel">
    <div v-if="loading" class="chat-character-status">正在读取角色设定…</div>
    <div v-else-if="error" class="chat-character-status chat-character-error">{{ error }}</div>
    <div v-else-if="context" class="chat-character-content">
      <!-- Character Profile Header -->
      <section class="char-card char-profile-card">
        <div class="char-profile-header">
          <div class="char-avatar" aria-hidden="true">
            {{ avatarInitial(context.character.name) }}
          </div>
          <div class="char-profile-info">
            <h4 class="char-name">{{ context.character.name }}</h4>
            <span class="char-role-badge">AI 故事角色</span>
          </div>
        </div>
        <p v-if="context.character.summary" class="char-summary">
          {{ context.character.summary }}
        </p>
      </section>

      <!-- Persona Section -->
      <section v-if="context.character.personaText" class="char-card">
        <div class="char-card-head">
          <Sparkles :size="14" class="char-icon" aria-hidden="true" />
          <span class="char-card-title">人设指令</span>
        </div>
        <p class="char-persona-text">{{ context.character.personaText }}</p>
      </section>

      <!-- World Section -->
      <section class="char-card">
        <div class="char-card-head">
          <Globe :size="14" class="char-icon" aria-hidden="true" />
          <span class="char-card-title">所属世界</span>
        </div>
        <div class="char-world-badge">
          <span>{{ context.world.name }}</span>
        </div>
      </section>

      <!-- Long-term Memory Section -->
      <section class="char-card">
        <div class="char-card-head">
          <Brain :size="14" class="char-icon" aria-hidden="true" />
          <span class="char-card-title">长期记忆</span>
          <span class="char-memory-count">{{ context.memory.activeCount }} 条活跃</span>
        </div>
        <ul v-if="context.memory.recent.length" class="char-memory-list">
          <li v-for="(memory, idx) in context.memory.recent" :key="memory.memoryId" class="char-memory-item">
            <span class="char-memory-idx">{{ idx + 1 }}</span>
            <span class="char-memory-text">{{ memory.content }}</span>
          </li>
        </ul>
        <div v-else class="char-memory-empty">
          暂无已激活的记忆片段
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.chat-character-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  height: 100%;
}

.chat-character-status {
  color: var(--muted);
  font-size: var(--text-sm);
  padding: var(--space-4);
  text-align: center;
}

.chat-character-error {
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: var(--radius-sm);
}

.chat-character-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.char-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.char-profile-card {
  background: var(--surface);
  border-color: var(--border-strong);
}

.char-profile-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.char-avatar {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: var(--text-lg);
  font-weight: 800;
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.char-profile-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.char-name {
  margin: 0;
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.char-role-badge {
  font-size: 11px;
  color: var(--primary);
  font-weight: 600;
}

.char-summary {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--muted);
  line-height: 1.5;
}

.char-card-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.char-icon {
  color: var(--primary);
}

.char-card-title {
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--text-strong);
  letter-spacing: 0.03em;
  flex: 1;
}

.char-memory-count {
  font-size: 11px;
  color: var(--muted);
  background: var(--surface);
  padding: 1px 6px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
}

.char-persona-text {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-size: var(--text-xs);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.char-world-badge {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-size: var(--text-xs);
  font-weight: 600;
}

.char-memory-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.char-memory-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: var(--text-xs);
  line-height: 1.5;
}

.char-memory-idx {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
}

.char-memory-text {
  color: var(--text);
  word-break: break-word;
}

.char-memory-empty {
  font-size: var(--text-xs);
  color: var(--muted);
  padding: var(--space-2) 0;
  text-align: center;
}
</style>
