<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowLeft, Copy, Download, Save, Sparkles, Trash2, Wifi } from "@lucide/vue";
import type {
  V2ModelBindingDto,
  V2ModelProfileDto,
  V2ModelProtocol,
  V2SaveModelProfileRequest,
} from "@living-network/contracts/v2";

import Badge from "../../components/ui/Badge.vue";
import Button from "../../components/ui/Button.vue";
import Checkbox from "../../components/ui/Checkbox.vue";
import Field from "../../components/ui/Field.vue";
import Input from "../../components/ui/Input.vue";
import PageHeader from "../../components/layout/PageHeader.vue";
import Select from "../../components/ui/Select.vue";
import { platformErrorMessage, v2PlatformClient } from "./platform.ts";
import { useNotificationStore } from "../stores/notification.ts";
import { modalityLabel, providerLabel, MODEL_PRESETS, type ModelPreset } from "./models-view-model.ts";

interface ModelForm {
  readonly id?: string | undefined;
  readonly sourceProfileId?: string | undefined;
  name: string;
  protocol: V2ModelProtocol;
  baseUrl: string;
  model: string;
  timeoutMs: string;
  maxTokens: string;
  contextWindow: string;
  inputModalities: string[];
  temperature: string;
  apiKey: string;
}

const route = useRoute();
const router = useRouter();
const client = v2PlatformClient();
const toast = useNotificationStore();

const profiles = ref<readonly V2ModelProfileDto[]>([]);
const bindings = ref<readonly V2ModelBindingDto[]>([]);
const form = ref<ModelForm>(emptyForm());
const loading = ref(true);
const saving = ref(false);
const testing = ref(false);
const deleting = ref(false);
const fetchingModels = ref(false);
const discoveredModels = ref<readonly string[]>([]);
const modelFilter = ref("");
const fetchModelError = ref<string | null>(null);
const error = ref<string | null>(null);
const testMessage = ref<string | null>(null);
const testStatus = ref<"idle" | "testing" | "success" | "error">("idle");
const draftNotice = ref<string | null>(null);
const advancedOpen = ref(false);

function emptyForm(): ModelForm {
  return {
    name: "",
    protocol: "openai-compatible",
    baseUrl: "",
    model: "",
    timeoutMs: "30000",
    maxTokens: "4096",
    contextWindow: "8192",
    inputModalities: ["text"],
    temperature: "0.2",
    apiKey: "",
  };
}

const AVAILABLE_MODALITIES: readonly { readonly value: string; readonly label: string; readonly required?: boolean }[] = [
  { value: "text", label: "文本", required: true },
  { value: "image", label: "图片" },
];

function toggleModality(value: string): void {
  if (value === "text") return;
  const idx = form.value.inputModalities.indexOf(value);
  form.value.inputModalities = idx >= 0
    ? form.value.inputModalities.filter((m) => m !== value)
    : [...form.value.inputModalities, value];
}

const editing = computed(() => form.value.id !== undefined);
const usedBy = computed(() => {
  if (form.value.id === undefined) return [];
  return bindings.value.filter((binding) => binding.profileId === form.value.id).map((binding) => binding.capability);
});
const filteredDiscoveredModels = computed(() => {
  if (!modelFilter.value.trim()) return discoveredModels.value;
  const q = modelFilter.value.toLowerCase().trim();
  return discoveredModels.value.filter((m) => m.toLowerCase().includes(q));
});

