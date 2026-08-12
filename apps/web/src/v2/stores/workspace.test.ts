import assert from "node:assert/strict";
import test from "node:test";

import { createPinia, setActivePinia } from "pinia";

import { createV2MockAdapter, type V2WorkspaceAdapter } from "../adapters/index.ts";
import { useV2WorkspaceStore } from "./workspace.ts";

test("V2 workspace store loads snapshot through injected adapter", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  store.setAdapter(createV2MockAdapter());

  await store.loadSnapshot();

  assert.equal(store.error, null);
  assert.equal(store.hasSnapshot, true);
  assert.equal(store.snapshot?.world.name, "Gate 0 Demo World");
  assert.equal(store.revisionLabel, "Revision 1");
});

test("V2 workspace store exposes adapter failures", async () => {
  setActivePinia(createPinia());
  const store = useV2WorkspaceStore();
  const adapter: V2WorkspaceAdapter = {
    mode: "mock",
    async getSnapshot() {
      throw new Error("fixture failed");
    },
    async createSceneGenerationJob() {
      throw new Error("not used");
    },
  };

  store.setAdapter(adapter);
  await store.loadSnapshot();

  assert.equal(store.hasSnapshot, false);
  assert.equal(store.error, "fixture failed");
});
