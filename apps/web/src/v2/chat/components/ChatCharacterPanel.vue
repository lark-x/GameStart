<script setup lang="ts">
import { useRouter } from "vue-router";
import { ArrowRight, Brain, Globe, Sparkles, UserRound } from "@lucide/vue";
import type { V2ChatContextResponse } from "@living-network/contracts/v2";
import Button from "../../../components/ui/Button.vue";
import Card from "../../../components/ui/Card.vue";

const props = defineProps<{
  context: V2ChatContextResponse | null;
  loading: boolean;
  error: string | null;
}>();

const router = useRouter();

function avatarInitial(name: string): string {
  return [...name.trim()][0] ?? "?";
}

function goToCharacterCenter(): void {
  if (props.context?.character.characterId) {
    void router.push(`/v2/workspace/characters/${encodeURIComponent(props.context.character.characterId)}`);
  } else {
    void router.push("/v2/workspace/characters");
  }
}
</script>

<template>
  <div class="chat-character-panel">
    <div v-if="loading" class="chat-character-status">正在读取角色设定…</div>
    <div v-else-if="error" class="chat-character-status chat-character-error">{{ error }}</div>
    <div v-else-if="context" class="chat-character-content">
      <!-- 角色 Hero 档案卡片 -->
      <Card class="char-profile-card">
        <div class="char-profile-header">
          <div class="char-avatar-ring">
            <div class="char-avatar" aria-hidden="true">
              {{ avatarInitial(context.character.name) }}
            </div>
          </div>
          <div class="char-profile-info">
            <div class="char-name-row">
              <h4 class="char-name">{{ context.character.name }}</h4>
            </div>
            <span class="char-role-badge">AI 故事角色</span>
          </div>
        </div>

        <p v-if="context.character.summary" class="char-summary">
          {{ context.character.summary }}
        </p>

        <div class="char-world-pill">
          <Globe :size="12" aria-hidden="true" />
          <span>{{ context.world.name }}</span>
        </div>
      </Card>

      <!-- 人设与台词风格 -->
      <Card v-if="context.character.personaText" class="char-card">
        <div class="char-card-head">
          <Sparkles :size="13" class="char-icon" aria-hidden="true" />
          <span class="char-card-title">人设指令与语调</span>
        </div>
        <p class="char-persona-text">{{ context.character.personaText }}</p>
      </Card>

      <!-- 所属世界观 -->
      <Card v-if="context.world.summary" class="char-card">
        <div class="char-card-head">
          <Globe :size="13" class="char-icon" aria-hidden="true" />
          <span class="char-card-title">世界观前提</span>
        </div>
        <p class="char-world-summary">{{ context.world.summary }}</p>
      </Card>

      <!-- 长期记忆沉淀 -->
      <Card class="char-card">
        <div class="char-card-head">
          <Brain :size="13" class="char-icon" aria-hidden="true" />
          <span class="char-card-title">角色长期记忆</span>
          <span class="char-memory-count">{{ context.memory.activeCount }} 条活跃</span>
        </div>

        <ul v-if="context.memory.recent.length" class="char-memory-list">
          <li v-for="(memory, idx) in context.memory.recent" :key="memory.memoryId" class="char-memory-item">
            <span class="char-memory-idx">{{ idx + 1 }}</span>
            <span class="char-memory-text">{{ memory.content }}</span>
          </li>
        </ul>
        <div v-else class="char-memory-empty">
          <p>✨ 记忆沉淀中</p>
          <small>随着对话推进，AI 将自动在此提炼角色的关键事实与剧情认知。</small>
        </div>
      </Card>

      <!-- 联动操作：前往角色中心 -->
      <div class="char-actions">
        <Button variant="secondary" size="sm" class="char-goto-btn" @click="goToCharacterCenter">
          <UserRound :size="14" aria-hidden="true" />
          <span>在角色中心查看完整档案</span>
          <ArrowRight :size="13" aria-hidden="true" />
        </Button>
      </div>
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
}

.char-profile-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--border);
}

.char-profile-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.char-avatar-ring {
  padding: 2px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--primary), var(--secondary, var(--primary-hover)));
}

.char-avatar {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--primary);
  font-size: var(--text-base);
  font-weight: 800;
}

.char-profile-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.char-name-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.char-name {
  margin: 0;
  font-size: var(--text-md);
  font-weight: 800;
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

.char-world-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 3px var(--space-2);
  border-radius: var(--radius-full);
  background: var(--surface-soft);
  border: 1px solid var(--border);
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  width: fit-content;
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
  flex: 1;
}

.char-memory-count {
  font-size: 10px;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 1px 6px;
  border-radius: var(--radius-full);
  font-weight: 600;
}

.char-persona-text,
.char-world-summary {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
  color: var(--text);
  font-size: var(--text-xs);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
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
  background: var(--surface-soft);
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
  padding: var(--space-3) var(--space-2);
  text-align: center;
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
  border: 1px dashed var(--border);
}

.char-memory-empty p {
  margin: 0 0 4px;
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--text-strong);
}

.char-memory-empty small {
  display: block;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.4;
}

.char-actions {
  margin-top: var(--space-1);
}

.char-goto-btn {
  width: 100%;
  justify-content: space-between;
}
</style>
