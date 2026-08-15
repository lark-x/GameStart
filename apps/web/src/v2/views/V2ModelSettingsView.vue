<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Copy, Cpu, Download, Plus, RefreshCw, Save, ShieldCheck, Trash2, Wifi } from "@lucide/vue";
import type {
  V2ModelProfileDto,
  V2ModelProtocol,
  V2PlatformCapabilities,
  V2SaveModelProfileRequest,
} from "@living-network/contracts/v2";

import Badge from "../../components/ui/Badge.vue";
import Button from "../../components/ui/Button.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import Field from "../../components/ui/Field.vue";
import Input from "../../components/ui/Input.vue";
import PageHeader from "../../components/layout/PageHeader.vue";
import Select from "../../components/ui/Select.vue";
import { platformErrorMessage, v2PlatformClient } from "./platform.ts";

interface ModelForm {
  readonly id?: string | undefined;
  readonly sourceProfileId?: string | undefined;
  name: string;
  protocol: V2ModelProtocol;
  baseUrl: string;
  model: string;
  timeoutMs: string;
  maxTokens: string;
  temperature: string;
  apiKey: string;
}

const client = v2PlatformClient();
const profiles = ref<readonly V2ModelProfileDto[]>([]);
const bindings = ref<readonly { readonly profileId?: string; readonly profileName?: string }[]>([]);
const capabilities = ref<V2PlatformCapabilities | null>(null);
const form = ref<ModelForm>(emptyForm());
const selectedBinding = ref("none");
const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
const deleting = ref(false);
const fetchingModels = ref(false);
const discoveredModels = ref<readonly string[]>([]);
const modelFilter = ref("");
const fetchModelError = ref<string | null>(null);
const error = ref<string | null>(null);
const message = ref<string | null>(null);
const testMessage = ref<string | null>(null);

function emptyForm(): ModelForm {
  return {
    name: "",
    protocol: "openai-compatible",
    baseUrl: "",
    model: "",
    timeoutMs: "30000",
    maxTokens: "4096",
    temperature: "0.2",
    apiKey: "",
  };
}

const editing = computed(() => form.value.id !== undefined);
const selectedProfile = computed(() => profiles.value.find((profile) => profile.id === form.value.id));
const sceneBinding = computed(() => bindings.value[0]);
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
    temperature: String(profile.temperature),
    apiKey: "",
  };
  testMessage.value = null;
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
  const baseName = form.value.name.replace(/\s*\(\u526f\u672c\d*\)$/, "");
  const copyName = baseName + " (\u526f\u672c)";
  form.value = {
    ...form.value,
    id: undefined,
    sourceProfileId: originalId,
    name: copyName,
    apiKey: "",
  };
  testMessage.value = "\u5df2\u57fa\u4e8e\u5f53\u524d\u914d\u7f6e\u590d\u5236\u4e3a\u65b0\u6863\u6848\u8349\u7a3f\uff0c\u53ef\u76f4\u63a5\u4fee\u6539\u6a21\u578b\u540d\u79f0\u540e\u4fdd\u5b58\u3002";
}

async function fetchModels(): Promise<void> {
  if (!form.value.baseUrl.trim()) {
    fetchModelError.value = "\u8bf7\u5148\u586b\u5199 API \u5730\u5740";
    return;
  }
  fetchingModels.value = true;
  fetchModelError.value = null;
  try {
    const models = await client.discoverModels({
      protocol: form.value.protocol,
      baseUrl: form.value.baseUrl.trim(),
      apiKey: form.value.apiKey.trim().length > 0 ? form.value.apiKey.trim() : undefined,
      profileId: form.value.id || form.value.sourceProfileId,
    });
    discoveredModels.value = models;
    if (models.length === 0) {
      fetchModelError.value = "\u672a\u80fd\u4ece\u8be5\u5730\u5740\u83b7\u53d6\u5230\u6a21\u578b\u5217\u8868\uff0c\u4f60\u53ef\u4ee5\u624b\u52a8\u8f93\u5165\u6a21\u578b\u540d\u79f0\u3002";
    }
  } catch (err) {
    fetchModelError.value = platformErrorMessage(err, "\u83b7\u53d6\u6a21\u578b\u5217\u8868\u5931\u8d25");
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
    if (current) selectProfile(current);
    else if (form.value.id !== undefined) newProfile();
    selectedBinding.value = nextBindings.find((binding) => binding.profileId !== undefined)?.profileId ?? "none";
  } catch (err) {
    error.value = platformErrorMessage(err, "无法读取模型配置");
  } finally {
    loading.value = false;
  }
}