function selectProfile(profile: V2ModelProfileDto): void {
  form.value = {
    id: profile.id,
    name: profile.name,
    protocol: profile.protocol,
    baseUrl: profile.baseUrl,
    model: profile.model,
    timeoutMs: String(profile.timeoutMs),
    maxTokens: String(profile.maxTokens),
    contextWindow: profile.contextWindow !== undefined ? String(profile.contextWindow) : "8192",
    inputModalities: profile.inputModalities && profile.inputModalities.length > 0 ? [...profile.inputModalities] : ["text"],
    temperature: String(profile.temperature),
    apiKey: "",
  };
  testMessage.value = null;
  draftNotice.value = null;
  fetchModelError.value = null;
  discoveredModels.value = [];
  modelFilter.value = "";
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const [nextProfiles, nextBindings] = await Promise.all([client.listModelProfiles(), client.listModelBindings()]);
    profiles.value = nextProfiles;
    bindings.value = nextBindings;
    const raw = route.params.profileId;
    if (typeof raw === "string" && raw !== "new") {
      const found = nextProfiles.find((profile) => profile.id === raw);
      if (found !== undefined) selectProfile(found);
      else error.value = "找不到该模型档案。";
    }
  } catch (err) {
    error.value = platformErrorMessage(err, "无法读取模型档案");
  } finally {
    loading.value = false;
  }
}

function requestFromForm(): V2SaveModelProfileRequest {
  const modalities = form.value.inputModalities;
  return {
    name: form.value.name.trim(),
    protocol: form.value.protocol,
    baseUrl: form.value.baseUrl.trim(),
    model: form.value.model.trim(),
    timeoutMs: Number(form.value.timeoutMs),
    maxTokens: Number(form.value.maxTokens),
    temperature: Number(form.value.temperature),
    ...(form.value.contextWindow ? { contextWindow: Number(form.value.contextWindow) } : {}),
    ...(modalities.length > 0 ? { inputModalities: Array.from(new Set(["text", ...modalities])) } : { inputModalities: ["text"] }),
    ...(form.value.id === undefined ? {} : { id: form.value.id }),
    ...(form.value.apiKey.trim().length === 0 ? {} : { apiKey: form.value.apiKey.trim() }),
    ...(form.value.sourceProfileId && form.value.apiKey.trim().length === 0 ? { sourceProfileId: form.value.sourceProfileId } : {}),
  };
}

async function save(): Promise<void> {
  saving.value = true;
  error.value = null;
  try {
    const request = requestFromForm();
    const saved = await client.saveModelProfile(request);
    form.value.apiKey = "";
    toast.success(`模型档案“${saved.name}”已保存。`);
    if (form.value.id === undefined || form.value.id !== saved.id) {
      await router.replace(`/v2/settings/models/${encodeURIComponent(saved.id)}`);
    }
    await load();
    selectProfile(saved);
  } catch (err) {
    const message = platformErrorMessage(err, "保存模型档案失败");
    error.value = message.includes("SECRET_KEY_REQUIRED")
      ? "无法保存 API 密钥：服务器未配置 INTEGRATION_SECRET_KEY。请在仓库根目录 .env 中配置 Base64 编码的 32 字节密钥后重启 API。"
      : message;
  } finally {
    saving.value = false;
  }
}

async function test(): Promise<void> {
  if (form.value.id === undefined) return;
  testing.value = true;
  testStatus.value = "testing";
  error.value = null;
  testMessage.value = null;
  try {
    const result = await client.testModelProfile(form.value.id);
    const preview = typeof result.preview === "string" ? ` 返回：${result.preview}` : "";
    testMessage.value = `连接测试成功。${preview}`;
    testStatus.value = "success";
  } catch (err) {
    testMessage.value = platformErrorMessage(err, "连接测试失败");
    testStatus.value = "error";
  } finally {
    testing.value = false;
  }
}

async function remove(): Promise<void> {
  if (form.value.id === undefined || !window.confirm("确定删除这个模型档案吗？已绑定的档案需要先解除绑定。")) return;
  deleting.value = true;
  error.value = null;
  try {
    await client.deleteModelProfile(form.value.id);
    toast.success("模型档案已删除。");
    await router.push("/v2/settings/models");
  } catch (err) {
    error.value = platformErrorMessage(err, "删除模型档案失败");
  } finally {
    deleting.value = false;
  }
}

function duplicateProfile(): void {
  if (form.value.id === undefined) return;
  const originalId = form.value.id;
  const baseName = form.value.name.replace(/\s*\(副本\d*\)$/, "");
  form.value = {
    ...form.value,
    id: undefined,
    sourceProfileId: originalId,
    name: baseName + " (副本)",
    apiKey: "",
  };
  draftNotice.value = "已基于当前配置复制为新档案草稿，可直接修改模型名称后保存。";
}

