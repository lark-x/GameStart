<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Cpu, Database, RefreshCw, Sparkles } from "@lucide/vue";
import type { V2ModelBindingDto } from "@living-network/contracts/v2";
import Badge from "../../components/ui/Badge.vue";
import Button from "../../components/ui/Button.vue";
import PageHeader from "../../components/layout/PageHeader.vue";
import { createV2PlatformClient, V2PlatformClientError } from "../adapters/platform.ts";

const apiBase = (() => {
  const env = (import.meta as ImportMeta & { readonly env?: Record<string, string | undefined> }).env ?? {};
  return env.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3003" : window.location.origin);
})();

const client = createV2PlatformClient({ baseUrl: apiBase });
const bindings = ref<readonly V2ModelBindingDto[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const memoryBinding = computed(() => bindings.value.find((b) => b.capability === "memory"));

interface EngineInfo {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly mode: "primary" | "shadow" | "available";
}

const engines: readonly EngineInfo[] = [
  { id: "builtin_structured", label: "Structured", description: "基于实体和关系的结构化记忆存储，支持精确检索。", mode: "available" },
  { id: "builtin_hybrid", label: "Hybrid", description: "FTS 全文检索 + 实体索引的混合引擎。", mode: "available" },
];

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    bindings.value = await client.listModelBindings();
  } catch (err) {
    error.value = err instanceof V2PlatformClientError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : "加载失败";
  } finally {
    loading.value = false;
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
      description="长期记忆引擎配置与运行状态。记忆从对话中自动提取，用于增强后续对话的上下文理解。"
    >
      <template #actions>
        <Button variant="secondary" size="sm" :loading="loading" @click="load">
          <RefreshCw :size="14" aria-hidden="true" />
          刷新
        </Button>
      </template>
    </PageHeader>

    <div v-if="error" class="v2-memory-alert" role="alert">{{ error }}</div>

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
        <div class="v2-memory-row">
          <span class="v2-memory-row-label">用途</span>
          <span class="v2-memory-row-value">Memory Extraction / Consolidation</span>
        </div>
      </div>
    </section>

    <!-- Engine info -->
    <section class="v2-memory-section" aria-labelledby="v2-memory-engine-title">
      <div class="v2-memory-section-head">
        <Database :size="16" aria-hidden="true" />
        <h2 id="v2-memory-engine-title">记忆引擎</h2>
      </div>
      <div class="v2-memory-engines">
        <div v-for="engine in engines" :key="engine.id" class="v2-memory-engine-card">
          <div class="v2-memory-engine-head">
            <strong>{{ engine.label }}</strong>
            <Badge :tone="engine.mode === 'primary' ? 'success' : 'neutral'">
              {{ engine.mode === "primary" ? "内置" : engine.mode === "shadow" ? "影子" : "可用" }}
            </Badge>
          </div>
          <p class="v2-memory-engine-id">{{ engine.id }}</p>
          <p class="v2-memory-engine-desc">{{ engine.description }}</p>
        </div>
      </div>
    </section>

    <div class="v2-memory-note">
      <Sparkles :size="16" aria-hidden="true" />
      <span>记忆数据统计、Fact Extraction 状态和评估基准将在后续版本中提供。</span>
    </div>
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
  margin: 0;
  color: var(--muted);
  font-size: var(--text-xs);
  font-family: ui-monospace, monospace;
}

.v2-memory-engine-desc {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.v2-memory-note {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--muted);
  font-size: var(--text-sm);
}

@media (max-width: 640px) {
  .v2-memory-engines {
    grid-template-columns: 1fr;
  }
}
</style>
