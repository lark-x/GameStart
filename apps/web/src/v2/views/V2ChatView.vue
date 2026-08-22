<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Copy,
  ImagePlus,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Send,
  Smile,
  Sparkles,
  Square,
  Sticker,
  X,
} from "@lucide/vue";

import Button from "../../components/ui/Button.vue";
import Textarea from "../../components/ui/Textarea.vue";
import V2ToastNotification from "../components/V2ToastNotification.vue";
import { useNotificationStore } from "../stores/notification.ts";
import type {
  V2ChatContextResponse,
  V2ChatDiagnosticsResponse,
  V2ChatFeaturesDto,
  V2ChatMessageDto,
  V2ConversationId,
  V2IdempotencyKey,
  V2MediaId,
  V2MessageId,
} from "@living-network/contracts/v2";
import { createV2ChatClient, type V2ChatStreamEvent } from "../chat/client.ts";
import { randomUuid } from "../random.ts";
import { buildStickerSendPayload, isChatModelConfigured } from "./chat-view-model.ts";
import ChatCharacterPanel from "../chat/components/ChatCharacterPanel.vue";
import ChatConversationSidebar from "../chat/components/ChatConversationSidebar.vue";
import ChatDiagnosticsModal from "../chat/components/ChatDiagnosticsModal.vue";
import ChatEmojiPicker from "../chat/components/ChatEmojiPicker.vue";
import ChatMessageBubble from "../chat/components/ChatMessageBubble.vue";
import ChatStickerPicker from "../chat/components/ChatStickerPicker.vue";

const route = useRoute();
const router = useRouter();
const environment = import.meta.env as Record<string, string | undefined>;
const baseUrl = environment.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3003" : window.location.origin);
const client = createV2ChatClient({ baseUrl });
const toast = useNotificationStore();

const conversationId = computed(() => route.params.conversationId as string);
const conversationTitle = ref("");
const messages = ref<readonly V2ChatMessageDto[]>([]);
const input = ref("");
const loading = ref(true);
const sending = ref(false);
const streaming = ref(false);
const imageUploading = ref(false);
const errorMessage = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const messagesContainer = ref<HTMLElement | null>(null);

// Character context + effective chat features
const features = ref<V2ChatFeaturesDto | null>(null);
type FeatureState = "idle" | "loading" | "ready" | "error";
const featureState = ref<FeatureState>("idle");
const featureError = ref<string | null>(null);
const context = ref<V2ChatContextResponse | null>(null);
const showCharacterPanel = ref(false);
const loadingContext = ref(false);
const contextError = ref<string | null>(null);
const modelConfigured = computed(() => isChatModelConfigured(featureState.value, features.value));
const imageEnabled = computed(() => features.value?.imageUpload === true);
const modelSummary = computed(() => {
  const model = features.value?.model;
  if (model === undefined) return "";
  return `${model.profileName ?? model.model} · ${model.inputModalities.includes("image") ? "文本 · 图片" : "文本"}`;
});

// Panel collapse state
const sidebarCollapsed = ref(false);
const contextCollapsed = ref(false);

function toggleSidebar(): void {
  sidebarCollapsed.value = !sidebarCollapsed.value;
}

function toggleContext(): void {
  if (typeof window !== "undefined" && window.innerWidth <= 1199) {
    void toggleCharacterPanel();
  } else {
    contextCollapsed.value = !contextCollapsed.value;
  }
}

const icebreakers = computed(() => {
  const charName = context.value?.character.name || conversationTitle.value || "你";
  return [
    `「${charName}，今天有什么新奇的故事想分享吗？」`,
    `「跟我聊聊关于这个世界正在发生的事情吧。」`,
    `「接下来我们该去哪里探险？」`,
  ];
});

function applyIcebreaker(text: string): void {
  input.value = text;
  void sendMessage();
}

// Multimodal composer state
interface PendingAttachment {
  readonly mediaId: string;
  readonly mediaRef: string;
  readonly mimeType: string;
}
const pendingAttachments = ref<readonly PendingAttachment[]>([]);
const emojiOpen = ref(false);
const stickerOpen = ref(false);
const MAX_ATTACHMENTS = 4;

const canSend = computed(() =>
  modelConfigured.value &&
  (input.value.trim().length > 0 || pendingAttachments.value.length > 0) &&
  !sending.value && !streaming.value && !loading.value && !imageUploading.value,
);

// Pagination state
const hasMore = ref(false);
const nextBeforeMessageId = ref<string | undefined>(undefined);
const loadingOlder = ref(false);
const loadingOlderError = ref("");
const isNearBottom = ref(true);
const showScrollHint = ref(false);

