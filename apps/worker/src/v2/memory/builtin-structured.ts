import { randomUUID } from "node:crypto";

import type {
  V2MemoryConsumeResult,
  V2MemoryEngineCapabilities,
  V2MemoryQuery,
  V2MemoryScopeType,
  V2RetrievedMemory,
} from "@living-network/contracts/v2";
import type {
  V2MemoryEngine,
  V2MemoryEngineConsumeInput,
  V2MemoryEngineRunRepository,
  V2MemoryRebuildRequest,
} from "@living-network/ports/v2";
import type { V2ChatUnitOfWork } from "@living-network/ports/v2";
import {
  createV2ChatMaintenanceJob,
  createV2Memory,
  type V2Memory,
} from "@living-network/domain/v2";
import type {
  V2ConversationId,
  V2MemoryConsolidatePayload,
  V2MemoryId,
  V2MessageId,
  V2StoryWorldId,
} from "@living-network/contracts/v2";

export const BUILTIN_STRUCTURED_ENGINE_ID = "builtin_structured";

export class V2BuiltinStructuredEngine implements V2MemoryEngine {
  public readonly id = BUILTIN_STRUCTURED_ENGINE_ID;

  private readonly unitOfWork: V2ChatUnitOfWork;
  private readonly runs: V2MemoryEngineRunRepository;
  private readonly now: () => Date;

  public constructor(options: {
    readonly unitOfWork: V2ChatUnitOfWork;
    readonly runs: V2MemoryEngineRunRepository;
    readonly now?: () => Date;
  }) {
    this.unitOfWork = options.unitOfWork;
    this.runs = options.runs;
    this.now = options.now ?? (() => new Date());
  }

  public capabilities(): V2MemoryEngineCapabilities {
    return {
      acceptsFactAssertions: true,
      acceptsRawMessages: false,
      supportsMutation: true,
      supportsEmbedding: false,
      supportsEntityIndex: false,
      supportsTemporalFacts: false,
    };
  }

  public async consume(input: V2MemoryEngineConsumeInput): Promise<V2MemoryConsumeResult> {
    const runId = `run:${BUILTIN_STRUCTURED_ENGINE_ID}:${randomUUID()}`;
    const startedAt = this.now();
    await this.runs.start({
      runId,
      engineId: this.id,
      batchId: input.batch.batchId,
      inputAssertionCount: input.assertions.length,
    });
    let outputCount = 0;
    try {
      for (const assertion of input.assertions) {
        const slotKey = [
          assertion.scopeType,
          assertion.scopeId,
          assertion.subject.entityId,
          assertion.predicate,
        ].join(":");
        const mutated = await this.applyAssertion(input, assertion, slotKey);
        if (mutated) outputCount += 1;
      }
      await this.runs.complete({
        runId,
        outputMemoryCount: outputCount,
        durationMs: Date.now() - startedAt.getTime(),
      });
      return {
        engineId: this.id,
        batchId: input.batch.batchId,
        inputAssertionCount: input.assertions.length,
        outputMemoryCount: outputCount,
        mutated: outputCount > 0,
      };
    } catch (error) {
      const errorCode = (error as { code?: string } | undefined)?.code ?? "ENGINE_FAILED";
      await this.runs.fail({
        runId,
        errorCode,
        durationMs: Date.now() - startedAt.getTime(),
      });
      throw error;
    }
  }

  public async retrieve(input: V2MemoryQuery): Promise<readonly V2RetrievedMemory[]> {
    return this.unitOfWork.withChatTransaction(async (repos) => {
      const query = input.query.trim();
      const rows = query.length === 0
        ? await repos.memories.listActiveByStoryWorld(input.storyWorldId)
        : await repos.memories.searchActive({
            storyWorldId: input.storyWorldId,
            query,
            limit: input.limit,
          });
      const limited = rows.slice(0, input.limit);
      return limited.map((memory, index) => this.toRetrievedMemory(memory, input, index));
    });
  }

  public async rebuild(_input: V2MemoryRebuildRequest): Promise<void> {
    // Rebuild is handled by the dispatcher: replay fact batches through consume.
    return;
  }

