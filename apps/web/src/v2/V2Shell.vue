<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Boxes, FileCheck2, GitFork, Globe2, Image as ImageIcon, PlayCircle, Radio, Sparkles } from "@lucide/vue";

import Button from "../components/ui/Button.vue";
import { useV2WorkspaceStore } from "./stores/workspace";
import V2StatusRail from "./components/V2StatusRail.vue";
import V2WorkspacePanel from "./components/V2WorkspacePanel.vue";
import { setV2Locale, t, v2Locale } from "./locale";

type V2Area = "canon" | "graph" | "review" | "assets" | "release" | "player" | "operations";

const areas: readonly { value: V2Area; label: string; icon: typeof Boxes }[] = [
  { value: "canon", label: "Canon", icon: Boxes },
  { value: "graph", label: "Graph", icon: GitFork },
  { value: "review", label: "Review", icon: Sparkles },
  { value: "assets", label: "Assets", icon: ImageIcon },
  { value: "release", label: "Release", icon: FileCheck2 },
  { value: "player", label: "Player", icon: PlayCircle },
  { value: "operations", label: "Ops", icon: Radio },
] as const;

const store = useV2WorkspaceStore();
const currentArea = ref<V2Area>("canon");

const allowMock = import.meta.env.VITE_V2_ENABLE_MOCK === "true";
const localizedAreas = computed(() => areas.map((area) => ({ ...area, label: t(`area.${area.value}` as keyof typeof import("./locale").v2Messages) })));
const localizedActiveAreaLabel = computed(() => localizedAreas.value.find((area) => area.value === currentArea.value)?.label ?? t("area.canon"));
function toggleLocale(): void { setV2Locale(v2Locale.value === "en" ? "zh-CN" : "en"); }

onMounted(() => {
  void store.loadSnapshot();
});
</script>

<template>
  <section class="page v2-shell" aria-labelledby="v2-title">
    <header class="v2-shell-header">
      <div class="v2-shell-title">
        <span class="v2-mode-pill"><Radio :size="15" aria-hidden="true" />{{ t("app.product") }}</span>
        <h1 id="v2-title">{{ t("app.title") }}</h1>
        <p>{{ t("app.description") }}</p>
      </div>
      <div class="v2-shell-actions">
        <Button variant="secondary" size="md" :aria-label="t('action.switchLanguage')" @click="toggleLocale"><Globe2 :size="17" aria-hidden="true" />{{ v2Locale === "en" ? "\u4e2d\u6587" : "English" }}</Button>
        <Button variant="primary" size="md" :loading="store.loading" @click="store.loadSnapshot">{{ t("action.refresh") }}</Button>
        <Button v-if="store.mode === 'http' && !store.hasSnapshot" variant="secondary" size="md" :loading="store.loading" @click="store.bootstrapWorkspace">{{ t("action.createWorld") }}</Button>
      </div>
    </header>

    <div class="v2-shell-layout">
      <main class="v2-workspace-main" :aria-label="`${localizedActiveAreaLabel} ${t('label.workspace')}`">
        <div class="v2-area-tabs" role="tablist" :aria-label="t('label.workspaceAreas')">
          <Button
            v-for="area in localizedAreas"
            :key="area.value"
            class="v2-area-tab"
            variant="secondary"
            size="md"
            role="tab"
            :aria-selected="currentArea === area.value"
            :aria-controls="`v2-${area.value}-panel`"
            :tabindex="currentArea === area.value ? 0 : -1"
            @click="currentArea = area.value"
          >
            <component :is="area.icon" :size="17" aria-hidden="true" />
            <span>{{ area.label }}</span>
          </Button>
        </div>

        <div :id="`v2-${currentArea}-panel`" role="tabpanel">
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
      </main>

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
        :allow-mock="allowMock"
        @refresh="store.loadSnapshot"
        @switch-mode="store.setMode"
      />
    </div>
  </section>
</template>

<style scoped>
.v2-shell {
  min-height: 100%;
}

.v2-shell-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-5);
  align-items: end;
  margin-bottom: var(--space-5);
}

.v2-shell-title {
  display: grid;
  gap: var(--space-2);
}

.v2-shell-title h1 {
  color: var(--text-strong);
  font-size: var(--text-2xl);
  line-height: 1.12;
}

.v2-shell-title p {
  max-width: 70ch;
  color: var(--muted);
  font-size: var(--text-md);
  line-height: 1.6;
}

.v2-mode-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  width: fit-content;
  min-height: 30px;
  padding: 0 var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: var(--surface-glass);
  color: var(--muted);
  font-size: var(--text-sm);
  font-weight: 700;
}

.v2-shell-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

.v2-shell-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 320px);
  gap: var(--space-5);
  align-items: start;
}

.v2-workspace-main {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}

.v2-area-tabs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  gap: var(--space-2);
}

.v2-area-tab {
  min-height: 44px;
  padding: 0 var(--space-3);
  font-size: var(--text-sm);
  font-weight: 800;
}

.v2-area-tab[aria-selected="true"] {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary);
}

@media (max-width: 767px) {
  .v2-shell-header {
    grid-template-columns: 1fr;
    padding-top: var(--space-5);
  }

.v2-shell-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

.v2-shell-layout {
    grid-template-columns: 1fr;
  }

  .v2-area-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .v2-area-tab {
    min-height: 42px;
    padding: 0 var(--space-2);
    font-size: var(--text-xs);
  }
}
</style>
