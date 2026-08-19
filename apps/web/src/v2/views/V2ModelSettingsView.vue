<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Copy, Cpu, Download, Plus, RefreshCw, Save, ShieldCheck, Trash2, Wifi } from "@lucide/vue";
import type {
  V2ModelBindingDto,
  V2ModelProfileDto,
  V2ModelProtocol,
  V2PlatformCapabilities,
  V2SaveModelProfileRequest,
} from "@living-network/contracts/v2";

import Badge from "../../components/ui/Badge.vue";
import Checkbox from "../../components/ui/Checkbox.vue";
import Button from "../../components/ui/Button.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import Field from "../../components/ui/Field.vue";
import Input from "../../components/ui/Input.vue";
import PageHeader from "../../components/layout/PageHeader.vue";
import Select from "../../components/ui/Select.vue";
import { platformErrorMessage, v2PlatformClient } from "./platform.ts";
import { useNotificationStore } from "../stores/notification.ts";

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

const client = v2PlatformClient();
const toast = useNotificationStore();
const profiles = ref<readonly V2ModelProfileDto[]>([]);
const bindings = ref<readonly V2ModelBindingDto[]>([]);
const capabilities = ref<V2PlatformCapabilities | null>(null);
const form = ref<ModelForm>(emptyForm());
const bindingSelections = ref<Record<string, string>>({
  chat: "none",
  scene_generation: "none",
  memory: "none",
  story_analysis: "none",
});
const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
type ConnectionTestStatus = "idle" | "testing" | "success" | "error";
const deleting = ref(false);
const fetchingModels = ref(false);
const discoveredModels = ref<readonly string[]>([]);
const modelFilter = ref("");
const fetchModelError = ref<string | null>(null);
const error = ref<string | null>(null);
const testMessage = ref<string | null>(null);
const testStatus = ref<ConnectionTestStatus>("idle");
const testResults = new Map<string, string>();

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

const AVAILABLE_MODALITIES: readonly { readonly value: string; readonly label: string }[] = [
  { value: "text", label: "文本" },
  { value: "image", label: "图片" },
  { value: "audio", label: "音频" },
  { value: "video", label: "视频" },
  { value: "file", label: "文件" },
];

function toggleModality(value: string): void {
  const idx = form.value.inputModalities.indexOf(value);
  if (idx >= 0) {
    form.value.inputModalities = form.value.inputModalities.filter((m) => m !== value);
  } else {
    form.value.inputModalities = [...form.value.inputModalities, value];
  }
}

const editing = computed(() => form.value.id !== undefined);
const selectedProfile = computed(() => profiles.value.find((profile) => profile.id === form.value.id));
const bindingCapabilities: readonly { readonly capability: string; readonly label: string; readonly hint: string }[] = [
  { capability: "chat", label: "对话模型", hint: "Chat 回复与即时故事开场使用。" },
  { capability: "scene_generation", label: "场景生成模型", hint: "Worker 场景生成任务使用。" },
  { capability: "memory", label: "记忆模型", hint: "Memory Extraction / Consolidation 使用。" },
  { capability: "story_analysis", label: "剧情分析模型", hint: "Story Analyzer 使用。" },
];
const filteredDiscoveredModels = computed(() => {
  if (!modelFilter.value.trim()) return discoveredModels.value;
  const q = modelFilter.value.toLowerCase().trim();
  return discoveredModels.value.filter((m) => m.toLowerCase().includes(q));
});

function statusLabel(value: string | undefined): string {
  if (value === "complete") return "配置完整";
  if (value === "incomplete") return "配置缺失";
  if (value === "bound") return "已绑定";
  if (value === "unbound") return "未绑定";
  if (value === "not-applicable") return "无需绑定";
  if (value === "ok") return "连接正常";
  if (value === "failed") return "连接失败";
  if (value === "checking") return "检测中";
  return "未测试";
}