async function handlePaste(event: ClipboardEvent): Promise<void> {
  const items = event.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        event.preventDefault();
        await uploadImageFile(file);
        break;
      }
    }
  }
}

async function uploadImageFile(file: File): Promise<void> {
  if (pendingAttachments.value.length >= MAX_ATTACHMENTS || imageUploading.value) return;
  imageUploading.value = true;
  errorMessage.value = "";
  try {
    const media = await client.uploadMedia(file);
    pendingAttachments.value = [
      ...pendingAttachments.value,
      { mediaId: media.mediaId, mediaRef: media.mediaRef, mimeType: media.mimeType },
    ].slice(0, MAX_ATTACHMENTS);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "图片上传失败";
  } finally {
    imageUploading.value = false;
  }
}

// Diagnostics state
const showDiagnostics = ref(false);
const diagnostics = ref<V2ChatDiagnosticsResponse | null>(null);
const loadingDiagnostics = ref(false);
const diagnosticsError = ref<string | null>(null);

// Story Analyzer state
const analyzing = ref(false);
const moreMenuOpen = ref(false);
const moreMenuRef = ref<HTMLElement | null>(null);

function handleScroll(): void {
  const container = messagesContainer.value;
  if (!container) return;
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  isNearBottom.value = distanceFromBottom < 80;
  if (isNearBottom.value) showScrollHint.value = false;
  if (container.scrollTop < 120 && hasMore.value && !loadingOlder.value && !loading.value) {
    void loadOlderMessages();
  }
}

function scrollToBottom(behavior: ScrollBehavior = "smooth"): void {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTo({
      top: messagesContainer.value.scrollHeight,
      behavior,
    });
    isNearBottom.value = true;
    showScrollHint.value = false;
  }
}

function jumpToLatest(): void {
  scrollToBottom("smooth");
}

function onDocumentClick(event: MouseEvent): void {
  if (moreMenuRef.value !== null && !moreMenuRef.value.contains(event.target as Node)) {
    moreMenuOpen.value = false;
  }
}

function onDocumentKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    if (showDiagnostics.value) {
      showDiagnostics.value = false;
    }
    if (moreMenuOpen.value) {
      moreMenuOpen.value = false;
    }
    if (emojiOpen.value) {
      emojiOpen.value = false;
    }
    if (stickerOpen.value) {
      stickerOpen.value = false;
    }
  }
}

onMounted(() => {
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeyDown);
});

onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick);
  document.removeEventListener("keydown", onDocumentKeyDown);
});

async function copyConversationId(): Promise<void> {
  try {
    await navigator.clipboard.writeText(conversationId.value);
    toast.success("会话 ID 已复制到剪贴板。", "已复制");
  } catch {
    errorMessage.value = "复制会话 ID 失败，请手动复制地址栏中的 ID。";
  } finally {
    moreMenuOpen.value = false;
  }
}

function openImagePreview(url: string): void {
  window.open(url, "_blank", "noopener");
}

async function triggerStoryAnalyze(): Promise<void> {
  if (analyzing.value || messages.value.length === 0) return;
  analyzing.value = true;
  errorMessage.value = "";
  try {
    await client.triggerStoryAnalyze(conversationId.value as V2ConversationId);
    toast.success("已发起剧情提炼任务，完成后将在创作工作区生成场景候选。", "剧情提炼");
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "发起剧情提炼失败";
  } finally {
    analyzing.value = false;
  }
}

let abortController: AbortController | undefined;
let loadGeneration = 0;

async function initConversation(): Promise<void> {
  const generation = ++loadGeneration;
  const id = conversationId.value as V2ConversationId;
  abortController?.abort();
  abortController = undefined;
  // Reset conversation-scoped state
  messages.value = [];
  conversationTitle.value = "";
  input.value = "";
  pendingAttachments.value = [];
  emojiOpen.value = false;
  stickerOpen.value = false;
  hasMore.value = false;
  nextBeforeMessageId.value = undefined;
  loadingOlder.value = false;
  loadingOlderError.value = "";
  isNearBottom.value = true;
  showScrollHint.value = false;
  showDiagnostics.value = false;
  diagnostics.value = null;
  loadingDiagnostics.value = false;
  diagnosticsError.value = null;
  analyzing.value = false;
  moreMenuOpen.value = false;
  errorMessage.value = "";
  featureState.value = "idle";
  featureError.value = null;
  features.value = null;
  context.value = null;
  showCharacterPanel.value = false;
  loadingContext.value = false;
  contextError.value = null;
  streaming.value = false;
  sending.value = false;
  imageUploading.value = false;

  await loadChat(generation, id);
  if (generation !== loadGeneration) return;
  await loadExtras(generation, id);
  if (generation !== loadGeneration) return;
  const currentState = featureState.value as FeatureState;
  const currentModelConfigured = isChatModelConfigured(currentState, features.value);
  if (messages.value.length === 0 && currentState === "ready" && currentModelConfigured) {
    await generateOpening();
  }
}

