<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Activity, Database, RefreshCw, Server, ShieldCheck } from "@lucide/vue";

import Badge from "../../components/ui/Badge.vue";
import Button from "../../components/ui/Button.vue";
import PageHeader from "../../components/layout/PageHeader.vue";
import type { V2PlatformCapabilities } from "@living-network/contracts/v2";
import { platformErrorMessage, v2PlatformClient } from "./platform.ts";

interface RuntimeHealth {
  readonly ok?: boolean;
  readonly version?: string;
}

interface RuntimeReady {
  readonly ok?: boolean;
  readonly version?: string;
  readonly storage?: string;
}

type LoadState = "idle" | "loading" | "ready" | "error";

const client = v2PlatformClient();
const health = ref<RuntimeHealth | null>(null);
const ready = ref<RuntimeReady | null>(null);
const capabilities = ref<V2PlatformCapabilities | null>(null);
const healthState = ref<LoadState>("idle");
const readyState = ref<LoadState>("idle");
const capabilitiesState = ref<LoadState>("idle");
const loading = ref(false);
const error = ref<string | null>(null);

const apiBase = computed(() => {
  const env = (import.meta as ImportMeta & { readonly env?: Record<string, string | undefined> }).env ?? {};
  return env.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3003" : window.location.origin);
});

