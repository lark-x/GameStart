<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import {
  Camera,
  Gift,
  Heart,
  MapPin,
  RefreshCw,
  Send,
  Smile,
  Sparkles,
  User,
} from "@lucide/vue";
import type {
  V2ChatMessageDto,
  V2CompanionRosterResponse,
  V2ConversationId,
  V2IdempotencyKey,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
import { createV2ChatClient } from "../../chat/client.ts";
import type { V2CompanionClient } from "../client.ts";

type V2CompanionRosterCharacter = V2CompanionRosterResponse["characters"][number];

const props = defineProps<{
  character: V2CompanionRosterCharacter;
  companionClient: V2CompanionClient;
}>();

const emit = defineEmits<{
  "preview-image": [url: string];
  "affinity-change": [];
}>();

const environment = import.meta.env as Record<string, string | undefined>;
const baseUrl = environment.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3003" : window.location.origin);
const chatClient = createV2ChatClient({ baseUrl });

const conversationId = ref<V2ConversationId | null>(null);
const messages = ref<readonly V2ChatMessageDto[]>([]);
const loadingMessages = ref(true);
const sending = ref(false);
const inputDraft = ref("");
const chatScrollContainer = ref<HTMLElement | null>(null);
const isGeneratingPhoto = ref(false);
const showActionMenu = ref(false);

// Auto-quick topic suggestions
const quickTopics = [
  "今天有什么有趣的事情吗？",
  "想和你一起在附近散散步~",
  "你现在在做些什么呢？",
  "送给你一杯温暖的热红茶 ☕",
];

function avatarInitial(name: string): string {
  return [...name.trim()][0] ?? "?";
}

function formatMsgTime(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

// Parses text for *action / monologue* cues (e.g. *微笑着递给你一杯茶*)
function parseMessageSegments(text: string): Array<{ type: "text" | "action"; content: string }> {
  const segments: Array<{ type: "text" | "action"; content: string }> = [];
  const regex = /(\*[^*]+\*|（[^）]+）|\([^)]+\))/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      segments.push({ type: "text", content: text.slice(lastIdx, match.index) });
    }
    const inner = match[0].replace(/^[*（(]|[*）)]$/g, "");
    segments.push({ type: "action", content: inner });
    lastIdx = regex.lastIndex;
  }

  if (lastIdx < text.length) {
    segments.push({ type: "text", content: text.slice(lastIdx) });
  }

  return segments.length > 0 ? segments : [{ type: "text", content: text }];
}

function scrollToBottom(): void {
  void nextTick(() => {
    if (chatScrollContainer.value) {
      chatScrollContainer.value.scrollTop = chatScrollContainer.value.scrollHeight;
    }
  });
}

async function loadConversation(): Promise<void> {
  loadingMessages.value = true;
  try {
    const contacts = await chatClient.listContacts();
    const targetContact = contacts.find((c) => c.characterId === props.character.characterId);

    if (targetContact?.latestConversationId) {
      conversationId.value = targetContact.latestConversationId;
    } else {
      const summaries = await chatClient.listConversationSummaries();
      const existing = summaries.find((s) => s.primaryCharacterId === props.character.characterId);
      if (existing) {
        conversationId.value = existing.conversationId;
      } else {
        const idempotencyKey = `conv:${props.character.characterId}:${Date.now()}` as V2IdempotencyKey;
        const res = await chatClient.createConversation({
          characterId: props.character.characterId,
          storyWorldId: (targetContact?.storyWorldId ?? "world:default") as V2StoryWorldId,
          idempotencyKey,
        });
        conversationId.value = res.conversation.conversationId;
      }
    }

    if (conversationId.value) {
      const page = await chatClient.listMessages(conversationId.value, { limit: 50 });
      messages.value = page.messages;
    }
    scrollToBottom();
  } catch (err) {
    console.error("Failed to load companion chat conversation:", err);
  } finally {
    loadingMessages.value = false;
  }
}