async function fetchModels(): Promise<void> {
  if (!form.value.baseUrl.trim()) {
    fetchModelError.value = "请先填写 API 地址";
    return;
  }
  fetchingModels.value = true;
  fetchModelError.value = null;
  try {
    const apiKey = form.value.apiKey.trim();
    const models = await client.discoverModels({
      protocol: form.value.protocol,
      baseUrl: form.value.baseUrl.trim(),
      apiKey: apiKey.length > 0 ? apiKey : undefined,
      profileId: form.value.id || form.value.sourceProfileId,
    });
    discoveredModels.value = models;
    form.value.apiKey = "";
    if (models.length === 0) fetchModelError.value = "未能从该地址获取到模型列表，你可以手动输入模型名称。";
  } catch (err) {
    fetchModelError.value = platformErrorMessage(err, "获取模型列表失败");
  } finally {
    fetchingModels.value = false;
  }
}

function selectDiscoveredModel(modelId: string): void {
  form.value.model = modelId;
  if (!form.value.name || form.value.name.trim().length === 0) form.value.name = modelId;
}

function applyPreset(preset: ModelPreset): void {
  form.value = {
    id: form.value.id,
    sourceProfileId: form.value.sourceProfileId,
    name: form.value.name && form.value.name.trim() !== "" ? form.value.name : preset.name,
    protocol: preset.protocol,
    baseUrl: preset.baseUrl,
    model: preset.model,
    timeoutMs: preset.timeoutMs,
    maxTokens: preset.maxTokens,
    contextWindow: preset.contextWindow,
    inputModalities: [...preset.inputModalities],
    temperature: preset.temperature,
    apiKey: form.value.apiKey,
  };
  draftNotice.value = `已套用预设「${preset.name}」（${preset.provider}），请填入对应的 API Key 后保存。`;
}