onMounted(() => {
  void initConversation();
});

watch(conversationId, (nextId, previousId) => {
  if (nextId === previousId || nextId === undefined) return;
  void initConversation();
});

onUnmounted(() => {
  abortController?.abort();
});

async function loadChat(generation: number, id: V2ConversationId): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [conversation, history] = await Promise.all([
      client.listConversationSummaries().then((items) => items.find((item) => item.conversationId === id)),
      client.listMessages(id, { limit: 50 }),
    ]);
    if (generation !== loadGeneration) return;
    conversationTitle.value = conversation?.title ?? "故事对话";
    messages.value = history.messages;
    hasMore.value = history.hasMore;
    nextBeforeMessageId.value = history.nextBeforeMessageId;
    await nextTick();
    if (generation !== loadGeneration) return;
    scrollToBottom("auto");
  } catch (error) {
    if (generation === loadGeneration) {
      errorMessage.value = error instanceof Error ? error.message : "加载对话失败";
    }
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

async function loadExtras(generation: number, id: V2ConversationId): Promise<void> {
  const [nextFeatures, nextContext] = await Promise.allSettled([
    client.getConversationFeatures(id),
    client.getConversationContext(id),
  ]);
  if (generation !== loadGeneration) return;
  if (nextFeatures.status === "fulfilled") {
    features.value = nextFeatures.value;
    featureState.value = "ready";
    featureError.value = null;
  } else {
    featureState.value = "error";
    featureError.value = nextFeatures.reason instanceof Error
      ? nextFeatures.reason.message
      : "无法读取模型能力状态，请刷新后重试。";
  }
  if (nextContext.status === "fulfilled") {
    context.value = nextContext.value;
    conversationTitle.value = nextContext.value.character.name || conversationTitle.value;
    contextError.value = null;
  } else {
    contextError.value = nextContext.reason instanceof Error ? nextContext.reason.message : "读取角色信息失败";
  }
}

async function toggleCharacterPanel(): Promise<void> {
  showCharacterPanel.value = !showCharacterPanel.value;
  if (showCharacterPanel.value && context.value === null) {
    const generation = loadGeneration;
    const id = conversationId.value as V2ConversationId;
    loadingContext.value = true;
    contextError.value = null;
    try {
      const nextContext = await client.getConversationContext(id);
      if (generation !== loadGeneration) return;
      context.value = nextContext;
    } catch (error) {
      if (generation === loadGeneration) {
        contextError.value = error instanceof Error ? error.message : "读取角色信息失败";
      }
    } finally {
      if (generation === loadGeneration) loadingContext.value = false;
    }
  }
}

async function loadOlderMessages(): Promise<void> {
  if (!hasMore.value || loadingOlder.value || !nextBeforeMessageId.value) return;
  const generation = loadGeneration;
  const id = conversationId.value as V2ConversationId;
  loadingOlder.value = true;
  loadingOlderError.value = "";
  const container = messagesContainer.value;
  const oldScrollHeight = container?.scrollHeight ?? 0;
  const oldScrollTop = container?.scrollTop ?? 0;

  try {
    const page = await client.listMessages(id, {
      beforeMessageId: nextBeforeMessageId.value as V2MessageId,
      limit: 50,
    });
    if (generation !== loadGeneration) return;
    messages.value = [...page.messages, ...messages.value];
    hasMore.value = page.hasMore;
    nextBeforeMessageId.value = page.nextBeforeMessageId;

    await nextTick();
    if (container) {
      const newScrollHeight = container.scrollHeight;
      container.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
    }
  } catch (error) {
    if (generation === loadGeneration) {
      loadingOlderError.value = error instanceof Error ? error.message : "加载更早消息失败";
    }
  } finally {
    if (generation === loadGeneration) loadingOlder.value = false;
  }
}

async function toggleDiagnostics(): Promise<void> {
  showDiagnostics.value = !showDiagnostics.value;
  if (showDiagnostics.value) {
    await refreshDiagnostics();
  }
}

async function refreshDiagnostics(): Promise<void> {
  const generation = loadGeneration;
  const id = conversationId.value as V2ConversationId;
  loadingDiagnostics.value = true;
  diagnosticsError.value = null;
  try {
    const nextDiagnostics = await client.getLatestDiagnostics(id);
    if (generation !== loadGeneration) return;
    diagnostics.value = nextDiagnostics;
  } catch (error) {
    if (generation === loadGeneration) {
      diagnosticsError.value = error instanceof Error ? error.message : "获取诊断信息失败";
    }
  } finally {
    if (generation === loadGeneration) loadingDiagnostics.value = false;
  }
}

async function generateOpening(): Promise<void> {
  const generation = loadGeneration;
  const id = conversationId.value as V2ConversationId;
  await startAssistantReply(`story-bootstrap:${id}`, generation, id);
}

async function sendMessage(): Promise<void> {
  const text = input.value.trim();
  const attachmentIds = pendingAttachments.value.map((item) => item.mediaId);
  if ((!text && attachmentIds.length === 0) || sending.value || streaming.value) return;
  await sendMessagePayload({ text, attachmentIds, clearComposer: true });
}

async function sendMessagePayload(params: {
  readonly text: string;
  readonly attachmentIds: readonly string[];
  readonly clearComposer: boolean;
}): Promise<void> {
  const generation = loadGeneration;
  const id = conversationId.value as V2ConversationId;
  const text = params.text;
  const attachmentIds = params.attachmentIds;
  sending.value = true;
  errorMessage.value = "";
  try {
    const response = await client.sendMessage(id, {
      ...(text ? { text } : {}),
      ...(attachmentIds.length ? { attachmentIds: attachmentIds as V2MediaId[] } : {}),
      idempotencyKey: `user:${Date.now()}:${randomUuid()}` as V2IdempotencyKey,
    });
    if (generation !== loadGeneration) return;
    messages.value = [...messages.value, response.message];
    if (params.clearComposer) {
      input.value = "";
      pendingAttachments.value = [];
    }
    await nextTick();
    scrollToBottom("smooth");
    await startAssistantReply(undefined, generation, id);
  } catch (error) {
    if (generation === loadGeneration) {
      errorMessage.value = error instanceof Error ? error.message : "发送失败";
    }
  } finally {
    if (generation === loadGeneration) sending.value = false;
  }
}

async function pickImage(): Promise<void> {
  fileInput.value?.click();
}

async function onImageSelected(event: Event): Promise<void> {
  const inputElement = event.target as HTMLInputElement;
  const files = Array.from(inputElement.files ?? []).slice(0, Math.max(0, MAX_ATTACHMENTS - pendingAttachments.value.length));
  inputElement.value = "";
  for (const file of files) {
    await uploadImageFile(file);
  }
}

function removePendingAttachment(index: number): void {
  pendingAttachments.value = pendingAttachments.value.filter((_, i) => i !== index);
}

function insertEmoji(emoji: string): void {
  input.value += emoji;
  emojiOpen.value = false;
}

async function sendSticker(sticker: { readonly mediaId: string; readonly mediaRef: string }): Promise<void> {
  stickerOpen.value = false;
  await sendMessagePayload(buildStickerSendPayload(sticker.mediaId));
}

async function startAssistantReply(
  openingIdempotencyKey?: string,
  expectedGeneration = loadGeneration,
  expectedConversationId = conversationId.value as V2ConversationId,
): Promise<void> {
  if (expectedGeneration !== loadGeneration || expectedConversationId !== conversationId.value) return;
  if (streaming.value) return;
  streaming.value = true;
  errorMessage.value = "";
  const controller = new AbortController();
  abortController = controller;
  const placeholderId = `assistant:${Date.now()}:${randomUuid()}`;
  const idempotencyKey = openingIdempotencyKey ?? `reply:${Date.now()}:${randomUuid()}`;
  const placeholder: V2ChatMessageDto = {
    messageId: placeholderId as V2ChatMessageDto["messageId"],
    conversationId: expectedConversationId,
    role: "assistant",
    text: "",
    attachments: [],
    status: "pending",
    createdAt: new Date().toISOString() as V2ChatMessageDto["createdAt"],
    idempotencyKey: idempotencyKey as V2ChatMessageDto["idempotencyKey"],
  };
  messages.value = [...messages.value, placeholder];
  await nextTick();
  scrollToBottom("smooth");

  let content = "";
  let replaced = false;

  const handleEvent = (event: V2ChatStreamEvent): void => {
    if (expectedGeneration !== loadGeneration || expectedConversationId !== conversationId.value) return;
    if (event.type === "delta" && event.content !== undefined) {
      content += event.content;
      updatePlaceholder(placeholder.messageId, { text: content, status: "pending" });
      if (isNearBottom.value) {
        scrollToBottom("auto");
      } else {
        showScrollHint.value = true;
      }
    } else if (event.type === "message" && event.message !== undefined) {
      replaced = true;
      messages.value = messages.value.map((message) =>
        message.messageId === placeholder.messageId ? event.message! : message,
      );
      if (isNearBottom.value) scrollToBottom("auto");
    } else if (event.type === "error") {
      errorMessage.value = event.errorMessage ?? "生成失败";
      updatePlaceholder(placeholder.messageId, { status: "failed" });
    }
  };

  try {
    await client.streamReply(
      expectedConversationId,
      { idempotencyKey: placeholder.idempotencyKey },
      handleEvent,
      controller.signal,
    );
  } catch (error) {
    if (expectedGeneration === loadGeneration && expectedConversationId === conversationId.value) {
      if (error instanceof DOMException && error.name === "AbortError") {
        errorMessage.value = "已停止生成";
      } else {
        errorMessage.value = error instanceof Error ? error.message : "生成失败";
      }
      updatePlaceholder(placeholder.messageId, { status: content ? "interrupted" : "failed" });
    }
  } finally {
    if (abortController === controller) abortController = undefined;
    if (expectedGeneration !== loadGeneration || expectedConversationId !== conversationId.value) return;
    streaming.value = false;
    if (!replaced && content.trim().length === 0) {
      messages.value = messages.value.filter((message) => message.messageId !== placeholder.messageId);
    }
  }
}

function updatePlaceholder(messageId: string, patch: { readonly text?: string; readonly status?: V2ChatMessageDto["status"] }): void {
  messages.value = messages.value.map((message) =>
    message.messageId === messageId ? { ...message, ...patch } : message,
  );
}

function stopGeneration(): void {
  abortController?.abort();
}

function openConversation(nextId: string): void {
  if (nextId === conversationId.value) return;
  void router.push(`/v2/chat/${encodeURIComponent(nextId)}`);
}
</script>

<template>
  <div
    class="v2-chat-page"
    :class="{
      'sidebar-collapsed': sidebarCollapsed,
      'context-collapsed': contextCollapsed
    }"
  >
    <aside class="v2-chat-conversations" aria-label="会话列表">
      <ChatConversationSidebar :active-conversation-id="conversationId" @select="openConversation" />
    </aside>

    <section class="v2-chat-main">
      <header class="v2-chat-header">
        <div class="v2-chat-header-left">
          <Button
            variant="ghost"
            size="icon"
            :title="sidebarCollapsed ? '展开会话列表' : '折叠会话列表'"
            :aria-label="sidebarCollapsed ? '展开会话列表' : '折叠会话列表'"
            @click="toggleSidebar"
          >
            <PanelLeftOpen v-if="sidebarCollapsed" :size="18" aria-hidden="true" />
            <PanelLeftClose v-else :size="18" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="返回聊天首页" @click="router.push('/v2/chat')">
            <ArrowLeft :size="18" aria-hidden="true" />
          </Button>
        </div>

        <div class="v2-chat-title">
          <h2>{{ conversationTitle }}</h2>
          <small v-if="modelSummary" class="v2-chat-model">{{ modelSummary }}</small>
        </div>

        <div class="v2-chat-header-actions">
          <Button
            variant="ghost"
            size="icon"
            :title="contextCollapsed ? '展开角色面板' : '折叠角色面板'"
            :aria-label="contextCollapsed ? '展开角色面板' : '折叠角色面板'"
            :class="{ active: !contextCollapsed }"
            @click="toggleContext"
          >
            <PanelRightClose v-if="!contextCollapsed" :size="18" aria-hidden="true" />
            <PanelRightOpen v-else :size="18" aria-hidden="true" />
          </Button>
          <Button
            v-if="streaming"
            variant="secondary"
            size="sm"
            @click="stopGeneration"
          >
            <Square :size="14" aria-hidden="true" />
            停止
          </Button>
          <div ref="moreMenuRef" class="v2-chat-more">
            <Button
              variant="ghost"
              size="icon"
              aria-label="更多操作"
              aria-haspopup="menu"
              :aria-expanded="moreMenuOpen"
              @click="moreMenuOpen = !moreMenuOpen"
            >
              <MoreHorizontal :size="18" aria-hidden="true" />
            </Button>
            <div v-if="moreMenuOpen" class="v2-chat-more-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                class="v2-chat-more-item"
                :disabled="messages.length === 0 || streaming || analyzing"
                @click="triggerStoryAnalyze"
              >
                <Sparkles :size="15" aria-hidden="true" />
                提炼剧情
              </button>
              <button type="button" role="menuitem" class="v2-chat-more-item" @click="toggleDiagnostics">
                <Activity :size="15" aria-hidden="true" />
                上下文诊断
              </button>
              <button type="button" role="menuitem" class="v2-chat-more-item" @click="router.push('/v2/workspace/ai-scene-request')">
                <BookOpen :size="15" aria-hidden="true" />
                创作工作区
              </button>
              <button type="button" role="menuitem" class="v2-chat-more-item" @click="copyConversationId">
                <Copy :size="15" aria-hidden="true" />
                复制会话 ID
              </button>
            </div>
          </div>
        </div>
      </header>

      <p v-if="errorMessage" class="v2-chat-error">{{ errorMessage }}</p>
      <p v-if="featureState === 'error'" class="v2-chat-error" role="alert">
        无法读取模型能力状态，请刷新后重试。{{ featureError ?? '' }}
      </p>
      <p v-if="loading" class="v2-chat-status">正在加载对话…</p>

      <div
        ref="messagesContainer"
        class="v2-chat-messages"
        aria-live="polite"
        @scroll="handleScroll"
      >
        <div class="v2-chat-messages-inner">
          <div v-if="loadingOlder" class="v2-chat-pagination-status">正在加载更早的历史记录…</div>
          <div v-else-if="loadingOlderError" class="v2-chat-pagination-status v2-chat-pagination-error">
            加载更早消息失败
            <Button variant="ghost" size="sm" @click="loadOlderMessages">重试</Button>
          </div>
          <div v-else-if="!hasMore && messages.length >= 50" class="v2-chat-pagination-status">已加载全部历史记录</div>

          <ChatMessageBubble
            v-for="message in messages"
            :key="message.messageId"
            :message="message"
            :conversation-title="conversationTitle"
            :media-url="client.mediaUrl"
            @preview-image="openImagePreview"
          />

          <button v-if="showScrollHint" type="button" class="v2-chat-scroll-hint" @click="jumpToLatest">
            ↓ 查看新消息
          </button>
        </div>
      </div>

      <div class="v2-chat-composer-wrap">
        <div class="v2-chat-composer-inner">
          <!-- 开场破冰建议气泡 -->
          <div v-if="messages.length <= 1 && modelConfigured" class="v2-chat-icebreakers">
            <span class="v2-icebreaker-title">
              <Sparkles :size="12" aria-hidden="true" />
              <span>开场建议</span>
            </span>
            <button
              v-for="(prompt, idx) in icebreakers"
              :key="idx"
              type="button"
              class="v2-icebreaker-chip"
              :disabled="sending || streaming"
              @click="applyIcebreaker(prompt)"
            >
              {{ prompt }}
            </button>
          </div>

          <ChatEmojiPicker :open="emojiOpen" @select="insertEmoji" @close="emojiOpen = false" />
          <ChatStickerPicker :open="stickerOpen" @select="sendSticker" @close="stickerOpen = false" />

          <form class="v2-chat-composer" @submit.prevent="sendMessage()">
            <p v-if="!modelConfigured" class="v2-chat-composer-notice">
              尚未配置聊天模型。
              <RouterLink to="/v2/settings/models">前往模型与能力</RouterLink>
            </p>

            <div v-if="pendingAttachments.length" class="v2-chat-attachment-preview" aria-label="待发送图片">
              <div v-for="(attachment, index) in pendingAttachments" :key="attachment.mediaId" class="v2-chat-attachment-chip">
                <img :src="client.mediaUrl(attachment.mediaRef)" :alt="'待发送图片 ' + (index + 1)" />
                <button type="button" :aria-label="'移除图片 ' + (index + 1)" @click="removePendingAttachment(index)">×</button>
              </div>
            </div>

            <input
              ref="fileInput"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              class="v2-chat-file-input"
              aria-hidden="true"
              tabindex="-1"
              @change="onImageSelected"
            />

            <div class="v2-chat-composer-row">
              <div class="v2-chat-composer-actions">
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  aria-label="表情"
                  :aria-expanded="emojiOpen"
                  @click="emojiOpen = !emojiOpen; stickerOpen = false"
                >
                  <Smile :size="18" aria-hidden="true" />
                </Button>
                <Button
                  v-if="imageEnabled"
                  variant="ghost"
                  size="icon"
                  type="button"
                  :loading="imageUploading"
                  :disabled="sending || streaming || loading || imageUploading"
                  aria-label="发送图片"
                  @click="pickImage"
                >
                  <ImagePlus :size="18" aria-hidden="true" />
                </Button>
                <Button
                  v-if="imageEnabled"
                  variant="ghost"
                  size="icon"
                  type="button"
                  aria-label="表情包"
                  :aria-expanded="stickerOpen"
                  @click="stickerOpen = !stickerOpen; emojiOpen = false"
                >
                  <Sticker :size="18" aria-hidden="true" />
                </Button>
              </div>

              <Textarea
                v-model="input"
                variant="composer"
                auto-grow
                :rows="1"
                placeholder="输入消息（Enter 发送，Shift + Enter 换行）……"
                :disabled="sending || streaming || loading || !modelConfigured"
                aria-label="输入消息"
                @paste="handlePaste"
                @keydown.enter.exact.prevent="sendMessage()"
              />

              <Button
                variant="primary"
                size="md"
                type="submit"
                class="v2-chat-send-btn"
                :loading="sending"
                :disabled="!canSend"
              >
                <Send :size="16" aria-hidden="true" />
                <span>发送</span>
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>

    <aside class="v2-chat-context" aria-label="角色信息">
      <ChatCharacterPanel :context="context" :loading="loadingContext" :error="contextError" />
    </aside>

    <ChatDiagnosticsModal
      :open="showDiagnostics"
      :diagnostics="diagnostics"
      :loading="loadingDiagnostics"
      :error="diagnosticsError"
      @close="showDiagnostics = false"
      @refresh="refreshDiagnostics"
    />

    <div v-if="showCharacterPanel" class="v2-chat-drawer-backdrop" @click="showCharacterPanel = false" />
    <aside v-if="showCharacterPanel" class="v2-chat-drawer" role="dialog" aria-modal="true" aria-label="角色信息面板">
      <div class="v2-chat-diagnostics-header">
        <h3>角色信息</h3>
        <Button variant="ghost" size="icon" aria-label="关闭角色面板" @click="showCharacterPanel = false">
          <X :size="14" aria-hidden="true" />
        </Button>
      </div>
      <ChatCharacterPanel :context="context" :loading="loadingContext" :error="contextError" />
    </aside>

    <V2ToastNotification />
  </div>
