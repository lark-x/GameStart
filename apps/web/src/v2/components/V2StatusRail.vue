<script setup lang="ts">
import { CheckCircle2, CircleAlert, Clock3, Database, GitBranch, Wifi } from "@lucide/vue";

import Badge from "../../components/ui/Badge.vue";
import Button from "../../components/ui/Button.vue";
import type { V2WorkspaceSnapshot } from "../adapters";

defineProps<{
  snapshot: V2WorkspaceSnapshot | null;
  loading: boolean;
  error: string | null;
  mode: "mock" | "http";
  graphIssueCount: number;
  typedStatePreviewCount: number;
  candidateStatus: string;
  currentSceneTitle: string;
}>();

const emit = defineEmits<{
  refresh: [];
  switchMode: [mode: "mock" | "http"];
}>();
</script>

<template>
  <aside class="v2-status-rail" aria-label="V2 workspace status">
    <div class="v2-status-rail-head">
      <div>
        <p class="v2-panel-kicker">Adapter</p>
        <h2>{{ mode === "mock" ? "Mock Fixture" : "HTTP API" }}</h2>
      </div>
      <Badge :tone="mode === 'mock' ? 'info' : 'warning'">{{ mode }}</Badge>
    </div>

    <div class="v2-status-actions" aria-label="Adapter controls">
      <Button
        variant="secondary"
        size="sm"
        :disabled="mode === 'mock' || loading"
        @click="emit('switchMode', 'mock')"
      >
        <Database :size="15" aria-hidden="true" />
        Mock
      </Button>
      <Button
        variant="secondary"
        size="sm"
        :disabled="mode === 'http' || loading"
        @click="emit('switchMode', 'http')"
      >
        <Wifi :size="15" aria-hidden="true" />
        HTTP
      </Button>
      <Button
        variant="ghost"
        size="icon"
        :loading="loading"
        aria-label="Refresh V2 snapshot"
        @click="emit('refresh')"
      >
        <Clock3 v-if="!loading" :size="17" aria-hidden="true" />
      </Button>
    </div>

    <div v-if="error" class="v2-alert" role="alert">
      <CircleAlert :size="18" aria-hidden="true" />
      <span>{{ error }}</span>
    </div>

    <dl v-if="snapshot" class="v2-status-list">
      <div>
        <dt>Health</dt>
        <dd>
          <CheckCircle2 :size="16" aria-hidden="true" />
          {{ snapshot.health.version }}
        </dd>
      </div>
      <div>
        <dt>Workspace</dt>
        <dd>{{ snapshot.world.name }}</dd>
      </div>
      <div>
        <dt>Revision</dt>
        <dd>
          <GitBranch :size="16" aria-hidden="true" />
          {{ snapshot.world.revision }}
        </dd>
      </div>
      <div>
        <dt>Candidate</dt>
        <dd>{{ candidateStatus }}</dd>
      </div>
      <div>
        <dt>Release</dt>
        <dd>{{ snapshot.release.valid ? "preflight valid" : "blocked" }}</dd>
      </div>
      <div>
        <dt>Graph diagnostics</dt>
        <dd>{{ graphIssueCount }}</dd>
      </div>
      <div>
        <dt>State preview</dt>
        <dd>{{ typedStatePreviewCount }}</dd>
      </div>
      <div>
        <dt>Current scene</dt>
        <dd>{{ currentSceneTitle }}</dd>
      </div>
    </dl>
  </aside>
</template>

<style scoped>
.v2-status-rail {
  min-width: 0;
  padding: var(--space-5);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.v2-status-rail-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.v2-status-rail-head h2 {
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

.v2-status-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.v2-alert {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
  margin-bottom: var(--space-4);
  padding: var(--space-3);
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.v2-status-list {
  display: grid;
  gap: var(--space-3);
  margin: 0;
}

.v2-status-list div {
  display: grid;
  gap: var(--space-1);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border);
}

.v2-status-list div:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.v2-status-list dt {
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: 800;
  text-transform: uppercase;
}

.v2-status-list dd {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--text-strong);
  font-size: var(--text-sm);
  font-weight: 700;
}

@media (max-width: 767px) {
  .v2-status-rail {
    padding: var(--space-4);
  }
}
</style>
