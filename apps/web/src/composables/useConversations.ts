import { ref, computed } from "vue";
import type { ApiConversation, ApiCharacter } from "../types";
import { useAppStore } from "../stores/app";
import { errorMessage } from "../types";

export function useConversations() {
  const store = useAppStore();
  const conversations = ref<ApiConversation[]>([]);
  const currentConversationId = ref("");
  const status = ref("准备加载会话……");

  const currentConversation = computed(() =>
    conversations.value.find((item) => item.conversation.id === currentConversationId.value),
  );

  function peerCharacters(conv?: ApiConversation): ApiCharacter[] {
    const item = conv ?? currentConversation.value;
    if (!item) return [];
    const memberIds = item.members
      .filter((member) => !member.leftAt && member.characterId !== store.currentCharacterId)
      .map((member) => member.characterId);
    return memberIds
      .map((id) => store.characters.find((c) => c.id === id))
      .filter((c): c is ApiCharacter => c !== undefined);
  }

  const primaryPeer = computed(() => peerCharacters()[0]);
  const characterName = computed(() =>
    currentConversation.value?.conversation.title ||
    peerCharacters().map((c) => c.displayName).join("、") ||
    "未命名会话",
  );
  const characterInitial = computed(() => characterName.value.slice(0, 1));
  const characterSubtitle = computed(() => {
    if (currentConversation.value?.conversation.type === "GROUP") return `${peerCharacters().length + 1} 人群聊`;
    return `${primaryPeer.value?.role === "AI" ? "AI 角色" : "角色"} · 私聊`;
  });

  function conversationLabel(item: ApiConversation): string {
    return (
      item.conversation.title ||
      peerCharacters(item).map((c) => c.displayName).join("、") ||
      (item.conversation.type === "PRIVATE" ? "私聊" : "小组聊天")
    );
  }

  function conversationMeta(item: ApiConversation): string {
    const count = item.members.filter((m) => !m.leftAt).length;
    return item.conversation.type === "PRIVATE" ? "私聊" : `${count} 人群聊`;
  }

  async function loadConversations(): Promise<void> {
    if (!store.currentCharacterId) return;
    try {
      status.value = "正在读取会话……";
      const result = await store.api.getConversations(store.currentCharacterId);
      conversations.value = result.data ?? [];
      if (!currentConversationId.value && conversations.value[0])
        currentConversationId.value = conversations.value[0].conversation.id;
      status.value = conversations.value.length ? `${conversations.value.length} 个会话` : "还没有会话";
    } catch (e: unknown) {
      status.value = errorMessage(e);
    }
  }

  return {
    conversations,
    currentConversationId,
    currentConversation,
    status,
    primaryPeer,
    characterName,
    characterInitial,
    characterSubtitle,
    peerCharacters,
    conversationLabel,
    conversationMeta,
    loadConversations,
  };
}