async function handleSendMessage(customText?: string): Promise<void> {
  const content = (customText || inputDraft.value).trim();
  if (!content || !conversationId.value || sending.value) return;

  if (!customText) {
    inputDraft.value = "";
  }

  sending.value = true;
  const idempotencyKey = `msg:${Date.now()}:${Math.random().toString(36).slice(2, 8)}` as V2IdempotencyKey;

  // Optimistic local user message append
  const tempUserMsg: V2ChatMessageDto = {
    messageId: `local:${Date.now()}` as unknown as V2ChatMessageDto["messageId"],
    conversationId: conversationId.value,
    role: "user",
    characterId: props.character.characterId,
    text: content,
    attachments: [],
    status: "completed",
    createdAt: new Date().toISOString() as unknown as V2ChatMessageDto["createdAt"],
    idempotencyKey,
  };
  messages.value = [...messages.value, tempUserMsg];
  scrollToBottom();

  try {
    await chatClient.sendMessage(conversationId.value, {
      text: content,
      idempotencyKey,
    });
    // Refresh authoritative history
    const refreshed = await chatClient.listMessages(conversationId.value, { limit: 50 });
    messages.value = refreshed.messages;
    emit("affinity-change");
    scrollToBottom();
  } catch (err) {
    console.error("Send message error:", err);
  } finally {
    sending.value = false;
    scrollToBottom();
  }
}

async function handlePhotoRequest(): Promise<void> {
  if (isGeneratingPhoto.value) return;
  isGeneratingPhoto.value = true;
  await handleSendMessage("能给我拍一张你现在所在地方的照片吗？我想看看你~ 📷");
  isGeneratingPhoto.value = false;
}

async function handleGiftSend(giftName: string): Promise<void> {
  showActionMenu.value = false;
  await handleSendMessage(`*微笑着递上一份精心准备的礼物：${giftName}* 这是送给你的！🎁`);
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void handleSendMessage();
  }
}

watch(
  () => props.character.characterId,
  () => {
    void loadConversation();
  },
);

onMounted(() => {
  void loadConversation();
});
</script>

