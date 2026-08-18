<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Activity, ArrowLeft, BookOpen, Copy, ImagePlus, MoreHorizontal, RefreshCw, Send, Sparkles, Square, X } from "@lucide/vue";

import Button from "../../components/ui/Button.vue";
import Textarea from "../../components/ui/Textarea.vue";
import V2ToastNotification from "../components/V2ToastNotification.vue";
import { useNotificationStore } from "../stores/notification.ts";
import type {
  V2ChatDiagnosticsResponse,
  V2ChatMessageDto,
  V2ConversationId,
  V2IdempotencyKey,
  V2MediaId,
  V2MessageId,
} from "@living-network/contracts/v2";
import { createV2ChatClient, type V2ChatStreamEvent } from "../chat/client.ts";

const route = useRoute();
const router = useRouter();
const environment = import.meta.env as Record<string, string | undefined>;
const baseUrl = environment.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3002" : window.location.origin);
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

// Pagination state
const hasMore = ref(false);
const nextBeforeMessageId = ref<string | undefined>(undefined);
const loadingOlder = ref(false);
const loadingOlderError = ref("");
const isNearBottom = ref(true);
const showScrollHint = ref(false);

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

function messageStatusLabel(message: V2ChatMessageDto): string | undefined {
  if (message.status === "pending") return "生成中";
  if (message.status === "failed") return "发送失败";
  if (message.status === "interrupted") return "已中断";
  return undefined;
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

onMounted(async () => {
  await loadChat();
  if (messages.value.length === 0) {
    await generateOpening();
  }
});

onUnmounted(() => {
  abortController?.abort();
});

async function loadChat(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [conversation, history] = await Promise.all([
      client.listConversations().then((items) => items.find((item) => item.conversationId === conversationId.value)),
      client.listMessages(conversationId.value as V2ConversationId, { limit: 50 }),
    ]);
    conversationTitle.value = conversation?.title ?? "故事对话";
    messages.value = history.messages;
    hasMore.value = history.hasMore;
    nextBeforeMessageId.value = history.nextBeforeMessageId;
    await nextTick();
    scrollToBottom("auto");
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "加载对话失败";
  } finally {
    loading.value = false;
  }
}

async function loadOlderMessages(): Promise<void> {
  if (!hasMore.value || loadingOlder.value || !nextBeforeMessageId.value) return;
  loadingOlder.value = true;
  loadingOlderError.value = "";
  const container = messagesContainer.value;
  const oldScrollHeight = container?.scrollHeight ?? 0;
  const oldScrollTop = container?.scrollTop ?? 0;

  try {
    const page = await client.listMessages(conversationId.value as V2ConversationId, {
      beforeMessageId: nextBeforeMessageId.value as V2MessageId,
      limit: 50,
    });
    messages.value = [...page.messages, ...messages.value];
    hasMore.value = page.hasMore;
    nextBeforeMessageId.value = page.nextBeforeMessageId;

    await nextTick();
    if (container) {
      const newScrollHeight = container.scrollHeight;
      container.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
    }
  } catch (error) {
    loadingOlderError.value = error instanceof Error ? error.message : "加载更早消息失败";
  } finally {
    loadingOlder.value = false;
  }
}

async function toggleDiagnostics(): Promise<void> {
  showDiagnostics.value = !showDiagnostics.value;
  if (showDiagnostics.value) {
    await refreshDiagnostics();
  }
}

async function refreshDiagnostics(): Promise<void> {
  loadingDiagnostics.value = true;
  diagnosticsError.value = null;
  try {
    diagnostics.value = await client.getLatestDiagnostics(conversationId.value as V2ConversationId);
  } catch (error) {
    diagnosticsError.value = error instanceof Error ? error.message : "获取诊断信息失败";
  } finally {
    loadingDiagnostics.value = false;
  }
}

async function generateOpening(): Promise<void> {
  await startAssistantReply(`story-bootstrap:${conversationId.value}`);
}

async function sendMessage(attachmentIds: readonly string[] = []): Promise<void> {
  const text = input.value.trim();
  if ((!text && attachmentIds.length === 0) || sending.value || streaming.value) return;
  sending.value = true;
  errorMessage.value = "";
  try {
    const response = await client.sendMessage(conversationId.value as V2ConversationId, {
      ...(text ? { text } : {}),
      ...(attachmentIds.length ? { attachmentIds: attachmentIds as V2MediaId[] } : {}),
      idempotencyKey: `user:${Date.now()}:${crypto.randomUUID()}` as V2IdempotencyKey,
    });
    messages.value = [...messages.value, response.message];
    input.value = "";
    await nextTick();
    scrollToBottom("smooth");
    await startAssistantReply();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "发送失败";
  } finally {
    sending.value = false;
  }
}

async function pickImage(): Promise<void> {
  fileInput.value?.click();
}

