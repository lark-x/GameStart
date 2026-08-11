<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch, type ComponentPublicInstance } from "vue";
import { Check, Image as ImageIcon, ImagePlus, Keyboard, RefreshCw, Send, Smile, Trash2, Wallpaper, X } from "@lucide/vue";
import Button from "../components/ui/Button.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import Input from "../components/ui/Input.vue";
import Textarea from "../components/ui/Textarea.vue";
import { useAppStore } from "../stores/app.js";
import { errorMessage, type ApiCharacter, type ApiConversation, type ApiMessage, type ApiStickerPack } from "../types";
import { splitChatMessage } from "../lib/chat-message";
import { deterministicReplyId, findPendingSource } from "../lib/auto-reply";
import { MAX_CHAT_BACKGROUND_ITEMS } from "../lib/theme";

import { useConversations } from "../composables/useConversations";
import { useChatMessages } from "../composables/useChatMessages";
import { useAutoReply } from "../composables/useAutoReply";
import { useImageJobPolling } from "../composables/useImageJobPolling";
import { useChatComposer } from "../composables/useChatComposer";
import { useChatBackground } from "../composables/useChatBackground";

type StickerOption = NonNullable<ApiStickerPack["_stickers"]>[number];

const store = useAppStore();

// --- Conversations ---
const {
  conversations, currentConversationId, currentConversation,
  status, primaryPeer, characterName, characterInitial, characterSubtitle,
  peerCharacters: peerCharactersFn, conversationLabel, conversationMeta,
  loadConversations,
} = useConversations();

function peerCharacters(conv?: ApiConversation) { return peerCharactersFn(conv); }

// --- Scroll helper ---
const messagesContainer = ref<HTMLElement | null>(null);
function scrollToBottom() {
  nextTick(() => { if (messagesContainer.value) messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight; });
}

// --- Messages ---
const { messages, loadMessages, cancelPending: cancelMessages, cleanup: cleanupMessages } = useChatMessages(currentConversationId, scrollToBottom);

// --- Auto-reply ---
const { autoReply, replyError, isGenerating, applyAutoReply, stopReplyPolling, cleanup: cleanupAutoReply } = useAutoReply(currentConversationId, messages, loadMessages);

// --- Image job polling ---
const { imageJob, imageStatus, pollImageJob, cancelPolling: cancelImagePolling, cleanup: cleanupImagePolling } = useImageJobPolling(currentConversationId, loadMessages);

// --- Composer ---
const {
  messageInput, selectedImages, composerStatus, isSendingMessage, enterSends, canSend,
  setEnterSends, addImageFiles, clearSelectedImages, removeSelectedImage, updateSelectedImage,
  sendSticker, sendMessage: sendComposerMessage, cleanup: cleanupComposer,
} = useChatComposer(currentConversationId, loadMessages, applyAutoReply);

// --- Background ---
const {
  chatBackground, backgroundStatus, backgroundPickerOpen,
  pickBackgroundImage, onBackgroundFileChange, selectBackgroundItem, removeBackgroundItem,
  toggleBackgroundPicker, cleanup: cleanupBackground,
} = useChatBackground();

// --- UI state ---
const unavailableImageIds = ref(new Set<string>());
const imageInput = ref<HTMLInputElement | null>(null);
const composerInput = ref<ComponentPublicInstance | null>(null);
const backgroundInput = ref<HTMLInputElement | null>(null);
const imageRequestOpen = ref(false);
const imagePrompt = ref("");
const imageWorkflowVersion = ref("");
const isRequestingImage = ref(false);
const stickerPacks = ref<ApiStickerPack[]>([]);
const activeStickerPackId = ref("");
const stickerPanelOpen = ref(false);
const stickerStatus = ref("");

