import assert from "node:assert/strict";
import test from "node:test";
import { createPinia, setActivePinia } from "pinia";
import { useNarrativeRevisionStore } from "../stores/useNarrativeRevisionStore.ts";
import { createNarrativeMutationKey } from "../utils/idempotency.ts";

test("Narrative Revision CAS Flow - Monotonic advancement and Idempotency Keys", () => {
  setActivePinia(createPinia());
  const revisionStore = useNarrativeRevisionStore();

  // 1. Uninitialized defaults
  assert.equal(revisionStore.isReady, false);
  assert.equal(revisionStore.currentRevision, 1);
  assert.equal(revisionStore.requireRevision(), 1);

  // 2. Initialize from bootstrap
  revisionStore.initialize("world-teyyvat", 100);
  assert.equal(revisionStore.isReady, true);
  assert.equal(revisionStore.currentRevision, 100);
  assert.equal(revisionStore.requireRevision(), 100);

  // 3. Advancing with higher revisions
  revisionStore.advanceFromResponse({ revision: 101 });
  assert.equal(revisionStore.currentRevision, 101);

  // 4. Monotonicity: Ignores stale lower revisions
  revisionStore.advanceFromResponse({ revision: 99 });
  assert.equal(revisionStore.currentRevision, 101);

  // 5. Direct number advance
  revisionStore.advanceFromResponse(102);
  assert.equal(revisionStore.currentRevision, 102);

  // 6. Unique Idempotency keys generated per mutation
  const key1 = createNarrativeMutationKey("save_scene");
  const key2 = createNarrativeMutationKey("save_scene");
  assert.ok(key1.startsWith("save_scene:"));
  assert.ok(key2.startsWith("save_scene:"));
  assert.notEqual(key1, key2);
});
