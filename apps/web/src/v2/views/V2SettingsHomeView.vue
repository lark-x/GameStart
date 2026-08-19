<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  Activity,
  AlertTriangle,
  Cpu,
  Image as ImageIcon,
  Palette,
  Terminal,
} from "@lucide/vue";
import { RouterLink } from "vue-router";
import { useTheme } from "../../lib/theme";
import type { V2ModelBindingDto, V2PlatformCapabilities } from "@living-network/contracts/v2";
import type { V2RuntimeHealth, V2RuntimeReady } from "../adapters/platform.ts";
import { createV2PlatformClient, V2PlatformClientError } from "../adapters/platform.ts";

const apiBase = (() => {
  const env = (import.meta as ImportMeta & { readonly env?: Record<string, string | undefined> }).env ?? {};
  return env.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3002" : window.location.origin);
})();

const client = createV2PlatformClient({ baseUrl: apiBase });
const { currentThemeMeta } = useTheme();

const health = ref<V2RuntimeHealth | null>(null);
const ready = ref<V2RuntimeReady | null>(null);
const capabilities = ref<V2PlatformCapabilities | null>(null);
const bindings = ref<readonly V2ModelBindingDto[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

function platformErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof V2PlatformClientError) return `${err.code}: ${err.message}`;
  return err instanceof Error ? err.message : fallback;
}

interface StatusRow {
  readonly label: string;
  readonly value: string;
  readonly tone: "success" | "warning" | "danger" | "neutral";
  readonly to?: string;
}

interface StatusSection {
  readonly label: string;
  readonly icon: typeof Activity;
  readonly rows: readonly StatusRow[];
}

const sections = computed<readonly StatusSection[]>(() => {
  const caps = capabilities.value;
  const chatBinding = bindings.value.find((b) => b.capability === "chat");
  const sceneBinding = bindings.value.find((b) => b.capability === "scene_generation");
  const memoryBinding = bindings.value.find((b) => b.capability === "memory");
  const storyBinding = bindings.value.find((b) => b.capability === "story_analysis");

  const apiOk = health.value?.ok;
  const storageOk = ready.value?.ok;
  const assetOk = caps?.assetGeneration.configured;

  return [
    {
      label: "系统",
      icon: Terminal,
      rows: [
        { label: "API", value: apiOk ? `正常${health.value?.version ? ` (v${health.value.version})` : ""}` : "未连接", tone: apiOk ? "success" : "danger" },
        { label: "数据库", value: storageOk ? `就绪${ready.value?.storage ? ` (${ready.value.storage})` : ""}` : "未就绪", tone: storageOk ? "success" : "danger" },
      ],
    },
    {
      label: "AI",
      icon: Cpu,
      rows: [
        { label: "对话", value: chatBinding?.profileName ?? "未绑定", tone: chatBinding?.profileId ? "success" : "warning", to: "/v2/settings/models" },
        { label: "场景生成", value: sceneBinding?.profileName ?? "未绑定", tone: sceneBinding?.profileId ? "success" : "warning", to: "/v2/settings/models" },
        { label: "记忆", value: memoryBinding?.profileName ?? "未绑定", tone: memoryBinding?.profileId ? "success" : "neutral", to: "/v2/settings/models" },
        { label: "剧情分析", value: storyBinding?.profileName ?? "未绑定", tone: storyBinding?.profileId ? "success" : "neutral", to: "/v2/settings/models" },
      ],
    },
    {
      label: "生成",
      icon: ImageIcon,
      rows: [
        { label: "ComfyUI", value: assetOk ? "已配置" : "未配置", tone: assetOk ? "success" : "neutral", to: "/v2/settings/comfyui" },
        { label: "连接状态", value: connectionLabel(caps?.assetGeneration.connection), tone: connectionTone(caps?.assetGeneration.connection), to: "/v2/settings/comfyui" },
      ],
    },
    {
      label: "界面",
      icon: Palette,
      rows: [
        { label: "主题", value: `${currentThemeMeta.value.symbol} ${currentThemeMeta.value.label}`, tone: "success", to: "/v2/settings/appearance" },
      ],
    },
  ];
});

const warnings = computed(() => {
  const items: { readonly label: string; readonly to: string }[] = [];
  const caps = capabilities.value;
  if (!health.value?.ok) items.push({ label: "API 未连接", to: "/v2/settings/runtime" });
  if (!ready.value?.ok) items.push({ label: "数据库未就绪", to: "/v2/settings/runtime" });
  if (caps?.sceneGeneration.connection === "failed") items.push({ label: "场景生成连接失败", to: "/v2/settings/models" });
  if (caps?.assetGeneration.connection === "failed") items.push({ label: "ComfyUI 连接失败", to: "/v2/settings/comfyui" });
  const chatBinding = bindings.value.find((b) => b.capability === "chat");
  if (!chatBinding?.profileId) items.push({ label: "对话模型未绑定", to: "/v2/settings/models" });
  return items;
});

