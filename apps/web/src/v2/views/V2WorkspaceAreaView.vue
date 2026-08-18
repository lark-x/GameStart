<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { AlertCircle } from "@lucide/vue";

import Button from "../../components/ui/Button.vue";
import ModuleTabs, { type ModuleTab } from "../components/layout/ModuleTabs.vue";
import V2DeferredGenerationView from "../components/workspace/V2DeferredGenerationView.vue";
import V2StatusRail from "../components/V2StatusRail.vue";
import V2ToastNotification from "../components/V2ToastNotification.vue";
import V2WorkspacePanel from "../components/V2WorkspacePanel.vue";
import { useV2WorkspaceStore } from "../stores/workspace";

const route = useRoute();
const router = useRouter();
const store = useV2WorkspaceStore();

const requestedArea = computed(() => (typeof route.params.area === "string" ? route.params.area : "project"));
const generationArea = computed(() => /^(ai-scene|comfy)-(request|jobs|review)$/.test(requestedArea.value));

const areaAliases: Readonly<Record<string, string>> = {
  project: "overview",
  stories: "overview",
  world: "canon",
  story: "graph",
  "formal-assets": "assets",
  export: "release",
};

const supportedAreas = new Set(["overview", "canon", "graph", "state", "assets", "release", "player"]);

const currentArea = computed(() => {
  const resolved = areaAliases[requestedArea.value] ?? requestedArea.value;
  return supportedAreas.has(resolved) ? resolved : undefined;
});

const isUnknownArea = computed(() => !generationArea.value && currentArea.value === undefined);

// Tabs for top-level modules
const storyTabs: readonly ModuleTab[] = [
  { label: "总览", to: "/v2/workspace/project", exact: true },
  { label: "世界设定", to: "/v2/workspace/world" },
  { label: "状态与逻辑", to: "/v2/workspace/state" },
  { label: "故事结构", to: "/v2/workspace/story" },
];

const creationTabs: readonly ModuleTab[] = [
  { label: "创建", to: "/v2/workspace/ai-scene-request" },
  { label: "任务", to: "/v2/workspace/ai-scene-jobs" },
  { label: "审核", to: "/v2/workspace/ai-scene-review" },
];

const assetTabs: readonly ModuleTab[] = [
  { label: "素材库", to: "/v2/workspace/formal-assets" },
  { label: "图片生成", to: "/v2/workspace/comfy-request" },
  { label: "任务", to: "/v2/workspace/comfy-jobs" },
  { label: "审核", to: "/v2/workspace/comfy-review" },
];

const releaseTabs: readonly ModuleTab[] = [
  { label: "发布检查", to: "/v2/workspace/release" },
  { label: "运行预览", to: "/v2/workspace/player" },
  { label: "导出", to: "/v2/workspace/export" },
];

const activeTabs = computed<readonly ModuleTab[]>(() => {
  const area = requestedArea.value;
  if (["project", "overview", "stories", "world", "canon", "state", "story", "graph"].includes(area)) {
    return storyTabs;
  }
  if (area.startsWith("ai-scene-") || area === "ai" || area === "review") {
    return creationTabs;
  }
  if (area.startsWith("comfy-") || area === "formal-assets" || area === "assets") {
    return assetTabs;
  }
  if (["release", "player", "export"].includes(area)) {
    return releaseTabs;
  }
  return [];
});
</script>

<template>
  <div class="v2-workspace-container" :aria-label="`${requestedArea} 工作区`">
    <!-- Module Tabs -->
    <ModuleTabs v-if="activeTabs.length" :tabs="activeTabs" />

    <!-- Unknown Area Fallback -->
    <div v-if="isUnknownArea" class="v2-workspace-unknown" role="alert">
      <AlertCircle :size="32" class="v2-unknown-icon" aria-hidden="true" />
      <h2>未找到工作区模块</h2>
      <p>请求的区域 “{{ requestedArea }}” 不存在或已迁移。</p>
      <Button variant="primary" size="md" @click="router.push('/v2/workspace/project')">
        返回项目总览
      </Button>
    </div>

    <!-- Workspace Grid -->
    <div v-else class="v2-workspace-grid">
      <div class="v2-workspace-content">
        <V2DeferredGenerationView
          v-if="generationArea"
          :area="requestedArea"
          :snapshot="store.snapshot"
        />
        <V2WorkspacePanel
          v-else-if="currentArea"
          :area="currentArea"
          :snapshot="store.snapshot"
          :loading="store.loading"
          v-model:draft-world-name="store.draftWorldName"
          v-model:draft-premise="store.draftPremise"
          :conflict="store.conflict"
          :has-draft-changes="store.hasDraftChanges"
          :uploading-asset="store.uploadingAsset"
          :manual-asset-message="store.manualAssetMessage"
          v-model:save-label="store.saveLabel"
          v-model:export-format="store.exportFormat"
          :release-message="store.releaseMessage"
          :player-message="store.playerMessage"
          :export-message="store.exportMessage"
          :release-ready="store.releaseReady"
          @preview-canon-draft="store.previewCanonDraft"
          @reset-canon-draft="store.resetCanonDraft"
          @upload-manual-asset="store.uploadManualAsset"
          @create-release="store.createRelease"
          @start-run="store.startRun"
          @submit-choice="store.submitChoice"
          @save-run="store.saveRun"
          @restore-save="store.restoreSave"
          @export-release="store.exportRelease"
        />
      </div>

      <V2StatusRail
        :snapshot="store.snapshot"
        :loading="store.loading"
        :error="store.error"
        :mode="store.mode"
        :graph-issue-count="store.graphIssueCount"
        :typed-state-preview-count="store.typedStatePreviewCount"
        :candidate-status="store.candidateStatus"
        :asset-candidate-status="store.assetCandidateStatus"
        :asset-library-count="store.assetLibraryCount"
        :current-scene-title="store.currentSceneTitle"
        @refresh="store.loadSnapshot"
      />
    </div>

    <V2ToastNotification />
  </div>
</template>

<style scoped>
.v2-workspace-container {
  width: 100%;
  container-type: inline-size;
}

.v2-workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 300px);
  gap: var(--space-5);
  align-items: start;
}

.v2-workspace-content {
  min-width: 0;
}

.v2-workspace-unknown {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-8);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  text-align: center;
}

.v2-unknown-icon {
  color: var(--warning);
}

.v2-workspace-unknown h2 {
  margin: 0;
  font-size: var(--text-lg);
  color: var(--text-strong);
}

.v2-workspace-unknown p {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-sm);
}

@container (max-width: 1000px) {
  .v2-workspace-grid {
    grid-template-columns: 1fr;
  }
}
</style>
