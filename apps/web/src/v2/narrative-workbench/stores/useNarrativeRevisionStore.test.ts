import assert from "node:assert/strict";
import test from "node:test";
import { createPinia, setActivePinia } from "pinia";
import { useNarrativeRevisionStore } from "./useNarrativeRevisionStore.ts";
import { createNarrativeMutationKey } from "../utils/idempotency.ts";

test("useNarrativeRevisionStore tracks worldRevision and advances monotonically", () => {
  setActivePinia(createPinia());
  const store = useNarrativeRevisionStore();

  assert.equal(store.storyWorldId, null);
  assert.equal(store.worldRevision, null);

  store.initialize("world-1", 5);
  assert.equal(store.storyWorldId, "world-1");
  assert.equal(store.worldRevision, 5);
  assert.equal(store.requireRevision(), 5);

  store.setRevision(6);
  assert.equal(store.worldRevision, 6);

  // setRevision with lower value should not regress
  store.setRevision(4);
  assert.equal(store.worldRevision, 6);

  // advanceFromResponse
  store.advanceFromResponse({ revision: 8 });
  assert.equal(store.worldRevision, 8);

  store.reset();
  assert.equal(store.storyWorldId, null);
  assert.equal(store.worldRevision, null);
});

test("createNarrativeMutationKey produces unique valid idempotency keys", () => {
  const key1 = createNarrativeMutationKey("create_scene");
  const key2 = createNarrativeMutationKey("create_scene");

  assert.match(key1, /^create_scene:[0-9a-f-]+$/);
  assert.match(key2, /^create_scene:[0-9a-f-]+$/);
  assert.notEqual(key1, key2);
});