function selectProfile(profile: V2ModelProfileDto, resetTestMessage = true): void {
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
  if (resetTestMessage) {
    testMessage.value = null;
  }
  fetchModelError.value = null;
  discoveredModels.value = [];
  modelFilter.value = "";
}

function newProfile(): void {
  form.value = emptyForm();
  testMessage.value = null;
  fetchModelError.value = null;
  discoveredModels.value = [];
  modelFilter.value = "";
}

function duplicateProfile(): void {
  if (form.value.id === undefined) return;
  const originalId = form.value.id;
  const baseName = form.value.name.replace(/\s*\(副本\d*\)$/, "");
  const copyName = baseName + " (副本)";
  form.value = {
    ...form.value,
    id: undefined,
    sourceProfileId: originalId,
    name: copyName,
    apiKey: "",
  };
  testMessage.value = "已基于当前配置复制为新档案草稿，可直接修改模型名称后保存。";
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
    form.value.apiKey = "";
    const models = await client.discoverModels({
      protocol: form.value.protocol,
      baseUrl: form.value.baseUrl.trim(),
      apiKey: apiKey.length > 0 ? apiKey : undefined,
      profileId: form.value.id || form.value.sourceProfileId,
    });
    discoveredModels.value = models;
    if (models.length === 0) {
      fetchModelError.value = "未能从该地址获取到模型列表，你可以手动输入模型名称。";
    }
  } catch (err) {
    fetchModelError.value = platformErrorMessage(err, "获取模型列表失败");
  } finally {
    fetchingModels.value = false;
  }
}

function selectDiscoveredModel(modelId: string): void {
  form.value.model = modelId;
  if (!form.value.name || form.value.name.trim().length === 0) {
    form.value.name = modelId;
  }
}

async function refresh(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const [nextProfiles, nextBindings, nextCapabilities] = await Promise.all([
      client.listModelProfiles(),
      client.listModelBindings(),
      client.getCapabilities(),
    ]);
    profiles.value = nextProfiles;
    bindings.value = nextBindings;
    capabilities.value = nextCapabilities;
    const current = form.value.id === undefined ? undefined : nextProfiles.find((profile) => profile.id === form.value.id);
    if (current) selectProfile(current, false);
    else if (form.value.id !== undefined) newProfile();
    const byCapability: Record<string, string> = {};
    for (const capability of bindingCapabilities) {
      const binding = nextBindings.find((item) => item.capability === capability.capability);
      byCapability[capability.capability] = binding?.profileId ?? "none";
    }
    bindingSelections.value = byCapability;
  } catch (err) {
    error.value = platformErrorMessage(err, "无法读取模型配置");
  } finally {
    loading.value = false;
  }
}

function requestFromForm(): V2SaveModelProfileRequest {
  const modalities = form.value.inputModalities;

  const input: V2SaveModelProfileRequest = {
    name: form.value.name.trim(),
    protocol: form.value.protocol,
    baseUrl: form.value.baseUrl.trim(),
    model: form.value.model.trim(),
    timeoutMs: Number(form.value.timeoutMs),
    maxTokens: Number(form.value.maxTokens),
    temperature: Number(form.value.temperature),
    ...(form.value.contextWindow ? { contextWindow: Number(form.value.contextWindow) } : {}),
    ...(modalities.length > 0 ? { inputModalities: modalities } : {}),
    ...(form.value.id === undefined ? {} : { id: form.value.id }),
    ...(form.value.apiKey.trim().length === 0 ? {} : { apiKey: form.value.apiKey.trim() }),
    ...(form.value.sourceProfileId && form.value.apiKey.trim().length === 0 ? { sourceProfileId: form.value.sourceProfileId } : {}),
  };
  return input;
}

function bindingName(capability: string): string {
  const binding = bindings.value.find((item) => item.capability === capability);
  return binding?.profileName ?? "未绑定";
}

