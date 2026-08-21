import assert from "node:assert/strict";
import test from "node:test";

import { randomUuid } from "./random.ts";

test("randomUuid returns a v4 UUID even without crypto.randomUUID", () => {
  const original = globalThis.crypto as (Crypto & { randomUUID?: () => string }) | undefined;
  const saved = original;
  try {
    // Simulate a non-secure-context browser where randomUUID is absent but getRandomValues exists.
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues: (array: Uint8Array) => {
          for (let index = 0; index < array.length; index += 1) array[index] = index;
          return array;
        },
      },
    });
    const value = randomUuid();
    assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: saved });
  }
});

test("randomUuid prefers crypto.randomUUID when available", () => {
  const original = globalThis.crypto as (Crypto & { randomUUID?: () => string }) | undefined;
  try {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: () => "00000000-0000-4000-8000-000000000000" },
    });
    assert.equal(randomUuid(), "00000000-0000-4000-8000-000000000000");
  } finally {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: original });
  }
});
