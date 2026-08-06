<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useAppStore } from "../stores/app.js";
import { errorMessage, type ApiConversation, type ApiMessage } from "../types";
import type { MessageKind } from "../../../../packages/contracts/src/index.ts";

const store = useAppStore();
const messages = ref<ApiMessage[]>([]);
const conversations = ref<ApiConversation[]>([]);
const currentConversationId = ref("");
const messageInput = ref("");
const messageKind = ref<MessageKind>("TEXT");
const status = ref("准备加载会话……");
const messagesContainer = ref<HTMLElement | null>(null);
const isGenerating = ref(false);

const characterName = computed(() => store.currentCharacter?.displayName || "默认助手");
const characterInitial = computed(() => characterName.value.slice(0, 1));

function conversationLabel(item: ApiConversation) {
  return item.conversation.title || (item.conversation.type === "PRIVATE" ? "和我聊天" : "小组聊天");
}

function isMine(message: ApiMessage) { return message.authorCharacterId === store.currentCharacterId; }
function authorName(message: ApiMessage) {
  return isMine(message) ? "我" : store.characters.find(c => c.id === message.authorCharacterId)?.displayName || characterName.value;
}

async function loadConversations() {
  if (!store.currentCharacterId) return;
  try {
    status.value = "正在读取会话……";
    const result = await store.api.getConversations(store.currentCharacterId);
    conversations.value = result.data ?? [];
    if (!currentConversationId.value && conversations.value[0]) currentConversationId.value = conversations.value[0].conversation.id;
    await loadMessages();
    status.value = conversations.value.length ? `${conversations.value.length} 个会话` : "还没有会话";
  } catch (e: unknown) { status.value = errorMessage(e); }
}

async function loadMessages() {
  if (!currentConversationId.value || !store.currentCharacterId) { messages.value = []; return; }
  try {
    const result = await store.api.getMessages(currentConversationId.value, store.currentCharacterId);
    messages.value = result.data ?? [];
    scrollToBottom();
  } catch (e: unknown) { status.value = errorMessage(e); }
}

async function sendMessage() {
  const value = messageInput.value.trim();
  if (!value || !currentConversationId.value || !store.currentCharacterId) return;
  const id = crypto.randomUUID();
  try {
    await store.api.sendMessage(currentConversationId.value, {
      id, authorCharacterId: store.currentCharacterId, kind: messageKind.value,
      ...(messageKind.value === "IMAGE" ? { mediaRef: value } : { text: value }),
      createdAt: new Date().toISOString(), idempotencyKey: id,
    });
    messageInput.value = "";
    await loadMessages();
  } catch (e: unknown) { status.value = errorMessage(e); }
}

async function triggerGenerateReply() {
  if (!currentConversationId.value || !store.currentCharacterId) return;
  isGenerating.value = true;
  status.value = "正在思考回复……";
  try {
    await store.api.streamConversation(currentConversationId.value, store.currentCharacterId, {
      onDelta: () => void loadMessages(),
      onDone: () => { isGenerating.value = false; status.value = "回复已送达"; void loadMessages(); },
      onError: (err) => { isGenerating.value = false; status.value = errorMessage(err); },
    });
  } catch (e: unknown) { isGenerating.value = false; status.value = errorMessage(e); }
}

function scrollToBottom() { nextTick(() => { if (messagesContainer.value) messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight; }); }

watch(() => store.currentCharacterId, () => void loadConversations(), { immediate: true });
</script>

<template>
  <div class="chat-layout">
    <aside class="conversation-panel">
      <div class="panel-title"><span>消息</span><button @click="loadConversations" title="刷新会话">↻</button></div>
      <div class="conversation-list">
        <button v-for="item in conversations" :key="item.conversation.id" class="conversation-item" :class="{ active: item.conversation.id === currentConversationId }" @click="currentConversationId = item.conversation.id; loadMessages()">
          <span class="avatar character-avatar"><img v-if="store.currentCharacter?.visualPromptRef" :src="store.currentCharacter.visualPromptRef" /><span v-else>{{ characterInitial }}</span></span>
          <span class="conversation-copy"><strong>{{ conversationLabel(item) }}</strong><small>{{ messages[messages.length - 1]?.text || '开始一段新的故事吧' }}</small></span>
          <time>刚刚</time>
        </button>
      </div>
      <p v-if="!conversations.length" class="panel-empty">{{ status }}</p>
    </aside>

    <section class="chat-room">
      <header class="chat-header">
        <div class="header-profile"><span class="avatar character-avatar compact"><img v-if="store.currentCharacter?.visualPromptRef" :src="store.currentCharacter.visualPromptRef" /><span v-else>{{ characterInitial }}</span></span><div><h1>{{ characterName }}</h1><p>❤ 100 <em>+1.0</em></p></div></div>
        <div class="header-actions"><span class="thought-status">{{ isGenerating ? '正在整理想法…' : '今天也想和你好好聊聊。' }}</span><button @click="triggerGenerateReply" :disabled="isGenerating">{{ isGenerating ? '思考中' : '生成回复' }}</button></div>
      </header>

      <div ref="messagesContainer" class="message-stream">
        <div v-if="!messages.length" class="empty-chat"><span class="avatar character-avatar">{{ characterInitial }}</span><strong>开始今天的对话吧</strong><p>说点什么，让故事继续发生。</p></div>
        <article v-for="message in messages" :key="message.id" class="message-row" :class="{ mine: isMine(message) }">
          <span v-if="!isMine(message)" class="avatar character-avatar">{{ authorName(message).slice(0, 1) }}</span>
          <div class="message-wrap"><span class="message-name">{{ authorName(message) }}</span><div class="message-bubble"><img v-if="message.kind === 'IMAGE' && message.mediaRef" :src="message.mediaRef" /><p v-else>{{ message.text || message.stickerId || '…' }}</p></div></div>
          <span v-if="isMine(message)" class="avatar user-avatar">我</span>
        </article>
      </div>

      <footer class="composer"><button class="composer-tool" @click="messageKind = messageKind === 'TEXT' ? 'IMAGE' : 'TEXT'" :title="messageKind === 'TEXT' ? '切换为图片消息' : '切换为文本消息'">{{ messageKind === 'TEXT' ? '◌' : '▧' }}</button><input v-model="messageInput" @keyup.enter="sendMessage" :placeholder="messageKind === 'IMAGE' ? '粘贴图片地址…' : '输入消息…'" /><button class="send-button" @click="sendMessage" :disabled="!messageInput.trim()">➤</button></footer>
    </section>
  </div>
