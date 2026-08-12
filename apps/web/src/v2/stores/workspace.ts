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

  const mode = computed(() => adapter.value.mode);
  const hasSnapshot = computed(() => snapshot.value !== null);
  const revisionLabel = computed(() =>
    snapshot.value ? `Revision ${snapshot.value.world.revision}` : "No revision",
  );

  function setAdapter(nextAdapter: V2WorkspaceAdapter) {
    adapter.value = nextAdapter;
    snapshot.value = null;
    error.value = null;
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
    try {
      snapshot.value = await adapter.value.getSnapshot();
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

  return {
    snapshot,
    loading,
    error,
    mode,
    hasSnapshot,
    revisionLabel,
    setAdapter,
    setMode,
    loadSnapshot,
  };
});