function goBack(): void {
  void router.push("/v2/settings/models");
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="model-detail-page">
    <PageHeader
      :title="editing ? '模型档案详情' : '新建模型档案'"
      description="配置模型连接、输入能力与高级参数。"
    >
      <template #actions>
        <Button variant="secondary" size="md" @click="goBack">
          <ArrowLeft :size="15" aria-hidden="true" />
          返回
        </Button>
      </template>
    </PageHeader>

    <div v-if="error" class="model-detail-alert" role="alert">{{ error }}</div>
    <div v-if="loading" class="model-detail-alert" role="status">正在读取...</div>

    <div v-else class="model-detail-layout">
      <form class="model-detail-card" @submit.prevent="save">
        <!-- 快捷预设模版 -->
        <div class="model-presets-bar">
          <div class="model-presets-title">
            <Sparkles :size="13" aria-hidden="true" />
            <span>快捷预设模版（一键填入常用大模型配置）</span>
          </div>
          <div class="model-presets-chips">
            <button
              v-for="preset in MODEL_PRESETS"
              :key="preset.id"
              type="button"
              class="model-preset-btn"
              @click="applyPreset(preset)"
            >
              <strong>{{ preset.name }}</strong>
              <small>{{ preset.provider }}</small>
            </button>
          </div>
        </div>

        <fieldset class="model-form-section">
          <legend>基础配置</legend>
          <div class="model-form-grid">
            <Field for-id="v2-model-name" label="档案名称" required hint="例如：主创作模型">
              <Input id="v2-model-name" v-model="form.name" placeholder="例如：主创作模型" required />
            </Field>
            <Field for-id="v2-model-protocol" label="Provider">
              <Select id="v2-model-protocol" v-model="form.protocol">
                <option value="openai-compatible">OpenAI 兼容</option>
                <option value="anthropic">Anthropic</option>
              </Select>
            </Field>
            <Field for-id="v2-model-base-url" label="API 地址" required hint="例如 https://api.example.com/v1">
              <Input id="v2-model-base-url" v-model="form.baseUrl" placeholder="https://..." required />
            </Field>
            <Field for-id="v2-model-model" label="Model ID" required>
              <Input id="v2-model-model" v-model="form.model" placeholder="模型 ID" required />
            </Field>
            <Field for-id="v2-model-api-key" label="API 密钥" hint="留空表示保持已有密钥；新建时留空表示无密钥。">
              <Input id="v2-model-api-key" v-model="form.apiKey" type="password" placeholder="sk-..." autocomplete="new-password" />
            </Field>
          </div>
          <div class="model-discovery-actions">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              :loading="fetchingModels"
              :disabled="!form.baseUrl.trim()"
              @click="fetchModels"
            >
              <Download :size="13" aria-hidden="true" />
              获取模型列表
            </Button>
          </div>
          <div v-if="fetchModelError || discoveredModels.length > 0" class="model-discovery-area">
            <div v-if="fetchModelError" class="model-fetch-error" role="alert">{{ fetchModelError }}</div>
            <div v-if="discoveredModels.length > 0" class="discovered-models-box">
              <div class="box-head">
                <span class="box-title">可用模型 ({{ discoveredModels.length }})</span>
                <Input v-if="discoveredModels.length > 6" v-model="modelFilter" placeholder="过滤..." size="sm" />
              </div>
              <div class="models-pill-grid">
                <button
                  v-for="m in filteredDiscoveredModels"
                  :key="m"
                  type="button"
                  class="model-chip"
                  :class="{ active: form.model === m }"
                  @click="selectDiscoveredModel(m)"
                >
                  {{ m }}
                </button>
              </div>
            </div>
          </div>
        </fieldset>

        <fieldset class="model-form-section">
          <legend>输入能力</legend>
          <div class="model-modalities">
            <Checkbox
              v-for="mod in AVAILABLE_MODALITIES"
              :key="mod.value"
              :model-value="form.inputModalities.includes(mod.value)"
              :label="mod.required ? `${mod.label}（必需）` : mod.label"
              :disabled="mod.required === true"
              @update:model-value="toggleModality(mod.value)"
            />
          </div>
        </fieldset>

        <details class="model-form-section model-advanced" :open="advancedOpen" @toggle="advancedOpen = ($event.target as HTMLDetailsElement).open">
          <summary>高级配置</summary>
          <div class="model-form-grid">
            <Field for-id="v2-model-context-window" label="上下文窗口（Token）" hint="模型总上下文限制，默认 8192">
              <Input id="v2-model-context-window" v-model="form.contextWindow" type="number" min="1" />
            </Field>
            <Field for-id="v2-model-max-tokens" label="最大输出 Token">
              <Input id="v2-model-max-tokens" v-model="form.maxTokens" type="number" min="1" />
            </Field>
            <Field for-id="v2-model-temperature" label="温度（0 - 2）">
              <Input id="v2-model-temperature" v-model="form.temperature" type="number" min="0" max="2" step="0.1" />
            </Field>
            <Field for-id="v2-model-timeout" label="超时（毫秒）">
              <Input id="v2-model-timeout" v-model="form.timeoutMs" type="number" min="1" />
            </Field>
          </div>
        </details>

        <div class="model-form-actions">
          <Button variant="primary" size="md" type="submit" :loading="saving">
            <Save :size="16" aria-hidden="true" />
            保存档案
          </Button>
          <Button v-if="editing" variant="secondary" size="md" type="button" @click="duplicateProfile">
            <Copy :size="16" aria-hidden="true" />
            复制档案
          </Button>
          <Button v-if="editing" variant="secondary" size="md" type="button" :loading="testing" @click="test">
            <Wifi :size="16" aria-hidden="true" />
            测试连接
          </Button>
          <Button v-if="editing" variant="danger" size="md" type="button" :loading="deleting" @click="remove">
            <Trash2 :size="16" aria-hidden="true" />
            删除
          </Button>
        </div>
        <p v-if="draftNotice" class="model-inline-success" role="status">{{ draftNotice }}</p>
        <p v-if="testMessage" :class="testStatus === 'success' ? 'model-inline-success' : 'model-inline-danger'" role="status">{{ testMessage }}</p>
      </form>

      <aside class="model-detail-card model-status-panel" aria-label="当前状态">
        <div class="model-section-head">
          <span class="model-section-kicker">当前状态</span>
        </div>
        <dl class="model-status-list">
          <div>
            <dt>连接状态</dt>
            <dd>{{ testStatus === "success" ? "连接正常" : testStatus === "error" ? "连接失败" : "未测试" }}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>{{ providerLabel(form.protocol) }}</dd>
          </div>
          <div>
            <dt>输入能力</dt>
            <dd>{{ modalityLabel(form.inputModalities) }}</dd>
          </div>
          <div>
            <dt>被哪些能力使用</dt>
            <dd v-if="usedBy.length === 0" class="muted">暂无</dd>
            <dd v-else class="used-by">
              <Badge v-for="capability in usedBy" :key="capability" tone="info">{{ capability }}</Badge>
            </dd>
          </div>
        </dl>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.model-detail-page {
  display: grid;
  gap: var(--space-5);
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
}

.model-detail-alert {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-sm);
}

