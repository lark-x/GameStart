<script setup lang="ts">
import { PackageCheck, ShieldCheck, Download, Play, Lock } from "@lucide/vue";
import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Field from "../../../components/ui/Field.vue";
import Select from "../../../components/ui/Select.vue";
import type { V2WorkspaceSnapshot } from "../../adapters";

const props = defineProps<{
  snapshot: V2WorkspaceSnapshot;
  loading: boolean;
  releaseReady: boolean;
  releaseMessage: string | null;
  exportFormat: "json" | "markdown";
  exportMessage: string | null;
}>();

const emit = defineEmits<{
  "update:exportFormat": [value: "json" | "markdown"];
  createRelease: [];
  startRun: [];
  exportRelease: [];
}>();

function copyExport() {
  if (props.snapshot.exportBundle?.preview) {
    navigator.clipboard.writeText(props.snapshot.exportBundle.preview);
  }
}
</script>

<template>
  <div class="release-workspace">
    <!-- Validation Checklist Card -->
    <div class="release-card">
      <div class="card-header">
        <div class="header-left">
          <ShieldCheck :size="20" class="icon-accent" />
          <h3>发布前合规与完整性检查</h3>
        </div>
        <Badge :tone="snapshot.release.valid ? 'success' : 'danger'">
          {{ snapshot.release.valid ? '结构校验通过' : '存在阻断问题' }}
        </Badge>
      </div>

      <div class="metrics-row">
        <div class="metric-item">
          <span class="m-label">当前故事空间</span>
          <strong class="m-val">{{ snapshot.world.name }}</strong>
          <span class="m-sub">修订版本 v{{ snapshot.world.revision }}</span>
        </div>

        <div class="metric-item">
          <span class="m-label">场景与分支</span>
          <strong class="m-val">{{ snapshot.sceneGraph.scenes.length }} 个节点</strong>
          <span class="m-sub">{{ snapshot.sceneGraph.diagnostics.length }} 项诊断</span>
        </div>

        <div class="metric-item">
          <span class="m-label">已通过素材</span>
          <strong class="m-val">{{ snapshot.assets.library.length }} 个资产</strong>
          <span class="m-sub">就绪待打包</span>
        </div>
      </div>

      <div class="action-bar">
        <Button
          variant="primary"
          size="md"
          :disabled="!releaseReady || loading"
          :loading="loading"
          @click="emit('createRelease')"
        >
          <Lock :size="16" /> 创建发布版本
        </Button>
        <span v-if="releaseMessage" class="feedback-msg">{{ releaseMessage }}</span>
      </div>
    </div>

    <!-- Active Release Package Info -->
    <div v-if="snapshot.releasePackage" class="release-package-card">
      <div class="pkg-header">
        <div class="pkg-title">
          <PackageCheck :size="20" class="icon-success" />
          <div>
            <h4>发布包：{{ snapshot.releasePackage.version }}</h4>
            <span class="manifest-hash">Hash: {{ snapshot.releasePackage.manifestHash }}</span>
          </div>
        </div>
        <Badge tone="success">已锁定不可变</Badge>
      </div>

      <div class="pkg-body">
        <p class="pkg-desc">此发布版本已封包固化，可安全地分发、离线导出或启动游玩沙箱体验。</p>
        <div class="pkg-actions">
          <Button variant="secondary" size="md" :disabled="loading" @click="emit('startRun')">
            <Play :size="16" /> 启动运行预览
          </Button>
        </div>
      </div>
    </div>

    <!-- Export Section -->
    <div class="export-card">
      <div class="card-header">
        <div class="header-left">
          <Download :size="18" />
          <h3>发布成果物导出</h3>
        </div>
        <Badge tone="neutral">{{ exportFormat.toUpperCase() }}</Badge>
      </div>

      <form class="export-form" @submit.prevent="emit('exportRelease')">
        <div class="export-controls">
          <Field label="导出目标格式" hint="支持导出为程序可解析的标准 JSON，或便于人类阅读的 Markdown 剧本文档。">
            <Select
              :model-value="exportFormat"
              aria-label="导出格式"
              id="v2-export-format"
              @update:model-value="emit('update:exportFormat', $event === 'markdown' ? 'markdown' : 'json')"
            >
              <option value="json">JSON 数据包 (标准引擎互通)</option>
              <option value="markdown">Markdown 交互式剧本文档</option>
            </Select>
          </Field>
          <div class="export-btn-wrap">
            <Button variant="secondary" size="md" type="submit" :loading="loading">
              <Download :size="16" /> 导出
            </Button>
          </div>
        </div>
        <span v-if="exportMessage" class="feedback-msg">{{ exportMessage }}</span>
      </form>

      <!-- Export Result Preview -->
      <div v-if="snapshot.exportBundle" class="export-result">
        <div class="result-header">
          <span class="preview-title">导出预览 ({{ snapshot.exportBundle.format }})</span>
          <Button variant="ghost" size="sm" @click="copyExport">复制内容</Button>
        </div>
        <pre class="preview-code">{{ snapshot.exportBundle.preview }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.release-workspace {
  display: grid;
  gap: var(--space-4);
}

.release-card, .release-package-card, .export-card {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: grid;
  gap: var(--space-3);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.header-left h3 {
  margin: 0;
  font-size: var(--text-md);
  color: var(--text-strong);
}

.icon-accent {
  color: #3b82f6;
}

.icon-success {
  color: #10b981;
}

.metrics-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
}

.metric-item {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.m-label {
  font-size: var(--text-xs);
  color: var(--muted);
}

.m-val {
  font-size: var(--text-md);
  color: var(--text-strong);
}

.m-sub {
  font-size: 11px;
  color: var(--muted);
}

.action-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.feedback-msg {
  font-size: var(--text-xs);
  color: var(--muted);
}

.release-package-card {
  border-left: 4px solid #10b981;
}

.pkg-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.pkg-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.pkg-title h4 {
  margin: 0;
  font-size: var(--text-md);
  color: var(--text-strong);
}

.manifest-hash {
  font-size: var(--text-xs);
  color: var(--muted);
  font-family: monospace;
}

.pkg-desc {
  font-size: var(--text-sm);
  color: var(--text);
  margin: var(--space-2) 0;
}

.export-controls {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-3);
  align-items: flex-end;
}

.export-btn-wrap {
  padding-bottom: 2px;
}

.export-result {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-3);
  background: var(--surface-soft);
  border-bottom: 1px solid var(--border);
}

.preview-title {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--muted);
}

.preview-code {
  margin: 0;
  padding: var(--space-3);
  font-size: var(--text-xs);
  font-family: monospace;
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text);
}

@media (max-width: 640px) {
  .export-controls {
    grid-template-columns: 1fr;
  }
}
</style>