// --- Computed views ---
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
  findPendingSource(currentConversationId.value, currentConversation.value?.conversation, store.currentCharacter, store.currentCharacterId, messages.value),
);
const imageRecipientId = computed(() => {
  const current = conversations.value.find((item) => item.conversation.id === currentConversationId.value);
  return current?.members.find((member) => member.characterId !== store.currentCharacterId && !member.leftAt)?.characterId;
});
const activeStickerPack = computed(() =>
  stickerPacks.value.find((pack) => pack.id === activeStickerPackId.value) ?? stickerPacks.value[0],
);
const stickerById = computed(() => {
  const stickers = new Map<string, StickerOption>();
  for (const pack of stickerPacks.value) {
    for (const sticker of pack._stickers ?? []) stickers.set(sticker.id, sticker);
  }
  return stickers;
});
const composerHint = computed(() => {
  if (composerStatus.value) return composerStatus.value;
  if (selectedImages.value.length) return `${selectedImages.value.length} 张图片待发送`;
  return "";
});
const enterModeLabel = computed(() => enterSends.value ? "Enter 发送" : "Enter 换行");

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

// --- Helper functions ---
function conversationCharacters(item: ApiConversation | undefined) {
  if (!item) return [];
  const memberIds = item.members
    .filter((member) => !member.leftAt && member.characterId !== store.currentCharacterId)
    .map((member) => member.characterId);
  return memberIds
    .map((id) => store.characters.find((character) => character.id === id))
    .filter((character): character is ApiCharacter => character !== undefined);
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

function sendMessage() { return sendComposerMessage(resizeComposer); }

function openImagePicker() {
  stickerPanelOpen.value = false;
  backgroundPickerOpen.value = false;
  imageInput.value?.click();
}

function toggleStickerPanel() {
  stickerPanelOpen.value = !stickerPanelOpen.value;
  if (stickerPanelOpen.value) {
    backgroundPickerOpen.value = false;
    if (stickerPacks.value.length === 0) void loadStickerPacks();
  }
}

function markImageUnavailable(messageId: string) {
  unavailableImageIds.value = new Set([...unavailableImageIds.value, messageId]);
}

function stickerForMessage(message: ApiMessage) {
  return message.stickerId ? stickerById.value.get(message.stickerId) : undefined;
}

function stickerLabel(message: ApiMessage) {
  return stickerForMessage(message)?.label ?? message.stickerId ?? "未知表情";
}

function stickerImageUrl(message: ApiMessage) {
  if (unavailableImageIds.value.has(message.id)) return "";
  const mediaRef = stickerForMessage(message)?.mediaRef;
  return mediaRef ? store.api.mediaUrl(mediaRef) : "";
}

function onImagesSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  addImageFiles(files);
}

function onComposerPaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files ?? []);
  if (!files.length) return;
  event.preventDefault();
  addImageFiles(files);
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
  return isMine(message) ? "我" : store.characters.find((c) => c.id === message.authorCharacterId)?.displayName || characterName.value;
}

// --- Sticker packs ---
async function loadStickerPacks() {
  if (!store.currentWorldId) { stickerPacks.value = []; activeStickerPackId.value = ""; return; }
  try {
    const result = await store.api.getStickerPacks(store.currentWorldId);
    const packs = (result.data ?? []) as ApiStickerPack[];
    await Promise.all(packs.map(async (pack) => {
      const stickers = await store.api.getStickers(pack.id);
      pack._stickers = stickers.data ?? [];
    }));
    stickerPacks.value = packs;
    if (!packs.some((pack) => pack.id === activeStickerPackId.value)) activeStickerPackId.value = packs[0]?.id ?? "";
    stickerStatus.value = "";
  } catch (error: unknown) {
    stickerPacks.value = []; activeStickerPackId.value = ""; stickerStatus.value = errorMessage(error);
  }
}

