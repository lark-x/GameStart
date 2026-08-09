<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import {
  ChevronDown,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Trash2,
} from "@lucide/vue";
import Button from "../components/ui/Button.vue";
import Input from "../components/ui/Input.vue";
import Select from "../components/ui/Select.vue";
import PageHeader from "../components/layout/PageHeader.vue";
import { useAppStore } from "../stores/app";
import type { SseEvent } from "../api";
import type { ApiInteractionLog } from "../types";

interface LogPage {
  items: ApiInteractionLog[];
  nextCursor?: string;
}

const store = useAppStore();
const logs = ref<ApiInteractionLog[]>([]);
const pendingLogs = ref<ApiInteractionLog[]>([]);
const nextCursor = ref("");
const lastEventId = ref("");
const query = ref("");
const correlationId = ref("");
const level = ref("");
const source = ref("");
const category = ref("");
const createdAfter = ref("");
const createdBefore = ref("");
const loading = ref(false);
const paused = ref(false);
const autoScroll = ref(true);
const connected = ref(false);
const expanded = ref<string | null>(null);
const loadError = ref("");
const logContainer = ref<HTMLElement | null>(null);
const seenIds = new Set<string>();

let unsubscribe: (() => void) | undefined;
let reconnectTimer: number | undefined;
let reconnectAttempt = 0;
let generation = 0;
let disposed = false;

const statusLabel = computed(() =>
  connected.value ? "实时连接正常" : "实时连接已断开",
);
const showAllLogs = ref(false);
const visibleLogs = computed(() => showAllLogs.value ? logs.value : logs.value.filter(isUsefulLog));
const newCount = computed(() => pendingLogs.value.filter((item) => showAllLogs.value || isUsefulLog(item)).length);

function isUsefulLog(item: ApiInteractionLog) {
  if (item.level === "ERROR" || item.level === "WARN") return true;
  if (item.category === "LLM") return ["provider.completed", "provider.error", "provider.test"].includes(item.action);
  if (item.category === "CHAT") return ["message.save", "auto_reply.completed", "auto_reply.failed"].includes(item.action);
  if (item.category === "IMAGE") return ["image.submit", "image.progress"].includes(item.action) && item.outcome !== "STARTED";
  return false;
}

function logSummary(item: ApiInteractionLog) {
  const content = item.message?.trim();
  const details = item.details ?? {};
  const error = details.error;
  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") return String((error as { message: string }).message);
  if (item.action === "provider.completed") return `LLM 回复${details.model ? ` · ${String(details.model)}` : ""}：${content || "调用完成"}`;
  if (item.action === "provider.error") return `LLM 调用失败：${content || "未知错误"}`;
  if (item.action === "provider.test") return `模型连接测试：${content || item.outcome}`;
  if (item.action === "message.save") return `消息内容：${content || "非文本消息"}`;
  if (item.action === "auto_reply.completed") return `角色回复：${content || "回复已保存"}`;
  if (item.action === "auto_reply.failed") return `角色回复失败：${content || "未知错误"}`;
  if (item.action === "image.submit") return `ComfyUI ${item.outcome === "SUCCESS" ? "已接收" : "提交异常"}：${String(details.prompt ?? content ?? "图片任务")}`;
  if (item.action === "image.progress") return `ComfyUI ${item.outcome === "COMPLETED" ? "生成完成" : "生成异常"}：${String(details.prompt ?? content ?? "图片任务")}`;
  if (content) return content;
  if (item.category === "HTTP" && details.status !== undefined) return `${item.action} · HTTP ${String(details.status)}`;
  if (details.status !== undefined) return `${item.action} · 状态 ${String(details.status)}`;
  return `${item.action} · ${item.outcome}`;
}

function dialogueMessages(item: ApiInteractionLog) {
  const raw = item.details?.requestMessages;
  const messages = Array.isArray(raw)
    ? raw.filter((value): value is { role: string; content: string } => Boolean(value && typeof value === "object" && typeof (value as { role?: unknown }).role === "string" && typeof (value as { content?: unknown }).content === "string"))
    : [];
  const response = item.details?.response;
  return typeof response === "string" && response.trim()
    ? [...messages, { role: "assistant", content: response }]
    : messages;
}

function dialogueRole(role: string) {
  if (role === "system") return "SYSTEM";
  if (role === "assistant") return "ASSISTANT";
  return "USER";
}

function technicalDetails(item: ApiInteractionLog) {
  const details = { ...(item.details ?? {}) };
  delete details.requestMessages;
  delete details.response;
  return details;
}

function hasDetails(value: Record<string, unknown> | undefined) {
  return Boolean(value && Object.keys(value).length);
}

