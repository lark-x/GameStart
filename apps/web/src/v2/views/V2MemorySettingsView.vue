<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Cpu, Database, RefreshCw, Sparkles } from "@lucide/vue";
import type { V2MemoryOverviewDto, V2ModelBindingDto } from "@living-network/contracts/v2";
import Badge from "../../components/ui/Badge.vue";
import Button from "../../components/ui/Button.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import PageHeader from "../../components/layout/PageHeader.vue";
import { createV2PlatformClient, V2PlatformClientError } from "../adapters/platform.ts";

const apiBase = (() => {
  const env = (import.meta as ImportMeta & { readonly env?: Record<string, string | undefined> }).env ?? {};
  return env.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3003" : window.location.origin);
})();

const client = createV2PlatformClient({ baseUrl: apiBase });

type LoadState = "idle" | "loading" | "ready" | "error";

const bindings = ref<readonly V2ModelBindingDto[]>([]);
const overview = ref<V2MemoryOverviewDto | null>(null);
const loadState = ref<LoadState>("idle");
const error = ref<string | null>(null);

const memoryBinding = computed(() => bindings.value.find((b) => b.capability === "memory"));

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
      <section class="v2-memory-section" aria-labelledby="v2-memory-overview-title">
        <div class="v2-memory-section-head">
          <Sparkles :size="16" aria-hidden="true" />
          <h2 id="v2-memory-overview-title">运行概览</h2>
        </div>
        <div class="v2-memory-stat-grid">
          <div class="v2-memory-stat-card">
            <span class="v2-memory-stat-value">{{ overview.facts.total }}</span>
            <span class="v2-memory-stat-label">活跃记忆</span>
          </div>
          <div class="v2-memory-stat-card">
            <span class="v2-memory-stat-value">{{ overview.facts.relatedCharacterCount }}</span>
            <span class="v2-memory-stat-label">关联角色</span>
          </div>
          <div class="v2-memory-stat-card">
            <span class="v2-memory-stat-value">{{ percent(overview.facts.averageImportance) }}</span>
            <span class="v2-memory-stat-label">平均重要度</span>
          </div>
          <div class="v2-memory-stat-card">
            <span class="v2-memory-stat-value">{{ percent(overview.facts.averageConfidence) }}</span>
            <span class="v2-memory-stat-label">平均置信度</span>
          </div>
        </div>
      </section>

      <!-- Type distribution -->
      <section v-if="overview.facts.typeDistribution.length > 0" class="v2-memory-section" aria-labelledby="v2-memory-kind-title">
        <div class="v2-memory-section-head">
          <Database :size="16" aria-hidden="true" />
          <h2 id="v2-memory-kind-title">类型分布</h2>
        </div>
        <div class="v2-memory-rows">
          <div v-for="item in overview.facts.typeDistribution" :key="item.kind" class="v2-memory-row">
            <span class="v2-memory-row-label">{{ kindLabel(item.kind) }}</span>
            <span class="v2-memory-row-value">{{ item.count }} 条</span>
          </div>
        </div>
      </section>

      <!-- Recent runs -->
      <section class="v2-memory-section" aria-labelledby="v2-memory-runs-title">
        <div class="v2-memory-section-head">
          <Cpu :size="16" aria-hidden="true" />
          <h2 id="v2-memory-runs-title">最近运行</h2>
        </div>
        <div class="v2-memory-rows">
          <div class="v2-memory-row">
            <span class="v2-memory-row-label">提取</span>
            <Badge :tone="statusTone(overview.extraction.latest?.status)">{{ statusLabel(overview.extraction.latest?.status) }}</Badge>
            <span class="v2-memory-row-value">最近：{{ formatTime(overview.extraction.latest?.updatedAt) }}</span>
          </div>
          <div v-if="overview.extraction.latest?.status === 'failed'" class="v2-memory-row">
            <span class="v2-memory-row-label">提取失败</span>
            <Badge tone="danger">失败</Badge>
            <span class="v2-memory-row-value">{{ overview.extraction.latest.error ?? "未知错误" }}</span>
          </div>
          <div v-else-if="overview.extraction.latestFailure" class="v2-memory-row">
            <span class="v2-memory-row-label">最近一次失败</span>
            <Badge tone="neutral">历史</Badge>
            <span class="v2-memory-row-value">{{ formatTime(overview.extraction.latestFailure.updatedAt) }} · {{ overview.extraction.latestFailure.error ?? "未知错误" }}</span>
          </div>
          <div class="v2-memory-row">
            <span class="v2-memory-row-label">整合</span>
            <Badge :tone="statusTone(overview.consolidation.latest?.status)">{{ statusLabel(overview.consolidation.latest?.status) }}</Badge>
            <span class="v2-memory-row-value">最近：{{ formatTime(overview.consolidation.latest?.updatedAt) }}</span>
          </div>
          <div v-if="overview.consolidation.latest?.status === 'failed'" class="v2-memory-row">
            <span class="v2-memory-row-label">整合失败</span>
            <Badge tone="danger">失败</Badge>
            <span class="v2-memory-row-value">{{ overview.consolidation.latest.error ?? "未知错误" }}</span>
          </div>
          <div v-else-if="overview.consolidation.latestFailure" class="v2-memory-row">
            <span class="v2-memory-row-label">最近一次失败</span>
            <Badge tone="neutral">历史</Badge>
            <span class="v2-memory-row-value">{{ formatTime(overview.consolidation.latestFailure.updatedAt) }} · {{ overview.consolidation.latestFailure.error ?? "未知错误" }}</span>
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
            <span class="v2-memory-row-value">{{ failure.error ?? "未知错误" }}</span>
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
              <strong>{{ engine.id }}</strong>
              <Badge :tone="engine.mode === 'primary' ? 'success' : 'neutral'">
                {{ engine.mode === "primary" ? "主引擎" : "影子引擎" }}
              </Badge>
            </div>
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
  font-family: ui-monospace, monospace;
}

@media (max-width: 640px) {
  .v2-memory-engines {
    grid-template-columns: 1fr;
  }
}
</style>