// --- Image request ---
async function requestConversationImage() {
  const prompt = imagePrompt.value.trim();
  if (!prompt || !currentConversationId.value || !store.currentCharacterId || !imageRecipientId.value) {
    imageStatus.value = "请选择私聊会话，并填写配图描述。"; return;
  }
  isRequestingImage.value = true;
  imageStatus.value = "正在创建图片请求…";
  try {
    const idempotencyKey = crypto.randomUUID();
    const result = await store.api.requestConversationImage(currentConversationId.value, {
      actorCharacterId: store.currentCharacterId, recipientCharacterId: imageRecipientId.value,
      prompt, workflowVersion: imageWorkflowVersion.value.trim() || "comfy-anima@v1",
      createdAt: new Date().toISOString(), idempotencyKey,
    });
    imageJob.value = result.data ?? null;
    imagePrompt.value = "";
    imageRequestOpen.value = false;
    imageStatus.value = "已请求对方生成图片，完成后会出现在聊天里。";
    if (imageJob.value) void pollImageJob(imageJob.value.id);
  } catch (error: unknown) { imageStatus.value = errorMessage(error); }
  finally { isRequestingImage.value = false; }
}

async function loadImageDefaults() {
  try {
    const result = await store.api.getComfyUiSettings();
    imageWorkflowVersion.value = result.data.defaultWorkflowVersion ?? "comfy-anima@v1";
  } catch { imageWorkflowVersion.value = "comfy-anima@v1"; }
}

// --- Background helpers ---
function selectThemeBackground() {
  setChatBackground({ ...chatBackground, kind: "theme" });
}

function selectCustomBackground(imageRef: string) {
  setChatBackground({ ...chatBackground, kind: "custom", imageRef });
}

// --- Retry auto reply ---
const triggerGenerateReply = retryAutoReply;
async function retryAutoReply() {
  if (!currentConversationId.value || !store.currentCharacterId) return;
  const sourceId = pendingSource.value?.id ?? autoReply.value?.sourceMessageId;
  if (!sourceId) return;
  replyError.value = "";
  autoReply.value = { status: "QUEUED", sourceMessageId: sourceId };
  try {
    const result = await store.api.retryAutoReply(currentConversationId.value, {
      readerCharacterId: store.currentCharacterId, sourceMessageId: sourceId,
    });
    applyAutoReply(result.data && typeof result.data === "object" && "status" in result.data ? result.data : null, sourceId);
  } catch (error: unknown) { replyError.value = errorMessage(error); }
}

// --- Watchers ---
watch(
  () => store.currentCharacterId,
  () => {
    stopReplyPolling();
    cancelMessages();
    cancelImagePolling();
    autoReply.value = null;
    replyError.value = "";
    void loadConversations().then(() => loadMessages());
  },
  { immediate: true },
);

watch(currentConversationId, () => {
  stopReplyPolling();
  cancelMessages();
  cancelImagePolling();
  autoReply.value = null;
  replyError.value = "";
  stickerPanelOpen.value = false;
  backgroundPickerOpen.value = false;
  void loadMessages();
});

watch(() => store.currentWorldId, () => void loadStickerPacks(), { immediate: true });

void loadImageDefaults();