function detailPayload(item: ApiInteractionLog) {
  return {
    id: item.id,
    requestId: item.requestId,
    correlationId: item.correlationId,
    worldId: item.worldId,
    actorId: item.actorId,
    conversationId: item.conversationId,
    entityType: item.entityType,
    entityId: item.entityId,
    ...(hasDetails(item.details) ? { details: item.details } : {}),
  };
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

function filterQuery(): Record<string, string | number> {
  return {
    limit: 100,
    query: query.value,
    correlationId: correlationId.value,
    level: level.value,
    source: source.value,
    category: category.value,
    ...(toIso(createdAfter.value) ? { createdAfter: toIso(createdAfter.value)! } : {}),
    ...(toIso(createdBefore.value) ? { createdBefore: toIso(createdBefore.value)! } : {}),
  };
}

function scrollToNewest() {
  if (!autoScroll.value || paused.value) return;
  nextTick(() => {
    if (logContainer.value) logContainer.value.scrollTop = 0;
  });
}

function mergeLogs(items: readonly ApiInteractionLog[], prepend: boolean) {
  const fresh = items.filter((item) => item.id && !seenIds.has(item.id));
  for (const item of fresh) seenIds.add(item.id);
  logs.value = prepend
    ? [...fresh, ...logs.value].slice(0, 500)
    : [...logs.value, ...fresh].slice(0, 500);
  if (fresh.length > 0 && prepend) scrollToNewest();
}

async function load(reset = true) {
  loading.value = true;
  loadError.value = "";
  try {
    const result = await store.api.getInteractionLogs({
      ...filterQuery(),
      ...(reset || !nextCursor.value ? {} : { cursor: nextCursor.value }),
    });
    const page = (result.data ?? result) as LogPage;
    if (reset) {
      logs.value = [];
      pendingLogs.value = [];
      seenIds.clear();
    }
    mergeLogs(page.items ?? [], false);
    nextCursor.value = page.nextCursor ?? "";
  } catch (error: unknown) {
    loadError.value = error instanceof Error ? error.message : "日志加载失败";
  } finally {
    loading.value = false;
  }
}

function stopStream() {
  generation += 1;
  unsubscribe?.();
  unsubscribe = undefined;
  if (reconnectTimer !== undefined) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  connected.value = false;
}

function scheduleReconnect(streamGeneration: number) {
  if (
    disposed ||
    streamGeneration !== generation ||
    reconnectTimer !== undefined
  ) return;
  const delay = Math.min(8_000, 1_000 * (2 ** reconnectAttempt));
  reconnectAttempt += 1;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = undefined;
    if (!disposed && streamGeneration === generation) connect();
  }, delay);
}

function connect() {
  stopStream();
  const streamGeneration = generation;
  unsubscribe = store.api.subscribeInteractionLogs(
    {
      onOpen: () => {
        if (streamGeneration !== generation) return;
        connected.value = true;
        reconnectAttempt = 0;
      },
      onClose: () => {
        if (streamGeneration !== generation) return;
        connected.value = false;
        scheduleReconnect(streamGeneration);
      },
      onError: () => {
        if (streamGeneration !== generation) return;
        connected.value = false;
        scheduleReconnect(streamGeneration);
      },
      onEvent: (event: SseEvent) => {
        if (streamGeneration !== generation) return;
        if (event.id) lastEventId.value = event.id;
        if (event.event !== "log" && event.event !== "message") return;
        const item = event.data as ApiInteractionLog | undefined;
        if (!item?.id || seenIds.has(item.id)) return;
        seenIds.add(item.id);
        if (paused.value) {
          pendingLogs.value = [...pendingLogs.value, item].slice(-200);
          return;
        }
        logs.value = [item, ...logs.value].slice(0, 500);
        scrollToNewest();
      },
    },
    lastEventId.value ? { lastEventId: lastEventId.value } : {},
  );
}

function togglePause() {
  paused.value = !paused.value;
  if (!paused.value && pendingLogs.value.length > 0) {
    logs.value = [...pendingLogs.value.reverse(), ...logs.value].slice(0, 500);
    pendingLogs.value = [];
    scrollToNewest();
  }
}

function clearFilters() {
  query.value = "";
  correlationId.value = "";
  level.value = "";
  source.value = "";
  category.value = "";
  createdAfter.value = "";
  createdBefore.value = "";
  void load();
}

onMounted(async () => {
  correlationId.value =
    new URLSearchParams(window.location.search).get("correlationId") ?? "";
  await load();
  connect();
});

onUnmounted(() => {
  disposed = true;
  stopStream();
  pendingLogs.value = [];
});
</script>

