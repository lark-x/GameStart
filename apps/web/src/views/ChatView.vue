<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type ComponentPublicInstance } from "vue";
import { Check, Image as ImageIcon, ImagePlus, Keyboard, MoreHorizontal, RefreshCw, Send, Smile, Trash2, X } from "@lucide/vue";
import Button from "../components/ui/Button.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import Input from "../components/ui/Input.vue";
import Textarea from "../components/ui/Textarea.vue";
import { useAppStore } from "../stores/app.js";
import { errorMessage, type ApiCharacter, type ApiConversation, type ApiMessage, type ApiStickerPack } from "../types";
import { splitChatMessage } from "../lib/chat-message";
import { findPendingSource, normalizeAutoReply } from "../lib/auto-reply";
import { MAX_CHAT_BACKGROUND_ITEMS } from "../lib/theme";
import { conversationCharacters as _conversationCharacters, characterImage as _characterImage, messageCharacter as _messageCharacter, messageTime as _messageTime, isMine as _isMine, authorName as _authorName, stickerLabel as _stickerLabel, stickerImageUrl as _stickerImageUrl, stickerPackIconUrl as _stickerPackIconUrl } from "../lib/chat-helpers";

import { useConversations } from "../composables/useConversations";
import { useChatMessages } from "../composables/useChatMessages";
import { useAutoReply } from "../composables/useAutoReply";
import { useImageJobPolling } from "../composables/useImageJobPolling";
import { useChatComposer } from "../composables/useChatComposer";
import { useChatBackground } from "../composables/useChatBackground";
import { useChatMedia } from "../composables/useChatMedia";

type StickerOption = NonNullable<ApiStickerPack["_stickers"]>[number];
type ComposerPanel = "stickers" | "image-request";

const store = useAppStore();

// --- Conversations ---
const {
  conversations, currentConversationId, currentConversation,
  status, primaryPeer, characterName, characterInitial, characterSubtitle,
  conversationLabel, conversationMeta,
  loadConversations,
} = useConversations();

// --- Scroll helper ---
const messagesContainer = ref<HTMLElement | null>(null);
function scrollToBottom() {
  nextTick(() => { if (messagesContainer.value) messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight; });
}

// --- Messages ---
const { messages, loadMessages, cancelPending: cancelMessages, cleanup: cleanupMessages } = useChatMessages(currentConversationId, scrollToBottom);

// --- Auto-reply ---
const { autoReply, replyError, isGenerating, applyAutoReply, stopReplyPolling, cleanup: cleanupAutoReply } = useAutoReply(currentConversationId, messages, loadMessages);

// --- Composer ---
const {
  messageInput, selectedImages, composerStatus, isSendingMessage, enterSends, canSend,
  setEnterSends, addImageFiles, removeSelectedImage,
  sendSticker, sendMessage: sendComposerMessage, cleanup: cleanupComposer,
} = useChatComposer(currentConversationId, loadMessages, applyAutoReply);

// --- Background ---
const {
  chatBackground, backgroundStatus,
  setChatBackground,
  pickBackgroundImage, onBackgroundFileChange, removeBackgroundItem,
  cleanup: cleanupBackground,
} = useChatBackground();

// --- Media (stickers + image requests) ---
// --- Image job polling ---
const { imageStatus, pollImageJob, cancelPolling: cancelImagePolling, cleanup: cleanupImagePolling } = useImageJobPolling(currentConversationId, loadMessages);

// --- Media (stickers + image requests) ---
const imageRecipientId = computed(() => {
  const current = conversations.value.find((item) => item.conversation.id === currentConversationId.value);
  return current?.members.find((member) => member.characterId !== store.currentCharacterId && !member.leftAt)?.characterId;
});
const {
  stickerPacks, activeStickerPackId, stickerStatus,
  imagePrompt, imageWorkflowVersion, isRequestingImage,
  loadStickerPacks, requestConversationImage: requestImage, loadImageDefaults,
} = useChatMedia(
  computed(() => store.currentWorldId),
  currentConversationId,
  computed(() => store.currentCharacterId),
  imageRecipientId,
  imageStatus,
  store.api,
  (id) => void pollImageJob(id),
);

