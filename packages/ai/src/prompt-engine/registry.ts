import type { PreparedPrompt, PromptContext } from "./types.ts";
import { prepareV2ChatReply, prepareV2ConversationSummary, prepareV2MemoryConsolidate, prepareV2MemoryExtract, prepareV2StoryBootstrap } from "./templates.ts";

export type V2PromptPreparer = (context: PromptContext) => PreparedPrompt;

export const V2_PROMPT_PREPARERS: Readonly<Record<string, V2PromptPreparer>> = {
  "story.bootstrap": prepareV2StoryBootstrap,
  "chat.reply": prepareV2ChatReply,
  "memory.extract": prepareV2MemoryExtract,
  "memory.consolidate": prepareV2MemoryConsolidate,
  "conversation.summary": prepareV2ConversationSummary,
};

export function prepareV2Prompt(context: PromptContext): PreparedPrompt {
  const preparer = V2_PROMPT_PREPARERS[context.task];
  if (preparer === undefined) {
    throw new Error(`Unsupported prompt task: ${context.task}`);
  }
  return preparer(context);
}