<template>
  <section class="logs-page">
    <PageHeader
      eyebrow="CREATOR CENTER"
      title="交互日志"
      description="聚焦用户消息、角色回复、外部模型和图片生成记录。"
    />

    <div class="toolbar">
      <Input v-model="query" placeholder="搜索消息、动作或 ID" @keyup.enter="load()" />
      <Input
        v-model="correlationId"
        placeholder="Correlation ID"
        @keyup.enter="load()"
      />
      <Select v-model="level" aria-label="日志级别">
        <option value="">全部级别</option>
        <option value="DEBUG">DEBUG</option>
        <option value="INFO">INFO</option>
        <option value="WARN">WARN</option>
        <option value="ERROR">ERROR</option>
      </Select>
      <Select v-model="source" aria-label="日志来源">
        <option value="">全部来源</option>
        <option value="API">API</option>
        <option value="AI">AI</option>
        <option value="PROVIDER">PROVIDER</option>
        <option value="WORKER">WORKER</option>
        <option value="SYSTEM">SYSTEM</option>
      </Select>
      <Select v-model="category" aria-label="日志分类">
        <option value="">全部分类</option>
        <option value="HTTP">HTTP</option>
        <option value="CHAT">CHAT</option>
        <option value="LLM">LLM</option>
        <option value="DISPATCH">DISPATCH</option>
        <option value="QUEUE">QUEUE</option>
        <option value="EVENT_OUTPUT">EVENT_OUTPUT</option>
        <option value="IMAGE">IMAGE</option>
        <option value="WORKER_LIFECYCLE">WORKER_LIFECYCLE</option>
      </Select>
      <label class="time-filter">
        <span>开始</span>
        <input v-model="createdAfter" type="datetime-local" />
      </label>
      <label class="time-filter">
        <span>结束</span>
        <input v-model="createdBefore" type="datetime-local" />
      </label>
      <Button size="icon" title="应用筛选" aria-label="应用筛选" @click="load()">
        <RefreshCw :size="16" />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        title="清空筛选"
        aria-label="清空筛选"
        @click="clearFilters"
      >
        <Trash2 :size="16" />
      </Button>
    </div>

    <div class="stream-controls">
      <span class="connection">
        <i :class="{ connected }" />
        <Radio :size="15" />
        {{ statusLabel }}
      </span>
      <Button variant="secondary" size="sm" @click="togglePause">
        <Play v-if="paused" :size="15" />
        <Pause v-else :size="15" />
        {{ paused ? "继续" : "暂停" }}
      </Button>
      <label class="toggle">
        <input v-model="autoScroll" type="checkbox" />
        自动滚动
      </label>
      <Button variant="ghost" size="sm" @click="showAllLogs = !showAllLogs">{{ showAllLogs ? "只看重点交互" : "显示全部日志" }}</Button>
      <span v-if="newCount" class="new-count">{{ newCount }} 条新日志</span>
    </div>

    <p v-if="loadError" class="load-error">{{ loadError }}</p>

    <div ref="logContainer" class="log-table">
      <article v-for="item in visibleLogs" :key="item.id" class="log-row">
        <button
          class="log-main"
          type="button"
          @click="expanded = expanded === item.id ? null : item.id"
        >
          <time>{{ new Date(item.createdAt).toLocaleString() }}</time>
          <strong :class="item.level.toLowerCase()">{{ item.level }}</strong>
          <span>{{ item.source }} / {{ item.category }}</span>
          <span class="action log-summary">{{ logSummary(item) }}</span>
          <span class="duration">{{ item.durationMs ?? "-" }} ms</span>
          <ChevronDown :size="15" />
        </button>
        <div v-if="expanded === item.id" class="details">
          <p class="details-summary">{{ logSummary(item) }}</p>
          <div v-if="dialogueMessages(item).length" class="dialogue-trace">
            <article v-for="(message, index) in dialogueMessages(item)" :key="`${message.role}-${index}`" :class="`role-${message.role}`">
              <strong>{{ dialogueRole(message.role) }}</strong>
              <p>{{ message.content }}</p>
            </article>
          </div>
          <pre v-if="hasDetails(technicalDetails(item))">{{ JSON.stringify({ ...detailPayload(item), details: technicalDetails(item) }, null, 2) }}</pre>
          <p v-else-if="!dialogueMessages(item).length" class="details-empty">没有附加上下文</p>
        </div>
      </article>
      <p v-if="!visibleLogs.length && logs.length && !loading" class="empty">暂时没有用户对话或外部服务调用；过程日志已默认隐藏。</p>
      <p v-if="!logs.length && !loading" class="empty">暂无匹配日志</p>
      <p v-if="loading" class="empty">正在读取日志……</p>
    </div>

    <Button
      v-if="nextCursor"
      class="load-more"
      variant="secondary"
      :disabled="loading"
      @click="load(false)"
    >
      加载更多
    </Button>
  </section>