</template>

<style scoped>
.chat-layout { position: relative; z-index: 1; display: flex; height: 100%; padding: 14px 18px 14px 14px; gap: 16px; }
.conversation-panel { width: 278px; flex: 0 0 278px; padding: 14px 9px; border-radius: 20px; background: rgba(255,253,250,.6); border: 1px solid rgba(144,101,75,.08); }
.panel-title { display:flex; justify-content:space-between; align-items:center; padding: 0 10px 12px; font-size: 15px; font-weight: 750; color:#574940; }.panel-title button { border:0; background:transparent; color:#a79a91; cursor:pointer; font-size:18px; }
.conversation-list { display:grid; gap:7px; }.conversation-item { display:flex; width:100%; gap:10px; align-items:center; padding:10px; border:0; border-radius:14px; background:transparent; text-align:left; cursor:pointer; color:#4d443e; transition:.18s ease; }.conversation-item:hover,.conversation-item.active { background:#f5e2d8; }.conversation-copy { min-width:0; flex:1; display:grid; gap:4px; }.conversation-copy strong { font-size:13px; }.conversation-copy small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#9b8d84; font-size:11px; }.conversation-item time { color:#b1a49c; font-size:10px; align-self:start; }.panel-empty { padding:24px 10px; color:#a89b93; font-size:12px; text-align:center; }
.chat-room { min-width:0; flex:1; display:flex; flex-direction:column; overflow:hidden; border-radius:20px; background:rgba(255,253,250,.42); border:1px solid rgba(144,101,75,.08); box-shadow:0 10px 40px rgba(123,81,53,.05); }.chat-header { height:75px; flex:0 0 75px; display:flex; align-items:center; justify-content:space-between; padding:0 26px; border-bottom:1px solid #eee4dd; }.header-profile { display:flex; align-items:center; gap:10px; }.header-profile h1 { margin:0; font-size:15px; font-weight:750; color:#403731; }.header-profile p { margin:4px 0 0; color:#bd644d; font-size:12px; font-weight:700; }.header-profile em { font-style:normal; font-size:10px; color:#d88c78; }.header-actions { display:flex; align-items:center; gap:15px; }.thought-status { max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#a39790; font-size:11px; font-style:italic; }.header-actions button { border:1px solid #edccc0; border-radius:999px; background:#fffaf6; color:#a75842; padding:7px 12px; font-size:11px; cursor:pointer; }.header-actions button:disabled { opacity:.55; }
.message-stream { flex:1; overflow-y:auto; padding:26px max(8%, 36px); display:flex; flex-direction:column; gap:16px; }.message-row { display:flex; gap:9px; align-items:flex-start; max-width:76%; }.message-row.mine { align-self:flex-end; flex-direction:row-reverse; }.message-wrap { display:grid; gap:4px; }.message-row.mine .message-wrap { justify-items:end; }.message-name { color:#a39891; font-size:10px; padding:0 4px; }.message-bubble { max-width:620px; border-radius:6px 16px 16px 16px; background:#fff; color:#50443d; padding:12px 15px; box-shadow:0 5px 13px rgba(127,93,68,.05); font-size:14px; line-height:1.7; }.message-row.mine .message-bubble { border-radius:16px 6px 16px 16px; background:#ad5c44; color:#fffaf5; box-shadow:0 7px 16px rgba(166,83,60,.17); }.message-bubble p { margin:0; white-space:pre-wrap; }.message-bubble img { display:block; width:100%; max-width:520px; max-height:430px; object-fit:cover; border-radius:13px; }.avatar { display:grid; place-items:center; overflow:hidden; flex:0 0 auto; width:34px; height:34px; border-radius:50%; font-size:13px; font-weight:700; }.avatar img { width:100%; height:100%; object-fit:cover; }.character-avatar { background:#efd2c4; color:#8e4937; }.user-avatar { background:#c76549; color:white; }.compact { width:36px; height:36px; }.empty-chat { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; color:#7f7168; }.empty-chat .avatar { width:52px; height:52px; }.empty-chat strong { margin-top:5px; font-size:15px; }.empty-chat p { margin:0; font-size:12px; color:#a79a92; }
.composer { flex:0 0 auto; display:flex; align-items:center; gap:9px; margin:0 24px 18px; padding:7px 8px 7px 11px; background:#fff; border:1px solid #f1e6df; border-radius:999px; box-shadow:0 8px 25px rgba(122,83,62,.07); }.composer input { min-width:0; flex:1; border:0; outline:0; background:transparent; color:#4c4039; padding:7px 2px; font-size:13px; }.composer input::placeholder { color:#c2b7af; }.composer-tool,.send-button { width:34px; height:34px; display:grid; place-items:center; border:0; border-radius:50%; cursor:pointer; }.composer-tool { background:#f9eee9; color:#b8725d; font-size:18px; }.send-button { background:#df9a83; color:#fff; font-size:16px; }.send-button:disabled { opacity:.4; cursor:default; }
</style>
