import { V2DomainError } from "../shared/index.ts";

export type V2GenerationJobStatus =
  | "queued"
  | "claimed"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

const transitions: Record<V2GenerationJobStatus, readonly V2GenerationJobStatus[]> = {
  queued: ["claimed", "cancelled", "failed"],
  claimed: ["running", "queued", "cancelled", "failed"],
  running: ["succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: ["queued"],
  cancelled: [],
};

export function assertV2GenerationJobTransition(
  from: V2GenerationJobStatus,
  to: V2GenerationJobStatus,
): V2GenerationJobStatus {
  if (!transitions[from].includes(to)) {
    throw new V2DomainError("INVALID_INPUT", `Cannot transition generation job from ${from} to ${to}`);
  }
  return to;
}

export function shouldRetryV2GenerationJob(input: {
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly retryable: boolean;
}): boolean {
  if (!Number.isSafeInteger(input.attempts) || input.attempts < 0) {
    throw new V2DomainError("INVALID_INPUT", "attempts must be a non-negative integer");
  }
  if (!Number.isSafeInteger(input.maxAttempts) || input.maxAttempts < 1) {
    throw new V2DomainError("INVALID_INPUT", "maxAttempts must be a positive integer");
  }
  return input.retryable && input.attempts < input.maxAttempts;
}
