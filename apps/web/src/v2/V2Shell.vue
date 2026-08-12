<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Boxes, FileCheck2, GitFork, PlayCircle, Radio, Sparkles } from "@lucide/vue";

import Button from "../components/ui/Button.vue";
import { useV2WorkspaceStore } from "./stores/workspace";
import V2StatusRail from "./components/V2StatusRail.vue";
import V2WorkspacePanel from "./components/V2WorkspacePanel.vue";

type V2Area = "canon" | "graph" | "review" | "release" | "player" | "operations";

const areas: readonly { value: V2Area; label: string; icon: typeof Boxes }[] = [
  { value: "canon", label: "Canon", icon: Boxes },
  { value: "graph", label: "Graph", icon: GitFork },
  { value: "review", label: "Review", icon: Sparkles },
  { value: "release", label: "Release", icon: FileCheck2 },
  { value: "player", label: "Player", icon: PlayCircle },
  { value: "operations", label: "Ops", icon: Radio },
] as const;

const store = useV2WorkspaceStore();
const currentArea = ref<V2Area>("canon");

const activeAreaLabel = computed(
  () => areas.find((area) => area.value === currentArea.value)?.label ?? "Canon",
);

onMounted(() => {
  void store.loadSnapshot();
});
</script>

<template>
  <section class="page v2-shell" aria-labelledby="v2-title">
    <header class="v2-shell-header">
      <div class="v2-shell-title">
        <span class="v2-mode-pill">
          <Radio :size="15" aria-hidden="true" />
          V2 Web Product
        </span>
        <h1 id="v2-title">Creator Game Platform</h1>
        <p>
          Local creator workspace for canon editing, candidate review, immutable release checks, and
          player runtime previews.
        </p>
      </div>
      <Button variant="primary" size="md" :loading="store.loading" @click="store.loadSnapshot">
        Refresh Snapshot
      </Button>
    </header>

    <div class="v2-shell-layout">
      <main class="v2-workspace-main" :aria-label="`${activeAreaLabel} workspace`">
        <div class="v2-area-tabs" role="tablist" aria-label="V2 workspace areas">
          <Button
            v-for="area in areas"
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
            @preview-canon-draft="store.previewCanonDraft"
            @reset-canon-draft="store.resetCanonDraft"
            @create-generation-job="store.createGenerationJob"
            @review-candidate="store.reviewCandidate"
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
