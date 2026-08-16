<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import V2DeferredGenerationView from "../components/workspace/V2DeferredGenerationView.vue";
import V2StatusRail from "../components/V2StatusRail.vue";
import V2ToastNotification from "../components/V2ToastNotification.vue";
import V2WorkspacePanel from "../components/V2WorkspacePanel.vue";
import { useV2WorkspaceStore } from "../stores/workspace";

const route = useRoute();
const store = useV2WorkspaceStore();
const requestedArea = computed(() => typeof route.params.area === "string" ? route.params.area : "project");
const generationArea = computed(() => /^(ai-scene|comfy)-(request|jobs|review)$/.test(requestedArea.value));
const areaAliases: Readonly<Record<string, string>> = {
  project: "overview",
  stories: "overview",
  world: "canon",
  story: "graph",
  "formal-assets": "assets",
  export: "release",
  operations: "overview",
};
const supportedAreas = new Set(["overview", "canon", "graph", "state", "assets", "release", "player"]);
const currentArea = computed(() => {
  const resolved = areaAliases[requestedArea.value] ?? requestedArea.value;
  return supportedAreas.has(resolved) ? resolved : "overview";
});
</script>

<template>
  <div class="v2-workspace-area" :aria-label="`${requestedArea} 工作区`">
    <div class="v2-workspace-content">
      <V2DeferredGenerationView
        v-if="generationArea"
        :area="requestedArea"
        :snapshot="store.snapshot"
      />
      <V2WorkspacePanel
        v-else
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
    <V2ToastNotification />
  </div>
</template>

<style scoped>
.v2-workspace-area {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(250px, 300px);
  gap: var(--space-5);
  align-items: start;
}

.v2-workspace-content { min-width: 0; }

@media (max-width: 960px) {
  .v2-workspace-area { grid-template-columns: 1fr; }
}
</style>
