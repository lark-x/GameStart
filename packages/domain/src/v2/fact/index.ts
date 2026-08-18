export class V2FactDomainError extends Error {
  public readonly code = "INVALID_INPUT";

  public constructor(message: string) {
    super(message);
    this.name = "V2FactDomainError";
  }
}

export type V2FactKind =
  | "profile"
  | "preference"
  | "relationship"
  | "episodic"
  | "world_fact";

export type V2FactScopeType =
  | "user"
  | "world"
  | "character"
  | "conversation";

export type V2FactEntityType =
  | "user"
  | "character"
  | "location"
  | "item"
  | "faction"
  | "concept";

export type V2FactObjectType =
  | "text"
  | "number"
  | "boolean"
  | "entity";

export type V2FactChangeHint =
  | "new"
  | "restate"
  | "corrects"
  | "replaces_previous"
  | "unknown";

export type V2FactEpistemicStatus =
  | "asserted"
  | "observed"
  | "reported"
  | "inferred"
  | "unknown";

export type V2FactBatchStatus = "pending" | "completed" | "failed";

export interface V2FactAssertion {
  readonly assertionId: string;
  readonly batchId: string;
  readonly storyWorldId: string;
  readonly conversationId: string;
  readonly scopeType: V2FactScopeType;
  readonly scopeId: string;
  readonly subject: {
    readonly entityType: V2FactEntityType;
    readonly entityId: string;
    readonly label?: string;
  };
  readonly predicate: string;
  readonly object: {
    readonly type: V2FactObjectType;
    readonly value: string | number | boolean;
    readonly entityId?: string;
  };
  readonly kind: V2FactKind;
  readonly text: string;
  readonly changeHint: V2FactChangeHint;
  readonly epistemicStatus?: V2FactEpistemicStatus;
  readonly confidence: number;
  readonly importanceHint: number;
  readonly sourceMessageIds: readonly string[];
  readonly observedAt: string;
  readonly extractorVersion: string;
}

export interface V2FactAssertionBatch {
  readonly batchId: string;
  readonly storyWorldId: string;
  readonly conversationId: string;
  readonly fromMessageId: string;
  readonly toMessageId: string;
  readonly sourceMessageIds: readonly string[];
  readonly sourceHash: string;
  readonly extractorVersion: string;
  readonly status: V2FactBatchStatus;
  readonly createdAt: string;
  readonly completedAt?: string;
}

function assertNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new V2FactDomainError(`${field} must be a non-empty string`);
  return trimmed;
}

const FACT_KINDS = new Set<V2FactKind>(["profile", "preference", "relationship", "episodic", "world_fact"]);
const SCOPE_TYPES = new Set<V2FactScopeType>(["user", "world", "character", "conversation"]);
const ENTITY_TYPES = new Set<V2FactEntityType>(["user", "character", "location", "item", "faction", "concept"]);
const OBJECT_TYPES = new Set<V2FactObjectType>(["text", "number", "boolean", "entity"]);
const CHANGE_HINTS = new Set<V2FactChangeHint>(["new", "restate", "corrects", "replaces_previous", "unknown"]);
const EPISTEMIC_STATUSES = new Set<V2FactEpistemicStatus>(["asserted", "observed", "reported", "inferred", "unknown"]);
const BATCH_STATUSES = new Set<V2FactBatchStatus>(["pending", "completed", "failed"]);

