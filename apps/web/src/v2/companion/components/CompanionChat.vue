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

function getCompanionFallbackReply(char: V2CompanionRosterCharacter, userText: string): string {
  const loc = char.schedule.currentActivity.locationName;
  const act = char.schedule.currentActivity.activityName;
  const mood = char.affinity.emotion.moodLabel;

  if (userText.includes("红茶") || userText.includes("礼物") || userText.includes("甜点") || userText.includes("花")) {
    return `*惊喜地接过礼物，脸颊浮现出浅浅的红晕* 哇，竟然送我这个！我正好在${loc}感到有些疲惫呢，有你在身边真好…谢谢你！`;
  }
  if (userText.includes("散步") || userText.includes("逛街") || userText.includes("走走")) {
    return `*自然地挽起你的手臂，眼眸中闪烁着欣喜的光芒* 好呀！这里的风吹得很舒服，我们一起去前面的喷泉广场看看吧~`;
  }
  if (userText.includes("照片") || userText.includes("拍一张") || userText.includes("自拍")) {
    return `*整理了一下头发，对着镜头露出元气满满的微笑* 咔嚓！你看，我身后的${loc}风景是不是很棒？这张写真就专门送给你保存啦！`;
  }

  const responses = [
    `*轻轻眨了眨眼，微笑着看着你* 听到你这么说我好开心！我现在在${loc}进行${act}呢，心情正处于「${mood}」的状态，你想和我聊聊接下来的计划吗？`,
    `*若有所思地托着下巴，随即露出温柔的笑容* 原来是这样呀。无论发生什么，能随时收到你的消息，对我来说都是一天中最期待的事。`,
    `*开心地走近了一步* 呐，刚才我还在想你会不会来找我呢！你今天过得还顺利吗？`,
  ];
  return responses[Math.floor(Math.random() * responses.length)] ?? `*微笑着点头* 能够与你在这里相遇，是我今天最幸运的事。`;
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
        // Create conversation or instant story
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
    console.warn("AI Stream unavailable, using warm companion dialogue:", err);
    // Fallback response for offline or non-LLM mode
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
              <MapPin :size="12" aria-hidden="true" />
              <span>{{ character.schedule.currentActivity.locationName }}</span>
            </span>
            <span class="status-pill activity-pill">
              <span>{{ character.schedule.currentActivity.activityName }}</span>
            </span>
            <span class="status-pill mood-pill">
              <Smile :size="12" aria-hidden="true" />
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
          <Camera :size="16" class="text-amber-400" aria-hidden="true" />
          <span class="btn-text-desktop">抓拍自拍</span>
        </button>

        <button
          type="button"
          class="header-btn icon-only"
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
          <Sparkles :size="22" class="text-indigo-400" aria-hidden="true" />
        </div>
        <h3 class="welcome-title">与 {{ character.name }} 的专属私密时光</h3>
        <p class="welcome-subtitle">
          当前位于「{{ character.schedule.currentActivity.locationName }}」，状态处于「{{ character.affinity.emotion.moodLabel }}」。你可以自由交谈、赠送礼物或索要自拍照片。
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
          @click="showGiftMenu = !showGiftMenu"
        >
          <Gift :size="15" class="text-rose-400" aria-hidden="true" />
          <span>送礼</span>
        </button>

        <button
          type="button"
          class="tool-btn"
          title="拍摄自拍"
          :disabled="isGeneratingPhoto || sending"
          @click="handlePhotoRequest"
        >
          <Camera :size="15" class="text-amber-400" aria-hidden="true" />
          <span>抓拍自拍</span>
        </button>
      </div>

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
  background: rgba(26, 23, 40, 0.75);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  position: relative;
}

/* ════ 1. 顶部 Header ════ */
.chat-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: rgba(22, 19, 36, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  z-index: 10;
  gap: 16px;
}

.header-character-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.char-avatar-ring {
  position: relative;
  padding: 3px;
  border-radius: 9999px;
  background: linear-gradient(135deg, #f43f5e, #6366f1);
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.3);
}

.char-avatar-box {
  width: 48px;
  height: 48px;
  border-radius: 9999px;
  background: #181528;
  color: #a5b4fc;
  display: grid;
  place-items: center;
  font-size: 18px;
  font-weight: 900;
}

.live-dot {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  background: #10b981;
  border: 2px solid #181528;
}

.char-meta-column {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.char-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.char-display-name {
  margin: 0;
  font-size: 18px;
  font-weight: 900;
  color: #f8fafc;
  letter-spacing: -0.01em;
}

.char-affinity-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 9999px;
  background: rgba(244, 63, 94, 0.15);
  border: 1px solid rgba(244, 63, 94, 0.3);
  color: #fb7185;
  font-size: 11px;
  font-weight: 800;
}

.char-live-status-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #94a3b8;
}

.location-pill {
  color: #818cf8;
  border-color: rgba(99, 102, 241, 0.25);
  background: rgba(99, 102, 241, 0.1);
}

