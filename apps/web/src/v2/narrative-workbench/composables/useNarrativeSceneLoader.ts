import { getCurrentInstance, onUnmounted, ref } from "vue";
import { useSceneDocumentStore } from "../../story/stores/useSceneDocumentStore.ts";
import { useNarrativeReferenceStore } from "../../story/stores/useNarrativeReferenceStore.ts";

export function useNarrativeSceneLoader() {
  const docStore = useSceneDocumentStore();
  const refStore = useNarrativeReferenceStore();

  const loadGeneration = ref(0);
  const activeAbortController = ref<AbortController | null>(null);
  const loading = ref(false);
  const activeLoadedSceneId = ref<string | null>(null);

  const loadScene = async (storyWorldId: string, sceneId: string): Promise<boolean> => {
    // Cancel previous inflight request
    if (activeAbortController.value) {
      activeAbortController.value.abort();
      activeAbortController.value = null;
    }

    const controller = new AbortController();
    activeAbortController.value = controller;
    const currentGen = ++loadGeneration.value;
    loading.value = true;

    try {
      await Promise.all([
        docStore.fetchDocument(storyWorldId, sceneId, { signal: controller.signal }),
        refStore.fetchReferences(storyWorldId, sceneId, { signal: controller.signal }),
      ]);

      // Check if another load started in the meantime
      if (loadGeneration.value !== currentGen) {
        return false;
      }

      activeLoadedSceneId.value = sceneId;
      return true;
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return false;
      }
      if (loadGeneration.value === currentGen) {
        throw err;
      }
      return false;
    } finally {
      if (loadGeneration.value === currentGen) {
        loading.value = false;
        activeAbortController.value = null;
      }
    }
  };

  const cancelLoading = (): void => {
    if (activeAbortController.value) {
      activeAbortController.value.abort();
      activeAbortController.value = null;
    }
    loading.value = false;
  };

  if (getCurrentInstance()) {
    onUnmounted(() => {
      cancelLoading();
    });
  }

  return {
    loadGeneration,
    loading,
    activeLoadedSceneId,
    loadScene,
    cancelLoading,
  };
}
