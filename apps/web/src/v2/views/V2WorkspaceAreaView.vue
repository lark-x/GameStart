<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import V2StatusRail from "../components/V2StatusRail.vue";
import V2ToastNotification from "../components/V2ToastNotification.vue";
import V2WorkspacePanel from "../components/V2WorkspacePanel.vue";
import { useV2WorkspaceStore } from "../stores/workspace";

const route = useRoute();
const store = useV2WorkspaceStore();
const areas = new Set(["canon", "graph", "review", "assets", "release", "player", "operations"]);
const currentArea = computed(() => {
  const value = typeof route.params.area === "string" ? route.params.area : "canon";
  return areas.has(value) ? value : "canon";
});
</script>

<template>
  <div class="v2-workspace-area" :aria-label="`${currentArea} 工作区`">
    <div class="v2-workspace-content">
      <V2WorkspacePanel
        :area="currentArea"
        :snapshot="store.snapshot"
        :loading="store.loading"
        v-model:draft-world-name="store.draftWorldName"
        v-model:draft-premise="store.draftPremise"
        v-model:expected-revision="store.expectedRevision"
        :conflict="store.conflict"
        :has-draft-changes="store.hasDraftChanges"
        v-model:generation-prompt="store.generationPrompt"
        v-model:reviewer="store.reviewer"
        v-model:review-reason="store.reviewReason"
        :generation-message="store.generationMessage"
        :review-message="store.reviewMessage"
        :can-review-candidate="store.canReviewCandidate"
        v-model:asset-prompt="store.assetPrompt"
        v-model:asset-review-reason="store.assetReviewReason"
        :asset-message="store.assetMessage"
        :asset-review-message="store.assetReviewMessage"
        :can-review-asset-candidate="store.canReviewAssetCandidate"
        v-model:save-label="store.saveLabel"
        v-model:export-format="store.exportFormat"
        :release-message="store.releaseMessage"
        :player-message="store.playerMessage"
        :export-message="store.exportMessage"
        :release-ready="store.releaseReady"
        @preview-canon-draft="store.previewCanonDraft"
        @reset-canon-draft="store.resetCanonDraft"
        @create-generation-job="store.createGenerationJob"
        @review-candidate="store.reviewCandidate"
        @create-asset-job="store.createAssetJob"
        @review-asset-candidate="store.reviewAssetCandidate"
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

.v2-workspace-content {
  min-width: 0;
}

@media (max-width: 960px) {
  .v2-workspace-area {
    grid-template-columns: 1fr;
  }
}
</style>