export function createV2FactAssertion(input: {
  readonly assertionId: string;
  readonly batchId: string;
  readonly storyWorldId: string;
  readonly conversationId: string;
  readonly scopeType: V2FactScopeType;
  readonly scopeId: string;
  readonly subject: {
    readonly entityType: V2FactEntityType;
    readonly entityId: string;
    readonly label?: string;
  };
  readonly predicate: string;
  readonly object: {
    readonly type: V2FactObjectType;
    readonly value: string | number | boolean;
    readonly entityId?: string;
  };
  readonly kind: V2FactKind;
  readonly text: string;
  readonly changeHint: V2FactChangeHint;
  readonly epistemicStatus?: V2FactEpistemicStatus;
  readonly confidence: number;
  readonly importanceHint: number;
  readonly sourceMessageIds: readonly string[];
  readonly observedAt: string;
  readonly extractorVersion: string;
}): V2FactAssertion {
  const assertionId = assertNonEmpty(input.assertionId, "assertionId");
  const batchId = assertNonEmpty(input.batchId, "batchId");
  const storyWorldId = assertNonEmpty(input.storyWorldId, "storyWorldId");
  const conversationId = assertNonEmpty(input.conversationId, "conversationId");
  if (!SCOPE_TYPES.has(input.scopeType)) throw new V2FactDomainError(`unsupported scopeType: ${String(input.scopeType)}`);
  const scopeId = assertNonEmpty(input.scopeId, "scopeId");
  if (!ENTITY_TYPES.has(input.subject.entityType)) throw new V2FactDomainError(`unsupported entityType: ${String(input.subject.entityType)}`);
  const entityId = assertNonEmpty(input.subject.entityId, "subject.entityId");
  const predicate = assertNonEmpty(input.predicate, "predicate");
  if (!OBJECT_TYPES.has(input.object.type)) throw new V2FactDomainError(`unsupported objectType: ${String(input.object.type)}`);
  const value = input.object.value;
  if (input.object.type === "boolean" && typeof value !== "boolean") {
    throw new V2FactDomainError("object.value must be a boolean for boolean object type");
  }
  if (input.object.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new V2FactDomainError("object.value must be a finite number for number object type");
  }
  if (input.object.type === "entity" && typeof value !== "string") {
    throw new V2FactDomainError("object.value must be a string for entity object type");
  }
  if (input.object.type === "entity" && input.object.entityId === undefined) {
    throw new V2FactDomainError("object.entityId is required for entity object type");
  }
  if (!FACT_KINDS.has(input.kind)) throw new V2FactDomainError(`unsupported kind: ${String(input.kind)}`);
  const text = assertNonEmpty(input.text, "text");
  if (text.length > 2000) throw new V2FactDomainError("text must be 2000 characters or shorter");
  if (!CHANGE_HINTS.has(input.changeHint)) throw new V2FactDomainError(`unsupported changeHint: ${String(input.changeHint)}`);
  if (input.epistemicStatus !== undefined && !EPISTEMIC_STATUSES.has(input.epistemicStatus)) {
    throw new V2FactDomainError(`unsupported epistemicStatus: ${String(input.epistemicStatus)}`);
  }
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    throw new V2FactDomainError("confidence must be a number between 0 and 1");
  }
  if (!Number.isFinite(input.importanceHint) || input.importanceHint < 0 || input.importanceHint > 1) {
    throw new V2FactDomainError("importanceHint must be a number between 0 and 1");
  }
  if (!Array.isArray(input.sourceMessageIds) || input.sourceMessageIds.length === 0 ||
      !input.sourceMessageIds.every((id) => typeof id === "string" && id.trim().length > 0)) {
    throw new V2FactDomainError("sourceMessageIds must be a non-empty array of message ids");
  }
  if (input.observedAt.trim().length === 0) throw new V2FactDomainError("observedAt must be a non-empty ISO time");
  const extractorVersion = assertNonEmpty(input.extractorVersion, "extractorVersion");

  return {
    assertionId,
    batchId,
    storyWorldId,
    conversationId,
    scopeType: input.scopeType,
    scopeId,
    subject: {
      entityType: input.subject.entityType,
      entityId,
      ...(input.subject.label === undefined ? {} : { label: input.subject.label.trim() }),
    },
    predicate,
    object: {
      type: input.object.type,
      value,
      ...(input.object.entityId === undefined ? {} : { entityId: input.object.entityId.trim() }),
    },
    kind: input.kind,
    text,
    changeHint: input.changeHint,
    ...(input.epistemicStatus === undefined ? {} : { epistemicStatus: input.epistemicStatus }),
    confidence: input.confidence,
    importanceHint: input.importanceHint,
    sourceMessageIds: [...input.sourceMessageIds],
    observedAt: input.observedAt,
    extractorVersion,
  };
}

export function createV2FactAssertionBatch(input: {
  readonly batchId: string;
  readonly storyWorldId: string;
  readonly conversationId: string;
  readonly fromMessageId: string;
  readonly toMessageId: string;
  readonly sourceMessageIds: readonly string[];
  readonly sourceHash: string;
  readonly extractorVersion: string;
  readonly status?: V2FactBatchStatus;
  readonly createdAt?: string;
  readonly completedAt?: string;
}): V2FactAssertionBatch {
  const batchId = assertNonEmpty(input.batchId, "batchId");
  const storyWorldId = assertNonEmpty(input.storyWorldId, "storyWorldId");
  const conversationId = assertNonEmpty(input.conversationId, "conversationId");
  const fromMessageId = assertNonEmpty(input.fromMessageId, "fromMessageId");
  const toMessageId = assertNonEmpty(input.toMessageId, "toMessageId");
  if (!Array.isArray(input.sourceMessageIds) || input.sourceMessageIds.length === 0 ||
      !input.sourceMessageIds.every((id) => typeof id === "string" && id.trim().length > 0)) {
    throw new V2FactDomainError("sourceMessageIds must be a non-empty array of message ids");
  }
  const sourceHash = assertNonEmpty(input.sourceHash, "sourceHash");
  const extractorVersion = assertNonEmpty(input.extractorVersion, "extractorVersion");
  const status = input.status ?? "pending";
  if (!BATCH_STATUSES.has(status)) throw new V2FactDomainError(`unsupported batch status: ${String(status)}`);
  return {
    batchId,
    storyWorldId,
    conversationId,
    fromMessageId,
    toMessageId,
    sourceMessageIds: [...input.sourceMessageIds],
    sourceHash,
    extractorVersion,
    status,
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...(input.completedAt === undefined ? {} : { completedAt: input.completedAt }),
  };
}
