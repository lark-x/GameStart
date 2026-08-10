<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch, type ComponentPublicInstance } from "vue";
import { ImagePlus, Paperclip, RefreshCw, RotateCcw, Send, Type, X } from "@lucide/vue";
import Button from "../components/ui/Button.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import Input from "../components/ui/Input.vue";
import Textarea from "../components/ui/Textarea.vue";
import { useAppStore } from "../stores/app.js";
import { importChatBackgroundFile, useTheme } from "../lib/theme";
import {
  deterministicReplyId,
  findPendingSource,
  normalizeAutoReply,
  type AutoReplyResult,
} from "../lib/auto-reply";
import { errorMessage, type ApiCharacter, type ApiConversation, type ApiImageJob, type ApiMessage } from "../types";
import { splitChatMessage } from "../lib/chat-message";

const store = useAppStore();
const { chatBackground, setChatBackground } = useTheme();
const messages = ref<ApiMessage[]>([]);
const conversations = ref<ApiConversation[]>([]);
const currentConversationId = ref("");
const messageInput = ref("");
const selectedImage = ref<File | null>(null);
const imagePreview = ref("");
const imageUploadStatus = ref("");
const unavailableImageIds = ref(new Set<string>());
const imageInput = ref<HTMLInputElement | null>(null);
const composerInput = ref<ComponentPublicInstance | null>(null);
const enterSends = ref(localStorage.getItem("living-network.chat.enter-sends") !== "false");
const status = ref("准备加载会话……");
const messagesContainer = ref<HTMLElement | null>(null);
const isGenerating = ref(false);
const autoReply = ref<AutoReplyResult | null>(null);
const replyError = ref("");
let replyTimer: number | undefined;
const backgroundInput = ref<HTMLInputElement | null>(null);
const backgroundStatus = ref("");
const showImageRequest = ref(false);
const imagePrompt = ref("");
const imageWorkflowVersion = ref("");
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

const currentConversation = computed(() =>
  conversations.value.find(
    (item) => item.conversation.id === currentConversationId.value,
  ),
);
function conversationCharacters(item: ApiConversation | undefined) {
  if (!item) return [];
  const memberIds = item.members
    .filter((member) => !member.leftAt && member.characterId !== store.currentCharacterId)
    .map((member) => member.characterId);
  return memberIds
    .map((id) => store.characters.find((character) => character.id === id))
    .filter((character): character is ApiCharacter => character !== undefined);
}
const peerCharacters = computed(() => conversationCharacters(currentConversation.value));
const primaryPeer = computed(() => peerCharacters.value[0]);
const characterName = computed(() =>
  currentConversation.value?.conversation.title ||
  peerCharacters.value.map((character) => character.displayName).join("、") ||
  "未命名会话",
);
const characterInitial = computed(() => characterName.value.slice(0, 1));
const characterSubtitle = computed(() => {
  if (currentConversation.value?.conversation.type === "GROUP") return `${peerCharacters.value.length + 1} 人群聊`;
  return `${primaryPeer.value?.role === "AI" ? "AI 角色" : "角色"} · 私聊`;
});
const chatStatus = computed(() => currentConversation.value ? "对话已同步" : status.value);
const messageViews = computed(() => messages.value.map((message, index) => {
  const previous = messages.value[index - 1];
  const day = new Date(message.createdAt).toDateString();
  return {
    message,
    display: splitChatMessage(message.text),
    dayLabel: previous && new Date(previous.createdAt).toDateString() === day
      ? ""
      : new Date(message.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", weekday: "short" }),
  };
}));
const pendingSource = computed(() =>
  findPendingSource(
    currentConversationId.value,
    currentConversation.value?.conversation,
    store.currentCharacter,
    store.currentCharacterId,
    messages.value,
  ),
);
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
    conversationCharacters(item).map((character) => character.displayName).join("、") ||
    (item.conversation.type === "PRIVATE" ? "私聊" : "小组聊天")
  );
}

function conversationMeta(item: ApiConversation) {
  const count = item.members.filter((member) => !member.leftAt).length;
  return item.conversation.type === "PRIVATE" ? "私聊" : `${count} 人群聊`;
}

function characterImage(character: ApiCharacter | undefined) {
  const value = character?.visualPromptRef?.trim();
  return value && /^(?:https?:\/\/|data:image\/|blob:|\/)/i.test(value) ? value : undefined;
}

function messageCharacter(message: ApiMessage) {
  return store.characters.find((character) => character.id === message.authorCharacterId);
}

