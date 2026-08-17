import type { ChatMessageContext, MemoryContext, PromptContext } from "./types.ts";

export function toV2MemoryContext(memory: {
  readonly memoryId: string;
  readonly kind: string;
  readonly content: string;
  readonly importance: number;
  readonly confidence: number;
}): MemoryContext {
  return {
    memoryId: memory.memoryId,
    kind: memory.kind,
    content: memory.content,
    importance: memory.importance,
    confidence: memory.confidence,
  };
}

export function toV2ChatMessageContext(message: {
  readonly role: "user" | "assistant" | "system";
  readonly text?: string;
  readonly attachments?: readonly { readonly kind: "image" }[];
}): ChatMessageContext {
  return {
    role: message.role,
    ...(message.text === undefined ? {} : { text: message.text }),
    imageCount: message.attachments?.filter((attachment) => attachment.kind === "image").length ?? 0,
  };
}

export function baseV2PromptContext(partial: Omit<PromptContext, "task"> & { readonly task?: PromptContext["task"] }): PromptContext {
  return {
    task: partial.task ?? "chat.reply",
    memories: partial.memories ?? [],
    recentMessages: partial.recentMessages ?? [],
    tokenBudget: partial.tokenBudget ?? 4096,
    ...(partial.persona === undefined ? {} : { persona: partial.persona }),
    ...(partial.world === undefined ? {} : { world: partial.world }),
    ...(partial.canon === undefined ? {} : { canon: partial.canon }),
    ...(partial.sessionSummary === undefined ? {} : { sessionSummary: partial.sessionSummary }),
    ...(partial.currentInput === undefined ? {} : { currentInput: partial.currentInput }),
  };
}
