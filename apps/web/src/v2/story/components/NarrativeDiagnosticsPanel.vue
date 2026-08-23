<script setup lang="ts">
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  RefreshCw,
  Sparkles,
} from "@lucide/vue";
import Badge from "../../../components/ui/Badge.vue";
import { useNarrativeDiagnosticsStore } from "../stores/useNarrativeDiagnosticsStore.ts";
import { useNarrativeOutlineStore } from "../stores/useNarrativeOutlineStore.ts";
import type { V2NarrativeDiagnostic } from "@living-network/contracts/v2";

const props = defineProps<{
  storyWorldId: string;
}>();

const emit = defineEmits<{
  jumpToScene: [sceneId: string];
}>();

const diagStore = useNarrativeDiagnosticsStore();
const outlineStore = useNarrativeOutlineStore();

function handleJump(issue: V2NarrativeDiagnostic) {
  if (issue.entityType === "scene" || issue.entityType === "block") {
    outlineStore.selectScene(issue.entityId);
    emit("jumpToScene", issue.entityId);
  }
}
</script>

<template>
  <div class="diagnostics-panel">
    <header class="panel-header">
      <div class="header-title-group">
        <AlertCircle :size="15" class="header-icon" />
        <h4>剧情正典诊断报告</h4>
        <Badge v-if="diagStore.errorCount > 0" tone="danger" size="xs">{{ diagStore.errorCount }} 错误</Badge>
        <Badge v-if="diagStore.warningCount > 0" tone="warning" size="xs">{{ diagStore.warningCount }} 警告</Badge>
        <Badge v-if="diagStore.report && diagStore.errorCount === 0 && diagStore.warningCount === 0" tone="success" size="xs">全项通过</Badge>
      </div>

      <button
        class="refresh-btn"
        :disabled="diagStore.loading"
        title="重新诊断"
        @click="diagStore.fetchDiagnostics(props.storyWorldId)"
      >
        <RefreshCw :size="13" :class="{ spin: diagStore.loading }" />
      </button>
    </header>

    <div class="panel-body">
      <!-- Filter Tabs -->
      <div class="filter-tabs">
        <button
          class="filter-btn"
          :class="{ active: diagStore.selectedSeverity === 'all' }"
          @click="diagStore.setFilterSeverity('all')"
        >
          全部 ({{ diagStore.issues.length }})
        </button>
        <button
          class="filter-btn"
          :class="{ active: diagStore.selectedSeverity === 'error' }"
          @click="diagStore.setFilterSeverity('error')"
        >
          错误 ({{ diagStore.errorCount }})
        </button>
        <button
          class="filter-btn"
          :class="{ active: diagStore.selectedSeverity === 'warning' }"
          @click="diagStore.setFilterSeverity('warning')"
        >
          警告 ({{ diagStore.warningCount }})
        </button>
      </div>

      <div v-if="diagStore.loading" class="diag-loading">
        <Sparkles :size="16" class="spin" />
        <span>诊断检测中...</span>
      </div>

      <div v-else-if="diagStore.filteredIssues.length === 0" class="diag-empty">
        <CheckCircle2 :size="24" class="success-icon" />
        <span>当前无 {{ diagStore.selectedSeverity !== 'all' ? diagStore.selectedSeverity : '' }} 问题，剧情结构与正典引用健康</span>
      </div>

      <div v-else class="issues-list">
        <div
          v-for="(issue, idx) in diagStore.filteredIssues"
          :key="idx"
          class="issue-card"
          :class="`severity-${issue.severity}`"
          @click="handleJump(issue)"
        >
          <div class="issue-card-top">
            <div class="issue-type-group">
              <AlertCircle v-if="issue.severity === 'error'" :size="13" class="issue-icon error-icon" />
              <AlertTriangle v-else-if="issue.severity === 'warning'" :size="13" class="issue-icon warning-icon" />
              <Info v-else :size="13" class="issue-icon info-icon" />
              <span class="issue-code">{{ issue.code }}</span>
            </div>
            <span v-if="issue.entityType === 'scene' || issue.entityType === 'block'" class="jump-hint">
              <span>定位场景</span>
              <ArrowRight :size="11" />
            </span>
          </div>

          <p class="issue-msg">{{ issue.message }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diagnostics-panel {
  display: flex;
  flex-direction: column;
  background: var(--bg-surface, #1e1e24);
  border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  max-height: 280px;
}

.panel-header {
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06));
}

.header-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-icon {
  color: var(--accent-primary, #6366f1);
}

.header-title-group h4 {
  font-size: 12px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary, #f3f4f6);
}

.refresh-btn {
  background: none;
  border: none;
  color: var(--text-muted, #9ca3af);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.refresh-btn:hover:not(:disabled) {
  color: var(--text-primary, #ffffff);
  background: rgba(255, 255, 255, 0.05);
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-tabs {
  display: flex;
  gap: 4px;
}

.filter-btn {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06));
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--text-muted, #9ca3af);
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-btn.active {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #ffffff);
  font-weight: 500;
}

.diag-loading,
.diag-empty {
  padding: 20px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted, #9ca3af);
}

.success-icon {
  color: #34d399;
}

.issues-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.issue-card {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06));
  border-radius: 6px;
  padding: 8px 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.issue-card:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.15);
}

.issue-card.severity-error {
  border-left: 3px solid #ef4444;
}

.issue-card.severity-warning {
  border-left: 3px solid #f59e0b;
}

.issue-card.severity-info {
  border-left: 3px solid #3b82f6;
}

.issue-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.issue-type-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.error-icon {
  color: #ef4444;
}

.warning-icon {
  color: #f59e0b;
}

.info-icon {
  color: #3b82f6;
}

.issue-code {
  font-family: monospace;
  font-size: 11px;
  color: var(--text-secondary, #d1d5db);
  font-weight: 600;
}

.jump-hint {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  color: var(--accent-primary, #818cf8);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.issue-card:hover .jump-hint {
  opacity: 1;
}

.issue-msg {
  font-size: 12px;
  color: var(--text-primary, #f3f4f6);
  margin: 0 0 2px;
  line-height: 1.4;
}

.spin {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