async function save(): Promise<void> {
  saving.value = true;
  error.value = null;
  try {
    const request = requestFromForm();
    form.value.apiKey = "";
    const saved = await client.saveModelProfile(request);
    toast.success(`模型档案“${saved.name}”已保存。`);
    await refresh();
    selectProfile(saved);
  } catch (err) {
    error.value = platformErrorMessage(err, "保存模型档案失败");
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
    testResults.set(form.value.id, testMessage.value);
  } catch (err) {
    testMessage.value = platformErrorMessage(err, "连接测试失败");
    testStatus.value = "error";
    testResults.set(form.value.id, testMessage.value);
  } finally {
    await refresh();
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
    newProfile();
    await refresh();
  } catch (err) {
    error.value = platformErrorMessage(err, "删除模型档案失败");
  } finally {
    deleting.value = false;
  }
}

async function saveBinding(capability: string): Promise<void> {
  error.value = null;
  try {
    const selected = bindingSelections.value[capability] ?? "none";
    await client.setModelBinding(capability, { profileId: selected === "none" ? null : selected });
    const label = bindingCapabilities.find((item) => item.capability === capability)?.label ?? capability;
    toast.success(selected === "none" ? `${label}已解除模型绑定。` : `${label}的模型绑定已更新。`);
    await refresh();
  } catch (err) {
    error.value = platformErrorMessage(err, "更新模型绑定失败");
  }
}

onMounted(() => {
  void refresh();
});
</script>