function messageTime(message: ApiMessage) {
  return new Date(message.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function isMine(message: ApiMessage) {
  return message.authorCharacterId === store.currentCharacterId;
}

function setEnterSends(value: boolean) {
  enterSends.value = value;
  localStorage.setItem("living-network.chat.enter-sends", String(value));
}

function resizeComposer(event?: Event) {
  const emittedTarget = event?.target;
  const componentElement = composerInput.value?.$el;
  const element = emittedTarget instanceof HTMLTextAreaElement
    ? emittedTarget
    : componentElement instanceof HTMLTextAreaElement
      ? componentElement
      : undefined;
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
}

function openImagePicker() {
  imageInput.value?.click();
}

function clearSelectedImage() {
  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value);
  selectedImage.value = null;
  imagePreview.value = "";
  imageUploadStatus.value = "";
}

function markImageUnavailable(messageId: string) {
  unavailableImageIds.value = new Set([...unavailableImageIds.value, messageId]);
}

function onImageSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
    imageUploadStatus.value = "请选择图片文件";
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    imageUploadStatus.value = "图片不能超过 12MB";
    return;
  }
  selectedImage.value = file;
  imageUploadStatus.value = `${Math.ceil(file.size / 1024)} KB`;
  imagePreview.value = URL.createObjectURL(file);
}

function onComposerKeydown(event: KeyboardEvent) {
  const send = enterSends.value
    ? event.key === "Enter" && !event.shiftKey
    : event.key === "Enter" && (event.ctrlKey || event.metaKey);
  if (!send) return;
  event.preventDefault();
  void sendMessage();
}
function authorName(message: ApiMessage) {
  if (message.kind === "SYSTEM" || !message.authorCharacterId) return "系统";
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
  if ((!value && !selectedImage.value) || !currentConversationId.value || !store.currentCharacterId)
    return;
  const id = crypto.randomUUID();
  try {
    let mediaRef: string | undefined;
    if (selectedImage.value) {
      imageUploadStatus.value = "正在上传图片…";
      const uploaded = await store.api.uploadChatImage(selectedImage.value);
      mediaRef = uploaded.data.mediaRef;
    }
    const result = await store.api.sendMessage(currentConversationId.value, {
      id,
      authorCharacterId: store.currentCharacterId,
      kind: mediaRef ? "IMAGE" : "TEXT",
      ...(mediaRef ? { mediaRef, ...(value ? { text: value } : {}) } : { text: value }),
      createdAt: new Date().toISOString(),
      idempotencyKey: id,
    });
    messageInput.value = "";
    clearSelectedImage();
    resizeComposer();
    await loadMessages();
    applyAutoReply(normalizeAutoReply(result.data?.autoReply), id);
  } catch (e: unknown) {
    status.value = errorMessage(e);
    replyError.value = errorMessage(e);
    const correlationId = (e as { correlationId?: string }).correlationId;
    autoReply.value = {
      status: "FAILED",
      ...(correlationId ? { correlationId } : {}),
    };
  }
}

function stopReplyPolling() {
  if (replyTimer !== undefined) {
    window.clearTimeout(replyTimer);
    replyTimer = undefined;
  }
  isGenerating.value = false;
}

function pollReply(sourceMessageId: string) {
  stopReplyPolling();
  isGenerating.value = true;
  const conversationId = currentConversationId.value;
  const expectedId = deterministicReplyId(conversationId, sourceMessageId);
  let attempts = 0;
  const check = async () => {
    if (currentConversationId.value !== conversationId) return;
    attempts += 1;
    try {
      await loadMessages();
      if (messages.value.some((message) => message.id === expectedId)) {
        stopReplyPolling();
        replyError.value = "";
        status.value = "回复已送达";
        return;
      }
      if (attempts >= 30) {
        stopReplyPolling();
        replyError.value = "回复等待超时，请重试";
        status.value = "回复需要重试";
        return;
      }
      replyTimer = window.setTimeout(check, 1_500);
    } catch (error: unknown) {
      stopReplyPolling();
      replyError.value = errorMessage(error);
    }
  };
  replyTimer = window.setTimeout(check, 500);
}

function applyAutoReply(result: AutoReplyResult | null, fallbackSourceId: string) {
  autoReply.value = result;
  replyError.value = "";
  if (!result || result.status === "NOT_APPLICABLE") {
    stopReplyPolling();
    return;
  }
  if (result.status === "QUEUED") {
    status.value = "正在生成回复……";
    pollReply(result.sourceMessageId ?? fallbackSourceId);
    return;
  }
  if (result.status === "COMPLETED" || result.status === "ALREADY_EXISTS") {
    stopReplyPolling();
    status.value = "回复已送达";
    void loadMessages();
    return;
  }
  stopReplyPolling();
  replyError.value = "回复生成失败，请重试";
}

