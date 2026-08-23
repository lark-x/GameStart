import assert from "node:assert/strict";
import test from "node:test";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { useSceneNavigationGuard } from "../composables/useSceneNavigationGuard.ts";
import { useSceneDocumentStore } from "../../story/stores/useSceneDocumentStore.ts";

test("Narrative Scene Navigation - Dirty Draft State Machine Guard", () => {
  setActivePinia(createPinia());
  const docStore = useSceneDocumentStore();

  let navigatedToScene: string | null = null;
  const storyWorldId = ref("world-1");

  const guard = useSceneNavigationGuard({
    storyWorldId,
    onNavigateScene: (sceneId) => {
      navigatedToScene = sceneId;
    },
  });

  // 1. Clean state -> directly navigates via callback
  docStore.isDirty = false;
  guard.requestSceneChange("scene-clean-target", () => {
    navigatedToScene = "scene-clean-target";
  });
  assert.equal(navigatedToScene, "scene-clean-target");
  assert.equal(guard.showConfirmModal.value, false);

  // 2. Dirty state -> blocks transition and opens confirmation dialog
  docStore.isDirty = true;
  guard.requestSceneChange("scene-dirty-target", () => {
    navigatedToScene = "scene-dirty-target";
  });
  assert.equal(guard.showConfirmModal.value, true);
  assert.equal(guard.pendingSceneId.value, "scene-dirty-target");
  // Callback not executed yet
  assert.equal(navigatedToScene, "scene-clean-target");

  // 3. User cancels navigation
  guard.handleCancel();
  assert.equal(guard.showConfirmModal.value, false);
  assert.equal(guard.pendingSceneId.value, null);
  assert.equal(navigatedToScene, "scene-clean-target");

  // 4. User confirms discard and proceed
  guard.requestSceneChange("scene-confirmed-target", () => {
    navigatedToScene = "scene-confirmed-target";
  });
  assert.equal(guard.showConfirmModal.value, true);
  guard.handleDiscardAndProceed();
  assert.equal(guard.showConfirmModal.value, false);
  assert.equal(docStore.isDirty, false);
  assert.equal(navigatedToScene, "scene-confirmed-target");
});