.model-detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(260px, 0.7fr);
  gap: var(--space-5);
  align-items: start;
}

.model-detail-card {
  min-width: 0;
  padding: var(--space-5);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.model-presets-bar {
  display: grid;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  border: 1px solid var(--border);
}

.model-presets-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--primary);
}

.model-presets-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.model-preset-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: border-color var(--motion-fast), background var(--motion-fast), transform var(--motion-fast);
}

.model-preset-btn:hover {
  border-color: var(--primary);
  background: var(--primary-faint);
  transform: translateY(-1px);
}

.model-preset-btn strong {
  font-weight: 600;
}

.model-preset-btn small {
  color: var(--muted);
}

.model-form-section {
  display: grid;
  gap: var(--space-4);
  margin: 0 0 var(--space-5);
  padding: 0;
  border: 0;
}

.model-form-section legend {
  padding: 0;
  font-size: var(--text-sm);
  font-weight: 800;
  color: var(--text-strong);
}

.model-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.model-modalities {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.model-advanced summary {
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: 800;
  color: var(--text-strong);
  user-select: none;
}

.model-advanced .model-form-grid {
  margin-top: var(--space-4);
}

.model-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  margin-top: var(--space-4);
}

.model-discovery-actions {
  margin: var(--space-2) 0 0;
}

.model-discovery-area {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.discovered-models-box {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px dashed var(--border-strong);
}

.box-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.box-title {
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--primary);
}

.models-pill-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 140px;
  overflow-y: auto;
}

.model-chip {
  padding: 3px 8px;
  font-size: var(--text-xs);
  border-radius: var(--radius-xs);
  border: 1px solid var(--border);
  background: var(--surface-soft);
  color: var(--text);
  cursor: pointer;
}

.model-chip.active {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--on-primary);
  font-weight: 700;
}

.model-fetch-error {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-xs);
}

.model-inline-success {
  background: var(--success-soft);
  color: var(--success);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
}

.model-inline-danger {
  background: var(--danger-soft);
  color: var(--danger);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
}

.model-status-panel {
  position: sticky;
  top: var(--space-4);
}

.model-section-head {
  margin-bottom: var(--space-3);
}

.model-section-kicker {
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 800;
  letter-spacing: 0.08em;
}

.model-status-list {
  display: grid;
  gap: var(--space-3);
  margin: 0;
}

.model-status-list div {
  display: grid;
  gap: 2px;
}

.model-status-list dt {
  color: var(--muted);
  font-size: var(--text-xs);
}

.model-status-list dd {
  margin: 0;
  color: var(--text);
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}

.model-status-list .muted {
  color: var(--muted);
}

.used-by {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

@media (max-width: 900px) {
  .model-detail-layout {
    grid-template-columns: 1fr;
  }

  .model-status-panel {
    position: static;
  }
}

@media (max-width: 560px) {
  .model-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