async function triggerGenerateReply() {
  const source = pendingSource.value;
  if (
    !source ||
    !currentConversationId.value ||
    !store.currentCharacterId ||
    isGenerating.value
  ) return;

  isGenerating.value = true;
  replyError.value = "";
  status.value = "正在重试回复……";
  try {
    const result = await store.api.retryAutoReply(currentConversationId.value, {
      readerCharacterId: store.currentCharacterId,
      sourceMessageId: source.id,
    });
    applyAutoReply(normalizeAutoReply(result.data), source.id);
  } catch (e: unknown) {
    stopReplyPolling();
    replyError.value = errorMessage(e);
    const correlationId = (e as { correlationId?: string }).correlationId;
    autoReply.value = {
      status: "FAILED",
      ...(correlationId ? { correlationId } : {}),
    };
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
        imageStatus.value = "图片已生成";
        await loadMessages();
        return;
      }
      if (imageJob.value?.status === "FAILED" || imageJob.value?.status === "CANCELLED") {
        imageStatus.value = imageJob.value.failureReason || "Image generation stopped";
        return;
      }
      imageStatus.value = imageJob.value?.status === "SUBMITTED" ? "正在生成图片…" : "图片请求已排队";
    } catch (error: unknown) {
      imageStatus.value = errorMessage(error);
      return;
    }
    await wait(2_000);
  }
  imageStatus.value = "图片仍在排队，请稍后刷新查看。";
}