onUnmounted(() => {
  cleanupAutoReply();
  cleanupMessages();
  cleanupImagePolling();
  cleanupComposer();
  cleanupBackground();
});
</script>
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
      </header>

      <div class="chat-status-strip">
        <span class="thought-status">{{ isGenerating ? `${characterName} 正在回复…` : chatStatus }}</span>
        <span v-if="imageStatus" class="chat-status-message">{{ imageStatus }}</span>
        <span v-if="backgroundStatus" class="chat-status-message">{{ backgroundStatus }}</span>
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
              <template v-else-if="item.message.kind === 'STICKER'">
                  <img
                    v-if="stickerImageUrl(item.message)"
                    class="sticker-message"
                    :src="stickerImageUrl(item.message)"
                    :alt="stickerLabel(item.message)"
                    @error="markImageUnavailable(item.message.id)"
                  />
                  <p v-else>贴纸 · {{ stickerLabel(item.message) }}</p>
                </template>
              <p v-else-if="item.display.body">{{ item.display.body }}</p>
              <p v-else class="message-empty">消息没有可显示的正文</p>
            </div>
            <time class="message-time">{{ messageTime(item.message) }}</time>
          </div>
          <span v-if="isMine(item.message) && item.message.kind !== 'SYSTEM'" class="avatar user-avatar">我</span>
        </article>
        </template>
      </div>


      <footer class="composer" @paste="onComposerPaste">
        <input ref="imageInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple class="visually-hidden" @change="onImagesSelected" />
        <input ref="backgroundInput" type="file" accept="image/*" class="visually-hidden" aria-hidden="true" tabindex="-1" @change="onBackgroundFileChange" />

        <div class="composer-toolbar" role="toolbar" aria-label="聊天功能">
          <Button variant="ghost" size="icon" class="composer-tool" title="表情包" aria-label="表情包" :class="{ active: stickerPanelOpen }" @click="toggleStickerPanel"><Smile :size="17" /></Button>
          <Button variant="ghost" size="icon" class="composer-tool" title="发送图片" aria-label="发送图片" @click="openImagePicker"><ImageIcon :size="17" /></Button>
          <Button variant="ghost" size="icon" class="composer-tool" :disabled="!imageRecipientId" title="请求对方发图" aria-label="请求对方发图" @click="imageRequestOpen = true; backgroundPickerOpen = false; stickerPanelOpen = false"><ImagePlus :size="17" /></Button>
          <Button variant="ghost" size="icon" class="composer-tool" title="聊天背景" aria-label="聊天背景" :class="{ active: backgroundPickerOpen || chatBackground.kind === 'custom' }" @click="toggleBackgroundPicker"><Wallpaper :size="17" /></Button>
          <Button variant="ghost" size="icon" class="composer-tool" title="重试回复" aria-label="重试回复" @click="triggerGenerateReply" :disabled="isGenerating || !pendingSource"><RefreshCw :size="17" /></Button>
          <Button variant="ghost" size="icon" class="composer-tool" :title="enterModeLabel" :aria-label="enterModeLabel" :aria-pressed="enterSends" :class="{ active: enterSends }" @click="setEnterSends(!enterSends)"><Keyboard :size="17" /></Button>
        </div>

        <div class="composer-main">
          <div v-if="backgroundPickerOpen" class="background-picker">
            <div class="background-picker-head">
              <div>
                <strong>聊天背景</strong>
                <span>选择主题默认或已导入背景</span>
              </div>
              <Button variant="ghost" size="icon" title="导入背景" aria-label="导入背景" :disabled="chatBackground.items.length >= MAX_CHAT_BACKGROUND_ITEMS" @click="pickBackgroundImage"><ImageIcon :size="16" /></Button>
            </div>
            <div class="background-options">
              <button type="button" class="background-option theme-option" :class="{ active: chatBackground.kind === 'theme' }" @click="selectThemeBackground">
                <span class="background-thumb theme-thumb" />
                <span>主题默认</span>
                <Check v-if="chatBackground.kind === 'theme'" :size="15" />
              </button>
              <article v-for="item in chatBackground.items" :key="item.id" class="background-option custom-option" :class="{ active: chatBackground.kind === 'custom' && chatBackground.imageRef === item.imageRef }">
                <button type="button" @click="selectCustomBackground(item.imageRef)">
                  <img :src="item.imageRef" :alt="item.label" />
                  <span>{{ item.label }}</span>
                  <Check v-if="chatBackground.kind === 'custom' && chatBackground.imageRef === item.imageRef" :size="15" />
                </button>
                <Button variant="ghost" size="icon" title="删除背景" aria-label="删除背景" @click="removeBackgroundItem(item.id)"><Trash2 :size="14" /></Button>
              </article>
            </div>
            <p class="background-picker-hint">最多保存 {{ MAX_CHAT_BACKGROUND_ITEMS }} 个背景；主题默认始终可用。</p>
          </div>

          <div v-if="stickerPanelOpen" class="sticker-picker">
            <div v-if="stickerPacks.length" class="sticker-pack-tabs" role="tablist" aria-label="表情包主题">
              <button
                v-for="pack in stickerPacks"
                :key="pack.id"
                type="button"
                :class="{ active: activeStickerPack?.id === pack.id }"
                @click="activeStickerPackId = pack.id"
              >{{ pack.name }}</button>
            </div>
            <div v-if="activeStickerPack && (activeStickerPack._stickers || []).length" class="sticker-options">
              <button
                v-for="sticker in activeStickerPack._stickers || []"
                :key="sticker.id"
                type="button"
                class="sticker-choice"
                :title="sticker.label"
                :aria-label="sticker.label"
                :disabled="isSendingMessage"
                @click="sendSticker(sticker)"
              >
                <img :src="store.api.mediaUrl(sticker.mediaRef)" :alt="sticker.label" loading="lazy" />
              </button>
            </div>
            <p v-else class="sticker-empty">{{ stickerStatus || "还没有可发送的表情包" }}</p>
          </div>

          <div v-if="selectedImages.length" class="composer-previews" aria-label="待发送图片">
            <article v-for="image in selectedImages" :key="image.id" class="composer-preview" :class="image.status">
              <img :src="image.previewUrl" :alt="image.file.name" />
              <div>
                <strong>{{ image.file.name }}</strong>
                <span>{{ image.error || image.sizeLabel }}</span>
              </div>
              <Button variant="ghost" size="icon" title="移除图片" aria-label="移除图片" :disabled="isSendingMessage" @click="removeSelectedImage(image.id)"><X :size="14" /></Button>
            </article>
          </div>

          <div class="composer-input-row">
            <Textarea
              ref="composerInput"
              v-model="messageInput"
              class="composer-input"
              :rows="1"
              :placeholder="selectedImages.length ? '可添加图片说明…' : '输入消息…'"
              @keydown="onComposerKeydown"
              @input="resizeComposer"
            />
            <Button
              size="icon"
              class="send-button"
              title="发送消息"
              aria-label="发送消息"
              :loading="isSendingMessage"
              @click="sendMessage"
              :disabled="!canSend || isSendingMessage"
              ><Send :size="17" /></Button
            >
          </div>
          <div v-if="composerHint" class="composer-meta">
            <span>{{ composerHint }}</span>
          </div>
        </div>
      </footer>
    </section>
  </div>

  <Teleport to="body">
    <div v-if="imageRequestOpen" class="image-request-overlay" role="presentation" @click.self="imageRequestOpen = false">
      <form class="image-request-dialog" @submit.prevent="requestConversationImage">
        <header>
          <div>
            <strong>让对方发图</strong>
            <span>提交后由对方角色把图片发进当前聊天。</span>
          </div>
          <Button variant="ghost" size="icon" title="关闭" aria-label="关闭" @click="imageRequestOpen = false"><X :size="16" /></Button>
        </header>
        <Input v-model="imagePrompt" class="image-prompt-input" placeholder="描述你希望对方发来的图片" autofocus />
        <Input v-model="imageWorkflowVersion" class="image-workflow-input" placeholder="workflow@version" />
        <p v-if="imageStatus" class="image-request-status">{{ imageStatus }}</p>
        <footer>
          <Button variant="ghost" @click="imageRequestOpen = false">取消</Button>
          <Button type="submit" :loading="isRequestingImage" :disabled="isRequestingImage || !imagePrompt.trim() || !imageRecipientId">请求发图</Button>
        </footer>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