async function onImageSelected(event: Event): Promise<void> {
  const inputElement = event.target as HTMLInputElement;
  const file = inputElement.files?.[0];
  inputElement.value = "";
  if (!file || imageUploading.value) return;
  imageUploading.value = true;
  errorMessage.value = "";
  try {
    const media = await client.uploadMedia(file);
    await sendMessage([media.mediaId]);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "图片发送失败";
  } finally {
    imageUploading.value = false;
  }
}

async function startAssistantReply(openingIdempotencyKey?: string): Promise<void> {
  if (streaming.value) return;
  streaming.value = true;
  errorMessage.value = "";
  abortController = new AbortController();
  const placeholderId = `assistant:${Date.now()}:${crypto.randomUUID()}`;
  const idempotencyKey = openingIdempotencyKey ?? `reply:${Date.now()}:${crypto.randomUUID()}`;
  const placeholder: V2ChatMessageDto = {
    messageId: placeholderId as V2ChatMessageDto["messageId"],
    conversationId: conversationId.value as V2ConversationId,
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
      conversationId.value as V2ConversationId,
      { idempotencyKey: placeholder.idempotencyKey },
      handleEvent,
      abortController.signal,
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      errorMessage.value = "已停止生成";
    } else {
      errorMessage.value = error instanceof Error ? error.message : "生成失败";
    }
    updatePlaceholder(placeholder.messageId, { status: content ? "interrupted" : "failed" });
  } finally {
    streaming.value = false;
    abortController = undefined;
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

function isUser(message: V2ChatMessageDto): boolean {
  return message.role === "user";
}
</script>

<template>
  <div class="v2-chat-page">
    <header class="v2-chat-header">
      <Button variant="ghost" size="icon" aria-label="返回创建故事" @click="router.push('/v2/start')">
        <ArrowLeft :size="18" aria-hidden="true" />
      </Button>
      <div class="v2-chat-title">
        <h2>{{ conversationTitle }}</h2>
      </div>
      <div class="v2-chat-header-actions">
        <Button
          v-if="streaming"
          variant="secondary"
          size="sm"
          @click="stopGeneration"
        >
          <Square :size="14" aria-hidden="true" />
          停止
        </Button>
        <div class="v2-chat-more" ref="moreMenuRef">
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
    <p v-if="loading" class="v2-chat-status">正在加载对话…</p>

    <div
      ref="messagesContainer"
      class="v2-chat-messages"
      aria-live="polite"
      @scroll="handleScroll"
    >
      <div v-if="loadingOlder" class="v2-chat-pagination-status">正在加载更早的历史记录…</div>
      <div v-else-if="loadingOlderError" class="v2-chat-pagination-status v2-chat-pagination-error">
        加载更早消息失败
        <Button variant="ghost" size="sm" @click="loadOlderMessages">重试</Button>
      </div>
      <div v-else-if="!hasMore && messages.length >= 50" class="v2-chat-pagination-status">已加载全部历史记录</div>

      <article
        v-for="message in messages"
        :key="message.messageId"
        class="v2-chat-message"
        :class="{ 'v2-chat-message-user': isUser(message), 'v2-chat-message-assistant': !isUser(message) }"
      >
        <div class="v2-chat-bubble">
          <template v-if="message.text">{{ message.text }}</template>
          <template v-else-if="message.status === 'pending'">…</template>
          <template v-else>（空消息）</template>
          <div v-if="message.attachments.length" class="v2-chat-images">
            <img
              v-for="attachment in message.attachments"
              :key="attachment.attachmentId"
              :src="client.mediaUrl(attachment.mediaRef)"
              :alt="'聊天图片'"
              class="v2-chat-image"
              loading="lazy"
              @error="(event) => (event.target as HTMLImageElement).style.display = 'none'"
              @click="openImagePreview(client.mediaUrl(attachment.mediaRef))"
            />
          </div>
        </div>
        <small
          v-if="messageStatusLabel(message)"
          class="v2-chat-meta"
          :class="{ 'v2-chat-meta-error': message.status === 'failed' }"
        >
          {{ messageStatusLabel(message) }}
        </small>
      </article>

      <button v-if="showScrollHint" type="button" class="v2-chat-scroll-hint" @click="jumpToLatest">
        ↓ 查看新消息
      </button>
    </div>

    <form class="v2-chat-composer" @submit.prevent="sendMessage()">
      <input
        ref="fileInput"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        class="v2-chat-file-input"
        aria-hidden="true"
        tabindex="-1"
        @change="onImageSelected"
      />
      <Button
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
      <Textarea
        v-model="input"
        variant="composer"
        auto-grow
        :rows="1"
        placeholder="输入消息……"
        :disabled="sending || streaming || loading"
        aria-label="输入消息"
      />
      <Button
        variant="primary"
        size="md"
        type="submit"
        :loading="sending"
        :disabled="(!input.trim() && !imageUploading) || streaming || loading"
      >
        <Send :size="16" aria-hidden="true" />
        发送
      </Button>
    </form>

    <div v-if="showDiagnostics" class="v2-chat-drawer-backdrop" @click="showDiagnostics = false" />
    <aside v-if="showDiagnostics" class="v2-chat-drawer" role="dialog" aria-modal="true" aria-label="上下文诊断面板">
      <div class="v2-chat-diagnostics-header">
        <h3>上下文诊断</h3>
        <div class="v2-chat-diagnostics-actions">
          <Button
            variant="ghost"
            size="icon"
            :loading="loadingDiagnostics"
            aria-label="刷新诊断数据"
            @click="refreshDiagnostics"
          >
            <RefreshCw :size="14" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="关闭诊断面板" @click="showDiagnostics = false">
            <X :size="14" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div v-if="loadingDiagnostics && !diagnostics" class="v2-chat-diagnostics-loading">
        正在读取上下文状态…
      </div>
      <div v-else-if="diagnosticsError" class="v2-chat-diagnostics-error">
        <p>{{ diagnosticsError }}</p>
        <Button variant="secondary" size="sm" @click="refreshDiagnostics">重试</Button>
      </div>
      <div v-else-if="diagnostics" class="v2-chat-diagnostics-grid">
        <div class="v2-diag-item">
          <span class="v2-diag-label">提示词模板</span>
          <span class="v2-diag-value">{{ diagnostics.templateId || "chat:roleplay:v1" }}</span>
        </div>
        <div class="v2-diag-item">
          <span class="v2-diag-label">Token 预算上限</span>
          <span class="v2-diag-value">{{ diagnostics.inputBudget ? `${diagnostics.inputBudget} tokens` : "4096 tokens" }}</span>
        </div>
        <div class="v2-diag-item">
          <span class="v2-diag-label">活跃长期记忆</span>
          <span class="v2-diag-value">{{ diagnostics.selectedMemoryIds ? `${diagnostics.selectedMemoryIds.length} 条` : "0 条" }}</span>
        </div>
        <div class="v2-diag-item">
          <span class="v2-diag-label">会话摘要版本</span>
          <span class="v2-diag-value">{{ diagnostics.summaryVersion ? `v${diagnostics.summaryVersion}` : "暂无" }}</span>
        </div>
        <div class="v2-diag-item">
          <span class="v2-diag-label">最近消息窗口</span>
          <span class="v2-diag-value">{{ diagnostics.recentCount !== undefined ? `${diagnostics.recentCount} 条` : "0 条" }}</span>
        </div>
        <div class="v2-diag-item">
          <span class="v2-diag-label">多模态图片</span>
          <span class="v2-diag-value">{{ diagnostics.imageCount !== undefined ? `${diagnostics.imageCount} 张` : "0 张" }}</span>
        </div>
      </div>
      <div v-else class="v2-chat-diagnostics-loading">
        暂无诊断数据
      </div>
    </aside>

    <V2ToastNotification />
  </div>
</template>

<style scoped>
.v2-chat-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
}

