<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Image as ImageIcon, Save, TestTube2 } from "@lucide/vue";
import type { V2PlatformCapabilities } from "@living-network/contracts/v2";
import Badge from "../../components/ui/Badge.vue";
import Button from "../../components/ui/Button.vue";
import Field from "../../components/ui/Field.vue";
import Input from "../../components/ui/Input.vue";
import PageHeader from "../../components/layout/PageHeader.vue";
import { platformErrorMessage, v2PlatformClient } from "./platform.ts";
import { useNotificationStore } from "../stores/notification.ts";

const client = v2PlatformClient();
const toast = useNotificationStore();
interface ImageForm {
  baseUrl: string;
  timeoutMs: string;
  defaultWorkflowVersion: string;
}

const settings = ref<ImageForm>({ baseUrl: "", timeoutMs: "30000", defaultWorkflowVersion: "" });
const capabilities = ref<V2PlatformCapabilities | null>(null);
const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
const error = ref<string | null>(null);

const isLocalhostHostNotice = computed(() => {
  const url = settings.value.baseUrl.toLowerCase().trim();
  return url.includes("localhost") || url.includes("127.0.0.1");
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const [loaded, nextCapabilities] = await Promise.all([
      client.getImageServiceSettings(),
      client.getCapabilities(),
    ]);
    settings.value = {
      baseUrl: loaded.baseUrl,
      timeoutMs: String(loaded.timeoutMs),
      defaultWorkflowVersion: loaded.defaultWorkflowVersion ?? "",
    };
    capabilities.value = nextCapabilities;
  } catch (err) {
    error.value = platformErrorMessage(err, "无法读取图片服务设置");
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  error.value = null;
  try {
    const saved = await client.saveImageServiceSettings({
      baseUrl: settings.value.baseUrl.trim(),
      timeoutMs: Number(settings.value.timeoutMs),
      ...(settings.value.defaultWorkflowVersion.trim() ? { defaultWorkflowVersion: settings.value.defaultWorkflowVersion.trim() } : {}),
    });
    settings.value = {
      baseUrl: saved.baseUrl,
      timeoutMs: String(saved.timeoutMs),
      defaultWorkflowVersion: saved.defaultWorkflowVersion ?? "",
    };
    toast.success("图片服务设置已保存。");
    capabilities.value = await client.getCapabilities();
  } catch (err) {
    error.value = platformErrorMessage(err, "保存图片服务设置失败");
  } finally {
    saving.value = false;
  }
}

async function testConnection(): Promise<void> {
  testing.value = true;
  error.value = null;
  try {
    const check = await client.testImageServiceConnection();
    capabilities.value = await client.getCapabilities();
    if (check.connection === "ok") {
      toast.success("ComfyUI 连接测试成功。");
    } else {
      error.value = `ComfyUI 连接测试失败：${check.errorMessage ?? "未知错误"}`;
    }
  } catch (err) {
    error.value = platformErrorMessage(err, "测试 ComfyUI 连接失败");
  } finally {
    testing.value = false;
  }
}

function statusLabel(value: string | undefined): string {
  if (value === "complete") return "配置完整";
  if (value === "incomplete") return "配置缺失";
  if (value === "not-applicable") return "无需绑定";
  if (value === "ok") return "连接正常";
  if (value === "failed") return "连接失败";
  if (value === "checking") return "检测中";
  return "未测试";
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="v2-image-settings">
    <PageHeader

      title="ComfyUI"
      description="为素材生成配置 ComfyUI。地址为空时，素材生成功能保持未配置，不会误发起外部请求。"
    >
      <template #actions>
        <Badge :tone="settings.baseUrl ? 'success' : 'warning'">{{ settings.baseUrl ? "已配置" : "未配置" }}</Badge>
      </template>
    </PageHeader>

    <div v-if="error" class="v2-image-message v2-image-error" role="alert">{{ error }}</div>

    <section class="v2-image-card" aria-labelledby="v2-image-service-title">
      <div class="v2-image-card-icon"><ImageIcon :size="24" aria-hidden="true" /></div>
      <div class="v2-image-card-copy">
        <p class="v2-section-kicker">ComfyUI 连接</p>
        <h2 id="v2-image-service-title">本地或远程图片生成服务</h2>
        <p>配置会持久化到 V2 SQLite。密钥以外的连接信息会显示在这里，便于确认 Worker 实际使用的地址。</p>
        <div class="v2-capability-line">
          <Badge :tone="capabilities?.assetGeneration.enabled ? 'success' : 'warning'">
            {{ capabilities?.assetGeneration.enabled ? "环境已启用" : "环境已关闭" }}
          </Badge>
          <span>配置：{{ statusLabel(capabilities?.assetGeneration.configuration) }}</span>
          <span>连接：{{ statusLabel(capabilities?.assetGeneration.connection) }}</span>
        </div>
      </div>
    </section>

    <form class="v2-image-form" @submit.prevent="save">
      <Field for-id="v2-image-base-url" label="ComfyUI 地址" hint="例如 http://host.docker.internal:8188 或局域网地址 http://192.168.1.50:8188；留空表示暂不启用素材生成。">
        <Input id="v2-image-base-url" v-model="settings.baseUrl" placeholder="http://host.docker.internal:8188" :disabled="loading" />
        <div v-if="isLocalhostHostNotice" class="v2-image-docker-hint" role="note">
          <span>提示：GameStart API 运行在 Docker 容器中。如果 ComfyUI 运行在宿主机，请使用 <code>http://host.docker.internal:8188</code>；若在另一台主机（如 Windows GPU 机），请使用该机局域网 IP。</span>
        </div>
      </Field>
      <Field for-id="v2-image-timeout" label="请求超时（毫秒）">
        <Input id="v2-image-timeout" v-model="settings.timeoutMs" type="number" min="1" :disabled="loading" />
      </Field>
      <Field for-id="v2-image-workflow" label="默认工作流版本" hint="仅作为平台默认提示，具体任务仍以任务自身版本为准。">
        <Input id="v2-image-workflow" v-model="settings.defaultWorkflowVersion" placeholder="local-default@1" :disabled="loading" />
      </Field>
      <div class="v2-image-actions">
        <Button variant="primary" size="md" type="submit" :loading="saving">
          <Save :size="16" aria-hidden="true" />
          保存设置
        </Button>
        <Button variant="secondary" size="md" type="button" :disabled="loading" @click="load">
          <TestTube2 :size="16" aria-hidden="true" />
          重新读取
        </Button>
        <Button variant="secondary" size="md" type="button" :loading="testing" :disabled="loading || !settings.baseUrl.trim()" @click="testConnection">
          <TestTube2 :size="16" aria-hidden="true" />
          测试连接
        </Button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.v2-image-settings {
  display: grid;
  gap: var(--space-5);
}

.v2-image-card,
.v2-image-form {
  padding: var(--space-6);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.v2-image-card {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
}

.v2-image-card-icon {
  display: grid;
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--primary-soft);
  color: var(--primary);
}

.v2-image-card-copy {
  display: grid;
  gap: var(--space-2);
}

.v2-section-kicker {
  margin: 0;
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 800;
  letter-spacing: 0.08em;
}

.v2-image-card h2 {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-lg);
}

.v2-image-card p:last-child {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-sm);
  line-height: 1.6;
}

.v2-capability-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  color: var(--muted);
  font-size: var(--text-sm);
}

.v2-image-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 0.45fr);
  gap: var(--space-5);
  max-width: 720px;
}

.v2-image-form > :nth-child(3),
.v2-image-actions {
  grid-column: 1 / -1;
}

.v2-image-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.v2-image-message {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

.v2-image-error {
  background: var(--danger-soft);
  color: var(--danger);
}


@media (max-width: 640px) {
  .v2-image-form {
    grid-template-columns: 1fr;
  }
}
</style>
