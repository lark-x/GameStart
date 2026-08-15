<script setup lang="ts">
import { ref, computed } from "vue";
import { AlertCircle, CheckCircle2, ArrowRight } from "@lucide/vue";
import Badge from "../../../components/ui/Badge.vue";
import type { V2WorkspaceSnapshot } from "../../adapters";

const props = defineProps<{
  snapshot: V2WorkspaceSnapshot;
  loading: boolean;
}>();

const selectedSceneId = ref<string | null>(
  props.snapshot.sceneGraph.scenes[0]?.sceneId ?? null
);

const selectedScene = computed(() => {
  return props.snapshot.sceneGraph.scenes.find(s => s.sceneId === selectedSceneId.value) || props.snapshot.sceneGraph.scenes[0];
});

const diagnostics = computed(() => props.snapshot.sceneGraph.diagnostics);
const hasErrors = computed(() => diagnostics.value.some(d => d.severity === 'danger'));

function formatValue(value: boolean | number | string) {
  return typeof value === "boolean" ? (value ? "是" : "否") : String(value);
}

function severityTone(severity: string): "danger" | "warning" | "info" {
  if (severity === "danger" || severity === "error") return "danger";
  if (severity === "warning") return "warning";
  return "info";
}
</script>

<template>
  <div class="graph-workspace">
    <!-- Diagnostics Banner -->
    <div class="diagnostics-summary" :class="{ 'has-errors': hasErrors }">
      <div class="diag-icon">
        <AlertCircle v-if="diagnostics.length > 0" :size="20" />
        <CheckCircle2 v-else :size="20" />
      </div>
      <div class="diag-text">
        <strong>结构诊断检查</strong>
        <span v-if="diagnostics.length === 0">所有场景可达且分支逻辑完整，未发现结构冲突。</span>
        <span v-else>检测到 {{ diagnostics.length }} 个待处理项（{{ diagnostics.filter(d => d.severity === 'danger').length }} 个严重阻断）。</span>
      </div>
      <Badge :tone="diagnostics.length === 0 ? 'success' : hasErrors ? 'danger' : 'warning'">
        {{ diagnostics.length === 0 ? '正常' : `${diagnostics.length} 项诊断` }}
      </Badge>
    </div>

    <div v-if="diagnostics.length > 0" class="diagnostics-list">
      <article
        v-for="diag in diagnostics"
        :key="`${diag.code}-${diag.targetId}`"
        class="diag-item"
      >
        <Badge :tone="severityTone(diag.severity)">{{ diag.code }}</Badge>
        <span class="diag-target">目标: {{ diag.targetId }}</span>
        <p class="diag-msg">{{ diag.message }}</p>
      </article>
    </div>

    <!-- Main Visual Split: Graph Flow & Detail Inspector -->
    <div class="graph-layout">
      <!-- Visual Scene Flow Column -->
      <div class="scenes-tree-container">
        <div class="tree-header">
          <h4>场景剧情节点图 ({{ snapshot.sceneGraph.scenes.length }})</h4>
          <span class="sub">点击节点查看详细状态与分支走向</span>
        </div>

        <div class="scenes-flow">
          <div
            v-for="(scene, index) in snapshot.sceneGraph.scenes"
            :key="scene.sceneId"
            class="scene-flow-node"
            :class="{ active: selectedScene?.sceneId === scene.sceneId, unreachable: !scene.reachable }"
            @click="selectedSceneId = scene.sceneId"
          >
            <div class="node-indicator">
              <span class="step-num">{{ index + 1 }}</span>
              <div v-if="index < snapshot.sceneGraph.scenes.length - 1" class="node-line"></div>
            </div>

            <div class="node-content">
              <div class="node-header">
                <strong>{{ scene.title }}</strong>
                <Badge :tone="scene.reachable ? 'success' : 'warning'">
                  {{ scene.reachable ? "可达" : "不可达" }}
                </Badge>
              </div>
              <div class="node-meta">
                <span class="scene-id">{{ scene.sceneId }}</span>
                <span class="choices-count">{{ scene.choiceCount }} 个分支选项</span>
              </div>
              <div v-if="scene.stateDeltaPreview.length > 0" class="state-pills">
                <span v-for="d in scene.stateDeltaPreview" :key="d.key" class="state-pill">
                  {{ d.key }}: {{ formatValue(d.before) }} → {{ formatValue(d.after) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Scene Detail Inspector Column -->
      <div v-if="selectedScene" class="scene-inspector">
        <div class="inspector-header">
          <div class="title-wrap">
            <span class="kicker">节点详情检查器</span>
            <h3>{{ selectedScene.title }}</h3>
            <span class="scene-key">ID: {{ selectedScene.sceneId }}</span>
          </div>
          <Badge :tone="selectedScene.reachable ? 'success' : 'warning'">
            {{ selectedScene.reachable ? "可到达节点" : "孤立节点" }}
          </Badge>
        </div>

        <!-- State Transitions Preview -->
        <div class="inspector-section">
          <h5>类型化状态变更预览 (State Delta)</h5>
          <div v-if="selectedScene.stateDeltaPreview.length === 0" class="empty-state-notice">
            本场景节点不改变任何剧情变量。
          </div>
          <div v-else class="delta-list">
            <div v-for="delta in selectedScene.stateDeltaPreview" :key="delta.key" class="delta-row">
              <span class="var-name">{{ delta.key }}</span>
              <div class="var-flow">
                <span class="val before">{{ formatValue(delta.before) }}</span>
                <ArrowRight :size="12" />
                <span class="val after">{{ formatValue(delta.after) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Global Typed State Summary -->
        <div class="inspector-section">
          <h5>全局变量表 (Variables)</h5>
          <div class="variables-table">
            <div v-for="v in snapshot.typedState.variables" :key="v.key" class="var-card">
              <span class="var-label">{{ v.label }}</span>
              <span class="var-val">{{ formatValue(v.value) }}</span>
              <span class="var-type">({{ v.type }})</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-workspace {
  display: grid;
  gap: var(--space-4);
}

.diagnostics-summary {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.diagnostics-summary.has-errors {
  background: #fef2f2;
  border-color: #fecaca;
}

.diag-icon {
  color: var(--primary);
  display: grid;
  place-items: center;
}

.diagnostics-summary.has-errors .diag-icon {
  color: #dc2626;
}

.diag-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.diag-text strong {
  font-size: var(--text-sm);
  color: var(--text-strong);
}

.diag-text span {
  font-size: var(--text-xs);
  color: var(--muted);
}

.diagnostics-list {
  display: grid;
  gap: var(--space-2);
}

.diag-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
}

.diag-target {
  color: var(--muted);
  font-family: monospace;
}

.diag-msg {
  margin: 0;
  color: var(--text);
  flex: 1;
}

.graph-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.scenes-tree-container {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.tree-header h4 {
  margin: 0;
  font-size: var(--text-md);
  color: var(--text-strong);
}

.tree-header .sub {
  font-size: var(--text-xs);
  color: var(--muted);
}

.scenes-flow {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.scene-flow-node {
  display: flex;
  gap: var(--space-3);
  cursor: pointer;
  position: relative;
}

.node-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 24px;
}

.step-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--surface);
  border: 2px solid var(--border);
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--text);
  z-index: 2;
  transition: all 0.2s ease;
}

.scene-flow-node.active .step-num {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.node-line {
  flex: 1;
  width: 2px;
  background: var(--border);
  min-height: 20px;
}

.node-content {
  flex: 1;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  transition: all 0.15s ease;
}

.scene-flow-node:hover .node-content {
  border-color: var(--border-strong);
}

.scene-flow-node.active .node-content {
  border-color: var(--primary);
  box-shadow: var(--shadow-sm);
}

.node-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
}

.node-header strong {
  font-size: var(--text-sm);
  color: var(--text-strong);
}

.node-meta {
  display: flex;
  gap: var(--space-3);
  font-size: var(--text-xs);
  color: var(--muted);
  margin-top: 4px;
}

.scene-id {
  font-family: monospace;
}

.state-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: var(--space-2);
}

.state-pill {
  font-size: 11px;
  padding: 1px 6px;
  background: #f0fdf4;
  color: #15803d;
  border-radius: var(--radius-xs);
  border: 1px solid #bbf7d0;
}

.scene-inspector {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.inspector-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 1px solid var(--border);
  padding-bottom: var(--space-3);
}

.kicker {
  font-size: var(--text-xs);
  color: var(--primary);
  font-weight: 700;
  text-transform: uppercase;
}

.title-wrap h3 {
  margin: 2px 0;
  font-size: var(--text-lg);
  color: var(--text-strong);
}

.scene-key {
  font-size: var(--text-xs);
  color: var(--muted);
  font-family: monospace;
}

.inspector-section h5 {
  margin: 0 0 var(--space-2) 0;
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  color: var(--muted);
}

.empty-state-notice {
  font-size: var(--text-xs);
  color: var(--muted);
  padding: var(--space-2);
}

.delta-list {
  display: grid;
  gap: var(--space-2);
}

.delta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
}

.var-name {
  font-weight: 600;
  color: var(--text-strong);
}

.var-flow {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.val {
  padding: 1px 6px;
  border-radius: var(--radius-xs);
}

.val.before {
  background: #f1f5f9;
  color: #64748b;
}

.val.after {
  background: #dcfce7;
  color: #15803d;
  font-weight: 600;
}

.variables-table {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: var(--space-2);
}

.var-card {
  display: flex;
  flex-direction: column;
  padding: var(--space-2);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
}

.var-label {
  color: var(--muted);
}

.var-val {
  font-weight: 700;
  color: var(--text-strong);
  margin-top: 2px;
}

.var-type {
  font-size: 10px;
  color: var(--muted);
}

@media (max-width: 768px) {
  .graph-layout {
    grid-template-columns: 1fr;
  }
}
</style>