.v2-chat-header {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: var(--space-3);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border);
}

.v2-chat-title {
  flex: 1;
  min-width: 0;
}

.v2-chat-title h2 {
  margin: 0;
  font-size: var(--text-base);
  color: var(--text);
}

.v2-chat-title p {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.v2-chat-diagnostics-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-4);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
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

.v2-chat-error {
  margin: 0;
  color: var(--danger);
  font-size: var(--text-sm);
}

.v2-chat-status {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-sm);
}

.v2-chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-2);
}

.v2-chat-error,
.v2-chat-status,
.v2-chat-success-banner {
  flex: 0 0 auto;
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
  box-shadow: var(--shadow-sm);
}

.v2-chat-message {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.v2-chat-message-user {
  align-items: flex-end;
}

.v2-chat-message-assistant {
  align-items: flex-start;
}

.v2-chat-bubble {
  max-width: min(760px, 88%);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}

.v2-chat-message-user .v2-chat-bubble {
  max-width: min(680px, 80%);
  background: var(--primary);
  color: var(--on-primary);
  border-color: transparent;
}

.v2-chat-images {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.v2-chat-image {
  cursor: zoom-in;
}

.v2-chat-image {
  max-width: 180px;
  max-height: 180px;
  border-radius: var(--radius-md);
  object-fit: cover;
}

.v2-chat-meta {
  font-size: var(--text-xs);
  color: var(--muted);
}

.v2-chat-meta-error {
  color: var(--danger);
}

.v2-chat-composer {
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-2);
  align-items: flex-end;
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}

.v2-chat-composer .ui-textarea-composer {
  flex: 1 1 auto;
  min-width: 0;
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

@media (max-width: 640px) {
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

@media (max-width: 640px) {
  .v2-chat-bubble,
  .v2-chat-message-user .v2-chat-bubble {
    max-width: 94%;
  }

  .v2-chat-composer {
    gap: var(--space-1);
  }
}
</style>
