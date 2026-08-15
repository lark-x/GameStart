<script setup lang="ts">
import { ImageIcon, Sparkles, Check, X, AlertTriangle, Layers } from "@lucide/vue";
import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Field from "../../../components/ui/Field.vue";
import Textarea from "../../../components/ui/Textarea.vue";
import { v2MediaRefToUrl } from "../../adapters";
import type { V2WorkspaceSnapshot } from "../../adapters";
import type { V2CandidateReviewAction } from "../../adapters/types";

defineProps<{
  snapshot: V2WorkspaceSnapshot;
  loading: boolean;
  assetPrompt: string;
  assetMessage: string | null;
  assetReviewReason: string;
  assetReviewMessage: string | null;
  canReviewAssetCandidate: boolean;
}>();

const emit = defineEmits<{
  "update:assetPrompt": [value: string];
  "update:assetReviewReason": [value: string];
  createAssetJob: [];
  reviewAssetCandidate: [action: V2CandidateReviewAction];
}>();

function mediaUrl(mediaRef: string): string | undefined {
  const env = (import.meta as ImportMeta & { readonly env?: Record<string, string | undefined> }).env ?? {};
  return v2MediaRefToUrl(mediaRef, env.VITE_API_BASE || window.location.origin);
}

function statusLabel(status: string): string {
  return {
    none: "无",
    idle: "空闲",
    queued: "排队中",
    running: "执行中",
    succeeded: "已完成",
    approved: "已通过",
    pending: "待审核",
    changes_requested: "要求修改",
    rejected: "已驳回",
    failed: "失败",
  }[status] ?? status;
}

function assetKindLabel(kind: string): string {
  return {
    scene_background: "场景背景",
    character_sprite: "角色立绘",
    item: "道具",
    audio: "背景音乐/音效",
  }[kind] ?? kind;
}
</script>

<template>
  <div class="assets-workspace">
    <!-- Generation Trigger Box -->
    <div class="asset-gen-box">
      <div class="gen-header">
        <div class="gen-title">
          <ImageIcon :size="18" class="icon-accent" />
          <h3>ComfyUI / 资产生成控制台</h3>
        </div>
        <div class="gen-badges">
          <Badge tone="info">{{ snapshot.assets.workflowName }}</Badge>
          <Badge :tone="snapshot.assets.job?.status === 'running' ? 'info' : 'neutral'">
            {{ statusLabel(snapshot.assets.job?.status ?? "idle") }}
          </Badge>
        </div>
      </div>

      <form class="gen-form" @submit.prevent="emit('createAssetJob')">
        <Field label="素材提示词 (Prompt)" hint="生成的视觉/音频资产将先进入候选审核，合格后并入发布素材库。">
          <Textarea
            :model-value="assetPrompt"
            :disabled="loading"
            id="v2-asset-prompt"
            aria-label="素材提示词"
            :rows="3"
            placeholder="输入角色立绘、差分表情或背景美术的画面描述与风格词..."
            @update:model-value="emit('update:assetPrompt', $event)"
          />
        </Field>
        <div class="form-actions">
          <Button variant="primary" size="md" type="submit" :loading="loading">
            <Sparkles :size="16" /> 创建素材任务
          </Button>
          <span v-if="assetMessage" class="feedback-msg">{{ assetMessage }}</span>
        </div>
      </form>
    </div>

    <!-- Asset Candidate Review Card -->
    <div v-if="snapshot.assets.candidate && snapshot.assets.job" class="candidate-box">
      <div class="candidate-header">
        <div class="meta-title">
          <Badge tone="warning">待审素材候选</Badge>
          <h4>{{ snapshot.assets.candidate.title }}</h4>
          <span class="sub-hash">工作流: {{ snapshot.assets.job.workflowVersion }} · Seed: {{ snapshot.assets.job.seed }}</span>
        </div>

        <div class="review-controls">
          <Field label="审核意见">
            <Textarea
              :model-value="assetReviewReason"
              :disabled="loading || !canReviewAssetCandidate"
              id="v2-asset-review-reason"
              aria-label="素材审核意见"
              placeholder="填写素材修改建议或通过意见..."
              :rows="2"
              @update:model-value="emit('update:assetReviewReason', $event)"
            />
          </Field>
          <div class="action-buttons">
            <Button
              variant="primary"
              size="sm"
              :disabled="!canReviewAssetCandidate"
              :loading="loading"
              @click="emit('reviewAssetCandidate', 'approve')"
            >
              <Check :size="14" /> 通过素材
            </Button>
            <Button
              variant="secondary"
              size="sm"
              :disabled="!canReviewAssetCandidate || loading"
              @click="emit('reviewAssetCandidate', 'request_changes')"
            >
              <AlertTriangle :size="14" /> 要求重绘
            </Button>
            <Button
              variant="danger"
              size="sm"
              :disabled="!canReviewAssetCandidate || loading"
              @click="emit('reviewAssetCandidate', 'reject')"
            >
              <X :size="14" /> 驳回
            </Button>
          </div>
          <span v-if="assetReviewMessage" class="feedback-msg highlight">{{ assetReviewMessage }}</span>
        </div>
      </div>

      <!-- Asset Preview & Provenance -->
      <div class="preview-layout">
        <div class="asset-image-container">
          <img
            v-if="mediaUrl(snapshot.assets.candidate.mediaRef)"
            class="asset-image"
            :src="mediaUrl(snapshot.assets.candidate.mediaRef)"
            :alt="snapshot.assets.candidate.title"
          />
          <div v-else class="image-placeholder">
            <ImageIcon :size="32" />
            <span>{{ snapshot.assets.candidate.mediaRef }}</span>
          </div>
        </div>

        <div class="provenance-details">
          <h5>校验说明与来源归属</h5>
          <p class="summary-text">{{ snapshot.assets.candidate.provenanceSummary }}</p>
          <ul v-if="snapshot.assets.candidate.validationNotes.length > 0" class="notes-list">
            <li v-for="note in snapshot.assets.candidate.validationNotes" :key="note">{{ note }}</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Asset Library Grid -->
    <div class="library-section">
      <div class="library-header">
        <h4><Layers :size="16" /> 已通过素材库 ({{ snapshot.assets.library.length }})</h4>
        <span class="sub">包含已通过审查并可直接用于场景播放的美术/音频资产</span>
      </div>

      <div v-if="snapshot.assets.library.length === 0" class="empty-lib">
        暂无通过审核的素材，生成并通过素材审核后将归档至此。
      </div>

      <div v-else class="library-grid">
        <article v-for="asset in snapshot.assets.library" :key="asset.assetId" class="lib-card">
          <div class="lib-img-wrap">
            <img
              v-if="mediaUrl(asset.mediaRef)"
              :src="mediaUrl(asset.mediaRef)"
              :alt="asset.title"
              class="lib-img"
            />
            <div v-else class="lib-img-fallback">
              <ImageIcon :size="24" />
            </div>
            <span class="kind-tag">{{ assetKindLabel(asset.kind) }}</span>
          </div>
          <div class="lib-info">
            <strong>{{ asset.title }}</strong>
            <span class="lib-seed">Seed: {{ asset.seed }}</span>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.assets-workspace {
  display: grid;
  gap: var(--space-4);
}