<template>
  <div class="companion-chat-root">
    <!-- ═══ 1. 顶部伴侣信息状态栏 (Header) ═══ -->
    <header class="chat-header-bar">
      <div class="header-character-info">
        <div class="char-avatar-ring">
          <div class="char-avatar-box">
            {{ avatarInitial(character.name) }}
          </div>
          <span class="live-dot" title="在线" />
        </div>

        <div class="char-meta-column">
          <div class="char-title-row">
            <h2 class="char-display-name">{{ character.name }}</h2>
            <div class="char-affinity-badge">
              <Heart :size="12" class="fill-current text-rose-500" aria-hidden="true" />
              <span>Lv.{{ character.affinity.level }} · {{ character.affinity.levelTitle }}</span>
            </div>
          </div>

          <div class="char-live-status-line">
            <span class="status-pill location-pill">
              <MapPin :size="11" aria-hidden="true" />
              <span>{{ character.schedule.currentActivity.locationName }}</span>
            </span>
            <span class="status-pill activity-pill">
              <span>{{ character.schedule.currentActivity.activityName }}</span>
            </span>
            <span class="status-pill mood-pill">
              <Smile :size="11" aria-hidden="true" />
              <span>{{ character.affinity.emotion.moodLabel }}</span>
            </span>
          </div>
        </div>
      </div>

      <div class="header-action-group">
        <button
          type="button"
          class="header-btn"
          title="生成抓拍自拍"
          :disabled="isGeneratingPhoto || sending"
          @click="handlePhotoRequest"
        >
          <Camera :size="16" aria-hidden="true" />
          <span class="btn-text-desktop">抓拍自拍</span>
        </button>

        <button
          type="button"
          class="header-btn"
          title="刷新对话记录"
          :disabled="loadingMessages"
          @click="loadConversation"
        >
          <RefreshCw :size="15" :class="{ 'spin-icon': loadingMessages }" aria-hidden="true" />
        </button>
      </div>
    </header>

    <!-- ═══ 2. 聊天消息流区域 (Message Stream) ═══ -->
    <div ref="chatScrollContainer" class="chat-message-stream">
      <!-- 初始欢迎引言 -->
      <div class="chat-welcome-banner">
        <div class="welcome-icon-box">
          <Sparkles :size="20" class="text-primary" aria-hidden="true" />
        </div>
        <h3 class="welcome-title">与 {{ character.name }} 的专属私密时光</h3>
        <p class="welcome-subtitle">
          当前位于 {{ character.schedule.currentActivity.locationName }}，心情处于「{{ character.affinity.emotion.moodLabel }}」状态。你可以自由与她交谈、赠送礼物或发起互动。
        </p>
      </div>

      <!-- 加载中 -->
      <div v-if="loadingMessages && messages.length === 0" class="chat-loading-state">
        <div class="spinner-ring" />
        <span>正在读取与 {{ character.name }} 的对话记录…</span>
      </div>

      <!-- 消息气泡流 -->
      <div
        v-for="msg in messages"
        :key="msg.messageId"
        class="message-row"
        :class="msg.role === 'user' ? 'is-player' : 'is-companion'"
      >
        <!-- 伴侣头像 -->
        <div v-if="msg.role !== 'user'" class="msg-avatar-ring">
          <div class="msg-avatar">{{ avatarInitial(character.name) }}</div>
        </div>

        <!-- 气泡内容体 -->
        <div class="message-bubble-wrapper">
          <div class="msg-sender-meta">
            <span class="msg-sender-name">{{ msg.role === 'user' ? '我' : character.name }}</span>
            <span class="msg-time">{{ formatMsgTime(msg.createdAt) }}</span>
          </div>

          <div class="message-bubble">
            <div class="bubble-content-text">
              <template v-for="(seg, idx) in parseMessageSegments(msg.text || '')" :key="idx">
                <span v-if="seg.type === 'action'" class="action-narrative-pill">
                  *{{ seg.content }}*
                </span>
                <span v-else class="regular-dialogue-text">
                  {{ seg.content }}
                </span>
              </template>
            </div>

            <!-- 附带插画或照片 -->
            <div v-if="msg.attachments && msg.attachments.length > 0" class="msg-attachment-grid">
              <div
                v-for="(att, aIdx) in msg.attachments"
                :key="aIdx"
                class="msg-img-wrap"
                @click="emit('preview-image', companionClient.mediaUrl(att.mediaRef))"
              >
                <img
                  :src="companionClient.mediaUrl(att.mediaRef)"
                  alt="插画配图"
                  class="msg-img"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 玩家头像 -->
        <div v-if="msg.role === 'user'" class="msg-avatar-ring is-player-avatar">
          <div class="msg-avatar player-avatar"><User :size="16" aria-hidden="true" /></div>
        </div>
      </div>

      <!-- 发送等待 / 伴侣输入中指示器 -->
      <div v-if="sending" class="message-row is-companion typing-indicator-row">
        <div class="msg-avatar-ring">
          <div class="msg-avatar">{{ avatarInitial(character.name) }}</div>
        </div>
        <div class="message-bubble typing-bubble">
          <span class="typing-dot" />
          <span class="typing-dot" />
          <span class="typing-dot" />
          <span class="typing-label">{{ character.name }} 正在思考回复…</span>
        </div>
      </div>
    </div>

    <!-- ═══ 3. 快捷话题推荐横轴 (Quick Topics) ═══ -->
    <div class="quick-topics-ribbon">
      <span class="quick-label">快捷互动：</span>
      <div class="topics-scroll">
        <button
          v-for="(t, idx) in quickTopics"
          :key="idx"
          type="button"
          class="topic-chip"
          :disabled="sending"
          @click="handleSendMessage(t)"
        >
          {{ t }}
        </button>
      </div>
    </div>

    <!-- ═══ 4. 底部输入控制台 (Input Dock) ═══ -->
    <footer class="chat-input-dock">
      <!-- 快捷工具栏 -->
      <div class="input-toolbar">
        <button
          type="button"
          class="tool-btn"
          title="赠送礼物"
          :disabled="sending"
          @click="showActionMenu = !showActionMenu"
        >
          <Gift :size="15" class="text-rose-500" aria-hidden="true" />
          <span>送礼</span>
        </button>

        <button
          type="button"
          class="tool-btn"
          title="拍摄自拍"
          :disabled="isGeneratingPhoto || sending"
          @click="handlePhotoRequest"
        >
          <Camera :size="15" class="text-amber-500" aria-hidden="true" />
          <span>抓拍自拍</span>
        </button>
      </div>

      <!-- 送礼快捷弹层 -->
      <div v-if="showActionMenu" class="gift-popover-menu" @click.stop>
        <div class="gift-pop-head">选择要送给 {{ character.name }} 的礼物：</div>
        <div class="gift-items-grid">
          <button type="button" class="gift-item-btn" @click="handleGiftSend('醇香热红茶 ☕')">☕ 醇香热红茶</button>
          <button type="button" class="gift-item-btn" @click="handleGiftSend('精美马卡龙甜点 🧁')">🧁 精美马卡龙</button>
          <button type="button" class="gift-item-btn" @click="handleGiftSend('新鲜采摘的塞西莉亚花 🌸')">🌸 塞西莉亚花</button>
          <button type="button" class="gift-item-btn" @click="handleGiftSend('手作音乐盒 🎵')">🎵 手作音乐盒</button>
        </div>
      </div>

      <!-- 消息输入框与发送按钮 -->
      <div class="input-form-row">
        <textarea
          v-model="inputDraft"
          class="chat-textarea"
          rows="1"
          placeholder="和她说点什么吧… (Enter 发送，Shift+Enter 换行)"
          :disabled="sending"
          @keydown="handleKeydown"
        />

        <button
          type="button"
          class="send-message-btn"
          :disabled="!inputDraft.trim() || sending"
          @click="handleSendMessage()"
        >
          <Send :size="16" aria-hidden="true" />
          <span>发送</span>
        </button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.companion-chat-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-2xl, 24px);
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
  position: relative;
}

