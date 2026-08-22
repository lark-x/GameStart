<script setup lang="ts">
import { computed } from "vue";
import type { V2ChatMessageDto } from "@living-network/contracts/v2";

const props = defineProps<{
  message: V2ChatMessageDto;
  conversationTitle: string;
  mediaUrl: (ref: string) => string;
}>();

const emit = defineEmits<{
  "preview-image": [url: string];
}>();

const isUser = computed(() => props.message.role === "user");

function avatarInitial(name: string): string {
  return [...name.trim()][0] ?? "?";
}

function messageStatusLabel(message: V2ChatMessageDto): string | null {
  if (message.status === "failed") return "发送失败";
  if (message.status === "interrupted") return "已中断";
  if (message.status === "pending" && !message.text) return "思考中…";
  return null;
}
</script>

<template>
  <article
    class="v2-chat-message-row"
    :class="{ 'v2-chat-message-user': isUser, 'v2-chat-message-assistant': !isUser }"
  >
    <div
      v-if="!isUser"
      class="v2-chat-avatar v2-chat-avatar-assistant"
      aria-hidden="true"
    >
      {{ avatarInitial(conversationTitle) }}
    </div>

    <div class="v2-chat-message-content">
      <div
        class="v2-chat-bubble"
        :class="{
          'v2-chat-bubble-user': isUser,
          'v2-chat-bubble-pending': message.status === 'pending' && !message.text
        }"
      >
        <template v-if="message.text">
          <div class="v2-chat-text">{{ message.text }}</div>
        </template>
        <div
          v-else-if="message.status === 'pending'"
          class="v2-chat-typing"
          aria-label="正在生成回复"
        >
          <span class="v2-chat-typing-dot" />
          <span class="v2-chat-typing-dot" />
          <span class="v2-chat-typing-dot" />
        </div>
        <template v-else>（空消息）</template>

        <!-- 附件图片列表 -->
        <div v-if="message.attachments && message.attachments.length" class="v2-chat-images">
          <div
            v-for="attachment in message.attachments"
            :key="attachment.attachmentId"
            class="v2-chat-image-card"
          >
            <img
              :src="mediaUrl(attachment.mediaRef)"
              :alt="'聊天图片'"
              class="v2-chat-image"
              loading="lazy"
              @error="(event) => (event.target as HTMLImageElement).style.display = 'none'"
              @click="emit('preview-image', mediaUrl(attachment.mediaRef))"
            />
          </div>
        </div>
      </div>

      <!-- 消息状态指示 -->
      <div
        v-if="messageStatusLabel(message)"
        class="v2-chat-status-pill"
        :class="{
          'v2-chat-status-error': message.status === 'failed',
          'v2-chat-status-interrupted': message.status === 'interrupted',
          'v2-chat-status-pending': message.status === 'pending'
        }"
      >
        <span class="v2-chat-status-dot" />
        <span>{{ messageStatusLabel(message) }}</span>
      </div>
    </div>

    <div v-if="isUser" class="v2-chat-avatar v2-chat-avatar-user" aria-hidden="true">
      我
    </div>
  </article>
</template>

<style scoped>
.v2-chat-message-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  max-width: 100%;
}

.v2-chat-message-user {
  flex-direction: row-reverse;
}

.v2-chat-message-assistant {
  flex-direction: row;
}

.v2-chat-avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  display: grid;
  place-items: center;
  font-size: var(--text-sm);
  font-weight: 700;
  flex-shrink: 0;
}

.v2-chat-avatar-assistant {
  background: var(--primary-soft);
  color: var(--primary);
  box-shadow: var(--shadow-sm);
}

.v2-chat-avatar-user {
  background: var(--surface-muted);
  color: var(--text-strong);
}

.v2-chat-message-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: min(680px, 78%);
}

.v2-chat-message-user .v2-chat-message-content {
  align-items: flex-end;
}

.v2-chat-bubble {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-strong);
  font-size: var(--text-base);
  line-height: 1.6;
  box-shadow: var(--shadow-sm);
  word-break: break-word;
  white-space: pre-wrap;
}

.v2-chat-bubble-user {
  background: var(--primary);
  color: var(--on-primary);
  border-color: var(--primary);
}

.v2-chat-bubble-pending {
  padding: var(--space-3) var(--space-4);
}

.v2-chat-text {
  min-height: 1.2em;
}

.v2-chat-typing {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
}

.v2-chat-typing-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--primary);
  animation: typingBounce 1.4s infinite ease-in-out both;
}

.v2-chat-typing-dot:nth-child(1) { animation-delay: -0.32s; }
.v2-chat-typing-dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes typingBounce {
  0%, 80%, 100% { transform: scale(0); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

.v2-chat-images {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.v2-chat-image-card {
  border-radius: var(--radius-md);
  overflow: hidden;
  max-width: 220px;
  max-height: 220px;
  cursor: pointer;
  border: 1px solid var(--border);
}

.v2-chat-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform var(--motion-fast);
}

.v2-chat-image:hover {
  transform: scale(1.03);
}

.v2-chat-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: var(--radius-full);
  color: var(--muted);
}

.v2-chat-status-dot {
  width: 5px;
  height: 5px;
  border-radius: var(--radius-full);
  background: currentColor;
}

.v2-chat-status-error {
  color: var(--danger);
}

.v2-chat-status-interrupted {
  color: var(--warning);
}

.v2-chat-status-pending {
  color: var(--primary);
}
</style>
