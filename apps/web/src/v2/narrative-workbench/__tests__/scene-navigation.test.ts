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

  // 1. Clean state -> directly navigates without prompt
  docStore.isDirty = false;
  guard.requestSceneChange("scene-clean-target");
  assert.equal(navigatedToScene, "scene-clean-target");
  assert.equal(guard.confirmModalOpen.value, false);

  // 2. Dirty state -> blocks transition and opens confirmation dialog
  docStore.isDirty = true;
  guard.requestSceneChange("scene-dirty-target");
  assert.equal(guard.confirmModalOpen.value, true);
  assert.equal(guard.pendingTargetSceneId.value, "scene-dirty-target");
  // Target scene is not switched yet
  assert.equal(navigatedToScene, "scene-clean-target");

  // 3. User cancels navigation
  guard.cancelNavigation();
  assert.equal(guard.confirmModalOpen.value, false);
  assert.equal(guard.pendingTargetSceneId.value, null);
  assert.equal(navigatedToScene, "scene-clean-target");

  // 4. User confirms discard and proceed
  guard.requestSceneChange("scene-confirmed-target");
  assert.equal(guard.confirmModalOpen.value, true);
  guard.confirmDiscardAndProceed();
  assert.equal(guard.confirmModalOpen.value, false);
  assert.equal(docStore.isDirty, false);
  assert.equal(navigatedToScene, "scene-confirmed-target");
});
