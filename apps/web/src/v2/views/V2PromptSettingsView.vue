<script setup lang="ts">
import { ScrollText } from "@lucide/vue";
import Badge from "../../components/ui/Badge.vue";
import PageHeader from "../../components/layout/PageHeader.vue";

interface PromptTaskInfo {
  readonly task: string;
  readonly label: string;
  readonly description: string;
  readonly status: "registered" | "implemented" | "planned";
}

const promptTasks: readonly PromptTaskInfo[] = [
  { task: "chat.reply", label: "对话回复", description: "用户消息的 AI 回复生成。", status: "registered" },
  { task: "story.bootstrap", label: "故事引导", description: "新故事的开场白和初始场景生成。", status: "registered" },
  { task: "memory.extract", label: "记忆提取", description: "从对话中提取结构化记忆数据。", status: "implemented" },
  { task: "memory.consolidate", label: "记忆整合", description: "合并和去重长期记忆条目。", status: "registered" },
  { task: "scene.generate", label: "场景生成", description: "Worker 场景生成任务的提示词。", status: "implemented" },
];

function statusLabel(status: PromptTaskInfo["status"]): string {
  if (status === "registered") return "已注册";
  if (status === "implemented") return "已实现";
  return "计划中";
}

function statusTone(status: PromptTaskInfo["status"]): "success" | "info" | "neutral" {
  if (status === "implemented") return "success";
  if (status === "registered") return "info";
  return "neutral";
}
</script>

<template>
  <div class="v2-prompt-settings">
    <PageHeader
      title="Prompt"
      description="提示词模板版本与运行时配置。每个任务对应一组经过调优的提示词模板，版本更新会影响 AI 输出质量。"
    />

    <section class="v2-prompt-section" aria-labelledby="v2-prompt-tasks-title">
      <div class="v2-prompt-section-head">
        <ScrollText :size="16" aria-hidden="true" />
        <h2 id="v2-prompt-tasks-title">提示词任务</h2>
      </div>
      <div class="v2-prompt-rows">
        <div v-for="item in promptTasks" :key="item.task" class="v2-prompt-row">
          <div class="v2-prompt-row-main">
            <strong>{{ item.label }}</strong>
            <p>{{ item.description }}</p>
            <code class="v2-prompt-row-task">{{ item.task }}</code>
          </div>
          <Badge :tone="statusTone(item.status)">{{ statusLabel(item.status) }}</Badge>
        </div>
      </div>
    </section>

    <div class="v2-prompt-note">
      <ScrollText :size="16" aria-hidden="true" />
      <span>提示词模板编辑器和版本管理将在后续版本中提供。</span>
    </div>
  </div>
</template>

<style scoped>
.v2-prompt-settings {
  display: grid;
  gap: var(--space-5);
}

.v2-prompt-section {
  display: grid;
  gap: var(--space-3);
}

.v2-prompt-section-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--muted);
}

.v2-prompt-section-head h2 {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.v2-prompt-rows {
  display: grid;
  gap: 1px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--border);
  overflow: hidden;
}

.v2-prompt-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--surface);
}

.v2-prompt-row-main {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.v2-prompt-row-main strong {
  color: var(--text-strong);
  font-size: var(--text-sm);
}

.v2-prompt-row-main p {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-xs);
}

.v2-prompt-row-task {
  color: var(--muted);
  font-size: var(--text-xs);
  font-family: ui-monospace, monospace;
}

.v2-prompt-note {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--muted);
  font-size: var(--text-sm);
}
</style>
