import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { createV2HttpAdapter, createV2MockAdapter, V2AdapterError } from "../adapters/index.ts";
import type { V2WorkspaceAdapter, V2WorkspaceMode, V2WorkspaceSnapshot } from "../adapters/types";

function createDefaultAdapter(): V2WorkspaceAdapter {
  if (typeof window === "undefined") return createV2MockAdapter();
  const mode = window.localStorage.getItem("living-network-v2-adapter");
  if (mode === "http") {
    return createV2HttpAdapter({
      baseUrl: import.meta.env.VITE_API_BASE || window.location.origin,
    });
  }
  return createV2MockAdapter();
}

export const useV2WorkspaceStore = defineStore("v2-workspace", () => {
  const adapter = ref<V2WorkspaceAdapter>(createDefaultAdapter());
  const snapshot = ref<V2WorkspaceSnapshot | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const draftWorldName = ref("");
  const draftPremise = ref("");
  const expectedRevision = ref(0);
  const conflict = ref<string | null>(null);

  const mode = computed(() => adapter.value.mode);
  const hasSnapshot = computed(() => snapshot.value !== null);
  const revisionLabel = computed(() =>
    snapshot.value ? `Revision ${snapshot.value.world.revision}` : "No revision",
  );
  const graphIssueCount = computed(() => snapshot.value?.sceneGraph.diagnostics.length ?? 0);
  const typedStatePreviewCount = computed(() => snapshot.value?.typedState.preview.length ?? 0);
  const hasDraftChanges = computed(
    () =>
      snapshot.value !== null &&
      (draftWorldName.value !== snapshot.value.world.name || draftPremise.value !== snapshot.value.world.premise),
  );

  function setAdapter(nextAdapter: V2WorkspaceAdapter) {
    adapter.value = nextAdapter;
    snapshot.value = null;
    error.value = null;
    conflict.value = null;
  }

  function setMode(nextMode: V2WorkspaceMode) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("living-network-v2-adapter", nextMode);
    }
    setAdapter(
      nextMode === "http"
        ? createV2HttpAdapter({ baseUrl: import.meta.env.VITE_API_BASE || window.location.origin })
        : createV2MockAdapter(),
    );
  }

  async function loadSnapshot() {
    loading.value = true;
    error.value = null;
    conflict.value = null;
    try {
      snapshot.value = await adapter.value.getSnapshot();
      draftWorldName.value = snapshot.value.world.name;
      draftPremise.value = snapshot.value.world.premise;
      expectedRevision.value = snapshot.value.world.revision;
    } catch (err) {
      if (err instanceof V2AdapterError) {
        error.value = `${err.code}: ${err.message}`;
      } else if (err instanceof Error) {
        error.value = err.message;
      } else {
        error.value = "Unknown V2 adapter error";
      }
    } finally {
      loading.value = false;
    }
  }

  function resetCanonDraft() {
    if (!snapshot.value) return;
    draftWorldName.value = snapshot.value.world.name;
    draftPremise.value = snapshot.value.world.premise;
    expectedRevision.value = snapshot.value.world.revision;
    conflict.value = null;
  }

  function previewCanonDraft() {
    if (!snapshot.value) return;
    if (expectedRevision.value !== snapshot.value.world.revision) {
      conflict.value = `Expected revision ${expectedRevision.value}, but workspace is at ${snapshot.value.world.revision}.`;
      return;
    }
    conflict.value = null;
    snapshot.value = {
      ...snapshot.value,
      world: {
        ...snapshot.value.world,
        name: draftWorldName.value.trim() || snapshot.value.world.name,
        premise: draftPremise.value.trim() || snapshot.value.world.premise,
        revision: snapshot.value.world.revision + 1,
      },
    };
    expectedRevision.value = snapshot.value.world.revision;
  }

  return {
    snapshot,
    loading,
    error,
    draftWorldName,
    draftPremise,
    expectedRevision,
    conflict,
    mode,
    hasSnapshot,
    revisionLabel,
    graphIssueCount,
    typedStatePreviewCount,
    hasDraftChanges,
    setAdapter,
    setMode,
    loadSnapshot,
    resetCanonDraft,
    previewCanonDraft,
  };
});
