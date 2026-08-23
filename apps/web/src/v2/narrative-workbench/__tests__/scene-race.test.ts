import assert from "node:assert/strict";
import test from "node:test";
import { createPinia, setActivePinia } from "pinia";
import { useNarrativeSceneLoader } from "../composables/useNarrativeSceneLoader.ts";
import { useSceneDocumentStore } from "../../story/stores/useSceneDocumentStore.ts";
import type { V2SceneDocument } from "@living-network/contracts/v2";

test("Narrative Scene Race Condition - Generation token & AbortController cancellation", async () => {
  setActivePinia(createPinia());
  const docStore = useSceneDocumentStore();
  const loader = useNarrativeSceneLoader();

  let slowFetchAborted = false;

  // Mock slow fetch for scene-1 vs fast fetch for scene-2
  docStore.fetchDocument = async (_worldId: string, sceneId: string, options?: { signal?: AbortSignal }): Promise<V2SceneDocument | null> => {
    if (sceneId === "scene-slow") {
      return new Promise<V2SceneDocument>((resolve, reject) => {
        const timer = setTimeout(() => {
          docStore.document = { sceneId: "scene-slow", title: "Slow Scene", revision: 1, isEntry: false };
          docStore.blocks = [];
          resolve(docStore.document);
        }, 100);

        options?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          slowFetchAborted = true;
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    } else {
      docStore.document = { sceneId: "scene-fast", title: "Fast Scene", revision: 2, isEntry: false };
      docStore.blocks = [];
      return Promise.resolve(docStore.document);
    }
  };

  // 1. Trigger slow load
  const p1 = loader.loadScene("world-1", "scene-slow");

  // 2. Immediately trigger fast load for another scene
  const p2 = loader.loadScene("world-1", "scene-fast");

  await Promise.allSettled([p1, p2]);

  // Verify scene-slow request was aborted and final active state is scene-fast
  assert.equal(slowFetchAborted, true);
  assert.equal(loader.activeSceneId.value, "scene-fast");
  assert.equal(docStore.document?.sceneId, "scene-fast");
});
