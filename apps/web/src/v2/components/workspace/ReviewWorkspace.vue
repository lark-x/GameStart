<script setup lang="ts">
import { Sparkles, Check, X, AlertTriangle, ShieldAlert, Cpu } from "@lucide/vue";
import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Field from "../../../components/ui/Field.vue";
import Input from "../../../components/ui/Input.vue";
import Textarea from "../../../components/ui/Textarea.vue";
import EmptyState from "../../../components/ui/EmptyState.vue";
import type { V2WorkspaceSnapshot } from "../../adapters";
import type { V2CandidateReviewAction } from "../../adapters/types";

defineProps<{
  snapshot: V2WorkspaceSnapshot;
  loading: boolean;
  generationPrompt: string;
  generationMessage: string | null;
  reviewer: string;
  reviewReason: string;
  reviewMessage: string | null;
  canReviewCandidate: boolean;
}>();

const emit = defineEmits<{
  "update:generationPrompt": [value: string];
  "update:reviewer": [value: string];
  "update:reviewReason": [value: string];
  createGenerationJob: [];
  reviewCandidate: [action: V2CandidateReviewAction];
}>();

function statusLabel(status: string): string {
  return {
    none: "无",
    idle: "空闲",
    queued: "排队中",
    running: "执行中",
    claimed: "已领取",
    succeeded: "已完成",
    approved: "已通过",
    pending: "待审核",
    changes_requested: "要求修改",
    rejected: "已驳回",
    failed: "失败",
  }[status] ?? status;
}

function sourceLabel(kind: string): string {
  return { world: "故事空间", character: "角色", location: "地点", fact: "事实", scene: "场景" }[kind] ?? kind;
}
</script>

<template>
  <div class="review-workspace">
    <!-- Generation Trigger Bar -->
    <div class="generator-box">
      <div class="gen-header">
        <div class="gen-title">
          <Sparkles :size="18" class="sparkle-icon" />
          <h3>AI 剧本/场景生成沙箱</h3>
        </div>
        <Badge :tone="snapshot.generation.job?.status === 'running' ? 'info' : 'neutral'">
          状态: {{ statusLabel(snapshot.generation.job?.status ?? "idle") }}
        </Badge>
      </div>

      <form class="gen-form" @submit.prevent="emit('createGenerationJob')">
        <Field label="生成提示词 (Prompt)" hint="所有生成物受不可信边界保护，必须经创作者审查通过后才会并入正典。">
          <Textarea
            :model-value="generationPrompt"
            :disabled="loading"
            id="v2-generation-prompt"
            aria-label="生成提示词"
            :rows="3"
            placeholder="描述你想生成的新场景、支线情节或人物对话..."
            @update:model-value="emit('update:generationPrompt', $event)"
          />
        </Field>

        <div class="gen-actions">
          <Button variant="primary" size="md" type="submit" :loading="loading">
            <Sparkles :size="16" /> 发送生成任务
          </Button>
          <span v-if="generationMessage" class="feedback-msg">{{ generationMessage }}</span>
        </div>
      </form>
    </div>

    <!-- Context Sources Pill List -->
    <div v-if="snapshot.generation.context.sources.length > 0" class="context-sources-bar">
      <span class="context-kicker"><Cpu :size="14" /> Prompt 上下文快照源 ({{ snapshot.generation.context.sources.length }})：</span>
      <div class="sources-tags">
        <span
          v-for="source in snapshot.generation.context.sources"
          :key="source.id"
          class="source-tag"
        >
          <span class="tag-kind">{{ sourceLabel(source.kind) }}</span>
          <span class="tag-label">{{ source.label }}</span>
        </span>
      </div>
    </div>

    <!-- Candidate Review Split Diff View -->
    <div v-if="snapshot.candidate" class="candidate-review-section">
      <div class="candidate-card">
        <!-- Review Action Bar -->
        <div class="review-header">
          <div class="candidate-meta">
            <Badge tone="warning">待审候选</Badge>
            <h4>{{ snapshot.generation.diff.title }}</h4>
            <span class="hash-tag">基线版本: v{{ snapshot.candidate.baseCanonRevision }}</span>
          </div>

          <div class="decision-box">
            <div class="reviewer-inputs">
              <Input
                :model-value="reviewer"
                :disabled="loading || !canReviewCandidate"
                id="v2-reviewer"
                aria-label="审核人"
                placeholder="审核人姓名"
                size="sm"
                @update:model-value="emit('update:reviewer', $event)"
              />
              <Input
                :model-value="reviewReason"
                :disabled="loading || !canReviewCandidate"
                id="v2-review-reason"
                aria-label="审核意见"
                placeholder="审核意见 / 理由（可选）"
                size="sm"
                @update:model-value="emit('update:reviewReason', $event)"
              />
            </div>
            <div class="action-buttons">
              <Button
                variant="primary"
                size="sm"
                :disabled="!canReviewCandidate"
                :loading="loading"
                @click="emit('reviewCandidate', 'approve')"
              >
                <Check :size="14" /> 通过入库
              </Button>
              <Button
                variant="secondary"
                size="sm"
                :disabled="!canReviewCandidate || loading"
                @click="emit('reviewCandidate', 'request_changes')"
              >
                <AlertTriangle :size="14" /> 要求重改
              </Button>
              <Button
                variant="danger"
                size="sm"
                :disabled="!canReviewCandidate || loading"
                @click="emit('reviewCandidate', 'reject')"
              >
                <X :size="14" /> 驳回
              </Button>
            </div>
          </div>
        </div>

        <p v-if="reviewMessage" class="feedback-msg highlight">{{ reviewMessage }}</p>

        <!-- Visual Diff Changes View -->
        <div class="diff-container">
          <div class="diff-column additions">
            <h5><Check :size="14" /> 新增内容与变更计划 (Additions)</h5>
            <ul class="diff-list">
              <li v-for="(addition, idx) in snapshot.generation.diff.additions" :key="idx">
                <span class="bullet">+</span>
                <span class="text">{{ addition }}</span>
              </li>
            </ul>
          </div>

          <div v-if="snapshot.generation.diff.warnings.length > 0" class="diff-column warnings">
            <h5><ShieldAlert :size="14" /> 潜在冲突与警告 (Warnings)</h5>
            <ul class="diff-list">
              <li v-for="(warning, idx) in snapshot.generation.diff.warnings" :key="idx">
                <span class="bullet">!</span>
                <span class="text">{{ warning }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty Candidate Placeholder -->
    <EmptyState
      v-else
      title="暂无待审核候选"
      description="在上方输入 Prompt 并触发生成，AI 产出的剧本将以隔离候选形式呈现于此供您裁决。"
    >
      <template #icon>
        <Sparkles :size="24" />
      </template>
    </EmptyState>
  </div>
</template>

<style scoped>
.review-workspace {
  display: grid;
  gap: var(--space-4);
}

.generator-box {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: grid;
  gap: var(--space-3);
}

.gen-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.gen-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.gen-title h3 {
  margin: 0;
  font-size: var(--text-md);
  color: var(--text-strong);
}

.sparkle-icon {
  color: #8b5cf6;
}

.gen-form {
  display: grid;
  gap: var(--space-3);
}

.gen-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.feedback-msg {
  font-size: var(--text-xs);
  color: var(--muted);
}

.feedback-msg.highlight {
  color: var(--primary);
  font-weight: 600;
}

.context-sources-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--surface-soft);
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  flex-wrap: wrap;
}