/* ════ 1. 顶部 Header ════ */
.chat-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-6);
  background: var(--surface-glass, rgba(255, 255, 255, 0.7));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border);
  z-index: 10;
  gap: var(--space-4);
}

.header-character-info {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.char-avatar-ring {
  position: relative;
  padding: 3px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, #f43f5e, var(--primary, #6366f1));
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
}

.char-avatar-box {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--primary);
  display: grid;
  place-items: center;
  font-size: var(--text-lg);
  font-weight: 900;
}

.live-dot {
  position: absolute;
  bottom: 1px;
  right: 1px;
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
  background: #10b981;
  border: 2px solid var(--surface);
}

.char-meta-column {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.char-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.char-display-name {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 900;
  color: var(--text-strong);
  letter-spacing: -0.01em;
}

.char-affinity-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: var(--radius-full);
  background: rgba(244, 63, 94, 0.1);
  color: #f43f5e;
  font-size: 11px;
  font-weight: 800;
}

.char-live-status-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: var(--surface-soft);
  color: var(--muted);
}

.location-pill {
  color: var(--primary);
  border-color: var(--primary-soft);
}

.mood-pill {
  color: #f59e0b;
  border-color: rgba(245, 158, 11, 0.2);
}

.header-action-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-strong);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: all var(--motion-fast);
}

.header-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
  transform: translateY(-1px);
}

.spin-icon {
  animation: spin 0.8s linear infinite;
}

/* ════ 2. 消息流 ════ */
.chat-message-stream {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--space-6) var(--space-8);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  background: radial-gradient(circle at top right, rgba(99, 102, 241, 0.03), transparent 70%),
              radial-gradient(circle at bottom left, rgba(244, 63, 94, 0.03), transparent 70%);
}

.chat-welcome-banner {
  padding: var(--space-6);
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(244, 63, 94, 0.05));
  border: 1px solid var(--border);
  border-radius: var(--radius-xl, 18px);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.welcome-icon-box {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: var(--surface);
  display: grid;
  place-items: center;
  box-shadow: var(--shadow-sm);
}

.welcome-title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 900;
  color: var(--text-strong);
}

.welcome-subtitle {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--muted);
  max-width: 580px;
  line-height: 1.5;
}

.message-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  max-width: 82%;
}

.message-row.is-player {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.message-row.is-companion {
  align-self: flex-start;
}

.msg-avatar-ring {
  padding: 2px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--primary), #ec4899);
  flex-shrink: 0;
}

.msg-avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  background: var(--surface);
  color: var(--primary);
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 800;
}

