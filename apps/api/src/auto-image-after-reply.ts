import type { ConversationReplyContext } from "./conversation-orchestrator.ts";
import { promptForExplicitChatImageIntent } from "./auto-image-intent.ts";
import { requestConversationImage, requireConversationImageStore } from "./use-cases/request-conversation-image.ts";
import type { HandlerContext } from "./context.ts";

/**
 * Best-effort afterReplySaved hook that triggers automatic image generation
 * when the AI reply contains an explicit image intent in a PRIVATE conversation.
 *
 * Shared between ApiApplication.streamConversation() and routes/conversations.ts
 * to avoid duplicating the same business logic.
 */
export function createAutoImageAfterReply(ctx: HandlerContext): (context: ConversationReplyContext) => Promise<void> {
  return async (context: ConversationReplyContext) => {
    if (!context.reply.inserted || context.conversation.conversation.type !== "PRIVATE") return;
    const settings = ctx.store.comfyUiSettings === undefined ? undefined : await ctx.store.comfyUiSettings.get();
    if (!settings?.autoImageIntentEnabled || !settings.defaultWorkflowVersion) return;
    const userContent = context.latestUserMessage?.text;
    const prompt = promptForExplicitChatImageIntent(userContent, context.reply.message.text ?? "");
    if (!prompt) return;
    const userId = context.latestUserMessage?.authorCharacterId;
    if (!userId || userId === context.ai.id) return;
    try {
      const imgStore = requireConversationImageStore(ctx.store);
      await requestConversationImage(imgStore, context.conversation.conversation.id, {
        actorCharacterId: context.ai.id,
        recipientCharacterId: userId,
        prompt,
        workflowVersion: settings.defaultWorkflowVersion,
        createdAt: context.reply.message.createdAt,
        idempotencyKey: `auto-image:${context.reply.message.id}`,
      });
    } catch {
      // auto-image is best-effort; do not fail the stream
    }
  };
}