</template>

<style scoped>
.v2-chat-page {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 320px;
  grid-template-areas: "sidebar main context";
  gap: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  position: relative;
  background: var(--surface-soft);
  transition: grid-template-columns 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}

.v2-chat-page.sidebar-collapsed {
  grid-template-columns: 0px minmax(0, 1fr) 320px;
}

.v2-chat-page.context-collapsed {
  grid-template-columns: 280px minmax(0, 1fr) 0px;
}

.v2-chat-page.sidebar-collapsed.context-collapsed {
  grid-template-columns: 0px minmax(0, 1fr) 0px;
}

.v2-chat-conversations {
  grid-area: sidebar;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--border);
  background: var(--surface);
  overflow: hidden;
  transition: opacity 0.2s ease;
}

.sidebar-collapsed .v2-chat-conversations {
  opacity: 0;
  pointer-events: none;
  border-right: 0;
}

.v2-chat-main {
  grid-area: main;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--background);
}

.v2-chat-context {
  grid-area: context;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-4);
  border-left: 1px solid var(--border);
  background: var(--surface);
  transition: opacity 0.2s ease, padding 0.2s ease;
}

.context-collapsed .v2-chat-context {
  opacity: 0;
  pointer-events: none;
  padding: 0;
  border-left: 0;
}

