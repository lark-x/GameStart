<script setup lang="ts">
import type { V2ChatContextResponse } from "@living-network/contracts/v2";

defineProps<{
  context: V2ChatContextResponse | null;
  loading: boolean;
  error: string | null;
}>();
</script>

<template>
  <div class="chat-character-panel">
    <div v-if="loading" class="chat-character-status">正在读取角色信息…</div>
    <div v-else-if="error" class="chat-character-status chat-character-error">{{ error }}</div>
    <div v-else-if="context" class="chat-character-content">
      <section>
        <h4>{{ context.character.name }}</h4>
        <p v-if="context.character.summary" class="chat-character-summary">{{ context.character.summary }}</p>
      </section>
      <section v-if="context.character.personaText">
        <span class="chat-character-label">人设</span>
        <p class="chat-character-persona">{{ context.character.personaText }}</p>
      </section>
      <section>
        <span class="chat-character-label">当前世界</span>
        <p class="chat-character-world">{{ context.world.name }}</p>
      </section>
      <section>
        <span class="chat-character-label">长期记忆</span>
        <p class="chat-character-world">{{ context.memory.activeCount }} 条活跃记忆</p>
        <ul v-if="context.memory.recent.length" class="chat-character-memory-list">
          <li v-for="memory in context.memory.recent" :key="memory.memoryId">{{ memory.content }}</li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.chat-character-panel {
  display: grid;
  gap: var(--space-4);
}

.chat-character-status {
  color: var(--muted);
  font-size: var(--text-sm);
}

.chat-character-error {
  color: var(--danger);
}

.chat-character-content {
  display: grid;
  gap: var(--space-4);
}

.chat-character-content section {
  display: grid;
  gap: var(--space-2);
}

.chat-character-content h4 {
  margin: 0;
  font-size: var(--text-lg);
  color: var(--text-strong);
}

.chat-character-label {
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.chat-character-summary,
.chat-character-persona,
.chat-character-world {
  margin: 0;
  color: var(--text);
  font-size: var(--text-sm);
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.chat-character-persona {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  white-space: pre-wrap;
}

.chat-character-memory-list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.chat-character-memory-list li {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  color: var(--text);
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}
</style>