.msg-avatar-ring.is-player-avatar {
  background: linear-gradient(135deg, #3b82f6, #6366f1);
}

.player-avatar {
  color: #3b82f6;
}

.message-bubble-wrapper {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.is-player .message-bubble-wrapper {
  align-items: flex-end;
}

.msg-sender-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 11px;
  color: var(--muted);
  padding: 0 4px;
}

.msg-sender-name {
  font-weight: 700;
  color: var(--text-strong);
}

.message-bubble {
  padding: 14px 18px;
  border-radius: 20px;
  font-size: var(--text-sm);
  line-height: 1.65;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  word-break: break-word;
  white-space: pre-wrap;
  position: relative;
}

.is-companion .message-bubble {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-strong);
  border-top-left-radius: 4px;
}

.is-player .message-bubble {
  background: linear-gradient(135deg, var(--primary), #4f46e5);
  color: #ffffff;
  border-top-right-radius: 4px;
}

.action-narrative-pill {
  display: inline-block;
  font-style: italic;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 2px 8px;
  border-radius: var(--radius-md);
  margin: 2px 0;
  font-weight: 600;
  font-size: 12px;
}

.is-player .action-narrative-pill {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

.msg-attachment-grid {
  margin-top: 10px;
  border-radius: var(--radius-md);
  overflow: hidden;
  max-width: 320px;
}

.msg-img-wrap {
  aspect-ratio: 16 / 10;
  cursor: zoom-in;
  overflow: hidden;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.msg-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.2s ease;
}

.msg-img-wrap:hover .msg-img {
  transform: scale(1.04);
}

/* 输入等待指示 */
.typing-bubble {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 18px;
  background: var(--surface);
  border: 1px solid var(--border);
}

.typing-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--primary);
  animation: typingBounce 1.2s infinite ease-in-out;
}

.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }

.typing-label {
  font-size: 11px;
  color: var(--muted);
  margin-left: 4px;
}

@keyframes typingBounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-5px); }
}

/* ════ 3. 快捷推荐横轴 ════ */
.quick-topics-ribbon {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-6);
  background: var(--surface);
  border-top: 1px solid var(--border);
  overflow-x: auto;
}

.quick-label {
  font-size: 11px;
  font-weight: 800;
  color: var(--muted);
  white-space: nowrap;
}

.topics-scroll {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.topic-chip {
  padding: 5px 12px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: var(--surface-soft);
  color: var(--text-strong);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--motion-fast);
}

.topic-chip:hover {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
}

/* ════ 4. 底部输入栏 ════ */
.chat-input-dock {
  padding: var(--space-4) var(--space-6);
  background: var(--surface-glass, rgba(255, 255, 255, 0.8));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  position: relative;
}

.input-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-strong);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--motion-fast);
}

.tool-btn:hover {
  border-color: var(--primary);
  background: var(--surface-soft);
}

.gift-popover-menu {
  position: absolute;
  bottom: 84px;
  left: 24px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-3);
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  z-index: 50;
  width: 260px;
}

.gift-pop-head {
  font-size: 11px;
  font-weight: 800;
  color: var(--muted);
}

.gift-items-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 4px;
}

.gift-item-btn {
  padding: 7px 12px;
  border-radius: var(--radius-md);
  border: 0;
  background: var(--surface-soft);
  color: var(--text-strong);
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  transition: all var(--motion-fast);
}

.gift-item-btn:hover {
  background: var(--primary-soft);
  color: var(--primary);
}

.input-form-row {
  display: flex;
  align-items: flex-end;
  gap: var(--space-3);
}

.chat-textarea {
  flex: 1 1 auto;
  min-height: 44px;
  max-height: 120px;
  padding: 10px 16px;
  border-radius: var(--radius-xl, 18px);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-strong);
  font-size: var(--text-sm);
  line-height: 1.5;
  resize: none;
  outline: none;
  font-family: inherit;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.02);
}

.chat-textarea:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

.send-message-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 11px 22px;
  border-radius: var(--radius-full);
  border: 0;
  background: linear-gradient(135deg, var(--primary), #4f46e5);
  color: #ffffff;
  font-size: var(--text-sm);
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.3);
  transition: all var(--motion-fast);
  flex-shrink: 0;
}

.send-message-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(99, 102, 241, 0.4);
}

.send-message-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 640px) {
  .btn-text-desktop {
    display: none;
  }
  .chat-message-stream {
    padding: var(--space-4) var(--space-3);
  }
  .message-row {
    max-width: 94%;
  }
  .chat-header-bar,
  .chat-input-dock {
    padding: var(--space-3) var(--space-4);
  }
}
</style>
