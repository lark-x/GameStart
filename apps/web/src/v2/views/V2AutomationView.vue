<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Radio, RefreshCw, RotateCcw } from "@lucide/vue";
import type { V2JobDetailDto, V2JobSummaryDto, V2MaintenanceJobStatus, V2MaintenanceJobType } from "@living-network/contracts/v2";
import Badge from "../../components/ui/Badge.vue";
import Button from "../../components/ui/Button.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import PageHeader from "../../components/layout/PageHeader.vue";
import Select from "../../components/ui/Select.vue";
import { createV2PlatformClient, V2PlatformClientError } from "../adapters/platform.ts";

const apiBase = (() => {
  const env = (import.meta as ImportMeta & { readonly env?: Record<string, string | undefined> }).env ?? {};
  return env.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3003" : window.location.origin);
})();

const client = createV2PlatformClient({ baseUrl: apiBase });

type LoadState = "idle" | "loading" | "ready" | "error";

const jobs = ref<readonly V2JobSummaryDto[]>([]);
const selectedJob = ref<V2JobDetailDto | null>(null);
const loadState = ref<LoadState>("idle");
const error = ref<string | null>(null);
const retrying = ref(false);
const loadingMore = ref(false);
const nextCursor = ref<string | undefined>(undefined);
const statusFilter = ref("");
const typeFilter = ref("");

const JOB_TYPES: readonly { readonly value: V2MaintenanceJobType; readonly label: string }[] = [
  { value: "memory_extract", label: "记忆提取" },
  { value: "conversation_summary", label: "对话摘要" },
  { value: "memory_consolidate", label: "记忆整合" },
  { value: "story_analyze", label: "剧情分析" },
  { value: "memory_engine_consume", label: "引擎消费" },
];

const STATUS_OPTIONS: readonly { readonly value: V2MaintenanceJobStatus; readonly label: string }[] = [
  { value: "pending", label: "等待中" },
  { value: "claimed", label: "已认领" },
  { value: "running", label: "运行中" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
];

const STATUS_LABELS: Readonly<Record<string, string>> = {
  pending: "等待中",
  claimed: "已认领",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
};

function jobTypeLabel(type: string): string {
  return JOB_TYPES.find((t) => t.value === type)?.label ?? type;
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "pending" || status === "claimed" || status === "running") return "warning";
  return "neutral";
}