</template>

<style scoped>
.logs-page {
  width: min(100%, 1400px);
  min-width: 0;
  margin: 0 auto;
  padding: clamp(16px, 3vw, 36px);
}
.toolbar {
  display: grid;
  grid-template-columns: repeat(5, minmax(130px, 1fr)) repeat(2, minmax(170px, 1fr)) auto auto;
  gap: 8px;
  align-items: end;
  margin: 20px 0 12px;
}
.time-filter {
  display: grid;
  gap: 4px;
  min-width: 0;
  color: var(--muted);
  font-size: var(--text-xs);
}
.time-filter input {
  width: 100%;
  min-width: 0;
  height: 38px;
  padding: 0 9px;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.stream-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 38px;
  margin-bottom: 10px;
  color: var(--muted);
  font-size: var(--text-xs);
}
.connection,
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.connection i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
}
.connection i.connected {
  background: var(--success);
}
.toggle input {
  accent-color: var(--primary);
}
.new-count {
  color: var(--primary);
  font-weight: 700;
}
.load-error {
  margin-bottom: 8px;
  color: var(--danger);
  font-size: var(--text-sm);
}
.log-table {
  height: calc(100dvh - 290px);
  min-height: 260px;
  max-height: none;
  overflow: auto;
  border: 1px solid var(--border);
  background: var(--surface);
}
.log-row {
  border-bottom: 1px solid var(--border);
}
.log-main {
  width: 100%;
  display: grid;
  grid-template-columns: 170px 58px 145px minmax(180px, 1fr) 76px 18px;
  gap: 10px;
  align-items: center;
  padding: 11px 12px;
  text-align: left;
  color: var(--text);
  background: transparent;
  border: 0;
  cursor: pointer;
}
.log-main time,
.duration {
  color: var(--muted);
  font-size: var(--text-xs);
}
.log-main strong {
  font-size: var(--text-xs);
}
.debug,
.info {
  color: var(--primary);
}
.warn {
  color: var(--warning);
}
.error {
  color: var(--danger);
}
.action {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.details {
  padding: 0 14px 14px;
  color: var(--muted);
  font-size: var(--text-sm);
}
.details p,
.details pre {
  overflow-wrap: anywhere;
}
.dialogue-trace {
  display: grid;
  gap: 8px;
  margin: 10px 0;
}
.dialogue-trace article {
  max-width: min(86%, 760px);
  padding: 9px 11px;
  color: var(--text);
  background: var(--surface-soft);
  border-left: 3px solid var(--border-strong);
}
.dialogue-trace article.role-user {
  justify-self: end;
  border-left: 0;
  border-right: 3px solid var(--primary);
}
.dialogue-trace article.role-assistant {
  border-left-color: var(--success);
}
.dialogue-trace article.role-system {
  max-width: 100%;
  color: var(--muted);
}
.dialogue-trace strong {
  display: block;
  margin-bottom: 4px;
  color: var(--muted);
  font-size: var(--text-xs);
}
.dialogue-trace p {
  margin: 0;
  white-space: pre-wrap;
}
.details pre {
  margin-top: 8px;
  padding: 10px;
  white-space: pre-wrap;
  background: var(--surface-soft);
  font-size: var(--text-xs);
}
.empty {
  padding: 40px 16px;
  text-align: center;
  color: var(--muted);
}
.load-more {
  margin-top: 12px;
}
@media (max-width: 1100px) {
  .toolbar {
    grid-template-columns: repeat(3, minmax(150px, 1fr));
  }
}
@media (max-width: 600px) {
  .logs-page {
    padding: 12px;
    overflow-x: hidden;
  }
  .toolbar {
    grid-template-columns: 1fr 1fr;
  }
  .toolbar :deep(.ui-input),
  .toolbar :deep(.ui-select),
  .time-filter {
    grid-column: 1 / -1;
  }
  .stream-controls {
    flex-wrap: wrap;
  }
  .log-table {
    height: calc(100dvh - 340px);
    min-height: 260px;
  }
  .log-main {
    grid-template-columns: 1fr auto;
    gap: 5px 8px;
  }
  .log-main time,
  .log-main .action {
    grid-column: 1 / -1;
  }
  .log-main > span:not(.action):not(.duration),
  .duration {
    min-width: 0;
    overflow-wrap: anywhere;
  }
}
.log-summary { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.details-summary { margin-bottom: 8px; color: var(--text); white-space: pre-wrap; }
.details-empty { color: var(--faint); font-size: var(--text-xs); }
</style>
