<script setup lang="ts">
import { computed } from "vue";
import { Boxes, FileCheck2, GitFork, PlayCircle, Sparkles } from "@lucide/vue";

import Badge from "../../components/ui/Badge.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import type { V2WorkspaceSnapshot } from "../adapters";

const props = defineProps<{
  area: string;
  snapshot: V2WorkspaceSnapshot | null;
  loading: boolean;
}>();

const areaMeta = computed(() => {
  switch (props.area) {
    case "canon":
      return { icon: Boxes, title: "Canon Workspace", badge: "workspace revision" };
    case "graph":
      return { icon: GitFork, title: "Narrative Graph", badge: "scene graph" };
    case "review":
      return { icon: Sparkles, title: "Candidate Review", badge: "pending candidate" };
    case "release":
      return { icon: FileCheck2, title: "Release Desk", badge: "preflight" };
    case "player":
      return { icon: PlayCircle, title: "Player Runtime", badge: "save bound" };
    default:
      return { icon: Boxes, title: "Operations", badge: "status" };
  }
});
</script>

<template>
  <section class="v2-workspace-panel" :aria-labelledby="`v2-${area}-title`">
    <div class="v2-panel-head">
      <div class="v2-panel-title">
        <component :is="areaMeta.icon" :size="20" aria-hidden="true" />
        <div>
          <p class="v2-panel-kicker">{{ area }}</p>
          <h2 :id="`v2-${area}-title`">{{ areaMeta.title }}</h2>
        </div>
      </div>
      <Badge tone="neutral">{{ areaMeta.badge }}</Badge>
    </div>

    <div v-if="loading" class="v2-loading" role="status" aria-live="polite">
      Loading V2 workspace snapshot
    </div>

    <EmptyState
      v-else-if="!snapshot"
      title="No V2 snapshot loaded"
      description="Use refresh to load the typed adapter snapshot."
    >
      <template #icon>
        <Boxes :size="24" aria-hidden="true" />
      </template>
    </EmptyState>

    <div v-else class="v2-panel-grid">
      <article class="v2-metric">
        <span>Workspace</span>
        <strong>{{ snapshot.world.name }}</strong>
        <small>revision {{ snapshot.world.revision }}</small>
      </article>
      <article class="v2-metric">
        <span>Graph</span>
        <strong>{{ snapshot.sceneGraph.scenes.length }} scene</strong>
        <small>entry {{ snapshot.sceneGraph.entrySceneId }}</small>
      </article>
      <article class="v2-metric">
        <span>Candidate</span>
        <strong>{{ snapshot.candidate.status }}</strong>
        <small>{{ snapshot.candidate.provenance.source }} source</small>
      </article>
      <article class="v2-metric">
        <span>Runtime</span>
        <strong>{{ snapshot.run.releaseVersion }}</strong>
        <small>{{ snapshot.run.currentSceneId }}</small>
      </article>
    </div>
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
  align-items: start;
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
  color: var(--text-strong);
  font-size: var(--text-xl);
  line-height: 1.2;
}

.v2-panel-kicker {
  margin-bottom: var(--space-1);
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.v2-panel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  gap: var(--space-3);
}

.v2-metric {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
}

.v2-metric span {
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: 800;
  text-transform: uppercase;
}

.v2-metric strong {
  overflow-wrap: anywhere;
  color: var(--text-strong);
  font-size: var(--text-lg);
}

.v2-metric small {
  overflow-wrap: anywhere;
  color: var(--muted);
  font-size: var(--text-sm);
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