function formatTime(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

async function load(): Promise<void> {
  loadState.value = "loading";
  error.value = null;
  nextCursor.value = undefined;
  try {
    const page = await client.listJobs({
      ...(statusFilter.value === "" ? {} : { status: statusFilter.value as V2MaintenanceJobStatus }),
      ...(typeFilter.value === "" ? {} : { type: typeFilter.value as V2MaintenanceJobType }),
      limit: 50,
    });
    jobs.value = page.items;
    nextCursor.value = page.nextCursor;
    selectedJob.value = null;
    loadState.value = "ready";
  } catch (err) {
    error.value = err instanceof V2PlatformClientError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : "加载失败";
    loadState.value = "error";
  }
}

async function loadMore(): Promise<void> {
  if (nextCursor.value === undefined || loadingMore.value) return;
  loadingMore.value = true;
  error.value = null;
  try {
    const page = await client.listJobs({
      ...(statusFilter.value === "" ? {} : { status: statusFilter.value as V2MaintenanceJobStatus }),
      ...(typeFilter.value === "" ? {} : { type: typeFilter.value as V2MaintenanceJobType }),
      limit: 50,
      cursor: nextCursor.value,
    });
    jobs.value = [...jobs.value, ...page.items];
    nextCursor.value = page.nextCursor;
  } catch (err) {
    error.value = err instanceof V2PlatformClientError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : "加载更多失败";
  } finally {
    loadingMore.value = false;
  }
}

async function openDetail(jobId: string): Promise<void> {
  error.value = null;
  try {
    selectedJob.value = await client.getJob(jobId);
  } catch (err) {
    error.value = err instanceof V2PlatformClientError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : "读取任务详情失败";
  }
}

async function retry(jobId: string): Promise<void> {
  retrying.value = true;
  error.value = null;
  try {
    await client.retryJob(jobId);
    await load();
  } catch (err) {
    error.value = err instanceof V2PlatformClientError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : "重试失败";
  } finally {
    retrying.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="v2-automation">
    <PageHeader
      title="任务运行中心"
      description="查看后台任务的最近状态与当前失败任务，并对失败任务执行人工重试。这里展示的是 Job 记录的最近状态，不代表完整的 Attempt 审计历史。"
    >
      <template #actions>
        <Button variant="secondary" size="sm" :loading="loadState === 'loading'" @click="load">
          <RefreshCw :size="14" aria-hidden="true" />
          刷新
        </Button>
      </template>
    </PageHeader>

    <div v-if="error" class="v2-automation-alert" role="alert">{{ error }}</div>

    <section class="v2-automation-filter">
      <Select v-model="statusFilter" label="状态">
        <option value="">全部状态</option>
        <option v-for="s in STATUS_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</option>
      </Select>
      <Select v-model="typeFilter" label="任务类型">
        <option value="">全部类型</option>
        <option v-for="t in JOB_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
      </Select>
      <Button variant="secondary" size="sm" @click="load">应用筛选</Button>
    </section>

    <section class="v2-automation-card">
      <template v-if="loadState === 'ready' && jobs.length === 0">
        <EmptyState
          title="暂无任务"
          description="当对话触发记忆提取、摘要或剧情分析时，后台任务会出现在这里。"
        >
          <template #icon>
            <Radio :size="26" aria-hidden="true" />
          </template>
        </EmptyState>
      </template>

      <template v-else>
        <div class="v2-automation-layout">
          <div class="v2-automation-list">
            <div
              v-for="job in jobs"
              :key="job.jobId"
              class="v2-automation-job"
              :class="{ selected: selectedJob?.jobId === job.jobId }"
              role="button"
              tabindex="0"
              @click="openDetail(job.jobId)"
              @keydown.enter="openDetail(job.jobId)"
            >
              <div class="v2-automation-job-head">
                <Badge :tone="statusTone(job.status)">{{ statusLabel(job.status) }}</Badge>
                <strong class="v2-automation-job-type">{{ jobTypeLabel(job.jobType) }}</strong>
                <span class="v2-automation-job-attempts">尝试 {{ job.attempts }}/{{ job.maxAttempts }}</span>
              </div>
              <p class="v2-automation-job-meta">{{ formatTime(job.createdAt) }}</p>
            </div>
          </div>

          <Button
            v-if="nextCursor"
            variant="secondary"
            size="sm"
            :loading="loadingMore"
            :disabled="loadingMore"
            class="v2-automation-load-more"
            @click="loadMore"
          >
            加载更多
          </Button>

          <div v-if="selectedJob" class="v2-automation-detail">
            <h3>任务详情</h3>
            <dl class="v2-automation-detail-grid">
              <dt>Job ID</dt>
              <dd>{{ selectedJob.jobId }}</dd>
              <dt>类型</dt>
              <dd>{{ jobTypeLabel(selectedJob.jobType) }}</dd>
              <dt>状态</dt>
              <dd><Badge :tone="statusTone(selectedJob.status)">{{ statusLabel(selectedJob.status) }}</Badge></dd>
              <dt>创建时间</dt>
              <dd>{{ formatTime(selectedJob.createdAt) }}</dd>
              <dt>开始时间</dt>
              <dd>{{ formatTime(selectedJob.startedAt) }}</dd>
              <dt>最后更新</dt>
              <dd>{{ formatTime(selectedJob.updatedAt) }}</dd>
              <dt>尝试次数</dt>
              <dd>{{ selectedJob.attempts }}/{{ selectedJob.maxAttempts }}</dd>
            </dl>
            <dl v-if="selectedJob.payloadSummary.conversationId || selectedJob.payloadSummary.sourceMessageCount !== undefined" class="v2-automation-detail-grid">
              <dt v-if="selectedJob.payloadSummary.conversationId">会话</dt>
              <dd v-if="selectedJob.payloadSummary.conversationId">{{ selectedJob.payloadSummary.conversationId }}</dd>
              <dt v-if="selectedJob.payloadSummary.sourceMessageCount !== undefined">涉及消息</dt>
              <dd v-if="selectedJob.payloadSummary.sourceMessageCount !== undefined">{{ selectedJob.payloadSummary.sourceMessageCount }} 条</dd>
            </dl>
            <p v-if="selectedJob.lastError" class="v2-automation-job-error">{{ selectedJob.lastError }}</p>
            <Button
              v-if="selectedJob.status === 'failed'"
              variant="secondary"
              size="sm"
              :loading="retrying"
              :disabled="retrying"
              @click="retry(selectedJob.jobId)"
            >
              <RotateCcw :size="14" aria-hidden="true" />
              重新执行
            </Button>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.v2-automation {
  display: grid;
  gap: var(--space-5);
}

.v2-automation-alert {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-sm);
}

.v2-automation-filter {
  display: flex;
  align-items: flex-end;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.v2-automation-card {
  min-height: 360px;
  padding: var(--space-6);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.v2-automation-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-4);
}

.v2-automation-list {
  display: grid;
  gap: var(--space-2);
  align-content: start;
}

.v2-automation-load-more {
  justify-self: start;
}

.v2-automation-job {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  cursor: pointer;
}

.v2-automation-job.selected {
  border-color: var(--primary);
}

.v2-automation-job-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.v2-automation-job-type {
  color: var(--text-strong);
  font-size: var(--text-base);
}

.v2-automation-job-attempts {
  color: var(--muted);
  font-size: var(--text-sm);
}

.v2-automation-job-meta {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-sm);
}

.v2-automation-detail {
  display: grid;
  gap: var(--space-3);
  align-content: start;
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.v2-automation-detail h3 {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-base);
}

.v2-automation-detail-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-2) var(--space-3);
  margin: 0;
}

.v2-automation-detail-grid dt {
  color: var(--muted);
  font-size: var(--text-sm);
}

.v2-automation-detail-grid dd {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}

.v2-automation-job-error {
  margin: 0;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .v2-automation-layout {
    grid-template-columns: 1fr;
  }
  .v2-automation-card {
    padding: var(--space-4);
  }
}
</style>
