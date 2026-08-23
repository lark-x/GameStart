import { getCurrentInstance, onMounted, onUnmounted, ref, type Ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { useSceneDocumentStore } from "../../story/stores/useSceneDocumentStore.ts";

export interface SceneNavigationGuardOptions {
  storyWorldId: Ref<string> | (() => string);
  onNavigateScene?: (sceneId: string) => void;
}

export function useSceneNavigationGuard(options: SceneNavigationGuardOptions) {
  const docStore = useSceneDocumentStore();

  const showConfirmModal = ref(false);
  const pendingSceneId = ref<string | null>(null);
  const pendingCallback = ref<(() => void) | null>(null);
  const saving = ref(false);
  const errorMessage = ref<string | null>(null);

  const getStoryWorldId = (): string => {
    if (typeof options.storyWorldId === "function") {
      return options.storyWorldId();
    }
    return options.storyWorldId.value;
  };

  const requestSceneChange = (nextSceneId: string, proceed: () => void): boolean => {
    if (!docStore.isDirty) {
      proceed();
      return true;
    }

    pendingSceneId.value = nextSceneId;
    pendingCallback.value = proceed;
    errorMessage.value = null;
    showConfirmModal.value = true;
    return false;
  };

  const handleSaveAndProceed = async (): Promise<boolean> => {
    saving.value = true;
    errorMessage.value = null;
    try {
      await docStore.saveDocument(getStoryWorldId());
      showConfirmModal.value = false;
      const cb = pendingCallback.value;
      const targetSceneId = pendingSceneId.value;
      pendingCallback.value = null;
      pendingSceneId.value = null;

      if (cb) {
        cb();
      } else if (targetSceneId && options.onNavigateScene) {
        options.onNavigateScene(targetSceneId);
      }
      return true;
    } catch (err: unknown) {
      errorMessage.value = err instanceof Error ? err.message : "保存场景草稿失败";
      return false;
    } finally {
      saving.value = false;
    }
  };

  const handleDiscardAndProceed = (): void => {
    docStore.discardChanges();
    showConfirmModal.value = false;
    errorMessage.value = null;
    const cb = pendingCallback.value;
    const targetSceneId = pendingSceneId.value;
    pendingCallback.value = null;
    pendingSceneId.value = null;

    if (cb) {
      cb();
    } else if (targetSceneId && options.onNavigateScene) {
      options.onNavigateScene(targetSceneId);
    }
  };

  const handleCancel = (): void => {
    showConfirmModal.value = false;
    pendingCallback.value = null;
    pendingSceneId.value = null;
    errorMessage.value = null;
  };

  const handleBeforeUnload = (e: BeforeUnloadEvent): void => {
    if (docStore.isDirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  };

  if (getCurrentInstance()) {
    onMounted(() => {
      if (typeof window !== "undefined") {
        window.addEventListener("beforeunload", handleBeforeUnload);
      }
    });

    onUnmounted(() => {
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", handleBeforeUnload);
      }
    });

    try {
      onBeforeRouteLeave((_to, _from, next) => {
        if (!docStore.isDirty) {
          next();
          return;
        }

        pendingCallback.value = () => next();
        showConfirmModal.value = true;
        next(false);
      });
    } catch {
      // Ignored
    }
  }

  return {
    showConfirmModal,
    pendingSceneId,
    saving,
    errorMessage,
    requestSceneChange,
    handleSaveAndProceed,
    handleDiscardAndProceed,
    handleCancel,
  };
}