// --- UI state ---
const unavailableImageIds = ref(new Set<string>());
const unavailableStickerIds = ref(new Set<string>());
const unavailableStickerPackIconIds = ref(new Set<string>());
const imageInput = ref<HTMLInputElement | null>(null);
const composerInput = ref<ComponentPublicInstance | null>(null);
const composerRoot = ref<HTMLElement | null>(null);
const backgroundInput = ref<HTMLInputElement | null>(null);
const settingsDrawerOpen = ref(false);
const activeComposerPanel = ref<ComposerPanel | null>(null);

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
      backgroundImage: `url("${store.api.mediaUrl(chatBackground.imageRef)}")`,
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
function conversationCharacters(item: ApiConversation | undefined) { return _conversationCharacters(item, store.currentCharacterId, store.characters); };
function characterImage(character: ApiCharacter | undefined) { return _characterImage(character); };
function messageCharacter(message: ApiMessage) { return _messageCharacter(message, store.characters); };
function messageTime(message: ApiMessage) { return _messageTime(message); };
function isMine(message: ApiMessage) { return _isMine(message, store.currentCharacterId); };
function authorName(message: ApiMessage) { return _authorName(message, store.currentCharacterId, store.characters, characterName.value); };
function stickerLabel(message: ApiMessage) { return _stickerLabel(message, stickerById.value); };
function stickerImageUrl(message: ApiMessage) { return _stickerImageUrl(message, stickerById.value, unavailableImageIds.value, store.api.mediaUrl); };
function stickerPackIconUrl(pack: ApiStickerPack) { return _stickerPackIconUrl(pack, unavailableStickerPackIconIds.value, store.api.mediaUrl); };

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

function closeChatSettings() { settingsDrawerOpen.value = false; }
function closeComposerPanel() { activeComposerPanel.value = null; }
function toggleChatSettings() {
  settingsDrawerOpen.value = !settingsDrawerOpen.value;
  if (settingsDrawerOpen.value) closeComposerPanel();
}
function openImagePicker() { closeComposerPanel(); closeChatSettings(); imageInput.value?.click(); }
function openImageRequest() {
  activeComposerPanel.value = activeComposerPanel.value === "image-request" ? null : "image-request";
  if (activeComposerPanel.value !== "image-request") return;
  closeChatSettings();
  void nextTick(() => resizeComposer());
}
function requestConversationImage() { return requestImage(closeComposerPanel); }
function openBackgroundPicker() { pickBackgroundImage(backgroundInput.value); }
function toggleStickerPanel() {
  activeComposerPanel.value = activeComposerPanel.value === "stickers" ? null : "stickers";
  if (activeComposerPanel.value === "stickers") {
    closeChatSettings();
    if (stickerPacks.value.length === 0) void loadStickerPacks();
  }
}
function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  closeChatSettings();
  closeComposerPanel();
}
function onDocumentPointerDown(event: PointerEvent) {
  if (!activeComposerPanel.value) return;
  const target = event.target;
  if (target instanceof Node && composerRoot.value?.contains(target)) return;
  closeComposerPanel();
}
function markImageUnavailable(messageId: string) { unavailableImageIds.value = new Set([...unavailableImageIds.value, messageId]); }
function markStickerUnavailable(stickerId: string) { unavailableStickerIds.value = new Set([...unavailableStickerIds.value, stickerId]); }
function markStickerPackIconUnavailable(packId: string) { unavailableStickerPackIconIds.value = new Set([...unavailableStickerPackIconIds.value, packId]); }
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
    prevConversationId = currentConversationId.value;
  autoReply.value = { status: "QUEUED", sourceMessageId: sourceId };
  try {
    const result = await store.api.retryAutoReply(currentConversationId.value, {
      readerCharacterId: store.currentCharacterId, sourceMessageId: sourceId,
    });
    applyAutoReply(normalizeAutoReply(result.data), sourceId);
  } catch (error: unknown) { replyError.value = errorMessage(error); }
}