async function readJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase.value.replace(/\/$/, "")}${path}`, { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error?.message === "string" ? payload.error.message : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

async function refresh(): Promise<void> {
  loading.value = true;
  error.value = null;
  healthState.value = "loading";
  readyState.value = "loading";
  capabilitiesState.value = "loading";
  try {
    const [nextHealth, nextReady, nextCapabilities] = await Promise.all([
      readJson<RuntimeHealth>("/api/v2/health"),
      readJson<RuntimeReady>("/api/v2/ready"),
      client.getCapabilities(),
    ]);
    health.value = nextHealth;
    ready.value = nextReady;
    capabilities.value = nextCapabilities;
    healthState.value = "ready";
    readyState.value = "ready";
    capabilitiesState.value = "ready";
  } catch (err) {
    error.value = platformErrorMessage(err, "无法读取运行状态");
    healthState.value = "error";
    readyState.value = "error";
    capabilitiesState.value = "error";
  } finally {
    loading.value = false;
  }
}

/** API card: loading shows "读取中", error shows "读取失败", only ready shows real state. */
function apiBadgeTone(state: LoadState, ok: boolean | undefined): "success" | "danger" | "warning" {
  if (state === "error") return "danger";
  if (state !== "ready") return "warning";
  return ok ? "success" : "danger";
}

function apiBadgeLabel(state: LoadState, ok: boolean | undefined): string {
  if (state === "error") return "读取失败";
  if (state !== "ready") return "读取中";
  return ok ? "正常" : "未连接";
}

/** Capability card: only show "不可用" when data is actually loaded. */
function capabilityStateTone(state: LoadState, value: boolean | undefined): "success" | "warning" | "neutral" {
  if (state === "error") return "neutral";
  if (state !== "ready") return "neutral";
  return value ? "success" : "warning";
}

function capabilityStateLabel(state: LoadState, value: boolean | undefined): string {
  if (state === "error") return "读取失败";
  if (state !== "ready") return "读取中";
  return value ? "可用" : "不可用";
}

function sourceLabel(value: string | undefined): string {
  if (value === "profile") return "模型档案";
  if (value === "environment") return "环境变量";
  if (value === "settings") return "平台设置";
  if (value === "none") return "未配置";
  return value ?? "-";
}

function configurationLabel(value: string | undefined): string {
  if (value === "complete") return "配置完整";
  if (value === "incomplete") return "配置缺失";
  return value ?? "-";
}

function bindingLabel(value: string | undefined): string {
  if (value === "bound") return "已绑定";
  if (value === "unbound") return "未绑定";
  if (value === "not-applicable") return "无需绑定";
  return value ?? "-";
}

function connectionLabel(value: string | undefined): string {
  if (value === "ok") return "连接正常";
  if (value === "failed") return "连接失败";
  if (value === "checking") return "检测中";
  if (value === "untested") return "未测试";
  return value ?? "-";
}

function connectionTone(value: string | undefined): "success" | "danger" | "warning" | "neutral" {
  if (value === "ok") return "success";
  if (value === "failed") return "danger";
  if (value === "checking") return "warning";
  return "neutral";
}

onMounted(() => {
  void refresh();
});
</script>

<template>
  <div class="v2-runtime-status">
    <PageHeader
      title="Runtime"
      description="检查 API、SQLite 和外部生成能力的当前状态。"
    >
      <template #actions>
        <Button variant="secondary" size="sm" :loading="loading" @click="refresh">
          <RefreshCw :size="14" aria-hidden="true" />
          刷新
        </Button>
      </template>
    </PageHeader>

    <div v-if="error" class="v2-runtime-alert" role="alert">{{ error }}</div>

    <section class="v2-runtime-grid" aria-label="运行状态">
      <article class="v2-runtime-card">
        <div class="v2-runtime-card-head">
          <Server :size="18" aria-hidden="true" />
          <h3>API</h3>
        </div>
        <Badge :tone="apiBadgeTone(healthState, health?.ok)">{{ apiBadgeLabel(healthState, health?.ok) }}</Badge>
        <p v-if="healthState === 'ready' && health?.version">版本 {{ health.version }}</p>
      </article>

      <article class="v2-runtime-card">
        <div class="v2-runtime-card-head">
          <Database :size="18" aria-hidden="true" />
          <h3>数据库</h3>
        </div>
        <Badge :tone="apiBadgeTone(readyState, ready?.ok)">{{ apiBadgeLabel(readyState, ready?.ok) }}</Badge>
        <p v-if="readyState === 'ready' && ready?.storage">{{ ready.storage }}</p>
      </article>

      <article class="v2-runtime-card">
        <div class="v2-runtime-card-head">
          <ShieldCheck :size="18" aria-hidden="true" />
          <h3>模型生成</h3>
        </div>
        <Badge :tone="capabilityStateTone(capabilitiesState, capabilities?.sceneGeneration.configured)">
          {{ capabilityStateLabel(capabilitiesState, capabilities?.sceneGeneration.configured) }}
        </Badge>
        <div v-if="capabilitiesState === 'ready'" class="v2-runtime-card-details">
          <p>来源：{{ sourceLabel(capabilities?.sceneGeneration.source) }}</p>
          <p>状态：{{ capabilities?.sceneGeneration.enabled ? "已启用" : "已禁用" }}</p>
          <p>配置：{{ configurationLabel(capabilities?.sceneGeneration.configuration) }}</p>
          <p>绑定：{{ bindingLabel(capabilities?.sceneGeneration.binding) }}</p>
          <p>连接：<span :class="`v2-runtime-conn-${connectionTone(capabilities?.sceneGeneration.connection)}`">{{ connectionLabel(capabilities?.sceneGeneration.connection) }}</span></p>
        </div>
        <p v-else class="v2-runtime-card-details">{{ capabilitiesState === "error" ? "状态读取失败" : "正在读取..." }}</p>
      </article>

      <article class="v2-runtime-card">
        <div class="v2-runtime-card-head">
          <Activity :size="18" aria-hidden="true" />
          <h3>素材生成</h3>
        </div>
        <Badge :tone="capabilityStateTone(capabilitiesState, capabilities?.assetGeneration.configured)">
          {{ capabilityStateLabel(capabilitiesState, capabilities?.assetGeneration.configured) }}
        </Badge>
        <div v-if="capabilitiesState === 'ready'" class="v2-runtime-card-details">
          <p>来源：{{ sourceLabel(capabilities?.assetGeneration.source) }}</p>
          <p>状态：{{ capabilities?.assetGeneration.enabled ? "已启用" : "已禁用" }}</p>
          <p>配置：{{ configurationLabel(capabilities?.assetGeneration.configuration) }}</p>
          <p>连接：<span :class="`v2-runtime-conn-${connectionTone(capabilities?.assetGeneration.connection)}`">{{ connectionLabel(capabilities?.assetGeneration.connection) }}</span></p>
        </div>
        <p v-else class="v2-runtime-card-details">{{ capabilitiesState === "error" ? "状态读取失败" : "正在读取..." }}</p>
      </article>
    </section>
  </div>
</template>

<style scoped>
.v2-runtime-status {
  display: grid;
  gap: var(--space-5);
}

.v2-runtime-alert {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-sm);
}

.v2-runtime-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.v2-runtime-card {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.v2-runtime-card-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--primary);
}

.v2-runtime-card h3 {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-base);
}

.v2-runtime-card p {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-sm);
}

.v2-runtime-card-details {
  display: grid;
  gap: var(--space-1);
  padding-top: var(--space-2);
  border-top: 1px solid var(--border);
}

.v2-runtime-conn-success {
  color: var(--success);
}

.v2-runtime-conn-danger {
  color: var(--danger);
}

.v2-runtime-conn-warning {
  color: var(--warning);
}

.v2-runtime-conn-neutral {
  color: var(--muted);
}

@media (max-width: 720px) {
  .v2-runtime-grid {
    grid-template-columns: 1fr;
  }
}
</style>
