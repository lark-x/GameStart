<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import Button from "../components/ui/Button.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import Input from "../components/ui/Input.vue";
import { useAppStore } from "../stores/app.js";
import { importChatBackgroundFile, useTheme } from "../lib/theme";
import { errorMessage, type ApiConversation, type ApiImageJob, type ApiMessage } from "../types";
import type { MessageKind } from "../../../../packages/contracts/src/index.ts";

const store = useAppStore();
const { chatBackground, setChatBackground } = useTheme();
const messages = ref<ApiMessage[]>([]);
const conversations = ref<ApiConversation[]>([]);
const currentConversationId = ref("");
const messageInput = ref("");
const messageKind = ref<MessageKind>("TEXT");
const status = ref("准备加载会话……");
const messagesContainer = ref<HTMLElement | null>(null);
const isGenerating = ref(false);
const backgroundInput = ref<HTMLInputElement | null>(null);
const backgroundStatus = ref("");
const showImageRequest = ref(false);
const imagePrompt = ref("");
const imageWorkflowVersion = ref("portrait@v1");
const imageJob = ref<ApiImageJob | null>(null);
const imageStatus = ref("");
const isRequestingImage = ref(false);

/** 聊天背景层样式：自定义图片或跟随主题的默认纹理 */
const backdropStyle = computed(() => {
  if (chatBackground.kind === "custom" && chatBackground.imageRef) {
    return {
      backgroundImage: `url("${chatBackground.imageRef}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      opacity: chatBackground.opacity,
      filter: chatBackground.blur > 0 ? `blur(${chatBackground.blur}px)` : undefined,
    };
  }
  return {
    backgroundImage: "var(--chat-texture)",
    backgroundSize: "var(--chat-texture-size)",
    opacity: chatBackground.opacity,
  };
});

function pickBackgroundImage() {
  backgroundInput.value?.click();
}

async function onBackgroundFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  backgroundStatus.value = "正在导入背景…";
  try {
    const imageRef = await importChatBackgroundFile(file);
    setChatBackground({ kind: "custom", imageRef });
    backgroundStatus.value = "聊天背景已更新";
  } catch (e: unknown) {
    backgroundStatus.value = errorMessage(e);
  }
}

function resetBackground() {
  setChatBackground({ kind: "theme" });
  backgroundStatus.value = "已恢复为主题默认背景";
}

const characterName = computed(
  () => store.currentCharacter?.displayName || "默认助手",
);
const characterInitial = computed(() => characterName.value.slice(0, 1));
const imageRecipientId = computed(() => {
  const current = conversations.value.find(
    (item) => item.conversation.id === currentConversationId.value,
  );
  return current?.members.find(
    (member) => member.characterId !== store.currentCharacterId && !member.leftAt,
  )?.characterId;
});

function conversationLabel(item: ApiConversation) {
  return (
    item.conversation.title ||
    (item.conversation.type === "PRIVATE" ? "和我聊天" : "小组聊天")
  );
}

function isMine(message: ApiMessage) {
  return message.authorCharacterId === store.currentCharacterId;
}
function authorName(message: ApiMessage) {
  return isMine(message)
    ? "我"
    : store.characters.find((c) => c.id === message.authorCharacterId)
        ?.displayName || characterName.value;
}

async function loadConversations() {
  if (!store.currentCharacterId) return;
  try {
    status.value = "正在读取会话……";
    const result = await store.api.getConversations(store.currentCharacterId);
    conversations.value = result.data ?? [];
    if (!currentConversationId.value && conversations.value[0])
      currentConversationId.value = conversations.value[0].conversation.id;
    await loadMessages();
    status.value = conversations.value.length
      ? `${conversations.value.length} 个会话`
      : "还没有会话";
  } catch (e: unknown) {
    status.value = errorMessage(e);
  }
}

async function loadMessages() {
  if (!currentConversationId.value || !store.currentCharacterId) {
    messages.value = [];
    return;
  }
  try {
    const result = await store.api.getMessages(
      currentConversationId.value,
      store.currentCharacterId,
    );
    messages.value = result.data ?? [];
    scrollToBottom();
  } catch (e: unknown) {
    status.value = errorMessage(e);
  }
}

async function sendMessage() {
  const value = messageInput.value.trim();
  if (!value || !currentConversationId.value || !store.currentCharacterId)
    return;
  const id = crypto.randomUUID();
  try {
    await store.api.sendMessage(currentConversationId.value, {
      id,
      authorCharacterId: store.currentCharacterId,
      kind: messageKind.value,
      ...(messageKind.value === "IMAGE"
        ? { mediaRef: value }
        : { text: value }),
      createdAt: new Date().toISOString(),
      idempotencyKey: id,
    });
    messageInput.value = "";
    await loadMessages();
  } catch (e: unknown) {
    status.value = errorMessage(e);
  }
}

async function triggerGenerateReply() {
  if (!currentConversationId.value || !store.currentCharacterId) return;
  isGenerating.value = true;
  status.value = "正在思考回复……";
  try {
    await store.api.streamConversation(
      currentConversationId.value,
      store.currentCharacterId,
      {
        onDelta: () => void loadMessages(),
        onDone: () => {
          isGenerating.value = false;
          status.value = "回复已送达";
          void loadMessages();
        },
        onError: (err) => {
          isGenerating.value = false;
          status.value = errorMessage(err);
        },
      },
    );
  } catch (e: unknown) {
    isGenerating.value = false;
    status.value = errorMessage(e);
  }
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

async function pollImageJob(jobId: string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const result = await store.api.getImageJob(jobId);
      imageJob.value = result.data ?? null;
      if (imageJob.value?.status === "SUCCEEDED") {
        imageStatus.value = "Image ready";
        return;
      }
      if (imageJob.value?.status === "FAILED" || imageJob.value?.status === "CANCELLED") {
        imageStatus.value = imageJob.value.failureReason || "Image generation stopped";
        return;
      }
      imageStatus.value = imageJob.value?.status === "SUBMITTED" ? "Generating image…" : "Image request queued";
    } catch (error: unknown) {
      imageStatus.value = errorMessage(error);
      return;
    }
    await wait(2_000);
  }
  imageStatus.value = "Image is still queued; refresh later to check again.";
}

async function requestConversationImage() {
  const prompt = imagePrompt.value.trim();
  if (!prompt || !currentConversationId.value || !store.currentCharacterId || !imageRecipientId.value) {
    imageStatus.value = "Choose a private conversation and enter an image prompt.";
    return;
  }
  isRequestingImage.value = true;
  imageStatus.value = "Creating image request…";
  try {
    const idempotencyKey = crypto.randomUUID();
    const result = await store.api.requestConversationImage(currentConversationId.value, {
      actorCharacterId: store.currentCharacterId,
      recipientCharacterId: imageRecipientId.value,
      prompt,
      workflowVersion: imageWorkflowVersion.value.trim() || "portrait@v1",
      createdAt: new Date().toISOString(),
      idempotencyKey,
    });
    imageJob.value = result.data ?? null;
    imagePrompt.value = "";
    if (imageJob.value) void pollImageJob(imageJob.value.id);
  } catch (error: unknown) {
    imageStatus.value = errorMessage(error);
  } finally {
    isRequestingImage.value = false;
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value)
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  });
}

watch(
  () => store.currentCharacterId,
  () => void loadConversations(),
  { immediate: true },
);
</script>

<template>
  <div class="chat-layout">
    <aside class="conversation-panel">
      <div class="panel-title">
        <span>消息</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="刷新会话"
          title="刷新会话"
          @click="loadConversations"
          >↻</Button
        >
      </div>
      <div class="conversation-list">
        <Button
          v-for="item in conversations"
          :key="item.conversation.id"
          variant="ghost"
          class="conversation-item"
          :class="{ active: item.conversation.id === currentConversationId }"
          @click="
            currentConversationId = item.conversation.id;
            loadMessages();
          "
        >
          <span class="avatar character-avatar"
            ><img
              v-if="store.currentCharacter?.visualPromptRef"
              :src="store.currentCharacter.visualPromptRef"
            /><span v-else>{{ characterInitial }}</span></span
          >
          <span class="conversation-copy"
            ><strong>{{ conversationLabel(item) }}</strong
            ><small>{{
              messages[messages.length - 1]?.text || "开始一段新的故事吧"
            }}</small></span
          >
          <time>刚刚</time>
        </Button>
      </div>
      <p v-if="!conversations.length" class="panel-empty">{{ status }}</p>
    </aside>

    <section class="chat-room">
      <div class="chat-backdrop" :style="backdropStyle" />
      <div v-if="chatBackground.kind === 'custom'" class="chat-backdrop-veil" />
      <header class="chat-header">
        <div class="header-profile">
          <span class="avatar character-avatar compact"
            ><img
              v-if="store.currentCharacter?.visualPromptRef"
              :src="store.currentCharacter.visualPromptRef"
            /><span v-else>{{ characterInitial }}</span></span
          >
          <div>
            <h1>{{ characterName }}</h1>
            <p>❤ 100 <em>+1.0</em></p>
          </div>
        </div>
        <div class="header-actions">
          <span v-if="backgroundStatus" class="background-status">{{ backgroundStatus }}</span>
          <input
            ref="backgroundInput"
            type="file"
            accept="image/*"
            class="visually-hidden"
            aria-hidden="true"
            tabindex="-1"
            @change="onBackgroundFileChange"
          />
          <Button
            variant="ghost"
            size="icon"
            title="导入图片作为聊天背景"
            aria-label="导入图片作为聊天背景"
            @click="pickBackgroundImage"
            >▦</Button
          >
          <Button
            v-if="chatBackground.kind === 'custom'"
            variant="ghost"
            size="icon"
            title="恢复主题默认背景"
            aria-label="恢复主题默认背景"
            @click="resetBackground"
            >↺</Button
          >
          <span class="thought-status">{{
            isGenerating ? "正在整理想法…" : "今天也想和你好好聊聊。"
          }}</span
          ><Button
            variant="ghost"
            :disabled="!imageRecipientId"
            @click="showImageRequest = !showImageRequest"
            >配图</Button
          ><Button @click="triggerGenerateReply" :disabled="isGenerating">{{
            isGenerating ? "思考中" : "生成回复"
          }}</Button>
        </div>
      </header>

      <div ref="messagesContainer" class="message-stream">
        <EmptyState
          class="empty-chat"
          title="开始今天的对话吧"
          description="说点什么，让故事继续发生。"
          ><template #icon>{{ characterInitial }}</template></EmptyState
        >
        <article
          v-for="message in messages"
          :key="message.id"
          class="message-row"
          :class="{ mine: isMine(message) }"
        >
          <span v-if="!isMine(message)" class="avatar character-avatar">{{
            authorName(message).slice(0, 1)
          }}</span>
          <div class="message-wrap">
            <span class="message-name">{{ authorName(message) }}</span>
            <div class="message-bubble">
              <img
                v-if="message.kind === 'IMAGE' && message.mediaRef"
                :src="message.mediaRef"
              />
              <p v-else>{{ message.text || message.stickerId || "…" }}</p>
            </div>
          </div>
          <span v-if="isMine(message)" class="avatar user-avatar">我</span>
        </article>
      </div>

      <footer class="composer">
        <div v-if="showImageRequest" class="image-request-panel">
          <Input
            v-model="imagePrompt"
            class="image-prompt-input"
            placeholder="描述想生成的聊天配图"
            @keyup.enter="requestConversationImage"
          />
          <Input
            v-model="imageWorkflowVersion"
            class="image-workflow-input"
            placeholder="workflow@version"
            @keyup.enter="requestConversationImage"
          />
          <Button
            @click="requestConversationImage"
            :disabled="isRequestingImage || !imagePrompt.trim() || !imageRecipientId"
            >{{ isRequestingImage ? "提交中" : "生成" }}</Button
          >
          <span v-if="imageStatus" class="image-request-status">{{ imageStatus }}</span>
          <img
            v-if="imageJob?.status === 'SUCCEEDED' && imageJob.mediaRef"
            class="image-request-result"
            :src="imageJob.mediaRef"
            alt="Generated chat image"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="composer-tool"
          @click="messageKind = messageKind === 'TEXT' ? 'IMAGE' : 'TEXT'"
          :title="messageKind === 'TEXT' ? '切换为图片消息' : '切换为文本消息'"
        >
          {{ messageKind === "TEXT" ? "◌" : "▧" }}
        </Button>
        <Input
          v-model="messageInput"
          class="composer-input"
          @keyup.enter="sendMessage"
          :placeholder="messageKind === 'IMAGE' ? '粘贴图片地址…' : '输入消息…'"
        />
        <Button
          size="icon"
          class="send-button"
          @click="sendMessage"
          :disabled="!messageInput.trim()"
          >➤</Button
        >
      </footer>
    </section>
  </div>
</template>

<style scoped>
/* 聊天页正好撑满视口高度，页面级无滚动条；消息流是唯一功能滚动区 */
.chat-layout {
  position: relative;
  z-index: 1;
  display: flex;
  height: 100dvh;
  padding: var(--space-4);
  gap: var(--space-4);
}
.conversation-panel {
  width: clamp(220px, 24vw, 300px);
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: var(--space-4) var(--space-3);
  border-radius: var(--radius-xl);
  background: var(--surface-glass);
  border: 1px solid var(--border);
}
.panel-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 var(--space-2) var(--space-3);
  font-size: var(--text-lg);
  font-weight: 750;
  color: var(--text-strong);
}
.conversation-list {
  display: grid;
  gap: 7px;
  overflow-y: auto;
  min-height: 0;
}
.conversation-item {
  width: 100%;
  justify-content: flex-start;
  gap: 10px;
  min-height: 0;
  padding: 10px;
  border-radius: var(--radius-md);
  font-weight: 400;
  text-align: left;
}
.conversation-item:hover:not(:disabled),
.conversation-item.active {
  background: var(--primary-soft);
  color: var(--text);
  transform: none;
}
.conversation-copy {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 4px;
}
.conversation-copy strong {
  font-size: var(--text-base);
}
.conversation-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: var(--text-xs);
}
.conversation-item time {
  color: var(--faint);
  font-size: var(--text-xs);
  align-self: flex-start;
}
.panel-empty {
  padding: var(--space-6) var(--space-2);
  color: var(--muted);
  font-size: var(--text-sm);
  text-align: center;
}
.chat-room {
  position: relative;
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border-radius: var(--radius-xl);
  background: var(--surface-glass);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}
.chat-backdrop {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-repeat: repeat;
  transition: opacity var(--motion-base);
}
.chat-backdrop-veil {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: var(--surface);
  opacity: 0.34;
}
.chat-header,
.message-stream,
.composer {
  position: relative;
  z-index: 1;
}
.chat-header {
  min-height: 72px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: 0 var(--space-6);
  border-bottom: 1px solid var(--border);
}
.header-profile {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.header-profile h1 {
  font-size: var(--text-lg);
  font-weight: 750;
  color: var(--text-strong);
}
.header-profile p {
  margin-top: 4px;
  color: var(--primary);
  font-size: var(--text-sm);
  font-weight: 700;
}
.header-profile em {
  font-style: normal;
  font-size: var(--text-xs);
  color: var(--faint);
}
.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}
.thought-status {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: var(--text-xs);
  font-style: italic;
}
.background-status {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--primary);
  font-size: var(--text-xs);
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
}
.message-stream {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-6) max(6%, var(--space-6));
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.message-row {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  max-width: min(76%, 720px);
}
.message-row.mine {
  align-self: flex-end;
  flex-direction: row-reverse;
}
.message-wrap {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.message-row.mine .message-wrap {
  justify-items: end;
}
.message-name {
  color: var(--faint);
  font-size: var(--text-xs);
  padding: 0 4px;
}
.message-bubble {
  max-width: 620px;
  border-radius: 6px 16px 16px 16px;
  background: var(--surface);
  color: var(--text);
  padding: 12px 15px;
  box-shadow: var(--shadow-sm);
  font-size: var(--text-md);
  line-height: 1.7;
}
.message-row.mine .message-bubble {
  border-radius: 16px 6px 16px 16px;
  background: var(--primary);
  color: var(--on-primary);
}
.message-bubble p {
  white-space: pre-wrap;
}
.message-bubble img {
  display: block;
  width: 100%;
  max-width: 520px;
  max-height: 430px;
  object-fit: cover;
  border-radius: var(--radius-md);
}
.avatar {
  display: grid;
  place-items: center;
  overflow: hidden;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-full);
  font-size: var(--text-base);
  font-weight: 700;
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.character-avatar {
  background: var(--primary-soft);
  color: var(--primary);
}
.user-avatar {
  background: var(--primary);
  color: var(--on-primary);
}
.compact {
  width: 36px;
  height: 36px;
}
.empty-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.composer {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 9px;
  margin: 0 var(--space-6) var(--space-5);
  padding: 7px 8px 7px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-sm);
}
.image-request-panel {
  flex: 0 0 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 4px 2px 8px;
}
.image-prompt-input {
  min-width: 180px;
  flex: 1 1 260px;
}
.image-workflow-input {
  min-width: 130px;
  flex: 0 1 170px;
}
.image-request-status {
  flex: 1 0 100%;
  color: var(--muted);
  font-size: var(--text-xs);
}
.image-request-result {
  display: block;
  max-width: min(100%, 340px);
  max-height: 220px;
  border-radius: var(--radius-md);
  object-fit: cover;
}
.composer-input {
  min-height: 0;
  min-width: 0;
  flex: 1;
  border-color: transparent;
  background: transparent;
  padding: 7px 2px;
  font-size: var(--text-base);
}
.composer-input:focus {
  border-color: transparent;
  box-shadow: none;
}
.composer-tool,
.send-button {
  border-radius: var(--radius-full);
}
.send-button {
  width: 36px;
  height: 36px;
}

@media (max-width: 767px) {
  .chat-layout {
    flex-direction: column;
    padding: var(--space-3);
    gap: var(--space-3);
  }
  .conversation-panel {
    width: 100%;
    flex: 0 0 auto;
    max-height: 32vh;
  }
  .chat-header {
    padding: 0 var(--space-4);
  }
  .thought-status {
    display: none;
  }
  .message-stream {
    padding: var(--space-4);
  }
  .composer {
    margin: 0 var(--space-3) var(--space-3);
  }
}
</style>
