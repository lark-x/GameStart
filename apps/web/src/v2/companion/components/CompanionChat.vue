<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import {
  Camera,
  Gift,
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
import { createV2ChatClient, type V2ChatStreamEvent } from "../../chat/client.ts";
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
const messages = ref<V2ChatMessageDto[]>([]);
const loadingMessages = ref(true);
const sending = ref(false);
const inputDraft = ref("");
const chatScrollContainer = ref<HTMLElement | null>(null);
const isGeneratingPhoto = ref(false);
const showGiftMenu = ref(false);

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

// Clean model raw error / risk rejection if any leaked into user text
function sanitizeText(raw: string): string {
  return raw
    .replace(/The request was rejected because it was considered high risk/gi, "")
    .trim();
}

// Parses text for *action / monologue* cues (e.g. *微笑着递给你一杯茶*)
function parseMessageSegments(text: string): Array<{ type: "text" | "action"; content: string }> {
  const clean = sanitizeText(text);
  const segments: Array<{ type: "text" | "action"; content: string }> = [];
  const regex = /(\*[^*]+\*|（[^）]+）|\([^)]+\))/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(clean)) !== null) {
    if (match.index > lastIdx) {
      segments.push({ type: "text", content: clean.slice(lastIdx, match.index) });
    }
    const inner = match[0].replace(/^[*（(]|[*）)]$/g, "");
    segments.push({ type: "action", content: inner });
    lastIdx = regex.lastIndex;
  }

  if (lastIdx < clean.length) {
    segments.push({ type: "text", content: clean.slice(lastIdx) });
  }

  return segments.length > 0 ? segments : [{ type: "text", content: clean }];
}

function scrollToBottom(): void {
  void nextTick(() => {
    if (chatScrollContainer.value) {
      chatScrollContainer.value.scrollTop = chatScrollContainer.value.scrollHeight;
    }
  });
}

function getCompanionFallbackReply(char: V2CompanionRosterCharacter, userText: string): string {
  const loc = char.schedule.currentActivity.locationName;
  const act = char.schedule.currentActivity.activityName;
  const mood = char.affinity.emotion.moodLabel;

  if (userText.includes("红茶") || userText.includes("礼物") || userText.includes("甜点") || userText.includes("花")) {
    return `*惊喜地接过礼物，脸颊泛起温和的红晕* 哇，谢谢你！在${loc}收到你的礼物，整个人都觉得暖洋洋的呢~`;
  }
  if (userText.includes("散步") || userText.includes("逛街") || userText.includes("走走")) {
    return `*自然地走在你的身旁，眼里满是笑意* 好呀，这里的阳光很舒服，我们一起走走吧~`;
  }
  if (userText.includes("照片") || userText.includes("拍一张") || userText.includes("自拍")) {
    return `*整理好发梢，对着你露出温柔灿烂的微笑* 咔嚓！在${loc}的专属合影拍好啦，送给你珍藏哦~ 📷`;
  }

  const responses = [
    `*轻轻点头，眼神温柔地注视着你* 听到你的声音真安心。我现在在${loc}进行${act}，心情正处于「${mood}」，能和你聊天真好。`,
    `*嘴角扬起浅浅的笑意* 刚才我还在想你呢！今天有什么想要和我分享的事情吗？`,
    `*温和地递来一杯温水* 无论遇到什么事，我都一直在这里陪着你哦。`,
  ];
  return responses[Math.floor(Math.random() * responses.length)] ?? `*微笑着注视着你* 很高兴能与你在这里度过温暖的时光。`;
}

