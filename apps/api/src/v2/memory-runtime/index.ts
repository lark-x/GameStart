import type {
  V2MemoryConsumeResult,
  V2MemoryEngineConsumeInput,
  V2MemoryQuery,
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
        ? await memories.listActiveScoped({
            storyWorldId: input.storyWorldId,
            conversationId: input.conversationId,
            ...(input.characterId === undefined ? {} : { characterId: input.characterId }),
            limit: input.limit,
          })
        : await memories.searchActiveScoped({
            storyWorldId: input.storyWorldId,
            conversationId: input.conversationId,
            ...(input.characterId === undefined ? {} : { characterId: input.characterId }),
            query,
            limit: input.limit,
          });
      return rows.slice(0, input.limit).map((memory, index) => toRetrievedMemory(memory, index));
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
  index: number,
): V2RetrievedMemory {
  return {
    memoryId: memory.memoryId,
    engineId: API_PRIMARY_ENGINE_ID,
    scopeType: memory.scopeType,
    scopeId: memory.scopeId,
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