async function requestConversationImage() {
  const prompt = imagePrompt.value.trim();
  if (!prompt || !currentConversationId.value || !store.currentCharacterId || !imageRecipientId.value) {
    imageStatus.value = "请选择私聊会话，并填写配图描述。";
    return;
  }
  isRequestingImage.value = true;
  imageStatus.value = "正在创建图片请求…";
  try {
    const idempotencyKey = crypto.randomUUID();
    const result = await store.api.requestConversationImage(currentConversationId.value, {
      actorCharacterId: store.currentCharacterId,
      recipientCharacterId: imageRecipientId.value,
      prompt,
      workflowVersion: imageWorkflowVersion.value.trim() || "comfy-anima@v1",
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

async function loadImageDefaults() {
  try {
    const result = await store.api.getComfyUiSettings();
    imageWorkflowVersion.value = result.data.defaultWorkflowVersion ?? "comfy-anima@v1";
  } catch {
    imageWorkflowVersion.value = "comfy-anima@v1";
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
  () => {
    stopReplyPolling();
    autoReply.value = null;
    replyError.value = "";
    void loadConversations();
  },
  { immediate: true },
);
watch(currentConversationId, () => {
  stopReplyPolling();
  autoReply.value = null;
  replyError.value = "";
  void loadMessages();
});
void loadImageDefaults();
onUnmounted(() => {
  stopReplyPolling();
  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value);
});
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
          ><RefreshCw :size="17" /></Button
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
              v-if="characterImage(conversationCharacters(item)[0])"
              :src="characterImage(conversationCharacters(item)[0])"
              :alt="conversationLabel(item)"
            /><span v-else>{{ conversationLabel(item).slice(0, 1) }}</span></span
          >
          <span class="conversation-copy"
            ><strong>{{ conversationLabel(item) }}</strong
            ><small>{{
              conversationMeta(item)
            }}</small></span
          >
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
              v-if="characterImage(primaryPeer)"
              :src="characterImage(primaryPeer)"
              :alt="characterName"
            /><span v-else>{{ characterInitial }}</span></span
          >
          <div>
            <h1>{{ characterName }}</h1>
            <p>{{ characterSubtitle }}</p>
          </div>
        </div>
        <div class="header-actions">
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
            ><ImagePlus :size="17" /></Button
          >
          <Button
            v-if="chatBackground.kind === 'custom'"
            variant="ghost"
            size="icon"
            title="恢复主题默认背景"
            aria-label="恢复主题默认背景"
            @click="resetBackground"
            ><RotateCcw :size="17" /></Button
          >
          <Button class="image-action" variant="ghost" :disabled="!imageRecipientId" title="打开聊天配图" aria-label="打开聊天配图" @click="showImageRequest = !showImageRequest"><ImagePlus :size="15" /><span>配图</span></Button>
          <Button class="retry-action" v-if="pendingSource || autoReply?.status === 'FAILED' || replyError" title="重试回复" aria-label="重试回复" @click="triggerGenerateReply" :disabled="isGenerating || !pendingSource"><RefreshCw :size="15" /><span>{{ isGenerating ? "生成中" : "重试回复" }}</span></Button>
        </div>
      </header>

      <div class="chat-status-strip">
        <span class="thought-status">{{ isGenerating ? `${characterName} 正在回复…` : chatStatus }}</span>
        <span v-if="backgroundStatus" class="background-status">{{ backgroundStatus }}</span>
      </div>

      <div v-if="replyError || autoReply?.status === 'FAILED'" class="reply-error" role="alert">
        <span>{{ replyError || "回复失败，请重试" }}</span>
        <code v-if="autoReply?.correlationId">{{ autoReply.correlationId }}</code>
        <RouterLink
          v-if="autoReply?.correlationId"
          :to="{ path: '/creator/logs', query: { correlationId: autoReply.correlationId } }"
        >查看日志</RouterLink>
      </div>

      <div ref="messagesContainer" class="message-stream">
        <EmptyState
          v-if="!messages.length"
          class="empty-chat"
          title="开始今天的对话吧"
          description="说点什么，让故事继续发生。"
          ><template #icon>{{ characterInitial }}</template></EmptyState
        >
        <template v-for="item in messageViews" :key="item.message.id">
          <time v-if="item.dayLabel" class="day-separator">{{ item.dayLabel }}</time>
        <article class="message-row" :class="{ mine: isMine(item.message), system: item.message.kind === 'SYSTEM' }">
          <span v-if="!isMine(item.message) && item.message.kind !== 'SYSTEM'" class="avatar character-avatar">
            <img v-if="characterImage(messageCharacter(item.message))" :src="characterImage(messageCharacter(item.message))" :alt="authorName(item.message)" />
            <span v-else>{{ authorName(item.message).slice(0, 1) }}</span>
          </span>
          <div class="message-wrap">
            <span v-if="item.message.kind !== 'SYSTEM'" class="message-name">{{ authorName(item.message) }}</span>
            <div class="message-bubble">
              <template v-if="item.message.kind === 'IMAGE'">
                <img
                  v-if="item.message.mediaRef && !unavailableImageIds.has(item.message.id)"
                  :src="store.api.mediaUrl(item.message.mediaRef)"
                  alt="聊天图片"
                  @error="markImageUnavailable(item.message.id)"
                />
                <p v-else class="image-unavailable">图片不可用</p>
                <p v-if="item.display.body" class="image-caption">{{ item.display.body }}</p>
              </template>
              <p v-else-if="item.message.kind === 'STICKER'">贴纸 · {{ item.message.stickerId || "未知" }}</p>
              <p v-else-if="item.display.body">{{ item.display.body }}</p>
              <p v-else class="message-empty">消息没有可显示的正文</p>
            </div>
            <time class="message-time">{{ messageTime(item.message) }}</time>
          </div>
          <span v-if="isMine(item.message) && item.message.kind !== 'SYSTEM'" class="avatar user-avatar">我</span>
        </article>
        </template>
      </div>

      <section v-if="showImageRequest" class="image-request-panel">
        <header><strong>聊天配图</strong><span>图片请求与消息正文分开显示。</span></header>
        <div class="image-request-fields">
          <Input v-model="imagePrompt" class="image-prompt-input" placeholder="描述想生成的聊天配图" @keyup.enter="requestConversationImage" />
          <Input v-model="imageWorkflowVersion" class="image-workflow-input" placeholder="workflow@version" @keyup.enter="requestConversationImage" />
          <Button @click="requestConversationImage" :disabled="isRequestingImage || !imagePrompt.trim() || !imageRecipientId">{{ isRequestingImage ? "提交中" : "生成" }}</Button>
        </div>
        <p v-if="imageStatus" class="image-request-status">{{ imageStatus }}</p>
        <img v-if="imageJob?.status === 'SUCCEEDED' && imageJob.mediaRef" class="image-request-result" :src="store.api.mediaUrl(imageJob.mediaRef)" alt="已生成的聊天配图" />
      </section>

      <footer class="composer">
        <input ref="imageInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="visually-hidden" @change="onImageSelected" />
        <Button variant="ghost" size="icon" class="composer-tool" title="添加图片" aria-label="添加图片" @click="openImagePicker"><Paperclip :size="17" /></Button>
        <div class="composer-main">
          <div v-if="selectedImage" class="image-attachment">
            <img :src="imagePreview" alt="待发送图片预览" />
            <span>{{ selectedImage.name }}</span>
            <Button variant="ghost" size="icon" title="移除图片" aria-label="移除图片" @click="clearSelectedImage"><X :size="15" /></Button>
          </div>
          <Textarea
            ref="composerInput"
            v-model="messageInput"
            class="composer-input"
            :rows="1"
            :placeholder="selectedImage ? '可添加图片说明…' : '输入消息…'"
            @keydown="onComposerKeydown"
            @input="resizeComposer"
          />
          <div class="composer-meta">
            <button type="button" class="enter-mode" :aria-pressed="enterSends" @click="setEnterSends(!enterSends)"><Type :size="14" /> {{ enterSends ? 'Enter 发送' : 'Enter 换行' }}</button>
            <span v-if="imageUploadStatus">{{ imageUploadStatus }}</span>
            <span v-else>{{ enterSends ? 'Shift+Enter 换行' : 'Ctrl/Cmd+Enter 发送' }}</span>
          </div>
        </div>
        <Button
          size="icon"
          class="send-button"
          title="发送消息"
          aria-label="发送消息"
          @click="sendMessage"
          :disabled="!messageInput.trim() && !selectedImage"
          ><Send :size="17" /></Button
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
.reply-error {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 9px var(--space-6);
  color: var(--danger);
  background: var(--surface-soft);
  border-bottom: 1px solid var(--border);
  font-size: var(--text-xs);
}
.reply-error code,
.reply-error a {
  overflow-wrap: anywhere;
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
.day-separator {
  align-self: center;
  padding: 3px 9px;
  color: var(--muted);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  font-size: var(--text-xs);
}
.composer-main { min-width: 0; flex: 1; display: grid; gap: 3px; }
.image-attachment { display: flex; align-items: center; gap: 7px; min-width: 0; color: var(--muted); font-size: var(--text-xs); }
.image-attachment img { width: 38px; height: 38px; border-radius: var(--radius-sm); object-fit: cover; }
.image-attachment span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.composer-meta { display: flex; align-items: center; gap: 10px; color: var(--faint); font-size: 11px; }
.enter-mode { display: inline-flex; align-items: center; gap: 4px; padding: 0; border: 0; background: transparent; color: var(--primary); cursor: pointer; font: inherit; }
.message-row {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  max-width: min(76%, 720px);
}
.message-row.system {
  align-self: center;
  max-width: min(86%, 720px);
}
.message-row.system .message-wrap {
  justify-items: center;
}
.message-row.system .message-bubble {
  padding: 7px 11px;
  color: var(--muted);
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: none;
  font-size: var(--text-sm);
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
.message-time {
  padding: 0 4px;
  color: var(--faint);
  font-size: var(--text-xs);
}
.message-row.mine .message-time {
  text-align: right;
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
  resize: none;
  overflow-y: auto;
  line-height: 1.45;
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
  .header-actions {
    gap: 4px;
  }
  .header-actions .image-action,
  .header-actions .retry-action {
    width: 36px;
    height: 36px;
    padding: 0;
  }
  .header-actions .image-action span,
  .header-actions .retry-action span {
    display: none;
  }
  .header-profile h1 {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .thought-status {
    display: none;
  }
  .reply-error {
    padding-inline: var(--space-4);
  }
  .message-stream {
    padding: var(--space-4);
  }
  .message-row {
    max-width: 92%;
  }
  .composer {
    margin: 0 var(--space-3) var(--space-3);
  }
}

.chat-status-strip { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-height: 32px; padding: 0 var(--space-6); border-bottom: 1px solid var(--border); color: var(--muted); font-size: var(--text-xs); }
.chat-status-strip .thought-status { display: block; }
.message-empty, .image-unavailable { color: var(--muted); }
.image-request-panel { flex: 0 0 auto; margin: 0 var(--space-6) var(--space-3); padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); box-shadow: var(--shadow-sm); }
.image-request-panel header { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-2); color: var(--text-strong); }
.image-request-panel header span { color: var(--muted); font-size: var(--text-xs); }
.image-request-fields { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.image-request-fields .image-prompt-input { flex: 1 1 260px; min-width: 180px; }
.image-request-fields .image-workflow-input { flex: 0 1 170px; min-width: 130px; }
.image-request-panel .image-request-status { margin-top: 7px; color: var(--muted); font-size: var(--text-xs); }
.image-request-panel .image-request-result { margin-top: 8px; }
@media (max-width: 767px) { .chat-status-strip { padding: 0 var(--space-4); } .chat-status-strip .thought-status { display: block; } .image-request-panel { margin: 0 var(--space-3) var(--space-3); } .image-request-panel header { align-items: flex-start; flex-direction: column; gap: 2px; } .image-request-fields { align-items: stretch; flex-direction: column; } .image-request-fields .image-prompt-input, .image-request-fields .image-workflow-input { width: 100%; min-width: 0; flex: none; } }
</style>
