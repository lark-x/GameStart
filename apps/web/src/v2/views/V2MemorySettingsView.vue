<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Cpu, Database, RefreshCw, Sparkles } from "@lucide/vue";
import { RouterLink } from "vue-router";
import type { V2MemoryDiagnosticsDto, V2MemoryOverviewDto, V2ModelBindingDto } from "@living-network/contracts/v2";
import Badge from "../../components/ui/Badge.vue";
import Button from "../../components/ui/Button.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import PageHeader from "../../components/layout/PageHeader.vue";
import { createV2PlatformClient, V2PlatformClientError } from "../adapters/platform.ts";
import { buildMemoryStatusSummary, shouldShowMemoryStats } from "./runtime-view-model.ts";

const apiBase = (() => {
  const env = (import.meta as ImportMeta & { readonly env?: Record<string, string | undefined> }).env ?? {};
  return env.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3003" : window.location.origin);
})();

const client = createV2PlatformClient({ baseUrl: apiBase });

type LoadState = "idle" | "loading" | "ready" | "error";

const bindings = ref<readonly V2ModelBindingDto[]>([]);
const overview = ref<V2MemoryOverviewDto | null>(null);
const diagnostics = ref<V2MemoryDiagnosticsDto | null>(null);
const loadState = ref<LoadState>("idle");
const diagnosticsState = ref<LoadState>("idle");
const error = ref<string | null>(null);
const diagnosticsError = ref<string | null>(null);
const showDiagnostics = ref(false);

const memoryBinding = computed(() => bindings.value.find((b) => b.capability === "memory"));
const hasMemoryFacts = computed(() => shouldShowMemoryStats(overview.value?.facts.total ?? 0));

const KIND_LABELS: Readonly<Record<string, string>> = {
  profile: "角色印象",
  preference: "用户偏好",
  relationship: "角色关系",
  episodic: "事件记忆",
  world_fact: "世界事实",
};

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