<template>
  <div class="v2-model-settings">
    <PageHeader

      title="模型与能力"
      description="模型密钥只写入服务端加密存储，页面不会回显原始密钥。场景生成能力从这里选择实际使用的模型。"
    >
      <template #actions>
        <Button variant="secondary" size="md" :loading="loading" @click="refresh">
          <RefreshCw :size="16" aria-hidden="true" />
          刷新
        </Button>
        <Button variant="primary" size="md" @click="newProfile">
          <Plus :size="16" aria-hidden="true" />
          新建档案
        </Button>
      </template>
    </PageHeader>

    <div v-if="error" class="v2-settings-alert" role="alert">{{ error }}</div>

    <section class="v2-capability-card" aria-labelledby="v2-capabilities-title">
      <div class="v2-section-heading">
        <div>
          <p class="v2-section-kicker">能力开关</p>
          <h2 id="v2-capabilities-title">当前运行能力</h2>
        </div>
        <ShieldCheck :size="22" aria-hidden="true" />
      </div>
      <div class="v2-capability-grid">
        <article>
          <span>场景生成</span>
          <Badge :tone="capabilities?.sceneGeneration.configured ? 'success' : 'warning'">
            {{ capabilities?.sceneGeneration.enabled ? "已启用" : "已关闭" }}
          </Badge>
          <small>配置：{{ statusLabel(capabilities?.sceneGeneration.configuration) }} · 绑定：{{ statusLabel(capabilities?.sceneGeneration.binding) }}</small>
          <small>连接：{{ statusLabel(capabilities?.sceneGeneration.connection) }} · 来源：{{ capabilities?.sceneGeneration.source ?? "none" }}</small>
          <small v-if="capabilities?.sceneGeneration.errorMessage">{{ capabilities.sceneGeneration.errorMessage }}</small>
        </article>
        <article>
          <span>素材生成</span>
          <Badge :tone="capabilities?.assetGeneration.configured ? 'success' : 'warning'">
            {{ capabilities?.assetGeneration.enabled ? "已启用" : "已关闭" }}
          </Badge>
          <small>配置：{{ statusLabel(capabilities?.assetGeneration.configuration) }} · 绑定：{{ statusLabel(capabilities?.assetGeneration.binding) }}</small>
          <small>连接：{{ statusLabel(capabilities?.assetGeneration.connection) }} · 来源：{{ capabilities?.assetGeneration.source ?? "none" }}</small>
        </article>
      </div>
    </section>

    <section class="v2-binding-card" aria-labelledby="v2-binding-title">
      <div class="v2-section-heading">
        <div>
          <p class="v2-section-kicker">能力绑定</p>
          <h2 id="v2-binding-title">各能力使用哪个模型？</h2>
        </div>
      </div>
      <div class="v2-binding-summary">
        <div v-for="item in bindingCapabilities" :key="item.capability" class="v2-binding-summary-item">
          <span>{{ item.label }}</span>
          <strong>{{ bindingName(item.capability) }}</strong>
        </div>
      </div>
      <div v-for="item in bindingCapabilities" :key="`${item.capability}-select`" class="v2-binding-row">
        <Field :for-id="`v2-binding-${item.capability}`" :label="item.label" :hint="item.hint">
          <Select
            :id="`v2-binding-${item.capability}`"
            :model-value="bindingSelections[item.capability] ?? 'none'"
            :disabled="profiles.length === 0"
            @update:model-value="(value: string) => { bindingSelections[item.capability] = value; }"
          >
            <option value="none">不绑定（使用环境变量兜底）</option>
            <option v-for="profileItem in profiles" :key="profileItem.id" :value="profileItem.id">
              {{ profileItem.name }} · {{ profileItem.model }}
            </option>
          </Select>
        </Field>
        <Button variant="secondary" size="md" :disabled="profiles.length === 0" @click="saveBinding(item.capability)">保存绑定</Button>
      </div>
    </section>

    <div class="v2-model-layout">
      <section class="v2-profile-list" aria-labelledby="v2-profile-list-title">
        <div class="v2-section-heading">
          <div>
            <p class="v2-section-kicker">模型档案</p>
            <h2 id="v2-profile-list-title">可用模型</h2>
          </div>
          <Badge tone="neutral">{{ profiles.length }}</Badge>
        </div>
        <EmptyState v-if="profiles.length === 0" title="还没有模型档案" description="新建一个档案后，就可以绑定到场景生成能力。">
          <template #icon><Cpu :size="23" aria-hidden="true" /></template>
        </EmptyState>
        <div v-else class="v2-profile-items">
          <Button
            v-for="profileItem in profiles"
            :key="profileItem.id"
            type="button"
            variant="secondary"
            size="md"
            class="v2-profile-item"
            :class="{ selected: profileItem.id === form.id }"
            @click="selectProfile(profileItem)"
          >
            <span class="v2-profile-item-main">
              <strong>{{ profileItem.name }}</strong>
              <small>{{ profileItem.model }}</small>
            </span>
            <Badge :tone="profileItem.hasApiKey ? 'success' : 'neutral'">{{ profileItem.hasApiKey ? "已加密" : "无密钥" }}</Badge>
          </Button>
        </div>
      </section>

      <section class="v2-model-editor" aria-labelledby="v2-model-editor-title">
        <div class="v2-section-heading">
          <div>
            <p class="v2-section-kicker">{{ editing ? "编辑档案" : "新建档案" }}</p>
            <h2 id="v2-model-editor-title">连接参数</h2>
          </div>
          <Badge v-if="selectedProfile?.hasApiKey" tone="success">密钥已保存</Badge>
        </div>
        <form @submit.prevent="save">
          <fieldset class="v2-form-section">
            <legend>基础信息</legend>
            <div class="v2-form-grid">
              <Field for-id="v2-model-name" label="档案名称" required hint="例如：主创作模型">
                <Input id="v2-model-name" v-model="form.name" placeholder="例如：主创作模型" required />
              </Field>
              <Field for-id="v2-model-name-value" label="模型名称" required>
                <div class="model-input-row">
                  <Input id="v2-model-name-value" v-model="form.model" placeholder="模型 ID" required />
                </div>
              </Field>
              <Field for-id="v2-model-protocol" label="协议" hint="Anthropic 会使用对应消息协议。">
                <Select id="v2-model-protocol" v-model="form.protocol">
                  <option value="openai-compatible">OpenAI 兼容</option>
                  <option value="anthropic">Anthropic</option>
                </Select>
              </Field>
            </div>
          </fieldset>

          <fieldset class="v2-form-section">
            <legend>连接</legend>
            <div class="v2-form-grid">
              <Field for-id="v2-model-base-url" label="API 地址" required hint="例如 https://api.example.com/v1">
                <Input id="v2-model-base-url" v-model="form.baseUrl" placeholder="https://..." required />
              </Field>
              <Field for-id="v2-model-api-key" label="API 密钥" hint="留空表示保持已有密钥；新建档案时留空表示无密钥。">
                <Input id="v2-model-api-key" v-model="form.apiKey" type="password" placeholder="sk-..." autocomplete="new-password" />
              </Field>
              <Field for-id="v2-model-timeout" label="超时（毫秒）">
                <Input id="v2-model-timeout" v-model="form.timeoutMs" type="number" min="1" />
              </Field>
            </div>
          </fieldset>

          <fieldset class="v2-form-section">
            <legend>模型能力</legend>
            <div class="v2-form-grid">
              <Field for-id="v2-model-context-window" label="上下文窗口（Token）" hint="模型的总上下文限制，默认 8192">
                <Input id="v2-model-context-window" v-model="form.contextWindow" type="number" min="1" />
              </Field>
              <Field for-id="v2-model-max-tokens" label="最大输出 Token">
                <Input id="v2-model-max-tokens" v-model="form.maxTokens" type="number" min="1" />
              </Field>
              <Field for-id="v2-model-temperature" label="温度（0 - 2）">
                <Input id="v2-model-temperature" v-model="form.temperature" type="number" min="0" max="2" step="0.1" />
              </Field>
              <Field label="输入能力" hint="选择模型支持的输入类型">
                <div class="v2-model-modalities">
                  <Checkbox
                    v-for="mod in AVAILABLE_MODALITIES"
                    :key="mod.value"
                    :model-value="form.inputModalities.includes(mod.value)"
                    :label="mod.label"
                    @update:model-value="toggleModality(mod.value)"
                  />
                </div>
              </Field>
            </div>
          </fieldset>

          <div class="v2-model-discovery-actions">
            <Button
              variant="secondary"
              size="sm"
              type="button"
              class="btn-fetch-models"
              :loading="fetchingModels"
              :disabled="!form.baseUrl.trim()"
              @click="fetchModels"
            >
              <Download :size="13" aria-hidden="true" />
              获取模型列表
            </Button>
          </div>

          <div v-if="fetchModelError || discoveredModels.length > 0" class="v2-discovery-area">
            <div v-if="fetchModelError" class="v2-model-fetch-error" role="alert">
              {{ fetchModelError }}
            </div>
            <div v-if="discoveredModels.length > 0" class="discovered-models-box">
              <div class="box-head">
                <span class="box-title">可用模型 ({{ discoveredModels.length }}) - 点击快速选用</span>
                <div v-if="discoveredModels.length > 6" class="box-search">
                  <Input v-model="modelFilter" placeholder="过滤模型..." size="sm" />
                </div>
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

          <div class="v2-form-actions">
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
          <p v-if="testMessage" :class="testStatus === 'success' ? 'v2-inline-message-success' : 'v2-inline-message-danger'" role="status">{{ testMessage }}</p>
        </form>
      </section>
    </div>

  </div>
