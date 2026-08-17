import type { ChatProvider } from "@living-network/ai/v2";
import { prepareV2ConversationSummary, toV2ChatMessageContext } from "@living-network/ai/prompt-engine";
import { createV2ConversationSummary, type V2ChatMaintenanceJob } from "@living-network/domain/v2";
import type { V2SqliteChatUnitOfWork } from "@living-network/database/v2";
import type { V2ChatMaintenanceJobRepository } from "@living-network/ports/v2";

export async function processV2ConversationSummaryJob(options: {
  readonly job: V2ChatMaintenanceJob;
  readonly unitOfWork: V2SqliteChatUnitOfWork;
  readonly provider: ChatProvider;
  readonly now?: () => Date;
}): Promise<void> {
  const now = options.now ?? (() => new Date());
  const conversationId = options.job.conversationId as never;

  const prepared = await options.unitOfWork.withChatTransaction(async ({ conversations, messages, summaries }) => {
    const conversation = await conversations.get(conversationId);
    if (conversation === undefined) throw new Error(`Conversation not found: ${options.job.conversationId}`);
    const recent = await messages.listRecentByConversation(conversationId, 30);
    const total = await messages.countByConversation(conversationId);
    const previous = await summaries.get(conversationId);
    const lastMessage = recent.at(-1);
    if (lastMessage === undefined) throw new Error("No messages to summarize");
    return {
      conversation,
      prompt: prepareV2ConversationSummary({
        task: "conversation.summary",
        tokenBudget: 4096,
        persona: { name: "角色", personaText: "" },
        memories: [],
        ...(previous === undefined ? {} : { sessionSummary: previous.summary }),
        recentMessages: recent.map(toV2ChatMessageContext),
      }),
      total,
      lastMessageId: lastMessage.messageId,
      previousVersion: previous?.version ?? 0,
    };
  });

  const result = await options.provider.complete({
    messages: prepared.prompt.messages,
    temperature: 0.3,
    maxTokens: 1200,
  });
  const summaryText = result.content.trim();
  if (summaryText.length === 0) throw new Error("Conversation summary output is empty");

  await options.unitOfWork.withChatTransaction(async ({ summaries, maintenanceJobs }) => {
    await summaries.save(createV2ConversationSummary({
      conversationId: prepared.conversation.conversationId,
      summary: summaryText,
      coveredUntilMessageId: prepared.lastMessageId,
      sourceMessageCount: prepared.total,
      version: prepared.previousVersion + 1,
      updatedAt: now().toISOString(),
    }));
    await maintenanceJobs.complete({ jobId: options.job.jobId, completedAt: now().toISOString() });
  });
}

export async function processPendingConversationSummaryJobs(options: {
  readonly jobs: V2ChatMaintenanceJobRepository;
  readonly unitOfWork: V2SqliteChatUnitOfWork;
  readonly provider: ChatProvider;
  readonly limit?: number;
  readonly now?: () => Date;
}): Promise<void> {
  const pending = await options.jobs.listPending(options.limit ?? 5);
  for (const job of pending) {
    if (job.jobType !== "conversation_summary") continue;
    try {
      await processV2ConversationSummaryJob({
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