@media (max-width: 1199px) {
  .v2-chat-page {
    grid-template-columns: 260px minmax(0, 1fr) 0px;
  }

  .v2-chat-context {
    display: none;
  }
}

@media (max-width: 820px) {
  .v2-chat-page {
    grid-template-columns: 0px minmax(0, 1fr) 0px;
  }

  .v2-chat-conversations {
    display: none;
  }
}

.v2-chat-header {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
  background: var(--surface-glass);
  backdrop-filter: blur(12px);
  z-index: 10;
}

.v2-chat-header-left {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.v2-chat-title {
  flex: 1;
  min-width: 0;
}

.v2-chat-title h2 {
  margin: 0;
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v2-chat-model {
  display: block;
  margin-top: 2px;
  font-size: var(--text-xs);
  color: var(--muted);
}

.v2-chat-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.v2-chat-more {
  position: relative;
}

.v2-chat-more-menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + var(--space-1));
  right: 0;
  display: grid;
  min-width: 180px;
  padding: var(--space-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-md);
}

.v2-chat-more-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 40px;
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}

.v2-chat-more-item:hover {
  background: var(--surface-soft);
}

.v2-chat-more-item:disabled {
  color: var(--faint);
  cursor: default;
}

.v2-chat-error {
  margin: 0;
  padding: var(--space-2) var(--space-4);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-sm);
  border-bottom: 1px solid var(--border);
}

