import type { V2IdempotencyKey } from "@living-network/contracts/v2";
import { randomUuid } from "../../random.ts";

/**
 * Creates a unique, structured idempotency key for narrative mutations.
 * Avoids plain Date.now() collisions and satisfies API idempotency contracts.
 */
export function createNarrativeMutationKey(operation: string): V2IdempotencyKey {
  return `${operation}:${randomUuid()}` as V2IdempotencyKey;
}
