<script setup lang="ts">
import { computed } from "vue";
import { Boxes, FileCheck2, GitFork, Image as ImageIcon, PlayCircle, Sparkles } from "@lucide/vue";

import Badge from "../../components/ui/Badge.vue";
import type { V2WorkspaceSnapshot } from "../adapters";
import type { V2CandidateReviewAction } from "../adapters/types";

import CanonWorkspace from "./workspace/CanonWorkspace.vue";
import GraphWorkspace from "./workspace/GraphWorkspace.vue";
import StateWorkspace from "./workspace/StateWorkspace.vue";
import ReviewWorkspace from "./workspace/ReviewWorkspace.vue";
import AssetsWorkspace from "./workspace/AssetsWorkspace.vue";
import ReleaseWorkspace from "./workspace/ReleaseWorkspace.vue";
import PlayerWorkspace from "./workspace/PlayerWorkspace.vue";
import ProjectOverviewWorkspace from "./workspace/ProjectOverviewWorkspace.vue";

const props = defineProps<{
  area: string;
  snapshot: V2WorkspaceSnapshot | null;
  loading: boolean;
  draftWorldName: string;
  draftPremise: string;
  conflict: string | null;
  hasDraftChanges: boolean;
  generationPrompt: string;
  generationMessage: string | null;
  reviewer: string;
  reviewReason: string;
  reviewMessage: string | null;
  canReviewCandidate: boolean;
  assetPrompt: string;
  assetReviewReason: string;
  assetMessage: string | null;
  assetReviewMessage: string | null;
  canReviewAssetCandidate: boolean;
  uploadingAsset: boolean;
  manualAssetMessage: string | null;
  saveLabel: string;
  exportFormat: "json" | "markdown";
  releaseMessage: string | null;
  playerMessage: string | null;
  exportMessage: string | null;
  releaseReady: boolean;
}>();

const emit = defineEmits<{
  "update:draftWorldName": [value: string];
  "update:draftPremise": [value: string];
  "update:generationPrompt": [value: string];
  "update:reviewer": [value: string];
  "update:reviewReason": [value: string];
  "update:assetPrompt": [value: string];
  "update:assetReviewReason": [value: string];
  "update:saveLabel": [value: string];
  "update:exportFormat": [value: "json" | "markdown"];
  previewCanonDraft: [];
  resetCanonDraft: [];
  createGenerationJob: [];
  reviewCandidate: [action: V2CandidateReviewAction];
  uploadManualAsset: [input: { readonly file: File; readonly title: string }];
  createAssetJob: [];
  reviewAssetCandidate: [action: V2CandidateReviewAction];
  createRelease: [];
  startRun: [];
  submitChoice: [choiceId: string];
  saveRun: [];
  restoreSave: [];
  exportRelease: [];
}>();

const title = computed(() => {
  switch (props.area) {
    case "canon":
      return "正典世界观 (Canon)";
    case "graph":
      return "故事结构图 (Scene Graph)";
    case "state":
      return "状态变量 (State Schema)";
    case "review":
      return "生成与审核 (Generation & Review)";
    case "assets":
      return "正式素材库 (Formal Assets)";
    case "release":
      return "发布与导出 (Release & Export)";
    case "player":

      return "游玩预览运行时 (Player Preview)";
    default:
      return "工作空间概览 (Overview)";
  }
});
</script>