.v2-chat-status {
  margin: 0;
  padding: var(--space-4);
  color: var(--muted);
  font-size: var(--text-sm);
  text-align: center;
}

.v2-chat-messages {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: var(--space-4);
}

.v2-chat-messages-inner {
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.v2-chat-composer-wrap {
  flex: 0 0 auto;
  padding: var(--space-3) var(--space-4) var(--space-4);
  background: var(--surface-glass);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--border);
}

.v2-chat-composer-inner {
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.v2-chat-icebreakers {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) 0;
}

.v2-icebreaker-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  color: var(--primary);
}

.v2-icebreaker-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-strong);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: border-color var(--motion-fast), background var(--motion-fast), transform var(--motion-fast);
}

.v2-icebreaker-chip:hover:not(:disabled) {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary);
  transform: translateY(-1px);
}

.v2-chat-pagination-status {
  text-align: center;
  font-size: var(--text-xs);
  color: var(--muted);
  padding: var(--space-1) 0;
}

.v2-chat-pagination-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--danger);
}

.v2-chat-scroll-hint {
  position: sticky;
  bottom: var(--space-3);
  align-self: center;
  z-index: 5;
  min-height: 36px;
  padding: 0 var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--primary);
  font-size: var(--text-sm);
  font-weight: 700;
  cursor: pointer;
  box-shadow: var(--shadow-md);
}