</template>

<style scoped>
.v2-model-settings {
  display: grid;
  gap: var(--space-5);
}

.v2-capability-card,
.v2-profile-list,
.v2-model-editor,
.v2-binding-card {
  min-width: 0;
  padding: var(--space-5);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.v2-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.v2-section-heading h2 {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-lg);
}

.v2-section-kicker {
  margin: 0 0 var(--space-1);
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 800;
  letter-spacing: 0.08em;
}

.v2-capability-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.v2-capability-grid article {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
}

.v2-capability-grid span {
  color: var(--text-strong);
  font-size: var(--text-sm);
  font-weight: 800;
}

.v2-capability-grid small {
  grid-column: 1 / -1;
  color: var(--muted);
  font-size: var(--text-xs);
}

.v2-model-layout {
  display: grid;
  grid-template-columns: minmax(220px, 0.72fr) minmax(0, 1.28fr);
  gap: var(--space-5);
  align-items: start;
  container-type: inline-size;
}

.v2-profile-items {
  display: grid;
  gap: var(--space-2);
}

.v2-profile-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  color: var(--text);
  cursor: pointer;
  text-align: left;
}

.v2-profile-item:hover,
.v2-profile-item.selected {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.v2-profile-item-main {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.v2-profile-item-main strong,
.v2-profile-item-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v2-profile-item-main strong {
  color: var(--text-strong);
  font-size: var(--text-sm);
}

.v2-profile-item-main small {
  color: var(--muted);
  font-size: var(--text-xs);
}

.v2-editor-form { display: grid; gap: var(--space-4); }
.form-block { padding: var(--space-4); border-radius: var(--radius-md); background: var(--surface-soft); border: 1px solid var(--border); display: grid; gap: var(--space-3); }
.form-block-title { margin: 0; font-size: var(--text-sm); font-weight: 700; color: var(--text-strong); }
.model-select-header { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); }
.form-row-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
.discovered-models-box { padding: var(--space-3); border-radius: var(--radius-sm); background: var(--surface); border: 1px dashed var(--border-strong); display: grid; gap: var(--space-2); }
.box-head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); }
.box-title { font-size: var(--text-xs); font-weight: 700; color: var(--primary); }
.box-search { max-width: 200px; }
.models-pill-grid { display: flex; flex-wrap: wrap; gap: 6px; max-height: 140px; overflow-y: auto; }
.model-chip { padding: 3px 8px; font-size: var(--text-xs); border-radius: var(--radius-xs); border: 1px solid var(--border); background: var(--surface-soft); color: var(--text); cursor: pointer; transition: all 0.15s ease; }
.model-chip:hover { border-color: var(--primary); background: var(--primary-soft); color: var(--primary); }
.model-chip.active { border-color: var(--primary); background: var(--primary); color: var(--on-primary); font-weight: 700; }
.v2-model-fetch-error { padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); background: var(--danger-soft); color: var(--danger); font-size: var(--text-xs); }
.model-input-row { display: flex; gap: var(--space-2); align-items: stretch; }
.model-input-row .ui-input { flex: 1; min-width: 0; }
.btn-fetch-models { flex: 0 0 auto; white-space: nowrap; }
.v2-discovery-area { grid-column: 1 / -1; display: grid; gap: var(--space-2); }
.v2-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.v2-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  margin-top: var(--space-4);
}

.v2-form-section {
  display: grid;
  gap: var(--space-4);
  margin: 0 0 var(--space-5);
  padding: 0;
  border: 0;
}

.v2-form-section legend {
  padding: 0;
  font-size: var(--text-sm);
  font-weight: 800;
  color: var(--text-strong);
}

.v2-model-discovery-actions {
  margin: var(--space-2) 0;
}

.v2-binding-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.v2-binding-summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--background);
}

.v2-binding-summary-item span {
  font-size: var(--text-xs);
  color: var(--muted);
}

.v2-binding-summary-item strong {
  font-size: var(--text-sm);
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v2-settings-alert {
  background: var(--danger-soft);
  color: var(--danger);
}

.v2-inline-message-success {
  background: var(--success-soft);
  color: var(--success);
}

.v2-inline-message-danger {
  background: var(--danger-soft);
  color: var(--danger);
}

.v2-binding-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-4);
  align-items: end;
}

@media (max-width: 820px) {
  .v2-model-layout,
  .v2-capability-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .v2-form-grid,
  .v2-binding-row {
    grid-template-columns: 1fr;
  }
}
.v2-model-modalities {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

</style>
