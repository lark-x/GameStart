import assert from "node:assert/strict";
import test from "node:test";

import { createV2FactAssertion, createV2FactAssertionBatch, V2FactDomainError } from "./index.ts";

const baseAssertion = {
  assertionId: "fact:one",
  batchId: "batch:one",
  storyWorldId: "world:one",
  conversationId: "conversation:one",
  scopeType: "user" as const,
  scopeId: "user:local",
  subject: { entityType: "user" as const, entityId: "user:local", label: "用户" },
  predicate: "preferred_coffee",
  object: { type: "text" as const, value: "pour_over" },
  kind: "preference" as const,
  text: "用户更喜欢手冲咖啡",
  changeHint: "replaces_previous" as const,
  confidence: 0.96,
  importanceHint: 0.7,
  sourceMessageIds: ["message:152"],
  observedAt: "2026-08-18T00:00:00.000Z",
  extractorVersion: "fact.extract:v1",
};

test("V2 fact domain creates valid assertions and batches", () => {
  const assertion = createV2FactAssertion(baseAssertion);
  assert.equal(assertion.assertionId, "fact:one");
  assert.equal(assertion.subject.label, "用户");
  assert.deepEqual(assertion.sourceMessageIds, ["message:152"]);

  const batch = createV2FactAssertionBatch({
    batchId: "batch:one",
    storyWorldId: "world:one",
    conversationId: "conversation:one",
    fromMessageId: "message:150",
    toMessageId: "message:152",
    sourceMessageIds: ["message:150", "message:151", "message:152"],
    sourceHash: "sha256:abc",
    extractorVersion: "fact.extract:v1",
  });
  assert.equal(batch.status, "pending");
  assert.equal(batch.sourceHash, "sha256:abc");
});

test("V2 fact domain rejects invalid input", () => {
  assert.throws(
    () => createV2FactAssertion({ ...baseAssertion, kind: "nonsense" as never }),
    (error: unknown) => error instanceof V2FactDomainError && /unsupported kind/.test(error.message),
  );
  assert.throws(
    () => createV2FactAssertion({ ...baseAssertion, confidence: 1.5 }),
    (error: unknown) => error instanceof V2FactDomainError && /confidence/.test(error.message),
  );
  assert.throws(
    () => createV2FactAssertion({ ...baseAssertion, importanceHint: -0.1 }),
    (error: unknown) => error instanceof V2FactDomainError && /importanceHint/.test(error.message),
  );
  assert.throws(
    () => createV2FactAssertion({ ...baseAssertion, sourceMessageIds: [] }),
    (error: unknown) => error instanceof V2FactDomainError && /sourceMessageIds/.test(error.message),
  );
  const anyId = createV2FactAssertion({ ...baseAssertion, sourceMessageIds: ["not-a-message"] });
  assert.deepEqual(anyId.sourceMessageIds, ["not-a-message"]);
  assert.throws(
    () => createV2FactAssertion({ ...baseAssertion, text: "" }),
    (error: unknown) => error instanceof V2FactDomainError && /text/.test(error.message),
  );
  assert.throws(
    () => createV2FactAssertion({ ...baseAssertion, object: { type: "entity" as const, value: "char:alice" } }),
    (error: unknown) => error instanceof V2FactDomainError && /entityId/.test(error.message),
  );
  assert.throws(
    () => createV2FactAssertionBatch({
      batchId: "batch:bad",
      storyWorldId: "world:one",
      conversationId: "conversation:one",
      fromMessageId: "message:1",
      toMessageId: "message:2",
      sourceMessageIds: [],
      sourceHash: "hash",
      extractorVersion: "fact.extract:v1",
    }),
    (error: unknown) => error instanceof V2FactDomainError && /sourceMessageIds/.test(error.message),
  );
});

test("V2 fact domain defaults epistemic status to omitted and supports asserted", () => {
  const assertion = createV2FactAssertion(baseAssertion);
  assert.equal("epistemicStatus" in assertion, false);
  const withStatus = createV2FactAssertion({ ...baseAssertion, epistemicStatus: "reported" });
  assert.equal(withStatus.epistemicStatus, "reported");
  assert.throws(
    () => createV2FactAssertion({ ...baseAssertion, epistemicStatus: "guessed" as never }),
    (error: unknown) => error instanceof V2FactDomainError,
  );
});