function formatTime(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function optionalPercent(value: number | null): string {
  return value === null ? "N/A" : percent(value);
}

function statusTone(status: string | undefined): "success" | "danger" | "neutral" {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  return "neutral";
}

function statusLabel(status: string | undefined): string {
  if (status === "completed") return "成功";
  if (status === "failed") return "失败";
  return status ?? "—";
}

function engineLabel(id: string): string {
  if (id.includes("structured")) return "Structured";
  if (id.includes("hybrid")) return "Hybrid";
  return id;
}

function truncateError(value: string | undefined): string {
  if (!value) return "未知错误";
  return value.length > 120 ? `${value.slice(0, 120)}…` : value;
}

const statusSummary = computed(() => buildMemoryStatusSummary({
  loadState: loadState.value,
  overview: overview.value,
  error: error.value,
  formatTime,
}));

async function load(): Promise<void> {
  loadState.value = "loading";
  error.value = null;
  try {
    const [nextBindings, nextOverview] = await Promise.all([
      client.listModelBindings(),
      client.getMemoryOverview(),
    ]);
    bindings.value = nextBindings;
    overview.value = nextOverview;
    loadState.value = "ready";
  } catch (err) {
    error.value = err instanceof V2PlatformClientError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : "加载失败";
    loadState.value = "error";
  }
}

async function loadDiagnostics(): Promise<void> {
  diagnosticsState.value = "loading";
  diagnosticsError.value = null;
  try {
    diagnostics.value = await client.getMemoryDiagnostics();
    diagnosticsState.value = "ready";
  } catch (err) {
    diagnosticsError.value = err instanceof V2PlatformClientError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : "诊断读取失败";
    diagnosticsState.value = "error";
  }
}

function toggleDiagnostics(): void {
  showDiagnostics.value = !showDiagnostics.value;
  if (showDiagnostics.value && diagnostics.value === null && diagnosticsState.value !== "loading") {
    void loadDiagnostics();
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="v2-memory-settings">
    <PageHeader
      title="Memory"
      description="查看长期记忆的数量、质量原始指标，以及最近提取与整合运行状态。"
    >
      <template #actions>
        <Button variant="secondary" size="sm" :loading="loadState === 'loading'" @click="load">
          <RefreshCw :size="14" aria-hidden="true" />
          刷新
        </Button>
      </template>
    </PageHeader>

    <div v-if="error" class="v2-memory-alert" role="alert">{{ error }}</div>

    <div v-if="loadState === 'error' && !error" class="v2-memory-alert" role="alert">状态读取失败</div>

    <section class="v2-memory-status" :class="statusSummary.tone" aria-labelledby="v2-memory-status-title">
      <div>
        <h2 id="v2-memory-status-title">{{ statusSummary.title }}</h2>
        <p>{{ statusSummary.detail }}</p>
      </div>
      <Badge :tone="statusSummary.tone">{{ statusSummary.tone === "success" ? "正常" : statusSummary.tone === "danger" ? "异常" : "待观察" }}</Badge>
    </section>

    <div v-if="loadState === 'loading'" class="v2-memory-loading">正在加载 Memory 状态…</div>

    <EmptyState
      v-if="loadState === 'ready' && overview && overview.facts.total === 0"
      title="当前还没有长期记忆"
      description="对话完成 Memory Extraction 后，统计会显示在这里。"
    >
      <template #icon>
        <Sparkles :size="26" aria-hidden="true" />
      </template>
    </EmptyState>

    <template v-if="loadState === 'ready' && overview">
      <!-- Overview -->
      <section v-if="hasMemoryFacts" class="v2-memory-section" aria-labelledby="v2-memory-overview-title">
        <div class="v2-memory-section-head">
          <Sparkles :size="16" aria-hidden="true" />
          <h2 id="v2-memory-overview-title">核心概览</h2>
        </div>
        <div class="v2-memory-stat-grid">
          <div class="v2-memory-stat-card">
            <span class="v2-memory-stat-value">{{ overview.facts.total }}</span>
            <span class="v2-memory-stat-label">活跃记忆</span>
            <span class="v2-memory-stat-hint">当前处于 active 状态、可被 Memory Engine 使用的记忆。</span>
          </div>
          <div class="v2-memory-stat-card">
            <span class="v2-memory-stat-value">{{ overview.facts.relatedCharacterCount }}</span>
            <span class="v2-memory-stat-label">关联角色</span>
            <span class="v2-memory-stat-hint">Fact Ledger 中 character subject 按 ID 去重统计。</span>
          </div>
          <div class="v2-memory-stat-card">
            <span class="v2-memory-stat-value">{{ percent(overview.facts.averageImportance) }}</span>
            <span class="v2-memory-stat-label">平均重要度</span>
            <span class="v2-memory-stat-hint">active Memory 的 importance 平均值。</span>
          </div>
          <div class="v2-memory-stat-card">
            <span class="v2-memory-stat-value">{{ percent(overview.facts.averageConfidence) }}</span>
            <span class="v2-memory-stat-label">平均置信度</span>
            <span class="v2-memory-stat-hint">active Memory 的 confidence 平均值。</span>
          </div>
        </div>
      </section>

      <!-- Type distribution -->
      <section v-if="hasMemoryFacts && overview.facts.typeDistribution.length > 0" class="v2-memory-section" aria-labelledby="v2-memory-kind-title">
        <div class="v2-memory-section-head">
          <Database :size="16" aria-hidden="true" />
          <h2 id="v2-memory-kind-title">类型分布</h2>
        </div>
        <div class="v2-memory-rows">
          <div v-for="item in overview.facts.typeDistribution" :key="item.kind" class="v2-memory-row">
            <span class="v2-memory-row-label">{{ kindLabel(item.kind) }}</span>
            <span class="v2-memory-row-value">{{ item.count }} 条</span>
            <span class="v2-memory-row-value secondary">{{ percent(item.count / overview.facts.total) }}</span>
          </div>
        </div>
      </section>

      <!-- Recent runs -->
      <section class="v2-memory-section" aria-labelledby="v2-memory-runs-title">
        <div class="v2-memory-section-head">
          <Cpu :size="16" aria-hidden="true" />
          <h2 id="v2-memory-runs-title">最近运行</h2>
        </div>
        <div class="v2-memory-runtime-grid">
          <div class="v2-memory-runtime-card">
            <div class="v2-memory-runtime-head">
              <h3>Memory Extraction</h3>
              <Badge :tone="statusTone(overview.extraction.latest?.status)">{{ statusLabel(overview.extraction.latest?.status) }}</Badge>
            </div>
            <dl>
              <dt>最近运行</dt>
              <dd>{{ formatTime(overview.extraction.latest?.updatedAt) }}</dd>
              <dt>最近开始</dt>
              <dd>{{ formatTime(overview.extraction.latest?.startedAt) }}</dd>
              <dt>{{ overview.extraction.latest?.status === "failed" ? "最近运行失败" : "最近一次失败" }}</dt>
              <dd v-if="overview.extraction.latest?.status === 'failed'">{{ formatTime(overview.extraction.latest.updatedAt) }} · {{ truncateError(overview.extraction.latest.error) }}</dd>
              <dd v-else>{{ overview.extraction.latestFailure ? `${formatTime(overview.extraction.latestFailure.updatedAt)} · ${truncateError(overview.extraction.latestFailure.error)}` : "—" }}</dd>
            </dl>
          </div>
          <div class="v2-memory-runtime-card">
            <div class="v2-memory-runtime-head">
              <h3>Memory Consolidation</h3>
              <Badge :tone="statusTone(overview.consolidation.latest?.status)">{{ statusLabel(overview.consolidation.latest?.status) }}</Badge>
            </div>
            <dl>
              <dt>最近运行</dt>
              <dd>{{ formatTime(overview.consolidation.latest?.updatedAt) }}</dd>
              <dt>最近开始</dt>
              <dd>{{ formatTime(overview.consolidation.latest?.startedAt) }}</dd>
              <dt>{{ overview.consolidation.latest?.status === "failed" ? "最近运行失败" : "最近一次失败" }}</dt>
              <dd v-if="overview.consolidation.latest?.status === 'failed'">{{ formatTime(overview.consolidation.latest.updatedAt) }} · {{ truncateError(overview.consolidation.latest.error) }}</dd>
              <dd v-else>{{ overview.consolidation.latestFailure ? `${formatTime(overview.consolidation.latestFailure.updatedAt)} · ${truncateError(overview.consolidation.latestFailure.error)}` : "—" }}</dd>
            </dl>
          </div>
        </div>
      </section>

      <!-- Recent failures -->
      <section v-if="overview.recentFailures.length > 0" class="v2-memory-section" aria-labelledby="v2-memory-failures-title">
        <div class="v2-memory-section-head">
          <Database :size="16" aria-hidden="true" />
          <h2 id="v2-memory-failures-title">当前可见失败</h2>
        </div>
        <div class="v2-memory-rows">
          <div v-for="failure in overview.recentFailures" :key="failure.jobId" class="v2-memory-row">
            <span class="v2-memory-row-label">{{ formatTime(failure.updatedAt) }}</span>
            <span class="v2-memory-row-value">{{ truncateError(failure.error) }}</span>
          </div>
        </div>
      </section>

      <!-- Engines -->
      <section class="v2-memory-section" aria-labelledby="v2-memory-engine-title">
        <div class="v2-memory-section-head">
          <Database :size="16" aria-hidden="true" />
          <h2 id="v2-memory-engine-title">Memory Engine</h2>
        </div>
        <div class="v2-memory-engines">
          <div v-for="engine in overview.engines" :key="engine.id" class="v2-memory-engine-card">
            <div class="v2-memory-engine-head">
              <strong>{{ engineLabel(engine.id) }}</strong>
              <Badge :tone="engine.mode === 'primary' ? 'success' : 'neutral'">
                {{ engine.mode === "primary" ? "主引擎" : "影子引擎" }}
              </Badge>
            </div>
            <span class="v2-memory-engine-id">{{ engine.id }}</span>
          </div>
        </div>
      </section>

      <!-- Model binding -->
      <section class="v2-memory-section" aria-labelledby="v2-memory-model-title">
        <div class="v2-memory-section-head">
          <Cpu :size="16" aria-hidden="true" />
          <h2 id="v2-memory-model-title">记忆模型</h2>
        </div>
        <div class="v2-memory-rows">
          <div class="v2-memory-row">
            <span class="v2-memory-row-label">绑定模型</span>
            <span class="v2-memory-row-value">{{ memoryBinding?.profileName ?? "未绑定" }}</span>
            <Badge :tone="memoryBinding?.profileId ? 'success' : 'warning'">{{ memoryBinding?.profileId ? "已配置" : "未配置" }}</Badge>
          </div>
          <RouterLink v-if="!memoryBinding?.profileId" class="v2-memory-link" to="/v2/settings/models">前往模型设置</RouterLink>
        </div>
      </section>

      <!-- Diagnostics -->
      <section class="v2-memory-section" aria-labelledby="v2-memory-diagnostics-title">
        <div class="v2-memory-section-head">
          <Database :size="16" aria-hidden="true" />
          <h2 id="v2-memory-diagnostics-title">高级诊断</h2>
        </div>
        <Button variant="secondary" size="sm" :loading="diagnosticsState === 'loading'" class="v2-memory-diagnostics-toggle" @click="toggleDiagnostics">
          {{ showDiagnostics ? "收起诊断" : "查看诊断" }}
        </Button>
        <div v-if="showDiagnostics" class="v2-memory-diagnostics">
          <div v-if="diagnosticsError" class="v2-memory-alert" role="alert">{{ diagnosticsError }}</div>
          <div v-else-if="diagnosticsState === 'loading'" class="v2-memory-loading">正在加载 Diagnostics…</div>
          <div v-else-if="diagnostics" class="v2-memory-diagnostics-grid">
            <div class="v2-memory-diagnostics-card">
              <h3>24h 运行</h3>
              <dl>
                <dt>Extraction Completed</dt>
                <dd>{{ diagnostics.extraction.completed }}</dd>
                <dt>Extraction Failed</dt>
                <dd>{{ diagnostics.extraction.failed }}</dd>
                <dt>Extraction Success Rate</dt>
                <dd>{{ optionalPercent(diagnostics.extraction.successRate) }}</dd>
                <dt>Consolidation Completed</dt>
                <dd>{{ diagnostics.consolidation.completed }}</dd>
                <dt>Consolidation Failed</dt>
                <dd>{{ diagnostics.consolidation.failed }}</dd>
              </dl>
            </div>
            <div class="v2-memory-diagnostics-card">
              <h3>Fact Ledger</h3>
              <dl>
                <dt>Fact Batch Count</dt>
                <dd>{{ diagnostics.facts.batchCount }}</dd>
                <dt>Fact Assertion Count</dt>
                <dd>{{ diagnostics.facts.assertionCount }}</dd>
              </dl>
            </div>
            <div class="v2-memory-diagnostics-card">
              <h3>Engine Consume</h3>
              <dl>
                <dt>Completed</dt>
                <dd>{{ diagnostics.engineConsume.completed }}</dd>
                <dt>Failed</dt>
                <dd>{{ diagnostics.engineConsume.failed }}</dd>
              </dl>
            </div>
            <div class="v2-memory-diagnostics-card">
              <h3>当前失败</h3>
              <dl>
                <dt>Failed Jobs</dt>
                <dd>{{ diagnostics.currentFailedJobs }}</dd>
              </dl>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.v2-memory-settings {
  display: grid;
  gap: var(--space-5);
}

.v2-memory-alert {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-sm);
}

.v2-memory-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.v2-memory-status.success {
  border-color: color-mix(in srgb, var(--success) 28%, var(--border));
}

.v2-memory-status.danger {
  border-color: color-mix(in srgb, var(--danger) 28%, var(--border));
}

.v2-memory-status h2 {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-lg);
}

.v2-memory-status p {
  margin: var(--space-1) 0 0;
  color: var(--muted);
  font-size: var(--text-sm);
}

.v2-memory-loading {
  color: var(--muted);
  font-size: var(--text-sm);
}

.v2-memory-section {
  display: grid;
  gap: var(--space-3);
}

.v2-memory-section-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--muted);
}

