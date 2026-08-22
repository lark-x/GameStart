<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, Copy } from "@lucide/vue";
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
const copied = ref(false);

function avatarInitial(name: string): string {
  return [...name.trim()][0] ?? "?";
}

function messageStatusLabel(message: V2ChatMessageDto): string | null {
  if (message.status === "failed") return "发送失败";
  if (message.status === "pending" && !message.text) return "思考中…";
  return null;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatRoleplayContent(raw: string): string {
  if (!raw) return "";
  let safe = escapeHtml(raw);
  // Full-width Chinese parentheses （...） for action/thought narration
  safe = safe.replace(/（([^）]+)）/g, '<span class="v2-narrative-action">（$1）</span>');
  // Half-width English parentheses (...) for action/thought narration
  safe = safe.replace(/\(([^)]+)\)/g, '<span class="v2-narrative-action">($1)</span>');
  // Asterisks *...* for narrative actions
  safe = safe.replace(/\*([^*]+)\*/g, '<span class="v2-narrative-action">*$1*</span>');
  // Bold **text**
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong class="v2-text-bold">$1</strong>');
  return safe;
}

async function copyMessageText(): Promise<void> {
  if (!props.message.text) return;
  try {
    await navigator.clipboard.writeText(props.message.text);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    // Fallback if clipboard API is unavailable
  }
}
</script>

<template>
  <article
    class="v2-chat-message-row"
    :class="{ 'v2-chat-message-user': isUser, 'v2-chat-message-assistant': !isUser }"
  >
    <!-- Avatar -->
    <div
      v-if="!isUser"
      class="v2-chat-avatar v2-chat-avatar-assistant"
      aria-hidden="true"
    >
      {{ avatarInitial(conversationTitle) }}
    </div>

    <!-- Message Body Container -->
    <div class="v2-chat-message-content">
      <div
        class="v2-chat-bubble"
        :class="{
          'v2-chat-bubble-user': isUser,
          'v2-chat-bubble-assistant': !isUser,
          'v2-chat-bubble-pending': message.status === 'pending' && !message.text
        }"
      >
        <!-- Formatted Text -->
        <template v-if="message.text">
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="v2-chat-text" v-html="formatRoleplayContent(message.text)" />
        </template>
        <!-- Typing Animation -->
        <div
          v-else-if="message.status === 'pending'"
          class="v2-chat-typing"
          aria-label="正在生成回复"
        >
          <span class="v2-chat-typing-dot" />
          <span class="v2-chat-typing-dot" />
          <span class="v2-chat-typing-dot" />
        </div>
        <template v-else>
          <span class="v2-chat-empty-msg">（空消息）</span>
        </template>

        <!-- Image Attachments -->
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

        <!-- Floating Action Toolbar on Hover -->
        <div v-if="message.text && !isUser" class="v2-chat-bubble-actions">
          <button
            type="button"
            class="v2-bubble-action-btn"
            :title="copied ? '已复制' : '复制内容'"
            aria-label="复制消息内容"
            @click.stop="copyMessageText"
          >
            <Check v-if="copied" :size="13" class="text-success" aria-hidden="true" />
            <Copy v-else :size="13" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- Status Indicator Pill -->
      <div
        v-if="messageStatusLabel(message)"
        class="v2-chat-status-pill"
        :class="{
          'v2-chat-status-error': message.status === 'failed',
          'v2-chat-status-pending': message.status === 'pending'
        }"
      >
        <span class="v2-chat-status-dot" />
        <span>{{ messageStatusLabel(message) }}</span>
      </div>
    </div>

    <!-- User Avatar -->
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
  position: relative;
}

.v2-chat-message-user {
  flex-direction: row-reverse;
}

.v2-chat-message-assistant {
  flex-direction: row;
}

.v2-chat-avatar {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-full);
  display: grid;
  place-items: center;
  font-size: var(--text-sm);
  font-weight: 800;
  flex-shrink: 0;
  user-select: none;
}

.v2-chat-avatar-assistant {
  background: var(--surface);
  color: var(--primary);
  border: 1px solid var(--border-strong);
  box-shadow: var(--shadow-sm);
}

.v2-chat-avatar-user {
  background: var(--primary);
  color: var(--on-primary);
  box-shadow: var(--shadow-sm);
}

.v2-chat-message-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: min(840px, 80%);
  min-width: 0;
}

.v2-chat-message-user .v2-chat-message-content {
  align-items: flex-end;
}

.v2-chat-message-assistant .v2-chat-message-content {
  align-items: flex-start;
}

.v2-chat-bubble {
  position: relative;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  font-size: var(--text-base);
  line-height: 1.7;
  word-break: break-word;
  white-space: pre-wrap;
  transition: box-shadow var(--motion-fast);
}

.v2-chat-bubble-assistant {
  background: var(--surface);
  color: var(--text-strong);
  border: 1px solid var(--border);
  border-top-left-radius: 4px;
  box-shadow: var(--shadow-sm);
}

.v2-chat-bubble-assistant:hover {
  box-shadow: var(--shadow-md);
}

.v2-chat-bubble-user {
  background: var(--primary);
  color: var(--on-primary);
  border-top-right-radius: 4px;
  box-shadow: var(--shadow-sm);
}

.v2-chat-bubble-pending {
  padding: var(--space-3) var(--space-4);
}

.v2-chat-text {
  min-height: 1.2em;
}

/* 角色扮演动作/心理/旁白渲染 */
:deep(.v2-narrative-action) {
  color: var(--muted);
  font-style: italic;
  opacity: 0.92;
  font-size: 0.96em;
  padding: 0 1px;
}

.v2-chat-bubble-user :deep(.v2-narrative-action) {
  color: rgb(255 255 255 / 85%);
}

:deep(.v2-text-bold) {
  font-weight: 700;
  color: var(--text-strong);
}

.v2-chat-bubble-user :deep(.v2-text-bold) {
  color: var(--on-primary);
}

.v2-chat-empty-msg {
  color: var(--muted);
  font-size: var(--text-sm);
}

/* 悬浮操作栏 */
.v2-chat-bubble-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  opacity: 0;
  transform: translateY(-2px);
  transition: opacity var(--motion-fast), transform var(--motion-fast);
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 2px;
  box-shadow: var(--shadow-sm);
}

.v2-chat-bubble:hover .v2-chat-bubble-actions {
  opacity: 1;
  transform: translateY(0);
}

.v2-bubble-action-btn {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-xs);
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background var(--motion-fast), color var(--motion-fast);
}

.v2-bubble-action-btn:hover {
  background: var(--surface);
  color: var(--text-strong);
}

.text-success {
  color: var(--success);
}

/* 打字动画 */
.v2-chat-typing {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 4px;
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

/* 附件图片 */
.v2-chat-images {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.v2-chat-image-card {
  border-radius: var(--radius-md);
  overflow: hidden;
  max-width: 240px;
  max-height: 240px;
  cursor: pointer;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
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

/* 状态药丸 */
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

.v2-chat-status-pending {
  color: var(--primary);
}
</style>
