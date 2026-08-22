<script setup lang="ts">
import { Activity, RefreshCw, X } from "@lucide/vue";
import type { V2ChatDiagnosticsResponse } from "@living-network/contracts/v2";
import Button from "../../../components/ui/Button.vue";

defineProps<{
  open: boolean;
  diagnostics: V2ChatDiagnosticsResponse | null;
  loading: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  close: [];
  refresh: [];
}>();
</script>

<template>
  <div v-if="open" class="v2-diag-backdrop" @click="emit('close')" />
  <aside
    v-if="open"
    class="v2-diag-drawer"
    role="dialog"
    aria-modal="true"
    aria-label="上下文诊断面板"
  >
    <div class="v2-diag-header">
      <div class="v2-diag-title">
        <Activity :size="16" aria-hidden="true" />
        <h3>上下文诊断</h3>
      </div>
      <div class="v2-diag-actions">
        <Button
          variant="ghost"
          size="icon"
          :loading="loading"
          aria-label="刷新诊断数据"
          @click="emit('refresh')"
        >
          <RefreshCw :size="14" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="关闭诊断面板"
          @click="emit('close')"
        >
          <X :size="14" aria-hidden="true" />
        </Button>
      </div>
    </div>

    <div v-if="loading && !diagnostics" class="v2-diag-loading">
      正在读取上下文状态…
    </div>
    <div v-else-if="error" class="v2-diag-error">
      <p>{{ error }}</p>
      <Button variant="secondary" size="sm" @click="emit('refresh')">重试</Button>
    </div>
    <div v-else-if="diagnostics" class="v2-diag-grid">
      <div class="v2-diag-item">
        <span class="v2-diag-label">提示词模板</span>
        <span class="v2-diag-value">{{ diagnostics.templateId || "chat:roleplay:v1" }}</span>
      </div>
      <div class="v2-diag-item">
        <span class="v2-diag-label">Token 预算上限</span>
        <span class="v2-diag-value">{{ diagnostics.inputBudget ? `${diagnostics.inputBudget} tokens` : "4096 tokens" }}</span>
      </div>
      <div class="v2-diag-item">
        <span class="v2-diag-label">活跃长期记忆</span>
        <span class="v2-diag-value">{{ diagnostics.selectedMemoryIds ? `${diagnostics.selectedMemoryIds.length} 条` : "0 条" }}</span>
      </div>
      <div class="v2-diag-item">
        <span class="v2-diag-label">会话摘要版本</span>
        <span class="v2-diag-value">{{ diagnostics.summaryVersion ? `v${diagnostics.summaryVersion}` : "暂无" }}</span>
      </div>
      <div class="v2-diag-item">
        <span class="v2-diag-label">最近消息窗口</span>
        <span class="v2-diag-value">{{ diagnostics.recentCount !== undefined ? `${diagnostics.recentCount} 条` : "0 条" }}</span>
      </div>
      <div class="v2-diag-item">
        <span class="v2-diag-label">多模态图片</span>
        <span class="v2-diag-value">{{ diagnostics.imageCount !== undefined ? `${diagnostics.imageCount} 张` : "0 张" }}</span>
      </div>
    </div>
    <div v-else class="v2-diag-loading">
      暂无诊断数据
    </div>
  </aside>
</template>

<style scoped>
.v2-diag-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 30%);
  z-index: 40;
}

.v2-diag-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(380px, 90vw);
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
  z-index: 50;
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  animation: diagSlideIn 0.2s ease-out;
}

@keyframes diagSlideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.v2-diag-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border);
}

.v2-diag-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--primary);
}

.v2-diag-title h3 {
  margin: 0;
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--text-strong);
}

.v2-diag-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.v2-diag-loading {
  padding: var(--space-4);
  color: var(--muted);
  font-size: var(--text-sm);
  text-align: center;
}

.v2-diag-error {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-sm);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.v2-diag-grid {
  display: grid;
  gap: var(--space-3);
}

.v2-diag-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-3);
  background: var(--surface-soft);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

.v2-diag-label {
  font-size: var(--text-xs);
  color: var(--muted);
}

.v2-diag-value {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-strong);
}
</style>
