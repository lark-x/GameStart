import { computed, getCurrentInstance, onUnmounted, ref, watch, type Ref } from "vue";
import { useSceneDocumentStore } from "../../story/stores/useSceneDocumentStore.ts";
import type { SaveStatus } from "../components/topbar/NarrativeTopBar.vue";

export interface NarrativeAutosaveOptions {
  storyWorldId: Ref<string> | (() => string);
  debounceMs?: number;
  enabled?: Ref<boolean> | boolean;
}

export function useNarrativeAutosave(options: NarrativeAutosaveOptions) {
  const docStore = useSceneDocumentStore();
  const debounceTime = options.debounceMs ?? 1000;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const isSaving = ref(false);
  const lastSavedTime = ref<string | null>(null);
  const saveError = ref<string | null>(null);

  const getStoryWorldId = (): string => {
    if (typeof options.storyWorldId === "function") {
      return options.storyWorldId();
    }
    return options.storyWorldId.value;
  };

  const isEnabled = (): boolean => {
    if (options.enabled === undefined) return true;
    if (typeof options.enabled === "boolean") return options.enabled;
    return options.enabled.value;
  };

  const saveStatus = computed<SaveStatus>(() => {
    if (docStore.hasConflict) return "conflict";
    if (isSaving.value || docStore.saving) return "saving";
    if (docStore.isDirty) return "dirty";
    if (docStore.error || saveError.value) return "error";
    return "saved";
  });

  const triggerAutosave = async (): Promise<boolean> => {
    if (!docStore.isDirty || isSaving.value || docStore.saving || docStore.hasConflict || !docStore.document) {
      return false;
    }

    isSaving.value = true;
    saveError.value = null;
    try {
      await docStore.saveDocument(getStoryWorldId());
      lastSavedTime.value = new Date().toISOString();
      return true;
    } catch (err: unknown) {
      saveError.value = err instanceof Error ? err.message : "自动保存失败";
      return false;
    } finally {
      isSaving.value = false;
    }
  };

  const cancelPendingAutosave = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  watch(
    () => [docStore.isDirty, docStore.blocks, docStore.plainBody],
    () => {
      cancelPendingAutosave();
      if (!isEnabled() || !docStore.isDirty || docStore.hasConflict) {
        return;
      }

      timer = setTimeout(() => {
        triggerAutosave();
      }, debounceTime);
    },
    { deep: true },
  );

  if (getCurrentInstance()) {
    onUnmounted(() => {
      cancelPendingAutosave();
    });
  }

  return {
    saveStatus,
    isSaving,
    lastSavedTime,
    saveError,
    triggerAutosave,
    cancelPendingAutosave,
  };
}