function requestFromForm(): V2SaveModelProfileRequest {
  const input: V2SaveModelProfileRequest = {
    name: form.value.name.trim(),
    protocol: form.value.protocol,
    baseUrl: form.value.baseUrl.trim(),
    model: form.value.model.trim(),
    timeoutMs: Number(form.value.timeoutMs),
    maxTokens: Number(form.value.maxTokens),
    temperature: Number(form.value.temperature),
    ...(form.value.id === undefined ? {} : { id: form.value.id }),
    ...(form.value.apiKey.trim().length === 0 ? {} : { apiKey: form.value.apiKey.trim() }),
    ...(form.value.sourceProfileId && form.value.apiKey.trim().length === 0 ? { sourceProfileId: form.value.sourceProfileId } : {}),
  };
  return input;
}

async function save(): Promise<void> {
  saving.value = true;
  error.value = null;
  message.value = null;
  try {
    const saved = await client.saveModelProfile(requestFromForm());
    message.value = `模型档案“${saved.name}”已保存。`;
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
  error.value = null;
  testMessage.value = null;
  try {
    const result = await client.testModelProfile(form.value.id);
    const preview = typeof result.preview === "string" ? ` 返回：${result.preview}` : "";
    testMessage.value = `连接测试成功。${preview}`;
  } catch (err) {
    testMessage.value = platformErrorMessage(err, "连接测试失败");
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
    message.value = "模型档案已删除。";
    newProfile();
    await refresh();
  } catch (err) {
    error.value = platformErrorMessage(err, "删除模型档案失败");
  } finally {
    deleting.value = false;
  }
}

async function saveBinding(): Promise<void> {
  error.value = null;
  try {
    await client.setModelBinding("scene_generation", { profileId: selectedBinding.value === "none" ? null : selectedBinding.value });
    message.value = selectedBinding.value === "none" ? "场景生成能力已解除模型绑定。" : "场景生成能力的模型绑定已更新。";
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
      eyebrow="平台配置 / 模型"
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
    <div v-if="message" class="v2-settings-success" role="status">{{ message }}</div>

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
            {{ capabilities?.sceneGeneration.configured ? "已配置" : "待配置" }}
          </Badge>
          <small>{{ capabilities?.sceneGeneration.source === "profile" ? "来自模型档案" : "来自环境变量或未配置" }}</small>
        </article>
        <article>
          <span>素材生成</span>
          <Badge :tone="capabilities?.assetGeneration.configured ? 'success' : 'warning'">
            {{ capabilities?.assetGeneration.configured ? "已配置" : "待配置" }}
          </Badge>
          <small>{{ capabilities?.assetGeneration.source === "settings" ? "来自图片服务设置" : "来自环境变量或未配置" }}</small>
        </article>
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
                        <form class="v2-form-grid" @submit.prevent="save">
          <Field for-id="v2-model-name" label="\u6863\u6848\u540d\u79f0" required hint="\u4f8b\u5982\uff1a\u4e3b\u521b\u4f5c\u6a21\u578b">
            <Input id="v2-model-name" v-model="form.name" placeholder="\u4f8b\u5982\uff1a\u4e3b\u521b\u4f5c\u6a21\u578b" required />
          </Field>
          <Field for-id="v2-model-protocol" label="\u534f\u8bae" hint="Anthropic \u4f1a\u4f7f\u7528\u5bf9\u5e94\u6d88\u606f\u534f\u8bae\u3002">
            <Select id="v2-model-protocol" v-model="form.protocol">
              <option value="openai-compatible">OpenAI \u517c\u5bb9</option>
              <option value="anthropic">Anthropic</option>
            </Select>
          </Field>
          <Field for-id="v2-model-base-url" label="API \u5730\u5740" required hint="\u4f8b\u5982 https://api.example.com/v1">
            <Input id="v2-model-base-url" v-model="form.baseUrl" placeholder="https://..." required />
          </Field>
          <Field for-id="v2-model-name-value" label="\u6a21\u578b\u540d\u79f0" required hint="\u53ef\u70b9\u51fb\u53f3\u4fa7\u83b7\u53d6\u6a21\u578b\u5217\u8868\u6216\u624b\u52a8\u8f93\u5165">
            <template #label>
              <div class="model-field-label">
                <span>\u6a21\u578b\u540d\u79f0</span>
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
                  \u83b7\u53d6\u6a21\u578b
                </Button>
              </div>
            </template>
            <Input id="v2-model-name-value" v-model="form.model" placeholder="\u6a21\u578b ID" required />
          </Field>

          <!-- Discovered Models Picker (if any) -->
          <div v-if="fetchModelError || discoveredModels.length > 0" class="v2-discovery-area">
            <div v-if="fetchModelError" class="v2-model-fetch-error" role="alert">
              {{ fetchModelError }}
            </div>
            <div v-if="discoveredModels.length > 0" class="discovered-models-box">
              <div class="box-head">
                <span class="box-title">\u53ef\u7528\u6a21\u578b ({{ discoveredModels.length }}) - \u70b9\u51fb\u5feb\u901f\u9009\u7528</span>
                <div v-if="discoveredModels.length > 6" class="box-search">
                  <Input v-model="modelFilter" placeholder="\u8fc7\u6ee4\u6a21\u578b..." size="sm" />
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

          <Field for-id="v2-model-api-key" label="API \u5bc6\u94a5" hint="\u7559\u7a7a\u8868\u793a\u4fdd\u6301\u5df2\u6709\u5bc6\u94a5\uff1b\u65b0\u5efa\u6863\u6848\u65f6\u7559\u7a7a\u8868\u793a\u65e0\u5bc6\u94a5\u3002">
            <Input id="v2-model-api-key" v-model="form.apiKey" type="password" placeholder="sk-..." autocomplete="new-password" />
          </Field>
          <Field for-id="v2-model-timeout" label="\u8d85\u65f6\uff08\u6beb\u79d2\uff09">
            <Input id="v2-model-timeout" v-model="form.timeoutMs" type="number" min="1" />
          </Field>
          <Field for-id="v2-model-max-tokens" label="\u6700\u5927\u8f93\u51fa Token">
            <Input id="v2-model-max-tokens" v-model="form.maxTokens" type="number" min="1" />
          </Field>
          <Field for-id="v2-model-temperature" label="\u6e29\u5ea6\uff080 - 2\uff09">
            <Input id="v2-model-temperature" v-model="form.temperature" type="number" min="0" max="2" step="0.1" />
          </Field>
          <div class="v2-form-actions v2-form-actions-wide">
            <Button variant="primary" size="md" type="submit" :loading="saving">
              <Save :size="16" aria-hidden="true" />
              \u4fdd\u5b58\u6863\u6848
            </Button>
            <Button v-if="editing" variant="secondary" size="md" type="button" @click="duplicateProfile">
              <Copy :size="16" aria-hidden="true" />
              \u590d\u5236\u6863\u6848
            </Button>
            <Button v-if="editing" variant="secondary" size="md" type="button" :loading="testing" @click="test">
              <Wifi :size="16" aria-hidden="true" />
              \u6d4b\u8bd5\u8fde\u63a5
            </Button>
            <Button v-if="editing" variant="danger" size="md" type="button" :loading="deleting" @click="remove">
              <Trash2 :size="16" aria-hidden="true" />
              \u5220\u9664
            </Button>
          </div>
          <p v-if="testMessage" class="v2-inline-message" role="status">{{ testMessage }}</p>
        </form>
      </section>
    </div>

    <section class="v2-binding-card" aria-labelledby="v2-binding-title">
      <div class="v2-section-heading">
        <div>
          <p class="v2-section-kicker">能力绑定</p>
          <h2 id="v2-binding-title">场景生成使用哪个模型？</h2>
        </div>
        <Badge tone="neutral">{{ sceneBinding?.profileName ?? "未绑定" }}</Badge>
      </div>
      <div class="v2-binding-row">
        <Field for-id="v2-scene-binding" label="场景生成模型" hint="Worker 每次执行任务时都会重新读取此绑定。">
          <Select id="v2-scene-binding" v-model="selectedBinding" :disabled="profiles.length === 0">
            <option value="none">不绑定（使用环境变量兜底）</option>
            <option v-for="profileItem in profiles" :key="profileItem.id" :value="profileItem.id">
              {{ profileItem.name }} · {{ profileItem.model }}
            </option>
          </Select>
        </Field>
        <Button variant="secondary" size="md" :disabled="profiles.length === 0" @click="saveBinding">保存绑定</Button>
      </div>
    </section>
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
.model-chip { padding: 3px 8px; font-size: 11px; border-radius: var(--radius-xs); border: 1px solid var(--border); background: var(--surface-soft); color: var(--text); cursor: pointer; transition: all 0.15s ease; }
.model-chip:hover { border-color: var(--primary); background: var(--primary-soft); color: var(--primary); }
.model-chip.active { border-color: var(--primary); background: var(--primary); color: var(--on-primary); font-weight: 700; }
.v2-model-fetch-error { padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); background: var(--danger-soft); color: var(--danger); font-size: var(--text-xs); }
.model-field-label { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); width: 100%; }
.btn-fetch-models { font-size: 11px; padding: 0 var(--space-2); min-height: 24px; height: 24px; }
.v2-discovery-area { grid-column: 1 / -1; display: grid; gap: var(--space-2); }
.v2-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.v2-form-actions-wide,
.v2-inline-message {
  grid-column: 1 / -1;
}

.v2-form-actions-wide {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}

.v2-inline-message,
.v2-settings-alert,
.v2-settings-success {
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.v2-inline-message,
.v2-settings-success {
  background: var(--success-soft);
  color: var(--success);
}

.v2-settings-alert {
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
</style>