function connectionLabel(value: string | undefined): string {
  if (value === "ok") return "连接正常";
  if (value === "failed") return "连接失败";
  if (value === "checking") return "检测中";
  return "未测试";
}

function connectionTone(value: string | undefined): "success" | "warning" | "danger" | "neutral" {
  if (value === "ok") return "success";
  if (value === "failed") return "danger";
  if (value === "checking") return "warning";
  return "neutral";
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const [nextHealth, nextReady, nextCapabilities, nextBindings] = await Promise.all([
      client.getHealth().catch(() => null),
      client.getReady().catch(() => null),
      client.getCapabilities().catch(() => null),
      client.listModelBindings().catch(() => []),
    ]);
    health.value = nextHealth;
    ready.value = nextReady;
    capabilities.value = nextCapabilities;
    bindings.value = nextBindings;
  } catch (err) {
    error.value = platformErrorMessage(err, "无法读取设置概览");
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="v2-settings-overview">
    <div v-if="error" class="v2-overview-alert" role="alert">{{ error }}</div>

    <section v-if="warnings.length" class="v2-overview-warnings" aria-label="需要处理">
      <div class="v2-overview-warnings-head">
        <AlertTriangle :size="16" aria-hidden="true" />
        <span>{{ warnings.length }} 项需要处理</span>
      </div>
      <div class="v2-overview-warnings-list">
        <RouterLink v-for="w in warnings" :key="w.label" :to="w.to" class="v2-overview-warning-item">
          <span>{{ w.label }}</span>
          <span class="v2-overview-warning-action">去配置 →</span>
        </RouterLink>
      </div>
    </section>

    <section v-for="section in sections" :key="section.label" class="v2-overview-section" :aria-label="section.label">
      <div class="v2-overview-section-head">
        <component :is="section.icon" :size="16" aria-hidden="true" />
        <h2>{{ section.label }}</h2>
      </div>
      <div class="v2-overview-rows">
        <component
          :is="row.to ? RouterLink : 'div'"
          v-for="row in section.rows"
          :key="row.label"
          :to="row.to"
          class="v2-overview-row"
        >
          <span class="v2-overview-row-label">{{ row.label }}</span>
          <span class="v2-overview-row-dot" :class="`v2-overview-row-dot-${row.tone}`" aria-hidden="true" />
          <span class="v2-overview-row-value">{{ row.value }}</span>
        </component>
      </div>
    </section>
  </div>
</template>

<style scoped>
.v2-settings-overview {
  display: grid;
  gap: var(--space-5);
}

.v2-overview-alert {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-sm);
}

.v2-overview-warnings {
  padding: var(--space-4);
  border: 1px solid var(--warning);
  border-radius: var(--radius-lg);
  background: var(--warning-soft, var(--surface));
}

.v2-overview-warnings-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  color: var(--warning);
  font-size: var(--text-sm);
  font-weight: 700;
}

.v2-overview-warnings-list {
  display: grid;
  gap: 1px;
}

.v2-overview-warning-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  color: inherit;
  text-decoration: none;
  font-size: var(--text-sm);
  transition: background var(--motion-fast);
}

.v2-overview-warning-item:hover {
  background: var(--surface);
}

.v2-overview-warning-action {
  color: var(--primary);
  font-weight: 600;
  font-size: var(--text-xs);
}

.v2-overview-section {
  display: grid;
  gap: var(--space-3);
}

.v2-overview-section-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--muted);
}

.v2-overview-section-head h2 {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.v2-overview-rows {
  display: grid;
  gap: 1px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--border);
  overflow: hidden;
}

.v2-overview-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--surface);
  color: inherit;
  text-decoration: none;
  transition: background var(--motion-fast);
}

a.v2-overview-row:hover {
  background: var(--primary-soft);
}

.v2-overview-row-label {
  flex: 0 0 auto;
  min-width: 100px;
  color: var(--muted);
  font-size: var(--text-sm);
  font-weight: 600;
}

.v2-overview-row-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.v2-overview-row-dot-success {
  background: var(--success);
}

.v2-overview-row-dot-warning {
  background: var(--warning);
}

.v2-overview-row-dot-danger {
  background: var(--danger);
}

.v2-overview-row-dot-neutral {
  background: var(--muted);
  opacity: 0.4;
}

.v2-overview-row-value {
  flex: 1 1 auto;
  color: var(--text-strong);
  font-size: var(--text-sm);
}

@media (max-width: 640px) {
  .v2-overview-row {
    padding: var(--space-2) var(--space-3);
  }
}
</style>
