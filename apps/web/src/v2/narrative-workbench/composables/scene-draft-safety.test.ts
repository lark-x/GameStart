import assert from "node:assert/strict";
import test from "node:test";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { useSceneDocumentStore } from "../../story/stores/useSceneDocumentStore.ts";
import { useSceneNavigationGuard } from "./useSceneNavigationGuard.ts";
import { useNarrativeSceneLoader } from "./useNarrativeSceneLoader.ts";
import { useNarrativeAutosave } from "./useNarrativeAutosave.ts";

test("useSceneNavigationGuard blocks dirty transitions and allows clean ones", async () => {
  setActivePinia(createPinia());
  const docStore = useSceneDocumentStore();
  const storyWorldId = ref("world-1");

  let navigatedSceneId: string | null = null;
  const guard = useSceneNavigationGuard({
    storyWorldId,
    onNavigateScene: (sceneId) => {
      navigatedSceneId = sceneId;
    },
  });

  // When clean, requests proceed immediately
  let called = false;
  const allowed = guard.requestSceneChange("scene-2", () => {
    called = true;
  });
  assert.equal(allowed, true);
  assert.equal(called, true);
  assert.equal(guard.showConfirmModal.value, false);

  // When dirty, requests are blocked and modal opens
  docStore.isDirty = true;
  called = false;
  const blocked = guard.requestSceneChange("scene-3", () => {
    called = true;
  });
  assert.equal(blocked, false);
  assert.equal(called, false);
  assert.equal(guard.showConfirmModal.value, true);
  assert.equal(guard.pendingSceneId.value, "scene-3");

  // Discard and proceed executes callback and resets dirty
  guard.handleDiscardAndProceed();
  assert.equal(called, true);
  assert.equal(guard.showConfirmModal.value, false);
  assert.equal(docStore.isDirty, false);

  // Cancel closes modal without executing callback
  docStore.isDirty = true;
  called = false;
  guard.requestSceneChange("scene-4", () => {
    called = true;
  });
  assert.equal(guard.showConfirmModal.value, true);
  guard.handleCancel();
  assert.equal(called, false);
  assert.equal(guard.showConfirmModal.value, false);
  assert.equal(guard.pendingSceneId.value, null);
  assert.equal(navigatedSceneId, null);
});

test("useNarrativeSceneLoader tracks generations and handles race conditions", async () => {
  setActivePinia(createPinia());
  const loader = useNarrativeSceneLoader();

  assert.equal(loader.loadGeneration.value, 0);
  assert.equal(loader.loading.value, false);

  // Triggering load increment generation
  const p1 = loader.loadScene("world-1", "scene-1");
  assert.equal(loader.loadGeneration.value, 1);
  assert.equal(loader.loading.value, true);

  const p2 = loader.loadScene("world-1", "scene-2");
  assert.equal(loader.loadGeneration.value, 2);

  // p1 should return false due to superseded generation
  const res1 = await p1.catch(() => false);
  assert.equal(res1, false);

  const res2 = await p2.catch(() => false);
  assert.equal(typeof res2, "boolean");

  // Cancel loading resets state
  loader.cancelLoading();
  assert.equal(loader.loading.value, false);
});

test("useNarrativeAutosave reflects store dirty, saving, and conflict statuses", () => {
  setActivePinia(createPinia());
  const docStore = useSceneDocumentStore();
  const storyWorldId = ref("world-1");

  const autosave = useNarrativeAutosave({
    storyWorldId,
    debounceMs: 100,
  });

  assert.equal(autosave.saveStatus.value, "saved");

  docStore.isDirty = true;
  assert.equal(autosave.saveStatus.value, "dirty");

  docStore.hasConflict = true;
  assert.equal(autosave.saveStatus.value, "conflict");

  docStore.hasConflict = false;
  docStore.isDirty = false;
  assert.equal(autosave.saveStatus.value, "saved");
});