.v2-chat-composer-wrap {
  position: relative;
  flex: 0 0 auto;
  padding: var(--space-3) clamp(16px, 4vw, 36px) var(--space-4);
  background: var(--surface-glass);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--border);
}

.v2-chat-composer {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
}

.v2-chat-composer-row {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
  width: 100%;
}

.v2-chat-composer-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.v2-chat-composer .ui-textarea-composer {
  flex: 1 1 auto;
  min-width: 0;
}

.v2-chat-send-btn {
  flex-shrink: 0;
}

.v2-chat-composer-notice {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--warning-soft);
  color: var(--warning);
  font-size: var(--text-sm);
}

.v2-chat-composer-notice a {
  color: var(--primary);
  font-weight: 600;
}

.v2-chat-attachment-preview {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding-bottom: var(--space-1);
}

.v2-chat-attachment-chip {
  position: relative;
  width: 56px;
  height: 56px;
}

.v2-chat-attachment-chip img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.v2-chat-attachment-chip button {
  position: absolute;
  top: -6px;
  right: -6px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}

.v2-chat-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.v2-chat-drawer-backdrop {
  position: fixed;
  z-index: 40;
  inset: 0;
  background: rgb(0 0 0 / 28%);
}

.v2-chat-drawer {
  position: fixed;
  z-index: 41;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(420px, 92vw);
  padding: var(--space-5);
  overflow-y: auto;
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
  display: grid;
  gap: var(--space-4);
  align-content: start;
}

