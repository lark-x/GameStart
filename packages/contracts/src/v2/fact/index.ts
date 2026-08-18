import type {
  V2ConversationId,
  V2IsoDateTime,
  V2MessageId,
  V2StoryWorldId,
} from "../shared/index.ts";

export const V2_FACT_EXTRACTOR_V1 = "fact.extract:v1" as const;

export type V2FactExtractorVersion = typeof V2_FACT_EXTRACTOR_V1 | (string & {});

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

  readonly storyWorldId: V2StoryWorldId;
  readonly conversationId: V2ConversationId;

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

  readonly sourceMessageIds: readonly V2MessageId[];
  readonly observedAt: V2IsoDateTime;
  readonly extractorVersion: V2FactExtractorVersion;
}

export interface V2FactAssertionBatch {
  readonly batchId: string;
  readonly storyWorldId: V2StoryWorldId;
  readonly conversationId: V2ConversationId;
  readonly fromMessageId: V2MessageId;
  readonly toMessageId: V2MessageId;
  readonly sourceMessageIds: readonly V2MessageId[];
  readonly sourceHash: string;
  readonly extractorVersion: V2FactExtractorVersion;
  readonly status: V2FactBatchStatus;
  readonly createdAt: V2IsoDateTime;
  readonly completedAt?: V2IsoDateTime;
}

export interface V2FactBatchDedupeKeyInput {
  readonly conversationId: V2ConversationId;
  readonly fromMessageId: V2MessageId;
  readonly toMessageId: V2MessageId;
  readonly extractorVersion: V2FactExtractorVersion;
}

export function v2FactBatchDedupeKey(input: V2FactBatchDedupeKeyInput): string {
  return `fact_extract:${input.conversationId}:${input.fromMessageId}:${input.toMessageId}:${input.extractorVersion}`;
}
