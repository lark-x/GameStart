import { randomUUID } from "node:crypto";

import type { ChatProvider } from "@living-network/ai/v2";
import {
  parseV2MemoryExtractionOutput,
  prepareV2MemoryExtract,
  toV2ChatMessageContext,
  toV2MemoryContext,
} from "@living-network/ai/prompt-engine";
import {
  createV2Memory,
  type V2ChatMaintenanceJob,
} from "@living-network/domain/v2";
import type { V2SqliteChatUnitOfWork } from "@living-network/database/v2";
import type { V2ChatMaintenanceJobRepository } from "@living-network/ports/v2";

export async function processV2MemoryExtractionJob(options: {
  readonly job: V2ChatMaintenanceJob;
  readonly unitOfWork: V2SqliteChatUnitOfWork;
  readonly provider: ChatProvider;
  readonly now?: () => Date;
}): Promise<void> {
  const now = options.now ?? (() => new Date());
  const conversationId = options.job.conversationId as never;

  const prepared = await options.unitOfWork.withChatTransaction(async ({ conversations, canon, messages, memories }) => {
    const conversation = await conversations.get(conversationId);
    if (conversation === undefined) throw new Error(`Conversation not found: ${options.job.conversationId}`);
    const character = await canon.getCharacter({
      storyWorldId: conversation.storyWorldId as never,
      characterId: conversation.primaryCharacterId as never,
    });
    const recent = await messages.listRecentByConversation(conversationId, 16);
    const existingMemories = await memories.listActiveByStoryWorld(conversation.storyWorldId as never);
    return {
      conversation,
      prompt: prepareV2MemoryExtract({
        task: "memory.extract",
        tokenBudget: 4096,
        persona: character === undefined ? { name: "角色", personaText: "" } : {
          name: character.name,
          personaText: character.personaText ?? "",
        },
        memories: existingMemories.slice(0, 10).map(toV2MemoryContext),
        recentMessages: recent.map(toV2ChatMessageContext),
      }),
    };
  });

  const result = await options.provider.complete({
    messages: prepared.prompt.messages,
    responseFormat: "json_object",
    temperature: 0.2,
    maxTokens: 1024,
  });
  const parsed = parseV2MemoryExtractionOutput(result.content);

  await options.unitOfWork.withChatTransaction(async ({ memories, maintenanceJobs }) => {
    for (const candidate of parsed.memories) {
      const existing = await memories.searchActive({
        storyWorldId: prepared.conversation.storyWorldId as never,
        query: candidate.content.slice(0, 50),
        limit: 5,
      });
      if (existing.some((memory) => memory.content === candidate.content)) continue;
      await memories.create(createV2Memory({
        memoryId: `memory:extract:${randomUUID()}`,
        storyWorldId: prepared.conversation.storyWorldId,
        conversationId: prepared.conversation.conversationId,
        kind: candidate.kind,
        content: candidate.content,
        importance: candidate.importance,
        confidence: candidate.confidence,
        sourceMessageIds: candidate.sourceMessageIds,
      }));
    }
    await maintenanceJobs.complete({ jobId: options.job.jobId, completedAt: now().toISOString() });
  });
}

export async function processPendingMemoryExtractionJobs(options: {
  readonly jobs: V2ChatMaintenanceJobRepository;
  readonly unitOfWork: V2SqliteChatUnitOfWork;
  readonly provider: ChatProvider;
  readonly limit?: number;
  readonly now?: () => Date;
}): Promise<void> {
  const pending = await options.jobs.listPending(options.limit ?? 5);
  for (const job of pending) {
    if (job.jobType !== "memory_extract") continue;
    try {
      await processV2MemoryExtractionJob({
        job,
        unitOfWork: options.unitOfWork,
        provider: options.provider,
        ...(options.now === undefined ? {} : { now: options.now }),
      });
    } catch (error) {
      await options.jobs.fail({
        jobId: job.jobId,
        error: error instanceof Error ? error.message : String(error),
        updatedAt: (options.now ?? (() => new Date()))().toISOString(),
      });
    }
  }
}
