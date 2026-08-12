import { assertIsoTimestamp, assertNonEmptyString } from "./validation.ts";

export const RelationshipChangeCandidateStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export type RelationshipChangeCandidateStatus =
  (typeof RelationshipChangeCandidateStatus)[keyof typeof RelationshipChangeCandidateStatus];

export interface RelationshipChangeCandidate {
  readonly id: string;
  readonly storyWorldId: string;
  readonly edgeId: string;
  readonly sourceType: string;
  readonly sourceRef?: string;
  readonly deltaAffinity: number;
  readonly deltaTrust: number;
  readonly deltaConflict: number;
  readonly deltaDependency: number;
  readonly reason?: string;
  readonly ruleVersion?: string;
  readonly status: RelationshipChangeCandidateStatus;
  readonly idempotencyKey?: string;
  readonly createdAt: string;
  readonly reviewedAt?: string;
}

export interface RelationshipChangeCandidateInput {
  readonly id: string;
  readonly storyWorldId: string;
  readonly edgeId: string;
  readonly sourceType: string;
  readonly sourceRef?: string;
  readonly deltaAffinity: number;
  readonly deltaTrust: number;
  readonly deltaConflict: number;
  readonly deltaDependency: number;
  readonly reason?: string;
  readonly ruleVersion?: string;
  readonly idempotencyKey?: string;
  readonly createdAt: string;
}

export interface RelationshipEvent {
  readonly id: string;
  readonly storyWorldId: string;
  readonly edgeId: string;
  readonly sourceType: string;
  readonly sourceRef?: string;
  readonly beforeAffinity: number;
  readonly beforeTrust: number;
  readonly beforeConflict: number;
  readonly beforeDependency: number;
  readonly deltaAffinity: number;
  readonly deltaTrust: number;
  readonly deltaConflict: number;
  readonly deltaDependency: number;
  readonly afterAffinity: number;
  readonly afterTrust: number;
  readonly afterConflict: number;
  readonly afterDependency: number;
  readonly reason?: string;
  readonly ruleVersion?: string;
  readonly reviewedBy?: string;
  readonly idempotencyKey?: string;
  readonly createdAt: string;
}

function assertDelta(value: number, field: string): void {
  if (!Number.isInteger(value) || value < -20 || value > 20) {
    throw new RangeError(`${field} must be an integer between -20 and 20`);
  }
}

export function createRelationshipChangeCandidate(
  input: RelationshipChangeCandidateInput,
): RelationshipChangeCandidate {
  assertNonEmptyString(input.id, "candidate.id");
  assertNonEmptyString(input.storyWorldId, "candidate.storyWorldId");
  assertNonEmptyString(input.edgeId, "candidate.edgeId");
  assertNonEmptyString(input.sourceType, "candidate.sourceType");
  assertDelta(input.deltaAffinity, "candidate.deltaAffinity");
  assertDelta(input.deltaTrust, "candidate.deltaTrust");
  assertDelta(input.deltaConflict, "candidate.deltaConflict");
  assertDelta(input.deltaDependency, "candidate.deltaDependency");
  assertIsoTimestamp(input.createdAt, "candidate.createdAt");

  const candidate: RelationshipChangeCandidate = {
    id: input.id,
    storyWorldId: input.storyWorldId,
    edgeId: input.edgeId,
    sourceType: input.sourceType,
    deltaAffinity: input.deltaAffinity,
    deltaTrust: input.deltaTrust,
    deltaConflict: input.deltaConflict,
    deltaDependency: input.deltaDependency,
    status: RelationshipChangeCandidateStatus.PENDING,
    createdAt: input.createdAt,
    ...(input.sourceRef !== undefined ? { sourceRef: input.sourceRef } : {}),
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    ...(input.ruleVersion !== undefined ? { ruleVersion: input.ruleVersion } : {}),
    ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
  };
  return candidate;
}
