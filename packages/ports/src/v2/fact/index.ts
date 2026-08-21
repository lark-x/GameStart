import type {
  V2ConversationId,
  V2FactExtractorVersion,
  V2MessageId,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
import type {
  V2FactAssertion,
  V2FactAssertionBatch,
  V2FactBatchStatus,
} from "@living-network/domain/v2";

export interface V2FactRepository {
  createBatch(input: V2FactAssertionBatch): Promise<V2FactAssertionBatch>;
  getBatch(batchId: string): Promise<V2FactAssertionBatch | undefined>;
  findBatchByRange(input: {
    readonly conversationId: V2ConversationId;
    readonly fromMessageId: V2MessageId;
    readonly toMessageId: V2MessageId;
    readonly extractorVersion: V2FactExtractorVersion;
  }): Promise<V2FactAssertionBatch | undefined>;
  listBatchesByConversation(
    conversationId: V2ConversationId,
    options?: { readonly limit?: number; readonly afterBatchId?: string },
  ): Promise<readonly V2FactAssertionBatch[]>;
  updateBatchStatus(input: {
    readonly batchId: string;
    readonly status: V2FactBatchStatus;
    readonly completedAt?: string;
  }): Promise<V2FactAssertionBatch | undefined>;

  createAssertions(input: readonly V2FactAssertion[]): Promise<readonly V2FactAssertion[]>;
  listAssertionsByBatch(batchId: string): Promise<readonly V2FactAssertion[]>;
  listAssertionsByConversation(
    conversationId: V2ConversationId,
    options?: { readonly limit?: number; readonly extractorVersion?: V2FactExtractorVersion },
  ): Promise<readonly V2FactAssertion[]>;
  getAssertion(assertionId: string): Promise<V2FactAssertion | undefined>;

  // Engine consumption offsets: each engine tracks its own progress through batches.
  getEngineOffset(engineId: string, scopeKey: string): Promise<string | undefined>;
  setEngineOffset(engineId: string, scopeKey: string, lastBatchId: string): Promise<void>;

  // Count distinct characters actually referenced as fact subjects.
  countDistinctCharacterSubjects(): Promise<number>;
  countFactBatches(): Promise<number>;
  countFactAssertions(): Promise<number>;
}

export interface V2FactWorldSummary {
  readonly storyWorldId: V2StoryWorldId;
  readonly batchCount: number;
  readonly assertionCount: number;
}
