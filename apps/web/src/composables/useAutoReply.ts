import { ref, type Ref } from "vue";
import type { ApiMessage } from "../types";
import {
  deterministicReplyId,
  type AutoReplyResult,
} from "../lib/auto-reply";

export function useAutoReply(
  currentConversationId: Ref<string>,
  messages: Ref<ApiMessage[]>,
  loadMessages: () => Promise<void>,
) {
  const autoReply = ref<AutoReplyResult | null>(null);
  const replyError = ref("");
  const isGenerating = ref(false);
  let replyTimer: ReturnType<typeof setTimeout> | undefined;
  const trackedConversationId = ref("");

  function stopReplyPolling(): void {
    if (replyTimer !== undefined) {
      clearTimeout(replyTimer);
      replyTimer = undefined;
    }
    isGenerating.value = false;
  }

  function pollReply(sourceMessageId: string): void {
    stopReplyPolling();
    isGenerating.value = true;
    const conversationId = currentConversationId.value;
    trackedConversationId.value = conversationId;
    const expectedId = deterministicReplyId(conversationId, sourceMessageId);
    let attempts = 0;

    const check = async (): Promise<void> => {
      // Abort if conversation changed
      if (currentConversationId.value !== conversationId) {
        stopReplyPolling();
        return;
      }
      attempts += 1;
      try {
        await loadMessages();
        // Re-check after load
        if (currentConversationId.value !== conversationId) {
          stopReplyPolling();
          return;
        }
        if (messages.value.some((m) => m.id === expectedId)) {
          stopReplyPolling();
          replyError.value = "";
          return;
        }
        if (attempts >= 30) {
          stopReplyPolling();
          replyError.value = "回复等待超时，请重试";
          return;
        }
        replyTimer = setTimeout(check, 1_500);
      } catch {
        stopReplyPolling();
        replyError.value = "回复轮询失败";
      }
    };
    replyTimer = setTimeout(check, 500);
  }

  function applyAutoReply(result: AutoReplyResult | null, fallbackSourceId: string): void {
    autoReply.value = result;
    replyError.value = "";
    if (!result || result.status === "NOT_APPLICABLE") {
      stopReplyPolling();
      return;
    }
    if (result.status === "QUEUED") {
      pollReply(result.sourceMessageId ?? fallbackSourceId);
      return;
    }
    if (result.status === "COMPLETED" || result.status === "ALREADY_EXISTS") {
      stopReplyPolling();
      void loadMessages();
      return;
    }
    if (result.status === "FAILED") {
      stopReplyPolling();
      replyError.value = "回复生成失败，请重试";
    }
  }

  function cleanup(): void {
    stopReplyPolling();
    autoReply.value = null;
    replyError.value = "";
  }

  return {
    autoReply,
    replyError,
    isGenerating,
    applyAutoReply,
    stopReplyPolling,
    cleanup,
  };
}
