<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ChevronRight, RefreshCw, Search, Trash2 } from "@lucide/vue";
import type { V2ModelCallLogDto, V2ModelCallLogQuery, V2ModelCallStatus } from "@living-network/contracts/v2";

import Badge from "../../components/ui/Badge.vue";
import Button from "../../components/ui/Button.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import Field from "../../components/ui/Field.vue";
import Input from "../../components/ui/Input.vue";
import PageHeader from "../../components/layout/PageHeader.vue";
import Select from "../../components/ui/Select.vue";
import { platformErrorMessage, v2PlatformClient } from "./platform.ts";

const client = v2PlatformClient();
const logs = ref<readonly V2ModelCallLogDto[]>([]);
const selected = ref<V2ModelCallLogDto | null>(null);
const query = ref("");
const model = ref("");
const status = ref<"" | V2ModelCallStatus>("");
const nextCursor = ref<string | undefined>();
const loading = ref(false);
const loadingMore = ref(false);
const error = ref<string | null>(null);
const message = ref<string | null>(null);

const hasLogs = computed(() => logs.value.length > 0);

function statusLabel(value: V2ModelCallStatus): string {
  return { running: "执行中", success: "成功", error: "失败", interrupted: "中断" }[value];
}

function statusTone(value: V2ModelCallStatus): "info" | "success" | "danger" | "warning" {
  const tones: Record<V2ModelCallStatus, "info" | "success" | "danger" | "warning"> = {
    running: "info",
    success: "success",
    error: "danger",
    interrupted: "warning",
  };
  return tones[value];
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function buildQuery(cursor?: string): V2ModelCallLogQuery {
  return {
    limit: 30,
    ...(status.value === "" ? {} : { status: status.value }),
    ...(model.value.trim() === "" ? {} : { model: model.value.trim() }),
    ...(query.value.trim() === "" ? {} : { query: query.value.trim() }),
    ...(cursor === undefined ? {} : { cursor }),
  };
}

async function load(reset = true): Promise<void> {
  if (reset) loading.value = true;
  else loadingMore.value = true;
  error.value = null;
  try {
    const page = await client.queryModelCallLogs(buildQuery(reset ? undefined : nextCursor.value));
    logs.value = reset ? page.items : [...logs.value, ...page.items];
    nextCursor.value = page.nextCursor;
    if (reset) selected.value = logs.value[0] ?? null;
  } catch (err) {
    error.value = platformErrorMessage(err, "无法读取模型调用日志");
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

async function openLog(log: V2ModelCallLogDto): Promise<void> {
  try {
    selected.value = await client.getModelCallLog(log.id);
  } catch {
    selected.value = log;
  }
}

async function cleanExpired(): Promise<void> {
  if (!window.confirm("确定清理 30 天前的模型调用日志吗？此操作不可恢复。")) return;
  error.value = null;
  message.value = null;
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const deleted = await client.deleteModelCallLogs(cutoff);
    message.value = `已清理 ${deleted} 条过期日志。`;
    await load();
  } catch (err) {
    error.value = platformErrorMessage(err, "清理日志失败");
  }
}

function messagePreview(log: V2ModelCallLogDto): string {
  const first = log.requestMessages?.[0]?.content;
  return first === undefined ? "无请求内容" : first.slice(0, 120);
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="v2-model-logs">
    <PageHeader
      title="调用日志"
      description="记录模型请求、响应、耗时、Token 用量和错误上下文。密钥、Bearer 令牌和超长文本会在写入前脱敏或截断，默认保留 30 天。"
    >
      <template #actions>
        <Button variant="secondary" size="md" :loading="loading" @click="load()">
          <RefreshCw :size="16" aria-hidden="true" />
          刷新日志
        </Button>
        <Button variant="danger" size="md" @click="cleanExpired">
          <Trash2 :size="16" aria-hidden="true" />
          清理过期日志
        </Button>
      </template>
    </PageHeader>

    <div v-if="error" class="v2-log-message v2-log-error" role="alert">{{ error }}</div>
    <div v-if="message" class="v2-log-message v2-log-success" role="status">{{ message }}</div>

    <section class="v2-log-filters" aria-label="日志筛选">
      <Field for-id="v2-log-query" label="关键词">
        <Input id="v2-log-query" v-model="query" placeholder="模型、错误或关联 ID" @keyup.enter="load()" />
      </Field>
      <Field for-id="v2-log-model" label="模型">
        <Input id="v2-log-model" v-model="model" placeholder="模型名称" @keyup.enter="load()" />
      </Field>
      <Field for-id="v2-log-status" label="状态">
        <Select id="v2-log-status" v-model="status">
          <option value="">全部状态</option>
          <option value="running">执行中</option>
          <option value="success">成功</option>
          <option value="error">失败</option>
          <option value="interrupted">中断</option>
        </Select>
      </Field>
      <div class="v2-log-filter-btn-wrap">
        <Button variant="primary" size="md" :loading="loading" @click="load()">
          <Search :size="16" aria-hidden="true" />
          查询
        </Button>
      </div>
    </section>

    <div class="v2-log-layout">
      <!-- 左侧：日志列表 -->
      <section class="v2-log-list-card" aria-labelledby="v2-log-list-title">
        <div class="v2-log-list-head">
          <div>
            <p class="v2-section-kicker">调用记录</p>
            <h2 id="v2-log-list-title">最近请求</h2>
          </div>
          <Badge tone="neutral">{{ logs.length }}</Badge>
        </div>
        <EmptyState v-if="!hasLogs && !loading" title="暂时没有模型调用" description="模型测试或 Worker 执行过请求后，记录会出现在这里。" />
        <div v-else class="v2-log-items">
          <article
            v-for="log in logs"
            :key="log.id"
            class="v2-log-item"
            :class="{ selected: selected?.id === log.id }"
            @click="openLog(log)"
          >
            <div class="v2-log-item-main">
              <div class="v2-log-item-title">
                <Badge :tone="statusTone(log.status)">{{ statusLabel(log.status) }}</Badge>
                <strong>{{ log.model ?? "未解析模型" }}</strong>
              </div>
              <p>{{ messagePreview(log) }}</p>
              <small>{{ formatTime(log.startedAt) }} · {{ log.durationMs === undefined ? "耗时未知" : `${log.durationMs} ms` }}</small>
            </div>
            <Button variant="ghost" size="icon" aria-label="查看日志详情" @click.stop="openLog(log)">
              <ChevronRight :size="17" aria-hidden="true" />
            </Button>
          </article>
        </div>
        <Button v-if="nextCursor" variant="secondary" size="md" class="v2-log-more" :loading="loadingMore" @click="load(false)">
          加载更多
        </Button>
      </section>

      <!-- 右侧：详情面板 -->
      <section class="v2-log-detail-card" aria-labelledby="v2-log-detail-title">
        <div class="v2-log-list-head">
          <div>
            <p class="v2-section-kicker">请求详情</p>
            <h2 id="v2-log-detail-title">{{ selected ? "调用上下文" : "选择一条日志" }}</h2>
          </div>
        </div>
        <EmptyState v-if="!selected" title="尚未选择日志" description="从左侧记录打开完整请求和响应。" />
        <div v-else class="v2-log-detail">
          <dl class="v2-log-meta">
            <div><dt>状态</dt><dd><Badge :tone="statusTone(selected.status)">{{ statusLabel(selected.status) }}</Badge></dd></div>
            <div><dt>能力</dt><dd>{{ selected.capability }}</dd></div>
            <div><dt>档案</dt><dd>{{ selected.profileName ?? "环境变量兜底" }}</dd></div>
            <div><dt>关联 ID</dt><dd class="mono-text">{{ selected.correlationId ?? "—" }}</dd></div>
            <div><dt>任务 ID</dt><dd class="mono-text">{{ selected.jobId ?? "—" }}</dd></div>
            <div><dt>Token</dt><dd>{{ selected.totalTokens ?? "—" }}</dd></div>
          </dl>
          <div v-if="selected.errorMessage" class="v2-log-error-box">
            <strong>{{ selected.errorCode ?? "调用失败" }}</strong>
            <p>{{ selected.errorMessage }}</p>
          </div>
          <div class="v2-log-content-block">
            <h3>请求消息</h3>
            <pre>{{ selected.requestMessages?.map((item) => `${item.role}: ${item.content}`).join("\n\n") ?? "无记录" }}</pre>
          </div>
          <div class="v2-log-content-block">
            <h3>响应内容</h3>
            <pre>{{ selected.responseText ?? "无响应" }}</pre>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.v2-model-logs {
  display: grid;
  gap: var(--space-4);
}

.v2-log-filters,
.v2-log-list-card,
.v2-log-detail-card {
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  min-width: 0;
}

.v2-log-filters {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(130px, 0.8fr) auto;
  gap: var(--space-3);
  align-items: end;
}

.v2-log-filter-btn-wrap {
  display: flex;
  align-items: flex-end;
  padding-bottom: 2px;
}

.v2-log-layout {
  display: grid;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
}

.v2-log-list-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.v2-log-list-head h2 {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-md);
  font-weight: 800;
}

.v2-section-kicker {
  margin: 0 0 var(--space-1);
  color: var(--primary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.v2-log-list-card {
  max-height: calc(100vh - 230px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.v2-log-detail-card {
  position: sticky;
  top: var(--space-4);
  max-height: calc(100vh - 230px);
  overflow-y: auto;
}

.v2-log-items {
  display: grid;
  gap: var(--space-2);
}

.v2-log-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  cursor: pointer;
  transition: all var(--motion-fast);
}

.v2-log-item:hover {
  background: var(--surface);
  border-color: var(--primary);
}

.v2-log-item.selected {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.v2-log-item-main {
  flex: 1;
  min-width: 0;
}

.v2-log-item-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.v2-log-item-title strong,
.v2-log-item p {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v2-log-item-title strong {
  color: var(--text-strong);
  font-size: var(--text-sm);
}

.v2-log-item p {
  margin: var(--space-1) 0;
  color: var(--muted);
  font-size: var(--text-xs);
  line-height: 1.4;
}

.v2-log-item small {
  color: var(--faint);
  font-size: 11px;
}

.v2-log-more {
  width: 100%;
  margin-top: var(--space-3);
}

.v2-log-detail {
  display: grid;
  gap: var(--space-3);
}

.v2-log-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: var(--space-2) var(--space-3);
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  border: 1px solid var(--border);
}

.v2-log-meta div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.v2-log-meta dt {
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
}

.v2-log-meta dd {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
  color: var(--text-strong);
  font-size: 13px;
  font-weight: 700;
}

.mono-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.v2-log-content-block {
  display: grid;
  gap: var(--space-1);
}

.v2-log-content-block h3 {
  margin: 0;
  color: var(--text-strong);
  font-size: 13px;
  font-weight: 800;
}

.v2-log-content-block pre {
  max-height: 220px;
  overflow: auto;
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-muted);
  border: 1px solid var(--border);
  color: var(--text);
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-all;
}

.v2-log-error-box,
.v2-log-message {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

.v2-log-error-box,
.v2-log-error {
  background: var(--danger-soft);
  color: var(--danger);
  border: 1px solid var(--danger);
}

.v2-log-error-box p {
  margin: var(--space-1) 0 0;
  font-size: 12px;
}

.v2-log-success {
  background: var(--success-soft);
  color: var(--success);
  border: 1px solid var(--success);
}

@media (max-width: 1040px) {
  .v2-log-layout {
    grid-template-columns: 1fr;
  }
  .v2-log-list-card,
  .v2-log-detail-card {
    position: static;
    max-height: none;
  }
}

@media (max-width: 768px) {
  .v2-log-filters {
    grid-template-columns: 1fr;
  }
  .v2-log-filter-btn-wrap {
    width: 100%;
  }
  .v2-log-filter-btn-wrap > .ui-button {
    width: 100%;
  }
}
</style>