:global(.app-main:has(.chat-layout)) {
  overflow: hidden;
}

.chat-layout {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  max-height: 100dvh;
  gap: var(--space-4);
  padding: var(--space-4);
  overflow: hidden;
}
.conversation-panel {
  width: clamp(220px, 24vw, 300px);
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: var(--space-4) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: var(--surface-glass);
  overflow: hidden;
}
.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-2) var(--space-3);
  color: var(--text-strong);
  font-size: var(--text-lg);
  font-weight: 750;
}
.conversation-list {
  display: grid;
  gap: 7px;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 2px;
}
.conversation-item {
  width: 100%;
  min-height: 0;
  justify-content: flex-start;
  gap: 10px;
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
  overflow: hidden;
  color: var(--text-strong);
  font-size: var(--text-base);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conversation-copy small {
  overflow: hidden;
  color: var(--muted);
  font-size: var(--text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
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
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: var(--surface-glass);
  box-shadow: var(--shadow-sm);
}
.chat-backdrop,
.chat-backdrop-veil {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}
.chat-backdrop {
  background-repeat: repeat;
  transition: opacity var(--motion-base);
}
.chat-backdrop-veil {
  background: var(--surface);
  opacity: 0.34;
}
.chat-header,
.chat-status-strip,
.reply-error,
.message-stream,
.composer {
  flex: 0 0 auto;
  display: grid;
  gap: 8px;
  max-height: min(44vh, 360px);
  margin: 0 var(--space-6) var(--space-5);
  padding: 8px 10px 10px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

/* Keep the message list as the only flexible primary scroll region. */
.chat-header,
.chat-status-strip,
.reply-error,
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
  margin: 0;
  padding: 0 var(--space-6);
  border: 0;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  max-height: none;
}
.header-profile {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.header-profile h1 {
  overflow: hidden;
  color: var(--text-strong);
  font-size: var(--text-lg);
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.header-profile p {
  margin-top: 4px;
  color: var(--primary);
  font-size: var(--text-sm);
  font-weight: 700;
}
.thought-status {
  max-width: 300px;
  overflow: hidden;
  color: var(--muted);
  font-size: var(--text-xs);
  font-style: italic;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-status-strip {
  min-height: 32px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: 0;
  padding: 0 var(--space-6);
  border: 0;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  max-height: none;
}
.chat-status-message {
  min-width: 0;
  max-width: min(42%, 260px);
  overflow: hidden;
  color: var(--primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reply-error {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 9px var(--space-6);
  border: 0;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  color: var(--danger);
  background: var(--surface-soft);
  box-shadow: none;
  max-height: none;
}
.reply-error code,
.reply-error a {
  overflow-wrap: anywhere;
}
.message-stream {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin: 0;
  padding: var(--space-6) max(6%, var(--space-6));
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  max-height: none;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.day-separator {
  align-self: center;
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  color: var(--muted);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  font-size: var(--text-xs);
}
.message-row {
  display: flex;
  align-items: flex-start;
  gap: 9px;
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
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted);
  background: color-mix(in srgb, var(--surface) 82%, transparent);
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
.message-name,
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
  padding: 12px 15px;
  border-radius: 6px 16px 16px 16px;
  color: var(--text);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  font-size: var(--text-md);
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.message-row.mine .message-bubble {
  border-radius: 16px 6px 16px 16px;
  color: var(--on-primary);
  background: var(--primary);
}
.message-bubble p {
  white-space: pre-wrap;
}
.message-bubble img {
  display: block;
  width: 100%;
  max-width: 520px;
  max-height: 430px;
  border-radius: var(--radius-md);
  object-fit: cover;
}
.sticker-message {
  width: min(180px, 100%) !important;
  max-height: 180px !important;
  object-fit: contain !important;
}
.message-empty,
.image-unavailable {
  color: var(--muted);
}
.avatar {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  overflow: hidden;
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
  color: var(--primary);
  background: var(--primary-soft);
}
.user-avatar {
  color: var(--on-primary);
  background: var(--primary);
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
  display: grid;
  gap: 8px;
  max-height: min(44vh, 360px);
  margin: 0 var(--space-6) var(--space-5);
  padding: 8px 10px 10px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  box-shadow: var(--shadow-sm);
  overflow-x: hidden;
  overflow-y: auto;
}
.composer-toolbar {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 2px 4px;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-inline: contain;
  scrollbar-width: thin;
}
.composer-tool {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border-radius: var(--radius-full);
}
.composer-tool.active {
  color: var(--primary);
  background: var(--primary-soft);
}
.background-picker {
  display: grid;
  gap: 10px;
  max-height: 210px;
  overflow: hidden;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
}
.background-picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.background-picker-head strong,
.background-picker-head span {
  display: block;
}
.background-picker-head strong {
  color: var(--text-strong);
  font-size: var(--text-sm);
}
.background-picker-head span,
.background-picker-hint {
  color: var(--muted);
  font-size: var(--text-xs);
}
.background-options {
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 8px;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: 2px;
}
.background-option {
  min-width: 0;
  min-height: 58px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 30px;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
}
.background-option.active {
  border-color: color-mix(in srgb, var(--primary) 48%, var(--border));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary) 28%, transparent);
}
.background-option button,
.theme-option {
  min-width: 0;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  padding: 7px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.theme-option {
  grid-column: 1 / -1;
  grid-template-columns: 42px minmax(0, 1fr) 18px;
}
.background-thumb,
.background-option img {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-sm);
  object-fit: cover;
}
.theme-thumb {
  border: 1px solid var(--border);
  background-image: var(--chat-texture);
  background-size: var(--chat-texture-size);
}
.background-option span:not(.background-thumb) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sticker-picker {
  display: grid;
  gap: 8px;
  max-height: 178px;
  overflow: hidden;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
}
.sticker-pack-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.sticker-pack-tabs button {
  flex: 0 0 auto;
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  font-size: var(--text-xs);
}
.sticker-pack-tabs button.active {
  border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
  color: var(--primary);
}
.sticker-options {
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
  gap: 6px;
  overflow-y: auto;
}
.sticker-choice {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  padding: 5px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: pointer;
}
.sticker-choice:hover {
  border-color: color-mix(in srgb, var(--primary) 38%, var(--border));
}
.sticker-choice img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.sticker-empty {
  color: var(--muted);
  font-size: var(--text-xs);
}
.composer-main {
  min-width: 0;
  display: grid;
  gap: 7px;
}
.composer-input-row {
  min-width: 0;
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.composer-previews {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 6px;
  max-height: 104px;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: 2px;
}
.composer-preview {
  min-width: 0;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 7px;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
}
.composer-preview.uploading {
  border-color: var(--primary);
}
.composer-preview.failed {
  border-color: var(--danger);
}
.composer-preview img {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-sm);
  object-fit: cover;
}
.composer-preview div {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.composer-preview strong,
.composer-preview span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.composer-preview strong {
  color: var(--text-strong);
  font-size: var(--text-xs);
}
.composer-preview span {
  color: var(--muted);
  font-size: 11px;
}
.composer-input {
  min-width: 0;
  min-height: 38px;
  max-height: 150px;
  padding: 8px 2px;
  border-color: transparent;
  background: transparent;
  font-size: var(--text-base);
  line-height: 1.45;
  resize: none;
  overflow-x: hidden;
  overflow-y: auto;
}
.composer-input:focus {
  border-color: transparent;
  box-shadow: none;
}
.composer-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--faint);
  font-size: 11px;
}
.send-button {
  flex: 0 0 auto;
  border-radius: var(--radius-full);
}
.send-button {
  width: 36px;
  height: 36px;
}
.image-request-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: var(--space-4);
  background: color-mix(in srgb, var(--background) 46%, transparent);
  backdrop-filter: blur(10px);
}
.image-request-dialog {
  width: min(100%, 460px);
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}
.image-request-dialog header,
.image-request-dialog footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.image-request-dialog header strong {
  display: block;
  color: var(--text-strong);
  font-size: var(--text-lg);
}
.image-request-dialog header span,
.image-request-status {
  color: var(--muted);
  font-size: var(--text-xs);
  line-height: 1.5;
}
.image-request-dialog footer {
  justify-content: flex-end;
}

@media (max-width: 767px) {
  .chat-layout {
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
  }
  .conversation-panel {
    width: 100%;
    max-height: 28vh;
    flex: 0 0 auto;
  }
  .chat-header {
    min-height: 64px;
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
  .chat-status-strip {
    padding: 0 var(--space-4);
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
    max-height: 42vh;
    margin: 0 var(--space-3) var(--space-3);
    border-radius: var(--radius-lg);
  }
  .composer-toolbar {
    gap: 3px;
    padding-bottom: 3px;
  }
  .composer-tool {
    width: 33px;
    height: 33px;
  }
  .sticker-picker {
    max-height: 160px;
  }
  .composer-previews {
    grid-template-columns: 1fr;
  }
}
</style>
