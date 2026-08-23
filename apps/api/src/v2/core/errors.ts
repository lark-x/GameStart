import { V2DomainError } from "@living-network/domain/v2";

export class V2HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  public constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "V2HttpError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function toV2HttpError(error: unknown): V2HttpError {
  if (error instanceof V2HttpError) return error;
  if (error instanceof V2DomainError) {
    if (error.code === "STALE_REVISION") return new V2HttpError(409, "STALE_REVISION", error.message);
    if (error.code === "IDEMPOTENCY_CONFLICT") return new V2HttpError(409, "IDEMPOTENCY_CONFLICT", error.message);
    if (error.code === "HAS_CHILDREN") return new V2HttpError(409, "HAS_CHILDREN", error.message);
    if (error.code === "REFERENCED_ENTITY") return new V2HttpError(409, "REFERENCED_ENTITY", error.message);
    if (error.code === "DUPLICATE_REFERENCE") return new V2HttpError(400, "DUPLICATE_REFERENCE", error.message);
    if (error.code === "INVALID_HIERARCHY") return new V2HttpError(400, "INVALID_HIERARCHY", error.message);
    if (error.code === "VALIDATION_FAILED") return new V2HttpError(400, "VALIDATION_FAILED", error.message);
    if (error.code === "CROSS_WORLD_REFERENCE") return new V2HttpError(422, "VALIDATION_FAILED", error.message);
    return new V2HttpError(422, "VALIDATION_FAILED", error.message);
  }
  if (error instanceof Error && isSqliteConstraint(error)) {
    return new V2HttpError(409, "CONFLICT", "Canon write conflicts with an existing record or constraint");
  }
  return new V2HttpError(500, "INTERNAL_ERROR", "Internal server error");
}

function isSqliteConstraint(error: Error): boolean {
  return "code" in error && String((error as { readonly code?: unknown }).code).startsWith("ERR_SQLITE_CONSTRAINT");
}
