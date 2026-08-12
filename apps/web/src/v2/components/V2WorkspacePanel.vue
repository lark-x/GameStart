<script setup lang="ts">
import { computed } from "vue";
import { Boxes, FileCheck2, GitFork, PlayCircle, Sparkles } from "@lucide/vue";

import Badge from "../../components/ui/Badge.vue";
import Button from "../../components/ui/Button.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import Field from "../../components/ui/Field.vue";
import Input from "../../components/ui/Input.vue";
import Textarea from "../../components/ui/Textarea.vue";
import type { V2WorkspaceSnapshot } from "../adapters";
import type { V2CandidateReviewAction } from "../adapters/types";

const props = defineProps<{
  area: string;
  snapshot: V2WorkspaceSnapshot | null;
  loading: boolean;
  draftWorldName: string;
  draftPremise: string;
  expectedRevision: number;
  conflict: string | null;
  hasDraftChanges: boolean;
  generationPrompt: string;
  generationMessage: string | null;
  reviewer: string;
  reviewReason: string;
  reviewMessage: string | null;
  canReviewCandidate: boolean;
}>();

const emit = defineEmits<{
  "update:draftWorldName": [value: string];
  "update:draftPremise": [value: string];
  "update:expectedRevision": [value: number];
  "update:generationPrompt": [value: string];
  "update:reviewer": [value: string];
  "update:reviewReason": [value: string];
  previewCanonDraft: [];
  resetCanonDraft: [];
  createGenerationJob: [];
  reviewCandidate: [action: V2CandidateReviewAction];
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

const statusTone = {
  info: "info",
  warning: "warning",
  danger: "danger",
} as const;

function formatValue(value: boolean | number | string) {
  return typeof value === "boolean" ? (value ? "true" : "false") : String(value);
}
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
      <template v-if="area === 'canon'">
        <form class="v2-canon-form" aria-label="Canon draft preview" @submit.prevent="emit('previewCanonDraft')">
          <Field label="World name" hint="Preview-only mock edit with optimistic revision guard.">
            <Input
              :model-value="draftWorldName"
              :disabled="loading"
              id="v2-world-name"
              aria-label="World name"
              @update:model-value="emit('update:draftWorldName', $event)"
            />
          </Field>
          <Field label="Premise">
            <Textarea
              :model-value="draftPremise"
              :disabled="loading"
              id="v2-world-premise"
              aria-label="Premise"
              :rows="4"
              @update:model-value="emit('update:draftPremise', $event)"
            />
          </Field>
          <Field v-if="conflict" label="Expected revision" :error="conflict">
            <Input
              :model-value="expectedRevision"
              :disabled="loading"
              id="v2-expected-revision"
              type="number"
              aria-label="Expected revision"
              @update:model-value="emit('update:expectedRevision', Number($event))"
            />
          </Field>
          <Field v-else label="Expected revision">
            <Input
              :model-value="expectedRevision"
              :disabled="loading"
              id="v2-expected-revision"
              type="number"
              aria-label="Expected revision"
              @update:model-value="emit('update:expectedRevision', Number($event))"
            />
          </Field>
          <div class="v2-form-actions">
            <Button variant="primary" size="md" type="submit" :disabled="!hasDraftChanges || loading">
              Preview Revision
            </Button>
            <Button variant="secondary" size="md" :disabled="loading" @click="emit('resetCanonDraft')">
              Reset Draft
            </Button>
          </div>
        </form>

        <div class="v2-list-grid" aria-label="Canon facts and rules">
          <article class="v2-metric">
            <span>Characters</span>
            <strong>{{ snapshot.world.characters.length }}</strong>
            <small>{{ snapshot.world.characters.map((character) => character.name).join(", ") }}</small>
          </article>
          <article class="v2-metric">
            <span>Locations</span>
            <strong>{{ snapshot.world.locations.length }}</strong>
            <small>{{ snapshot.world.locations.map((location) => location.name).join(", ") }}</small>
          </article>
          <article v-for="fact in snapshot.world.facts" :key="fact.factId" class="v2-record">
            <Badge :tone="fact.visibility === 'creator' ? 'warning' : 'info'">{{ fact.visibility }}</Badge>
            <p>{{ fact.text }}</p>
          </article>
          <article v-for="rule in snapshot.world.rules" :key="rule.ruleId" class="v2-record">
            <Badge :tone="rule.severity === 'hard' ? 'danger' : 'neutral'">{{ rule.severity }}</Badge>
            <p>{{ rule.text }}</p>
          </article>
        </div>
      </template>

      <template v-else-if="area === 'graph'">
        <div class="v2-list-grid">
          <article v-for="scene in snapshot.sceneGraph.scenes" :key="scene.sceneId" class="v2-record">
            <div class="v2-record-head">
              <strong>{{ scene.title }}</strong>
              <Badge :tone="scene.reachable ? 'success' : 'warning'">
                {{ scene.reachable ? "reachable" : "unreachable" }}
              </Badge>
            </div>
            <p>{{ scene.choiceCount }} choices · {{ scene.stateDeltaPreview.length }} state previews</p>
          </article>
        </div>

        <div class="v2-diagnostics" aria-label="Graph diagnostics">
          <article
            v-for="diagnostic in snapshot.sceneGraph.diagnostics"
            :key="`${diagnostic.code}-${diagnostic.targetId}`"
            class="v2-record"
          >
            <Badge :tone="statusTone[diagnostic.severity]">{{ diagnostic.severity }}</Badge>
            <p>{{ diagnostic.message }}</p>
          </article>
        </div>
      </template>

      <template v-else-if="area === 'review'">
        <form class="v2-canon-form" aria-label="Generation job controls" @submit.prevent="emit('createGenerationJob')">
          <Field label="Generation prompt" hint="Mock adapter creates a typed job without writing canon.">
            <Textarea
              :model-value="generationPrompt"
              :disabled="loading"
              id="v2-generation-prompt"
              aria-label="Generation prompt"
              :rows="3"
              @update:model-value="emit('update:generationPrompt', $event)"
            />
          </Field>
          <div class="v2-form-actions">
            <Button variant="primary" size="md" type="submit" :loading="loading">
              Create Job
            </Button>
            <Badge tone="info">{{ snapshot.generation.job.status }}</Badge>
          </div>
          <p v-if="generationMessage" class="v2-feedback">{{ generationMessage }}</p>
        </form>

        <div class="v2-list-grid" aria-label="Generation context sources">
          <article v-for="source in snapshot.generation.context.sources" :key="source.id" class="v2-record">
            <div class="v2-record-head">
              <strong>{{ source.label }}</strong>
              <Badge tone="neutral">{{ source.kind }}</Badge>
            </div>
            <p>{{ source.id }}</p>
          </article>
        </div>

        <article class="v2-record" aria-label="Candidate diff">
          <div class="v2-record-head">
            <strong>{{ snapshot.generation.diff.title }}</strong>
            <Badge :tone="snapshot.candidate.status === 'pending' ? 'warning' : 'success'">
              {{ snapshot.candidate.status }}
            </Badge>
          </div>
          <p>Base revision {{ snapshot.candidate.baseCanonRevision }} · {{ snapshot.generation.context.contextHash }}</p>
          <ul class="v2-plain-list">
            <li v-for="addition in snapshot.generation.diff.additions" :key="addition">{{ addition }}</li>
          </ul>
          <ul class="v2-plain-list v2-warning-list">
            <li v-for="warning in snapshot.generation.diff.warnings" :key="warning">{{ warning }}</li>
          </ul>
        </article>

        <form class="v2-canon-form" aria-label="Candidate review actions" @submit.prevent="emit('reviewCandidate', 'approve')">
          <Field label="Reviewer">
            <Input
              :model-value="reviewer"
              :disabled="loading || !canReviewCandidate"
              id="v2-reviewer"
              aria-label="Reviewer"
              @update:model-value="emit('update:reviewer', $event)"
            />
          </Field>
          <Field label="Review reason">
            <Textarea
              :model-value="reviewReason"
              :disabled="loading || !canReviewCandidate"
              id="v2-review-reason"
              aria-label="Review reason"
              :rows="3"
              @update:model-value="emit('update:reviewReason', $event)"
            />
          </Field>
          <div class="v2-form-actions">
            <Button variant="primary" size="md" type="submit" :disabled="!canReviewCandidate" :loading="loading">
              Approve
            </Button>
            <Button
              variant="secondary"
              size="md"
              :disabled="!canReviewCandidate || loading"
              @click="emit('reviewCandidate', 'request_changes')"
            >
              Request Changes
            </Button>
            <Button
              variant="danger"
              size="md"
              :disabled="!canReviewCandidate || loading"
              @click="emit('reviewCandidate', 'reject')"
            >
              Reject
            </Button>
          </div>
          <p v-if="reviewMessage" class="v2-feedback">{{ reviewMessage }}</p>
          <p v-if="snapshot.candidate.reviewReason" class="v2-feedback">
            {{ snapshot.candidate.reviewer }}: {{ snapshot.candidate.reviewReason }}
          </p>
        </form>
      </template>

      <template v-else-if="area === 'operations'">
        <div class="v2-list-grid">
          <article v-for="variable in snapshot.typedState.variables" :key="variable.key" class="v2-record">
            <div class="v2-record-head">
              <strong>{{ variable.label }}</strong>
              <Badge tone="neutral">{{ variable.type }}</Badge>
            </div>
            <p>{{ variable.key }} = {{ formatValue(variable.value) }}</p>
          </article>
        </div>
        <div class="v2-diagnostics" aria-label="Typed state delta preview">
          <article v-for="delta in snapshot.typedState.preview" :key="delta.key" class="v2-record">
            <Badge tone="info">{{ delta.sourceSceneId }}</Badge>
            <p>{{ delta.key }}: {{ formatValue(delta.before) }} -> {{ formatValue(delta.after) }}</p>
          </article>
        </div>
      </template>

      <template v-else>
        <article class="v2-metric">
          <span>Workspace</span>
          <strong>{{ snapshot.world.name }}</strong>
          <small>revision {{ snapshot.world.revision }}</small>
        </article>
        <article class="v2-metric">
          <span>Graph</span>
          <strong>{{ snapshot.sceneGraph.scenes.length }} scenes</strong>
          <small>{{ snapshot.sceneGraph.diagnostics.length }} diagnostics</small>
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
      </template>
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
  grid-template-columns: 1fr;
  gap: var(--space-3);
}

.v2-list-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: var(--space-3);
}

.v2-canon-form {
  display: grid;
  gap: var(--space-3);
}

.v2-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
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

.v2-record {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
}

.v2-record p {
  overflow-wrap: anywhere;
  color: var(--text);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.v2-record-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.v2-record-head strong {
  overflow-wrap: anywhere;
  color: var(--text-strong);
  font-size: var(--text-md);
}

.v2-diagnostics {
  display: grid;
  gap: var(--space-3);
}

.v2-feedback {
  color: var(--muted);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.v2-plain-list {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding-left: var(--space-5);
  color: var(--text);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.v2-warning-list {
  color: var(--warning);
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
