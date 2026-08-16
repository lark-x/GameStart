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

const client = v2PlatformClient();
const health = ref<RuntimeHealth | null>(null);
const ready = ref<RuntimeReady | null>(null);
const capabilities = ref<V2PlatformCapabilities | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const apiBase = computed(() => {
  const env = (import.meta as ImportMeta & { readonly env?: Record<string, string | undefined> }).env ?? {};
  return env.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3002" : window.location.origin);
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
  try {
    const [nextHealth, nextReady, nextCapabilities] = await Promise.all([
      readJson<RuntimeHealth>("/api/v2/health"),
      readJson<RuntimeReady>("/api/v2/ready"),
      client.getCapabilities(),
    ]);
    health.value = nextHealth;
    ready.value = nextReady;
    capabilities.value = nextCapabilities;
  } catch (err) {
    error.value = platformErrorMessage(err, "无法读取运行状态");
  } finally {
    loading.value = false;
  }
}

function capabilityTone(value: boolean | undefined): "success" | "warning" {
  return value ? "success" : "warning";
}

function capabilityLabel(value: boolean | undefined): string {
  return value ? "可用" : "不可用";
}

function statusText(value: string | undefined): string {
  return value ?? "-";
}

onMounted(() => {
  void refresh();
});
</script>

<template>
  <div class="v2-runtime-status">
    <PageHeader
      eyebrow="外部服务 / 运行状态"
      title="V2 运行状态"
      description="检查 API、SQLite 和外部生成能力的当前可观察状态。"
    >
      <template #actions>
        <Button variant="secondary" size="md" :loading="loading" @click="refresh">
          <RefreshCw :size="16" aria-hidden="true" />
          刷新
        </Button>
      </template>
    </PageHeader>

    <div v-if="error" class="v2-runtime-alert" role="alert">{{ error }}</div>

    <section class="v2-runtime-grid" aria-label="运行状态">
      <article class="v2-runtime-card">
        <div class="v2-runtime-card-head">
          <Server :size="22" aria-hidden="true" />
          <h2>API 健康</h2>
        </div>
        <Badge :tone="health?.ok ? 'success' : 'warning'">{{ health?.ok ? "正常" : "未知" }}</Badge>
        <p>版本：{{ health?.version ?? "-" }}</p>
      </article>

      <article class="v2-runtime-card">
        <div class="v2-runtime-card-head">
          <Database :size="22" aria-hidden="true" />
          <h2>持久化</h2>
        </div>
        <Badge :tone="ready?.ok ? 'success' : 'warning'">{{ ready?.ok ? "就绪" : "未就绪" }}</Badge>
        <p>存储：{{ ready?.storage ?? "-" }}</p>
      </article>

      <article class="v2-runtime-card">
        <div class="v2-runtime-card-head">
          <ShieldCheck :size="22" aria-hidden="true" />
          <h2>模型生成</h2>
        </div>
        <Badge :tone="capabilityTone(capabilities?.sceneGeneration.configured)">
          {{ capabilityLabel(capabilities?.sceneGeneration.configured) }}
        </Badge>
        <p>来源：{{ capabilities?.sceneGeneration.source ?? "none" }}</p>
        <p>开关：{{ capabilities?.sceneGeneration.enabled ? "enabled" : "disabled" }}</p>
        <p>配置：{{ statusText(capabilities?.sceneGeneration.configuration) }}</p>
        <p>绑定：{{ statusText(capabilities?.sceneGeneration.binding) }}</p>
        <p>连接：{{ statusText(capabilities?.sceneGeneration.connection) }}</p>
      </article>

      <article class="v2-runtime-card">
        <div class="v2-runtime-card-head">
          <Activity :size="22" aria-hidden="true" />
          <h2>素材生成</h2>
        </div>
        <Badge :tone="capabilityTone(capabilities?.assetGeneration.configured)">
          {{ capabilityLabel(capabilities?.assetGeneration.configured) }}
        </Badge>
        <p>来源：{{ capabilities?.assetGeneration.source ?? "none" }}</p>
        <p>开关：{{ capabilities?.assetGeneration.enabled ? "enabled" : "disabled" }}</p>
        <p>配置：{{ statusText(capabilities?.assetGeneration.configuration) }}</p>
        <p>连接：{{ statusText(capabilities?.assetGeneration.connection) }}</p>
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
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-5);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.v2-runtime-card-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--primary);
}

.v2-runtime-card h2 {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-lg);
}

.v2-runtime-card p {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-sm);
}

@media (max-width: 720px) {
  .v2-runtime-grid {
    grid-template-columns: 1fr;
  }
}
</style>