.asset-gen-box {
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

.icon-accent {
  color: #3b82f6;
}

.gen-badges {
  display: flex;
  gap: var(--space-2);
}

.gen-form {
  display: grid;
  gap: var(--space-3);
}

.form-actions {
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

.candidate-box {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: grid;
  gap: var(--space-4);
}

.candidate-header {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
  border-bottom: 1px solid var(--border);
  padding-bottom: var(--space-3);
}

.meta-title h4 {
  margin: var(--space-1) 0;
  font-size: var(--text-md);
  color: var(--text-strong);
}

.sub-hash {
  font-size: var(--text-xs);
  color: var(--muted);
  font-family: monospace;
}

.review-controls {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.action-buttons {
  display: flex;
  gap: var(--space-2);
}

.preview-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: var(--space-4);
}

.asset-image-container {
  width: 100%;
  height: 180px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  display: grid;
  place-items: center;
}

.asset-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  color: var(--muted);
  font-size: var(--text-xs);
  padding: var(--space-2);
  text-align: center;
  word-break: break-all;
}

.provenance-details h5 {
  margin: 0 0 var(--space-2) 0;
  font-size: var(--text-xs);
  text-transform: uppercase;
  color: var(--muted);
}

.summary-text {
  font-size: var(--text-sm);
  color: var(--text);
  margin: 0 0 var(--space-2) 0;
}

.notes-list {
  margin: 0;
  padding-left: var(--space-4);
  font-size: var(--text-xs);
  color: var(--muted);
}

.library-section {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: grid;
  gap: var(--space-3);
}

.library-header h4 {
  margin: 0;
  font-size: var(--text-md);
  color: var(--text-strong);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.library-header .sub {
  font-size: var(--text-xs);
  color: var(--muted);
}

.empty-lib {
  font-size: var(--text-xs);
  color: var(--muted);
  padding: var(--space-3);
  text-align: center;
}

.library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--space-3);
}

.lib-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.lib-img-wrap {
  width: 100%;
  height: 120px;
  background: #f1f5f9;
  position: relative;
}

.lib-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.lib-img-fallback {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: #94a3b8;
}

.kind-tag {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
}

.lib-info {
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lib-info strong {
  font-size: var(--text-xs);
  color: var(--text-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lib-seed {
  font-size: 10px;
  color: var(--muted);
}

@media (max-width: 768px) {
  .candidate-header, .preview-layout {
    grid-template-columns: 1fr;
  }
}
</style>