.v2-memory-section-head h2 {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.v2-memory-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-3);
}

.v2-memory-stat-card {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.v2-memory-stat-value {
  color: var(--text-strong);
  font-size: var(--text-xl);
  font-weight: 700;
}

.v2-memory-stat-label {
  color: var(--muted);
  font-size: var(--text-sm);
}

.v2-memory-stat-hint {
  color: var(--muted);
  font-size: var(--text-xs);
  line-height: 1.45;
}

.v2-memory-rows {
  display: grid;
  gap: 1px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--border);
  overflow: hidden;
}

.v2-memory-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--surface);
}

.v2-memory-row-label {
  flex: 0 0 auto;
  min-width: 100px;
  color: var(--muted);
  font-size: var(--text-sm);
  font-weight: 600;
}

.v2-memory-row-value {
  flex: 1 1 auto;
  color: var(--text-strong);
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}

.v2-memory-row-value.secondary {
  flex: 0 0 auto;
  color: var(--muted);
}

.v2-memory-runtime-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-3);
}

.v2-memory-runtime-card {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.v2-memory-runtime-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.v2-memory-runtime-head h3 {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-base);
}

.v2-memory-runtime-card dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-2) var(--space-3);
  margin: 0;
}

.v2-memory-runtime-card dt {
  color: var(--muted);
  font-size: var(--text-sm);
}

