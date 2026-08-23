export type V2DomainErrorCode =
  | "INVALID_INPUT"
  | "VALIDATION_FAILED"
  | "CROSS_WORLD_REFERENCE"
  | "STALE_REVISION"
  | "IDEMPOTENCY_CONFLICT"
  | "HAS_CHILDREN"
  | "REFERENCED_ENTITY"
  | "DUPLICATE_REFERENCE"
  | "INVALID_HIERARCHY"
  | "INVALID_CANDIDATE_TRANSITION"
  | "RELEASE_INVARIANT_FAILED";

export class V2DomainError extends Error {
  public readonly code: V2DomainErrorCode;

  public constructor(code: V2DomainErrorCode, message: string) {
    super(message);
    this.name = "V2DomainError";
    this.code = code;
  }
}