.mood-pill {
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.25);
  background: rgba(245, 158, 11, 0.1);
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
  padding: 8px 16px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.06);
  color: #f1f5f9;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.header-btn:hover {
  background: rgba(99, 102, 241, 0.2);
  border-color: #6366f1;
  color: #ffffff;
  transform: translateY(-1px);
}

.header-btn.icon-only {
  padding: 8px;
}

.spin-icon {
  animation: spin 0.8s linear infinite;
}

/* ════ 2. 消息流 ════ */
.chat-message-stream {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: radial-gradient(circle at top right, rgba(99, 102, 241, 0.06), transparent 70%),
              radial-gradient(circle at bottom left, rgba(244, 63, 94, 0.05), transparent 70%);
}

.chat-welcome-banner {
  padding: 20px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(244, 63, 94, 0.08));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.welcome-icon-box {
  width: 44px;
  height: 44px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.1);
  display: grid;
  place-items: center;
}

.welcome-title {
  margin: 0;
  font-size: 16px;
  font-weight: 900;
  color: #f8fafc;
}

.welcome-subtitle {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
  max-width: 600px;
  line-height: 1.6;
}

.message-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  max-width: 80%;
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
  background: linear-gradient(135deg, #f43f5e, #6366f1);
  flex-shrink: 0;
}

.msg-avatar {
  width: 38px;
  height: 38px;
  border-radius: 9999px;
  background: #1e1b2e;
  color: #a5b4fc;
  display: grid;
  place-items: center;
  font-size: 14px;
  font-weight: 800;
}

.msg-avatar-ring.is-player-avatar {
  background: linear-gradient(135deg, #3b82f6, #6366f1);
}

.player-avatar {
  color: #60a5fa;
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
  color: #64748b;
  padding: 0 4px;
}

.msg-sender-name {
  font-weight: 700;
  color: #94a3b8;
}

.message-bubble {
  padding: 14px 20px;
  border-radius: 20px;
  font-size: 14px;
  line-height: 1.7;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  word-break: break-word;
  white-space: pre-wrap;
  position: relative;
}

.is-companion .message-bubble {
  background: rgba(30, 27, 46, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
  border-top-left-radius: 4px;
}

.is-player .message-bubble {
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  color: #ffffff;
  border-top-right-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.action-narrative-pill {
  display: inline-block;
  font-style: italic;
  color: #c084fc;
  background: rgba(192, 132, 252, 0.15);
  padding: 2px 10px;
  border-radius: 8px;
  margin: 2px 0;
  font-weight: 600;
  font-size: 13px;
}

.is-player .action-narrative-pill {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

.msg-attachment-grid {
  margin-top: 10px;
  border-radius: 12px;
  overflow: hidden;
  max-width: 320px;
}

.msg-img-wrap {
  aspect-ratio: 16 / 10;
  cursor: zoom-in;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
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
  background: rgba(30, 27, 46, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: #818cf8;
  animation: typingBounce 1.2s infinite ease-in-out;
}

.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }

.typing-label {
  font-size: 12px;
  color: #94a3b8;
  margin-left: 6px;
}

@keyframes typingBounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-5px); }
}

/* ════ 3. 快捷推荐横轴 ════ */
.quick-topics-ribbon {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  background: rgba(22, 19, 36, 0.85);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  overflow-x: auto;
}

.quick-label {
  font-size: 12px;
  font-weight: 800;
  color: #64748b;
  white-space: nowrap;
}

.topics-scroll {
  display: flex;
  align-items: center;
  gap: 8px;
}

.topic-chip {
  padding: 6px 14px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.05);
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.topic-chip:hover {
  background: rgba(99, 102, 241, 0.2);
  border-color: #6366f1;
  color: #ffffff;
}

/* ════ 4. 底部输入栏 ════ */
.chat-input-dock {
  padding: 14px 24px 18px 24px;
  background: rgba(22, 19, 36, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
}

.input-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tool-btn:hover {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.15);
  color: #ffffff;
}

.gift-popover-menu {
  position: absolute;
  bottom: 88px;
  left: 24px;
  background: #1e1b2e;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  padding: 14px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 50;
  width: 260px;
}

.gift-pop-head {
  font-size: 12px;
  font-weight: 800;
  color: #94a3b8;
}

.gift-items-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
}

.gift-item-btn {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.04);
  color: #f1f5f9;
  font-size: 13px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.gift-item-btn:hover {
  background: rgba(244, 63, 94, 0.15);
  border-color: rgba(244, 63, 94, 0.3);
  color: #ffffff;
}

.input-form-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}

.chat-textarea {
  flex: 1 1 auto;
  min-height: 48px;
  max-height: 120px;
  padding: 12px 18px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: #141220;
  color: #f8fafc;
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  outline: none;
  font-family: inherit;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
}

.chat-textarea:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25);
}

.send-message-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 13px 24px;
  border-radius: 9999px;
  border: 0;
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  color: #ffffff;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.send-message-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
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
  .chat-header-bar,
  .chat-input-dock {
    padding: 12px 16px;
  }
}
</style>