// --- Watchers ---
let prevConversationId = currentConversationId.value;
watch(
  () => store.currentCharacterId,
  () => {
    stopReplyPolling();
    cancelMessages();
    cancelImagePolling();
    autoReply.value = null;
    replyError.value = "";
    prevConversationId = currentConversationId.value;
    void loadConversations().then(() => {
      void nextTick(() => {
        if (currentConversationId.value && currentConversationId.value === prevConversationId) {
          void loadMessages();
        }
      });
    });
  },
  { immediate: true },
);

watch(currentConversationId, () => {
  stopReplyPolling();
  cancelMessages();
  cancelImagePolling();
  autoReply.value = null;
  replyError.value = "";
    prevConversationId = currentConversationId.value;
  closeComposerPanel();
  closeChatSettings();
  void loadMessages();
});

watch(() => store.currentWorldId, () => void loadStickerPacks(), { immediate: true });

void loadImageDefaults();

onMounted(() => {
  document.addEventListener("keydown", onDocumentKeydown);
  document.addEventListener("pointerdown", onDocumentPointerDown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", onDocumentKeydown);
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  cleanupAutoReply();
  cleanupMessages();
  cleanupImagePolling();
  cleanupComposer();
  cleanupBackground();
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
          @click="currentConversationId = item.conversation.id"
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
        <Button
          variant="ghost"
          size="icon"
          class="chat-more-button"
          :class="{ active: settingsDrawerOpen }"
          title="聊天设置"
          aria-label="聊天设置"
          :aria-expanded="settingsDrawerOpen"
          @click="toggleChatSettings"
        ><MoreHorizontal :size="19" /></Button>
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

      <div v-if="settingsDrawerOpen" class="chat-settings-scrim" role="presentation" @click.self="closeChatSettings">
        <aside class="chat-settings-drawer" aria-label="聊天设置">
          <header class="settings-drawer-head">
            <div>
              <strong>聊天设置</strong>
              <span>背景、回复与输入偏好</span>
            </div>
            <Button variant="ghost" size="icon" title="关闭设置" aria-label="关闭设置" @click="closeChatSettings"><X :size="16" /></Button>
          </header>

          <section class="settings-section">
            <div class="settings-section-head">
              <div>
                <strong>聊天背景</strong>
                <span>选择主题默认或已导入背景</span>
              </div>
              <Button variant="ghost" size="icon" title="导入背景" aria-label="导入背景" :disabled="chatBackground.items.length >= MAX_CHAT_BACKGROUND_ITEMS" @click="openBackgroundPicker"><ImageIcon :size="16" /></Button>
            </div>
            <div class="background-options">
              <button type="button" class="background-option theme-option" :class="{ active: chatBackground.kind === 'theme' }" @click="selectThemeBackground">
                <span class="background-thumb theme-thumb" />
                <span>主题默认</span>
                <Check v-if="chatBackground.kind === 'theme'" :size="15" />
              </button>
              <article v-for="item in chatBackground.items" :key="item.id" class="background-option custom-option" :class="{ active: chatBackground.kind === 'custom' && chatBackground.imageRef === item.imageRef }">
                <button type="button" @click="selectCustomBackground(item.imageRef)">
                  <img :src="store.api.mediaUrl(item.imageRef)" :alt="item.label" />
                  <span>{{ item.label }}</span>
                  <Check v-if="chatBackground.kind === 'custom' && chatBackground.imageRef === item.imageRef" :size="15" />
                </button>
                <Button variant="ghost" size="icon" title="删除背景" aria-label="删除背景" @click="removeBackgroundItem(item.id)"><Trash2 :size="14" /></Button>
              </article>
            </div>
            <p class="background-picker-hint">最多保存 {{ MAX_CHAT_BACKGROUND_ITEMS }} 个背景；主题默认始终可用。</p>
          </section>

          <section class="settings-section compact-section">
            <div>
              <strong>回复</strong>
              <span>上一条消息没有生成回复时可重试</span>
            </div>
            <Button variant="secondary" size="sm" title="重试回复" aria-label="重试回复" @click="triggerGenerateReply" :disabled="isGenerating || !pendingSource">
              <RefreshCw :size="15" />
              重试
            </Button>
          </section>

          <section class="settings-section compact-section">
            <div>
              <strong>输入模式</strong>
              <span>{{ enterModeLabel }}</span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              :title="enterModeLabel"
              :aria-label="enterModeLabel"
              :aria-pressed="enterSends"
              @click="setEnterSends(!enterSends)"
            >
              <Keyboard :size="15" />
              切换
            </Button>
          </section>
        </aside>
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


      <footer ref="composerRoot" class="composer" @paste="onComposerPaste">
        <input ref="imageInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple class="file-input-hidden" @change="onImagesSelected" />
        <input ref="backgroundInput" type="file" accept="image/*" class="file-input-hidden" aria-hidden="true" tabindex="-1" @change="onBackgroundFileChange" />

        <div v-if="activeComposerPanel === 'stickers'" class="composer-popover sticker-picker" role="dialog" aria-label="表情包">
          <div class="sticker-popover-head">
            <strong>发表情</strong>
            <span>{{ activeStickerPack?.name || "表情包" }}</span>
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
              <img
                v-if="!unavailableStickerIds.has(sticker.id)"
                :src="store.api.mediaUrl(sticker.mediaRef)"
                :alt="sticker.label"
                loading="lazy"
                @error="markStickerUnavailable(sticker.id)"
              />
              <span v-else>{{ sticker.label }}</span>
            </button>
          </div>
          <p v-else class="sticker-empty">{{ stickerStatus || "还没有可发送的表情包" }}</p>
          <div v-if="stickerPacks.length" class="sticker-pack-tabs" role="tablist" aria-label="表情包主题">
            <button
              v-for="pack in stickerPacks"
              :key="pack.id"
              type="button"
              class="sticker-pack-tab"
              :class="{ active: activeStickerPack?.id === pack.id }"
              :aria-selected="activeStickerPack?.id === pack.id"
              @click="activeStickerPackId = pack.id"
            >
              <img
                v-if="stickerPackIconUrl(pack)"
                :src="stickerPackIconUrl(pack)"
                :alt="pack.name"
                loading="lazy"
                @error="markStickerPackIconUnavailable(pack.id)"
              />
              <span v-else>{{ pack.name.slice(0, 2) }}</span>
            </button>
          </div>
        </div>

        <form
          v-if="activeComposerPanel === 'image-request'"
          class="composer-popover image-request-panel"
          aria-label="让对方发图"
          @submit.prevent="requestConversationImage"
        >
          <header class="image-request-panel-head">
            <div>
              <strong>让对方发图</strong>
              <span>提交后由对方角色把图片发进当前聊天。</span>
            </div>
            <Button variant="ghost" size="icon" title="关闭" aria-label="关闭" @click="closeComposerPanel"><X :size="16" /></Button>
          </header>
          <Input v-model="imagePrompt" class="image-request-input" placeholder="描述你希望对方发来的图片" autofocus />
          <Input v-model="imageWorkflowVersion" class="image-request-input" placeholder="workflow@version" />
          <p v-if="imageStatus" class="image-request-status">{{ imageStatus }}</p>
          <footer class="image-request-panel-actions">
            <Button variant="ghost" @click="closeComposerPanel">取消</Button>
            <Button type="submit" :loading="isRequestingImage" :disabled="isRequestingImage || !imagePrompt.trim() || !imageRecipientId">请求发图</Button>
          </footer>
        </form>

        <div class="composer-toolbar" role="toolbar" aria-label="聊天功能">
          <Button variant="ghost" size="icon" class="composer-tool" title="表情包" aria-label="表情包" :class="{ active: activeComposerPanel === 'stickers' }" @click="toggleStickerPanel"><Smile :size="17" /></Button>
          <Button variant="ghost" size="icon" class="composer-tool" title="发送图片" aria-label="发送图片" @click="openImagePicker"><ImageIcon :size="17" /></Button>
          <Button variant="ghost" size="icon" class="composer-tool" :class="{ active: activeComposerPanel === 'image-request' }" :disabled="!imageRecipientId" title="请求对方发图" aria-label="请求对方发图" @click="openImageRequest"><ImagePlus :size="17" /></Button>
        </div>

        <div class="composer-main">
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
</template>

<style src="./ChatView.css" scoped></style>