.v2-chat-diagnostics-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}

.v2-chat-diagnostics-header h3 {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
}

.v2-chat-diagnostics-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.v2-chat-diagnostics-loading {
  font-size: var(--text-xs);
  color: var(--muted);
  padding: var(--space-2) 0;
}

.v2-chat-diagnostics-error {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-start;
  padding: var(--space-3);
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-xs);
}

.v2-chat-diagnostics-error p {
  margin: 0;
}

.v2-chat-diagnostics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: var(--space-2);
}

.v2-diag-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--background);
  padding: var(--space-2);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.v2-diag-label {
  font-size: var(--text-xs);
  color: var(--muted);
}

.v2-diag-value {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--text);
}

@media (max-width: 640px) {
  .v2-chat-header {
    padding: var(--space-2) var(--space-3);
  }

  .v2-chat-messages {
    padding: var(--space-3) var(--space-2);
  }

  .v2-chat-message-content {
    max-width: 88%;
  }

  .v2-chat-composer-wrap {
    padding: var(--space-2) var(--space-2) var(--space-3);
  }

  .v2-chat-composer-row {
    gap: var(--space-1);
  }

  .v2-chat-drawer {
    top: auto;
    right: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    max-height: 70dvh;
    border-left: 0;
    border-top: 1px solid var(--border);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }
}
</style>
