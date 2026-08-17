<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, ImagePlus, Send, Square } from "@lucide/vue";

import Button from "../../components/ui/Button.vue";
import Textarea from "../../components/ui/Textarea.vue";
import type { V2ChatMessageDto, V2ConversationId, V2IdempotencyKey, V2MediaId } from "@living-network/contracts/v2";
import { createV2ChatClient, type V2ChatStreamEvent } from "../chat/client.ts";

const route = useRoute();
const router = useRouter();
const environment = import.meta.env as Record<string, string | undefined>;
const baseUrl = environment.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3002" : window.location.origin);
const client = createV2ChatClient({ baseUrl });

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
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "加载对话失败";
  } finally {
    loading.value = false;
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
  let content = "";
  let replaced = false;

  const handleEvent = (event: V2ChatStreamEvent): void => {
    if (event.type === "delta" && event.content !== undefined) {
      content += event.content;
      updatePlaceholder(placeholder.messageId, { text: content, status: "pending" });
    } else if (event.type === "message" && event.message !== undefined) {
      replaced = true;
      messages.value = messages.value.map((message) =>
        message.messageId === placeholder.messageId ? event.message! : message,
      );
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
        <p>{{ conversationId }}</p>
      </div>
      <Button
        v-if="streaming"
        variant="secondary"
        size="sm"
        @click="stopGeneration"
      >
        <Square :size="14" aria-hidden="true" />
        停止
      </Button>
    </header>

    <p v-if="errorMessage" class="v2-chat-error">{{ errorMessage }}</p>
    <p v-if="loading" class="v2-chat-status">正在加载对话…</p>

    <div class="v2-chat-messages" aria-live="polite">
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
            />
          </div>
        </div>
        <small class="v2-chat-meta">{{ isUser(message) ? "你" : "角色" }} · {{ message.status }}</small>
      </article>
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
        :rows="2"
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
  </div>
</template>

<style scoped>
.v2-chat-page {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 88px);
  min-height: 0;
  gap: var(--space-3);
}

.v2-chat-header {
  display: flex;
  align-items: center;
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
  max-width: 78%;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}

.v2-chat-message-user .v2-chat-bubble {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: transparent;
}

.v2-chat-images {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
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

.v2-chat-composer {
  display: flex;
  gap: var(--space-2);
  align-items: flex-end;
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
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
</style>
