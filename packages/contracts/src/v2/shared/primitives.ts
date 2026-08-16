export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type V2StoryWorldId = Brand<string, "V2StoryWorldId">;
export type V2CharacterId = Brand<string, "V2CharacterId">;
export type V2LocationId = Brand<string, "V2LocationId">;
export type V2SceneId = Brand<string, "V2SceneId">;
export type V2ChoiceId = Brand<string, "V2ChoiceId">;
export type V2CandidateId = Brand<string, "V2CandidateId">;
export type V2JobId = Brand<string, "V2JobId">;
export type V2ReleaseId = Brand<string, "V2ReleaseId">;
export type V2RunId = Brand<string, "V2RunId">;
export type V2SaveId = Brand<string, "V2SaveId">;
export type V2AssetId = Brand<string, "V2AssetId">;

export type V2IsoDateTime = Brand<string, "V2IsoDateTime">;
export type V2Revision = Brand<number, "V2Revision">;
export type V2IdempotencyKey = Brand<string, "V2IdempotencyKey">;

export interface V2ReleaseBlockerDto {
  readonly code: string;
  readonly message: string;
  readonly targetPage: "world" | "state" | "story" | "formal-assets" | "release";
  readonly entityId?: string;
}

export interface V2PageRequest {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface V2Page<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
}

export interface V2ErrorEnvelope {
  readonly error: {
    readonly code: V2ErrorCode;
    readonly message: string;
    readonly field?: string;
    readonly correlationId?: string;
  };
}

export type V2ErrorCode =
  | "CAPABILITY_UNAVAILABLE"
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STALE_REVISION"
  | "VALIDATION_FAILED"
  | "IDEMPOTENCY_CONFLICT"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface V2Revisioned {
  readonly revision: V2Revision;
}

export interface V2IdempotentCommand {
  readonly idempotencyKey: V2IdempotencyKey;
}