  private async applyAssertion(
    input: V2MemoryEngineConsumeInput,
    assertion: V2MemoryEngineConsumeInput["assertions"][number],
    slotKey: string,
  ): Promise<boolean> {
    return this.unitOfWork.withChatTransaction(async (repos) => {
      const conversation = await repos.conversations.get(input.batch.conversationId as V2ConversationId);
      const storyWorldId = input.batch.storyWorldId as V2StoryWorldId;
      const existingMemories = await repos.memories.listByConversation(input.batch.conversationId as V2ConversationId);
      const content = assertion.text.trim();
      const exactMatch = existingMemories.find(
        (memory: V2Memory) => memory.status === "active"
          && memory.kind === assertion.kind
          && memory.content.trim() === content,
      );
      if (exactMatch !== undefined) {
        return false;
      }

      // Structured slot mutation: replaces_previous / corrects supersede the previous value.
      const sameSlot = existingMemories.filter(
        (memory: V2Memory) => memory.status === "active" && memory.slotKey === slotKey,
      );
      const shouldReplace = assertion.changeHint === "replaces_previous" || assertion.changeHint === "corrects";
      if (sameSlot.length > 0 && shouldReplace) {
        for (const memory of sameSlot) {
          await repos.memories.supersede({
            memoryId: memory.memoryId as V2MemoryId,
            updatedAt: this.now().toISOString(),
          });
        }
      }

      const similarCandidates = await repos.memories.searchActive({
        storyWorldId,
        query: content,
        limit: 5,
      });
      const similarMemory = similarCandidates.find(
        (memory: V2Memory) => memory.status === "active" && memory.kind === assertion.kind,
      );
      if (similarMemory !== undefined && sameSlot.length === 0) {
        const idempotencyKey = `memory_consolidate:${similarMemory.memoryId}:${content}`;
        const alreadyQueued = await repos.maintenanceJobs.findJobByDedupeKey("memory_consolidate", idempotencyKey) !== undefined;
        if (alreadyQueued) {
          return false;
        }
        const consolidatePayload: V2MemoryConsolidatePayload = {
          conversationId: input.batch.conversationId as V2ConversationId,
          ...(storyWorldId ? { storyWorldId } : {}),
          ...(assertion.subject.entityType === "character" ? { characterId: assertion.subject.entityId as never } : {}),
          existingMemoryId: similarMemory.memoryId as V2MemoryId,
          idempotencyKey,
          candidate: {
            kind: assertion.kind,
            content,
            importance: assertion.importanceHint,
            confidence: assertion.confidence,
            sourceMessageIds: assertion.sourceMessageIds as V2MessageId[],
          },
        };
        await repos.maintenanceJobs.enqueue(createV2ChatMaintenanceJob({
          jobId: randomUUID(),
          conversationId: input.batch.conversationId,
          jobType: "memory_consolidate",
          status: "pending",
          payload: consolidatePayload,
          dedupeKey: idempotencyKey,
          attempts: 0,
          maxAttempts: 3,
          availableAt: this.now().toISOString(),
        }));
        return false;
      }

      await repos.memories.create(createV2Memory({
        memoryId: randomUUID(),
        storyWorldId,
        conversationId: input.batch.conversationId,
        ...(conversation?.primaryCharacterId === undefined
          ? {}
          : { characterId: conversation.primaryCharacterId }),
        engineId: this.id,
        sourceAssertionIds: [assertion.assertionId],
        slotKey,
        kind: assertion.kind,
        content,
        importance: assertion.importanceHint,
        confidence: assertion.confidence,
        sourceMessageIds: assertion.sourceMessageIds,
        status: "active",
        createdAt: this.now().toISOString(),
        updatedAt: this.now().toISOString(),
      }));
      void conversation;
      return true;
    });
  }

  private toRetrievedMemory(
    memory: V2Memory,
    input: V2MemoryQuery,
    index: number,
  ): V2RetrievedMemory {
    const scopeType: V2MemoryScopeType = memory.conversationId !== undefined
      ? "conversation"
      : "world";
    return {
      memoryId: memory.memoryId,
      engineId: this.id,
      scopeType,
      scopeId: memory.conversationId ?? input.storyWorldId,
      kind: memory.kind,
      text: memory.content,
      relevance: memory.importance > 0 ? memory.importance + 1 / (index + 2) : 0,
      importance: memory.importance,
      confidence: memory.confidence,
      sourceAssertionIds: memory.sourceAssertionIds ?? [],
      sourceMessageIds: memory.sourceMessageIds as V2MessageId[],
      ...(memory.createdAt === undefined ? {} : { observedAt: memory.createdAt as never }),
    };
  }
}