<template>
  <section class="v2-workspace-panel">
    <div class="v2-panel-head">
      <div class="v2-panel-title">
        <Boxes v-if="area === 'canon'" :size="20" aria-hidden="true" />
        <GitFork v-else-if="area === 'graph'" :size="20" aria-hidden="true" />
        <Sparkles v-else-if="area === 'review'" :size="20" aria-hidden="true" />
        <ImageIcon v-else-if="area === 'assets'" :size="20" aria-hidden="true" />
        <FileCheck2 v-else-if="area === 'release'" :size="20" aria-hidden="true" />
        <PlayCircle v-else-if="area === 'player'" :size="20" aria-hidden="true" />
        <div>
          <p class="v2-panel-kicker">工作区模块</p>
          <h2>{{ title }}</h2>
        </div>
      </div>
      <Badge tone="info">{{ area }}</Badge>
    </div>

    <!-- 1. Canon Area：无快照时也渲染，由组件内部给出空库创建入口 -->
    <CanonWorkspace
      v-if="area === 'canon'"
      :snapshot="snapshot"
      :loading="loading"
      :draft-world-name="draftWorldName"
      :draft-premise="draftPremise"
      :conflict="conflict"
      :has-draft-changes="hasDraftChanges"
      @update:draft-world-name="emit('update:draftWorldName', $event)"
      @update:draft-premise="emit('update:draftPremise', $event)"
      @preview-canon-draft="emit('previewCanonDraft')"
      @reset-canon-draft="emit('resetCanonDraft')"
    />

    <ProjectOverviewWorkspace
      v-else-if="area === 'overview'"
      :snapshot="snapshot"
      :loading="loading"
    />

    <template v-else-if="snapshot">
      <div class="v2-panel-content">
        <!-- 2. Graph Area -->
        <GraphWorkspace
        v-if="area === 'graph'"
        :snapshot="snapshot"
        :loading="loading"
      />
        <StateWorkspace
          v-else-if="area === 'state'"
          :snapshot="snapshot"
          :loading="loading"
        />


      <!-- 3. Review Area -->
      <ReviewWorkspace
        v-else-if="area === 'review'"
        :snapshot="snapshot"
        :loading="loading"
        :generation-prompt="generationPrompt"
        :generation-message="generationMessage"
        :reviewer="reviewer"
        :review-reason="reviewReason"
        :review-message="reviewMessage"
        :can-review-candidate="canReviewCandidate"
        @update:generation-prompt="emit('update:generationPrompt', $event)"
        @update:reviewer="emit('update:reviewer', $event)"
        @update:review-reason="emit('update:reviewReason', $event)"
        @create-generation-job="emit('createGenerationJob')"
        @review-candidate="emit('reviewCandidate', $event)"
      />

      <!-- 4. Assets Area -->
      <AssetsWorkspace
        v-else-if="area === 'assets'"
        :snapshot="snapshot"
        :loading="loading"
        :asset-prompt="assetPrompt"
        :asset-message="assetMessage"
        :asset-review-reason="assetReviewReason"
        :asset-review-message="assetReviewMessage"
        :can-review-asset-candidate="canReviewAssetCandidate"
        :uploading="uploadingAsset"
        :upload-message="manualAssetMessage"
        @update:asset-prompt="emit('update:assetPrompt', $event)"
        @update:asset-review-reason="emit('update:assetReviewReason', $event)"
        @upload-manual-asset="emit('uploadManualAsset', $event)"
        @create-asset-job="emit('createAssetJob')"
        @review-asset-candidate="emit('reviewAssetCandidate', $event)"
      />

      <!-- 5. Release Area -->
      <ReleaseWorkspace
        v-else-if="area === 'release'"
        :snapshot="snapshot"
        :loading="loading"
        :release-ready="releaseReady"
        :release-message="releaseMessage"
        :export-format="exportFormat"
        :export-message="exportMessage"
        @update:export-format="emit('update:exportFormat', $event)"
        @create-release="emit('createRelease')"
        @start-run="emit('startRun')"
        @export-release="emit('exportRelease')"
      />

      <!-- 6. Player Area -->
      <PlayerWorkspace
        v-else-if="area === 'player'"
        :snapshot="snapshot"
        :loading="loading"
        :save-label="saveLabel"
        :player-message="playerMessage"
        @update:save-label="emit('update:saveLabel', $event)"
        @submit-choice="emit('submitChoice', $event)"
        @save-run="emit('saveRun')"
        @restore-save="emit('restoreSave')"
      />

      <ProjectOverviewWorkspace v-else :snapshot="snapshot" :loading="loading" />
      </div>
    </template>

    <ProjectOverviewWorkspace v-else :snapshot="null" :loading="loading" />
  </section>
</template>

<style scoped>
.v2-workspace-panel {
  min-width: 0;
  padding: var(--space-5);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.v2-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.v2-panel-title {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  color: var(--primary);
}

.v2-panel-title h2 {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-xl);
  line-height: 1.2;
}

.v2-panel-kicker {
  margin: 0 0 var(--space-1) 0;
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.v2-loading {
  display: grid;
  place-items: center;
  min-height: 220px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: var(--text-md);
}

@media (max-width: 767px) {
  .v2-workspace-panel {
    padding: var(--space-4);
  }
}
</style>
