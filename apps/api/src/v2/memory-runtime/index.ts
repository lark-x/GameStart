import type {
  V2MemoryConsumeResult,
  V2MemoryEngineConsumeInput,
  V2MemoryQuery,
  V2MemoryScopeType,
  V2RetrievedMemory,
} from "@living-network/contracts/v2";
import type { V2MemoryRuntime } from "@living-network/ports/v2";
import type { V2Memory } from "@living-network/domain/v2";
import type { V2MessageId } from "@living-network/contracts/v2";
import { V2SqliteMemoryRepository } from "@living-network/database/v2";

export const API_PRIMARY_ENGINE_ID = "builtin_structured";

export function createV2ApiMemoryRuntime(db: DatabaseSync): V2MemoryRuntime {
  const memories = new V2SqliteMemoryRepository(db);
  return {
    primaryEngineId: API_PRIMARY_ENGINE_ID,
    shadowEngineIds: [],
    async retrieve(input: V2MemoryQuery): Promise<readonly V2RetrievedMemory[]> {
      const query = input.query.trim();
      const rows = query.length === 0
        ? input.characterId === undefined
          ? await memories.listActiveByStoryWorld(input.storyWorldId)
          : await memories.listActiveByCharacter({
              storyWorldId: input.storyWorldId,
              characterId: input.characterId,
              limit: input.limit,
            })
        : await memories.searchActive({
            storyWorldId: input.storyWorldId,
            query,
            limit: input.limit,
          });
      const scopedRows = query.length > 0 && input.characterId !== undefined
        ? await memories.searchActiveByCharacter({
            storyWorldId: input.storyWorldId,
            characterId: input.characterId,
            query,
            limit: input.limit,
          })
        : rows;
      return scopedRows.slice(0, input.limit).map((memory, index) => toRetrievedMemory(memory, input, index));
    },
    async consumeForAllEngines(_input: V2MemoryEngineConsumeInput): Promise<readonly V2MemoryConsumeResult[]> {
      // Consumption happens in the worker; the API runtime only serves retrieval.
      return [];
    },
    listEngines() {
      return [{ id: API_PRIMARY_ENGINE_ID, mode: "primary" as const }];
    },
  };
}

function toRetrievedMemory(
  memory: V2Memory,
  input: V2MemoryQuery,
  index: number,
): V2RetrievedMemory {
  const scopeType: V2MemoryScopeType = memory.conversationId !== undefined ? "conversation" : "world";
  return {
    memoryId: memory.memoryId,
    engineId: API_PRIMARY_ENGINE_ID,
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
import type { DatabaseSync } from "node:sqlite";
