import { ref, type Ref } from "vue";
import type { ApiMessage } from "../types";
import { useAppStore } from "../stores/app";
import { errorMessage } from "../types";

export function useChatMessages(
  currentConversationId: Ref<string>,
  scrollToBottom: () => void,
) {
  const store = useAppStore();
  const messages = ref<ApiMessage[]>([]);
  const requestToken = ref(0);
  let activeController: AbortController | undefined;

  async function loadMessages(): Promise<void> {
    if (!currentConversationId.value || !store.currentCharacterId) {
      messages.value = [];
      return;
    }
    const token = ++requestToken.value;
    const conversationId = currentConversationId.value;
    const characterId = store.currentCharacterId;

    // Cancel previous request
    if (activeController) activeController.abort();
    activeController = new AbortController();

    try {
      const result = await store.api.getMessages(conversationId, characterId, activeController.signal);
      // Only apply if still current
      if (token !== requestToken.value || currentConversationId.value !== conversationId) return;
      messages.value = result.data ?? [];
      scrollToBottom();
    } catch (e: unknown) {
      if (token !== requestToken.value) return; // Superseded
      // Don't report abort errors
      if (e instanceof DOMException && e.name === "AbortError") return;
      // Status reporting is handled by the caller
      throw new Error(errorMessage(e));
    }
  }

  function cancelPending(): void {
    if (activeController) {
      activeController.abort();
      activeController = undefined;
    }
    requestToken.value++;
  }

  function cleanup(): void {
    cancelPending();
    messages.value = [];
  }

  return {
    messages,
    loadMessages,
    cancelPending,
    cleanup,
  };
}