.v2-memory-runtime-card dd {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}

.v2-memory-engines {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-3);
}

.v2-memory-engine-card {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.v2-memory-engine-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.v2-memory-engine-head strong {
  color: var(--text-strong);
  font-size: var(--text-base);
}

.v2-memory-engine-id {
  color: var(--muted);
  font-size: var(--text-xs);
  font-family: ui-monospace, monospace;
}

.v2-memory-link {
  padding: var(--space-3) var(--space-4);
  background: var(--surface);
  color: var(--primary);
  font-size: var(--text-sm);
  font-weight: 600;
  text-decoration: none;
}

.v2-memory-link:hover {
  text-decoration: underline;
}

.v2-memory-diagnostics-toggle {
  justify-self: start;
}

.v2-memory-diagnostics {
  display: grid;
  gap: var(--space-3);
}

.v2-memory-diagnostics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-3);
}

.v2-memory-diagnostics-card {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.v2-memory-diagnostics-card h3 {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-base);
}

.v2-memory-diagnostics-card dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-2) var(--space-3);
  margin: 0;
}

.v2-memory-diagnostics-card dt {
  color: var(--muted);
  font-size: var(--text-sm);
}

.v2-memory-diagnostics-card dd {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-sm);
}

@media (max-width: 640px) {
  .v2-memory-engines {
    grid-template-columns: 1fr;
  }

  .v2-memory-status {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