.context-kicker {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--muted);
  font-weight: 600;
}

.sources-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.source-tag {
  display: inline-flex;
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  padding: 1px 6px;
  font-size: 11px;
}

.tag-kind {
  color: var(--muted);
  margin-right: 4px;
}

.tag-label {
  font-weight: 600;
  color: var(--text-strong);
}

.candidate-review-section {
  display: grid;
  gap: var(--space-3);
}

.candidate-card {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: grid;
  gap: var(--space-4);
}

.review-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4);
  flex-wrap: wrap;
  border-bottom: 1px solid var(--border);
  padding-bottom: var(--space-3);
}

.candidate-meta {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.candidate-meta h4 {
  margin: 0;
  font-size: var(--text-md);
  color: var(--text-strong);
}

.hash-tag {
  font-size: var(--text-xs);
  color: var(--muted);
  font-family: monospace;
}

.decision-box {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.reviewer-inputs {
  display: flex;
  gap: var(--space-2);
}

.action-buttons {
  display: flex;
  gap: var(--space-2);
}

.diff-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--space-3);
}

.diff-column {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
}

.diff-column.additions {
  border-left: 4px solid #22c55e;
}

.diff-column.warnings {
  border-left: 4px solid #eab308;
}

.diff-column h5 {
  margin: 0 0 var(--space-2) 0;
  font-size: var(--text-xs);
  display: flex;
  align-items: center;
  gap: 4px;
}

.diff-column.additions h5 {
  color: #15803d;
}

.diff-column.warnings h5 {
  color: #a16207;
}

.diff-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-1);
}

.diff-list li {
  display: flex;
  gap: var(--space-2);
  font-size: var(--text-xs);
  line-height: 1.5;
}

.diff-column.additions .bullet {
  color: #16a34a;
  font-weight: 700;
}

.diff-column.warnings .bullet {
  color: #ca8a04;
  font-weight: 700;
}

.diff-list .text {
  color: var(--text);
  word-break: break-word;
}
</style>