async function loadConversation(): Promise<void> {
  loadingMessages.value = true;
  try {
    const contacts = await chatClient.listContacts();
    const targetContact = contacts.find((c) => c.characterId === props.character.characterId || c.characterName === props.character.name);

    if (targetContact?.latestConversationId) {
      conversationId.value = targetContact.latestConversationId;
    } else {
      const summaries = await chatClient.listConversationSummaries();
      const existing = summaries.find((s) => s.primaryCharacterId === props.character.characterId || s.characterName === props.character.name);
      if (existing) {
        conversationId.value = existing.conversationId;
      } else {
        try {
          const idempotencyKey = `conv:${props.character.characterId}:${Date.now()}` as V2IdempotencyKey;
          const res = await chatClient.createConversation({
            characterId: props.character.characterId,
            storyWorldId: (targetContact?.storyWorldId ?? "world:default") as V2StoryWorldId,
            idempotencyKey,
          });
          conversationId.value = res.conversation.conversationId;
        } catch {
          const instantRes = await chatClient.createInstantStory({
            persona: props.character.summary || props.character.name,
            displayName: props.character.name,
            idempotencyKey: `instant:${props.character.characterId}:${Date.now()}` as V2IdempotencyKey,
          });
          conversationId.value = instantRes.conversation.conversationId;
        }
      }
    }

    if (conversationId.value) {
      const page = await chatClient.listMessages(conversationId.value, { limit: 50 });
      messages.value = [...page.messages];
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
  if (!content || sending.value) return;

  if (!customText) {
    inputDraft.value = "";
  }

  sending.value = true;
  const userMsgId = `user:${Date.now()}` as unknown as V2ChatMessageDto["messageId"];
  const userMsgKey = `msg:${Date.now()}` as V2IdempotencyKey;

  // 1. Optimistically append player message
  const userMsg: V2ChatMessageDto = {
    messageId: userMsgId,
    conversationId: conversationId.value ?? ("conv:default" as V2ConversationId),
    role: "user",
    characterId: props.character.characterId,
    text: content,
    attachments: [],
    status: "completed",
    createdAt: new Date().toISOString() as unknown as V2ChatMessageDto["createdAt"],
    idempotencyKey: userMsgKey,
  };
  messages.value.push(userMsg);
  scrollToBottom();

  // 2. Prepare assistant placeholder
  const placeholderId = `assistant:${Date.now()}` as unknown as V2ChatMessageDto["messageId"];
  const replyKey = `reply:${Date.now()}` as V2IdempotencyKey;
  const assistantMsg: V2ChatMessageDto = {
    messageId: placeholderId,
    conversationId: conversationId.value ?? ("conv:default" as V2ConversationId),
    role: "assistant",
    characterId: props.character.characterId,
    text: "",
    attachments: [],
    status: "pending",
    createdAt: new Date().toISOString() as unknown as V2ChatMessageDto["createdAt"],
    idempotencyKey: replyKey,
  };
  messages.value.push(assistantMsg);
  scrollToBottom();

  // 3. Send & Stream AI response
  try {
    if (conversationId.value) {
      await chatClient.sendMessage(conversationId.value, {
        text: content,
        idempotencyKey: userMsgKey,
      });

      let streamedText = "";
      await chatClient.streamReply(
        conversationId.value,
        { idempotencyKey: replyKey },
        (event: V2ChatStreamEvent) => {
          if (event.type === "delta" && event.content) {
            streamedText += event.content;
            const target = messages.value.find((m) => m.messageId === placeholderId);
            if (target) {
              (target as { text?: string }).text = streamedText;
            }
            scrollToBottom();
          } else if (event.type === "message" && event.message) {
            messages.value = messages.value.map((m) => (m.messageId === placeholderId ? event.message! : m));
            scrollToBottom();
          }
        },
      );
    } else {
      throw new Error("No conversation ID");
    }
  } catch (err) {
    console.warn("AI Stream unavailable, using companion dialogue:", err);
    const fallbackText = getCompanionFallbackReply(props.character, content);
    const target = messages.value.find((m) => m.messageId === placeholderId);
    if (target) {
      (target as { text?: string; status: string }).text = fallbackText;
      (target as { text?: string; status: string }).status = "completed";
    }
  } finally {
    sending.value = false;
    emit("affinity-change");
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
  showGiftMenu.value = false;
  await handleSendMessage(`*递上一份精心准备的礼物：${giftName}* 这是送给你的！🎁`);
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
    <!-- ═══ 1. 顶部紧凑状态栏 (Header 56px) ═══ -->
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
            <span class="location-pill">
              <MapPin :size="11" aria-hidden="true" />
              <span>{{ character.schedule.currentActivity.locationName }}</span>
            </span>
            <span class="mood-pill">
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
          <Camera :size="15" class="text-primary" aria-hidden="true" />
          <span class="btn-text-desktop">抓拍自拍</span>
        </button>

        <button
          type="button"
          class="header-btn icon-only"
          title="刷新记录"
          :disabled="loadingMessages"
          @click="loadConversation"
        >
          <RefreshCw :size="14" :class="{ 'spin-icon': loadingMessages }" aria-hidden="true" />
        </button>
      </div>
    </header>

    <!-- ═══ 2. 沉浸宽屏消息流区域 (Message Stream) ═══ -->
    <div ref="chatScrollContainer" class="chat-message-stream">
      <!-- 初始欢迎引言 -->
      <div class="chat-welcome-banner">
        <div class="welcome-icon-box">
          <Sparkles :size="20" class="text-primary" aria-hidden="true" />
        </div>
        <div class="welcome-text-wrap">
          <h3 class="welcome-title">与 {{ character.name }} 的专属私密时光</h3>
          <p class="welcome-subtitle">
            伴侣当前位于「{{ character.schedule.currentActivity.locationName }}」，心情「{{ character.affinity.emotion.moodLabel }}」。你可以畅所欲言、赠送心意礼物或索要自拍照片。
          </p>
        </div>
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
          <div class="msg-avatar player-avatar"><User :size="15" aria-hidden="true" /></div>
        </div>
      </div>

      <!-- 发送等待 / 伴侣思考指示器 -->
      <div v-if="sending && (!messages.at(-1)?.text)" class="message-row is-companion typing-indicator-row">
        <div class="msg-avatar-ring">
          <div class="msg-avatar">{{ avatarInitial(character.name) }}</div>
        </div>
        <div class="message-bubble typing-bubble">
          <span class="typing-dot" />
          <span class="typing-dot" />
          <span class="typing-dot" />
          <span class="typing-label">{{ character.name }} 正在回应你…</span>
        </div>
      </div>
    </div>

    <!-- ═══ 3. 底部集成化输入控制台 (Input Dock) ═══ -->
    <footer class="chat-input-dock">
      <!-- 送礼快捷弹层 -->
      <div v-if="showGiftMenu" class="gift-popover-menu" @click.stop>
        <div class="gift-pop-head">选择送给 {{ character.name }} 的心意礼物：</div>
        <div class="gift-items-grid">
          <button type="button" class="gift-item-btn" @click="handleGiftSend('醇香热红茶 ☕')">☕ 醇香热红茶</button>
          <button type="button" class="gift-item-btn" @click="handleGiftSend('精美马卡龙甜点 🧁')">🧁 精美马卡龙</button>
          <button type="button" class="gift-item-btn" @click="handleGiftSend('新鲜采摘的塞西莉亚花 🌸')">🌸 塞西莉亚花</button>
          <button type="button" class="gift-item-btn" @click="handleGiftSend('手作八音盒 🎵')">🎵 手作八音盒</button>
        </div>
      </div>

      <!-- 输入栏核心行 -->
      <div class="input-form-row">
        <!-- 工具按钮组 -->
        <div class="input-tool-group">
          <button
            type="button"
            class="input-tool-btn"
            title="赠送心意礼物"
            :disabled="sending"
            @click="showGiftMenu = !showGiftMenu"
          >
            <Gift :size="18" class="text-rose-500" aria-hidden="true" />
          </button>

          <button
            type="button"
            class="input-tool-btn"
            title="索要即时自拍"
            :disabled="isGeneratingPhoto || sending"
            @click="handlePhotoRequest"
          >
            <Camera :size="18" class="text-amber-600" aria-hidden="true" />
          </button>
        </div>

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
          <span class="btn-text-desktop">发送</span>
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
  background: var(--cmp-surface, #ffffff);
  border: 1px solid var(--cmp-border, #ebdcd1);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: var(--cmp-shadow-md, 0 8px 24px rgba(120, 80, 60, 0.08));
  position: relative;
}

/* ════ 1. 顶部 Header (56px 紧凑) ════ */
.chat-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 24px;
  min-height: 56px;
  background: var(--cmp-surface-glass, rgba(255, 255, 255, 0.92));
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--cmp-border-light, #f3eae2);
  z-index: 10;
  gap: 16px;
}

.header-character-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.char-avatar-ring {
  position: relative;
  padding: 2px;
  border-radius: 9999px;
  background: linear-gradient(135deg, var(--cmp-primary, #e06d53), var(--cmp-accent, #f59e0b));
}

.char-avatar-box {
  width: 36px;
  height: 36px;
  border-radius: 9999px;
  background: var(--cmp-surface, #ffffff);
  color: var(--cmp-primary, #e06d53);
  display: grid;
  place-items: center;
  font-size: 15px;
  font-weight: 900;
}

.live-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  background: var(--cmp-success, #10b981);
  border: 2px solid var(--cmp-surface, #ffffff);
}

.char-meta-column {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.char-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.char-display-name {
  margin: 0;
  font-size: 16px;
  font-weight: 900;
  color: var(--cmp-text-strong, #2c221e);
  letter-spacing: -0.01em;
}

.location-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9999px;
  background: var(--cmp-primary-soft, #fcedea);
  color: var(--cmp-primary, #e06d53);
}

.mood-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9999px;
  background: var(--cmp-accent-soft, #fef3c7);
  color: var(--cmp-accent, #d97706);
}

.header-action-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 9999px;
  border: 1px solid var(--cmp-border, #ebdcd1);
  background: var(--cmp-surface-soft, #f6f1ea);
  color: var(--cmp-text, #4a3e39);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s ease;
}

.header-btn:hover {
  border-color: var(--cmp-primary, #e06d53);
  color: var(--cmp-primary, #e06d53);
  background: var(--cmp-surface, #ffffff);
  transform: translateY(-1px);
}

.header-btn.icon-only {
  padding: 6px;
}

.spin-icon {
  animation: spin 0.8s linear infinite;
}

/* ════ 2. 消息流 ════ */
.chat-message-stream {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 24px 36px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: var(--cmp-bg-gradient, #faf7f2);
}

.chat-welcome-banner {
  padding: 16px 20px;
  background: var(--cmp-surface-soft, #f6f1ea);
  border: 1px solid var(--cmp-border-light, #f3eae2);
  border-radius: 18px;
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 8px;
}

.welcome-icon-box {
  width: 38px;
  height: 38px;
  border-radius: 9999px;
  background: var(--cmp-surface, #ffffff);
  display: grid;
  place-items: center;
  box-shadow: var(--cmp-shadow-sm, 0 2px 8px rgba(120, 80, 60, 0.05));
  flex-shrink: 0;
}

.welcome-text-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.welcome-title {
  margin: 0;
  font-size: 14px;
  font-weight: 900;
  color: var(--cmp-text-strong, #2c221e);
}

.welcome-subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--cmp-text-muted, #8c7d74);
  line-height: 1.5;
}

.message-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
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
  border-radius: 9999px;
  background: linear-gradient(135deg, var(--cmp-primary, #e06d53), var(--cmp-accent, #f59e0b));
  flex-shrink: 0;
}

.msg-avatar {
  width: 38px;
  height: 38px;
  border-radius: 9999px;
  background: var(--cmp-surface, #ffffff);
  color: var(--cmp-primary, #e06d53);
  display: grid;
  place-items: center;
  font-size: 14px;
  font-weight: 900;
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
  gap: 4px;
}

.is-player .message-bubble-wrapper {
  align-items: flex-end;
}

.msg-sender-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--cmp-text-muted, #8c7d74);
  padding: 0 4px;
}

.msg-sender-name {
  font-weight: 800;
  color: var(--cmp-text-strong, #2c221e);
}

.message-bubble {
  padding: 14px 20px;
  border-radius: 20px;
  font-size: 14px;
  line-height: 1.7;
  box-shadow: var(--cmp-shadow-sm, 0 2px 8px rgba(120, 80, 60, 0.05));
  word-break: break-word;
  white-space: pre-wrap;
  position: relative;
}

.is-companion .message-bubble {
  background: var(--cmp-surface, #ffffff);
  border: 1px solid var(--cmp-border, #ebdcd1);
  color: var(--cmp-text-strong, #2c221e);
  border-top-left-radius: 4px;
}

.is-player .message-bubble {
  background: linear-gradient(135deg, var(--cmp-primary, #e06d53), #ea580c);
  color: #ffffff;
  border-top-right-radius: 4px;
}

.action-narrative-pill {
  display: inline-block;
  font-style: italic;
  color: var(--cmp-primary, #e06d53);
  background: var(--cmp-primary-soft, #fcedea);
  padding: 2px 10px;
  border-radius: 8px;
  margin: 2px 0;
  font-weight: 700;
  font-size: 13px;
}

.is-player .action-narrative-pill {
  background: rgba(255, 255, 255, 0.25);
  color: #ffffff;
}

.msg-attachment-grid {
  margin-top: 10px;
  border-radius: 12px;
  overflow: hidden;
  max-width: 340px;
}

.msg-img-wrap {
  aspect-ratio: 16 / 10;
  cursor: zoom-in;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid var(--cmp-border, #ebdcd1);
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
  background: var(--cmp-surface, #ffffff);
  border: 1px solid var(--cmp-border, #ebdcd1);
}

.typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: var(--cmp-primary, #e06d53);
  animation: typingBounce 1.2s infinite ease-in-out;
}

.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }

.typing-label {
  font-size: 12px;
  color: var(--cmp-text-muted, #8c7d74);
  margin-left: 6px;
}

@keyframes typingBounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-5px); }
}

/* ════ 3. 底部集成化输入栏 ════ */
.chat-input-dock {
  padding: 12px 24px 16px 24px;
  background: var(--cmp-surface-glass, rgba(255, 255, 255, 0.95));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid var(--cmp-border-light, #f3eae2);
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
}

.gift-popover-menu {
  position: absolute;
  bottom: 74px;
  left: 24px;
  background: var(--cmp-surface, #ffffff);
  border: 1px solid var(--cmp-border, #ebdcd1);
  border-radius: 16px;
  padding: 14px;
  box-shadow: var(--cmp-shadow-lg, 0 16px 36px rgba(120, 80, 60, 0.12));
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 50;
  width: 260px;
}

.gift-pop-head {
  font-size: 12px;
  font-weight: 800;
  color: var(--cmp-text-muted, #8c7d74);
}

.gift-items-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
}

.gift-item-btn {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--cmp-border-light, #f3eae2);
  background: var(--cmp-surface-soft, #f6f1ea);
  color: var(--cmp-text-strong, #2c221e);
  font-size: 13px;
  font-weight: 800;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.gift-item-btn:hover {
  background: var(--cmp-primary-soft, #fcedea);
  border-color: var(--cmp-primary, #e06d53);
  color: var(--cmp-primary, #e06d53);
}

.input-form-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.input-tool-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.input-tool-btn {
  width: 40px;
  height: 40px;
  border-radius: 9999px;
  border: 1px solid var(--cmp-border, #ebdcd1);
  background: var(--cmp-surface-soft, #f6f1ea);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.input-tool-btn:hover {
  border-color: var(--cmp-primary, #e06d53);
  background: var(--cmp-surface, #ffffff);
  transform: translateY(-1px);
}

.chat-textarea {
  flex: 1 1 auto;
  min-height: 44px;
  max-height: 120px;
  padding: 10px 16px;
  border-radius: 16px;
  border: 1px solid var(--cmp-border, #ebdcd1);
  background: var(--cmp-surface-soft, #f6f1ea);
  color: var(--cmp-text-strong, #2c221e);
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  outline: none;
  font-family: inherit;
}

.chat-textarea:focus {
  border-color: var(--cmp-primary, #e06d53);
  background: var(--cmp-surface, #ffffff);
  box-shadow: 0 0 0 3px var(--cmp-focus-ring, rgba(224, 109, 83, 0.25));
}

.send-message-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 11px 20px;
  border-radius: 9999px;
  border: 0;
  background: linear-gradient(135deg, var(--cmp-primary, #e06d53), #ea580c);
  color: #ffffff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(224, 109, 83, 0.3);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.send-message-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(224, 109, 83, 0.4);
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
    padding: 16px 12px;
  }
  .message-row {
    max-width: 94%;
  }
}
</style>
