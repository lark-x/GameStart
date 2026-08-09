<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Check, Eye, EyeOff, Plus, RefreshCw, Settings2, Trash2 } from "@lucide/vue";
import Button from "../components/ui/Button.vue";
import Select from "../components/ui/Select.vue";
import Input from "../components/ui/Input.vue";
import PageHeader from "../components/layout/PageHeader.vue";
import Modal from "../components/ui/Modal.vue";
import { useAppStore } from "../stores/app.js";
import { importChatBackgroundFile, useTheme } from "../lib/theme";
import { errorMessage, type ApiComfyUiSettings, type ApiLlmProviderProfile, type ApiWorkflow } from "../types";

const store = useAppStore();
const profiles = ref<ApiLlmProviderProfile[]>([]);
const profileLoading = ref(false);
const profileSaving = ref(false);
const profileStatus = ref("");
const profileDialogOpen = ref(false);
const profileDialogMode = ref<"create" | "edit">("create");
const editingProfileId = ref<string | null>(null);
const activationId = ref<string | null>(null);
const showApiKey = ref(false);

interface ProfileTest {
  success: boolean;
  latencyMs?: number;
  model?: string;
  preview?: string;
  error?: { message?: string };
  correlationId?: string;
}

const profileTests = ref<Record<string, ProfileTest>>({});
const profileTesting = ref<string | null>(null);

function createProfileForm() {
  return {
    id: String(crypto.randomUUID()),
    name: "",
    protocol: "OPENAI_COMPATIBLE" as "OPENAI_COMPATIBLE" | "ANTHROPIC",
    baseUrl: "",
    model: "",
    timeoutMs: 60000,
    maxTokens: 4096,
    temperature: 0.7,
    isActive: false,
    apiKey: "",
  };
}

const profileForm = ref(createProfileForm());
const profileDialogTitle = computed(() => profileDialogMode.value === "create" ? "新建模型档案" : "配置模型档案");

const comfySettings = ref<ApiComfyUiSettings | null>(null);
const comfyLoading = ref(false);
const comfySaving = ref(false);
const comfyStatus = ref("");
const comfyForm = ref({ baseUrl: "", timeoutMs: 60000, defaultWorkflowVersion: "", autoImageIntentEnabled: false });
const workflows = ref<ApiWorkflow[]>([]);
const status = ref("准备加载集成设置");

const { currentTheme, chatBackground, syncState, setTheme, setChatBackground, THEMES } = useTheme();
const backgroundInput = ref<HTMLInputElement | null>(null);
const backgroundStatus = ref("");
const opacityValue = ref(chatBackground.opacity);
const blurValue = ref(chatBackground.blur);

watch(() => chatBackground.opacity, (value) => { opacityValue.value = value; });
watch(() => chatBackground.blur, (value) => { blurValue.value = value; });

const syncText = computed(() => {
  switch (syncState.value) {
    case "loading": return "读取中...";
    case "saving": return "保存中...";
    case "synced": return "已同步到服务端";
    case "error": return "同步失败，已保存本地缓存";
    default: return "未连接服务端";
  }
});

const backgroundPreviewStyle = computed(() => ({
  ...(chatBackground.kind === "custom" && chatBackground.imageRef
    ? { backgroundImage: "url(\"" + chatBackground.imageRef + "\")", backgroundSize: "cover", backgroundPosition: "center" }
    : { backgroundImage: "var(--chat-texture)", backgroundSize: "var(--chat-texture-size)" }),
  opacity: opacityValue.value,
  filter: chatBackground.kind === "custom" && blurValue.value > 0 ? "blur(" + blurValue.value + "px)" : undefined,
}));

let backgroundPushTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleBackgroundPatch(patch: { opacity?: number; blur?: number }) {
  if (backgroundPushTimer) clearTimeout(backgroundPushTimer);
  backgroundPushTimer = setTimeout(() => setChatBackground(patch), 300);
}
function pickBackgroundImage() { backgroundInput.value?.click(); }
function onOpacityInput() { scheduleBackgroundPatch({ opacity: opacityValue.value }); }
function onBlurInput() { scheduleBackgroundPatch({ blur: blurValue.value }); }
async function onBackgroundFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  backgroundStatus.value = "正在导入背景...";
  try {
    const imageRef = await importChatBackgroundFile(file);
    setChatBackground({ kind: "custom", imageRef });
    backgroundStatus.value = "聊天背景已更新";
  } catch (error: unknown) {
    backgroundStatus.value = errorMessage(error);
  }
}
function resetBackground() {
  setChatBackground({ kind: "theme" });
  backgroundStatus.value = "已恢复主题默认背景";
}

function profilePayload(profile: ApiLlmProviderProfile, isActive: boolean) {
  return {
    id: profile.id,
    name: profile.name,
    protocol: profile.protocol,
    baseUrl: profile.baseUrl,
    model: profile.model,
    timeoutMs: profile.timeoutMs,
    maxTokens: profile.maxTokens,
    temperature: profile.temperature,
    isActive,
  };
}

async function loadIntegrations() {
  profileLoading.value = true;
  comfyLoading.value = true;
  try {
    profiles.value = (await store.api.getLlmProviderProfiles()).data ?? [];
    status.value = profiles.value.length + " 个模型档案";
  } catch (error: unknown) {
    profileStatus.value = errorMessage(error);
  } finally {
    profileLoading.value = false;
  }
  try {
    const result = await store.api.getComfyUiSettings();
    comfySettings.value = result.data;
    comfyForm.value = {
      baseUrl: result.data.baseUrl,
      timeoutMs: result.data.timeoutMs,
      defaultWorkflowVersion: result.data.defaultWorkflowVersion ?? "",
      autoImageIntentEnabled: result.data.autoImageIntentEnabled,
    };
  } catch (error: unknown) {
    comfyStatus.value = errorMessage(error);
  } finally {
    comfyLoading.value = false;
  }
  try {
    workflows.value = (await store.api.getWorkflows()).data ?? [];
  } catch (error: unknown) {
    status.value = errorMessage(error);
  }
}

async function activateProfile(profile: ApiLlmProviderProfile) {
  if (profile.isActive || activationId.value) return;
  activationId.value = profile.id;
  profileStatus.value = "";
  try {
    await store.api.saveLlmProviderProfile(profilePayload(profile, true));
    profiles.value = profiles.value.map((item) => ({ ...item, isActive: item.id === profile.id }));
    profileStatus.value = "已切换到 " + profile.name;
  } catch (error: unknown) {
    profileStatus.value = errorMessage(error);
  } finally {
    activationId.value = null;
  }
}

function editProfile(profile: ApiLlmProviderProfile) {
  profileDialogMode.value = "edit";
  editingProfileId.value = profile.id;
  profileForm.value = {
    id: profile.id,
    name: profile.name,
    protocol: profile.protocol,
    baseUrl: profile.baseUrl,
    model: profile.model,
    timeoutMs: profile.timeoutMs,
    maxTokens: profile.maxTokens,
    temperature: profile.temperature,
    isActive: profile.isActive,
    apiKey: "",
  };
  showApiKey.value = false;
  profileDialogOpen.value = true;
}

function newProfile() {
  profileDialogMode.value = "create";
  editingProfileId.value = null;
  profileForm.value = { ...createProfileForm(), isActive: profiles.value.length === 0 };
  showApiKey.value = false;
  profileDialogOpen.value = true;
}

function closeProfileDialog() {
  if (!profileSaving.value) profileDialogOpen.value = false;
}

async function saveProfile() {
  profileSaving.value = true;
  profileStatus.value = "";
  try {
    const id = profileForm.value.id.trim() || editingProfileId.value || String(crypto.randomUUID());
    const apiKey = profileForm.value.apiKey.trim();
    await store.api.saveLlmProviderProfile({
      id,
      name: profileForm.value.name,
      protocol: profileForm.value.protocol,
      baseUrl: profileForm.value.baseUrl,
      model: profileForm.value.model,
      timeoutMs: profileForm.value.timeoutMs,
      maxTokens: profileForm.value.maxTokens,
      temperature: profileForm.value.temperature,
      isActive: profileForm.value.isActive,
      ...(apiKey ? { apiKey } : {}),
    });
    profileForm.value.id = id;
    profileForm.value.apiKey = "";
    profileDialogOpen.value = false;
    profileStatus.value = "模型档案已保存";
    await loadIntegrations();
  } catch (error: unknown) {
    profileStatus.value = errorMessage(error);
  } finally {
    profileSaving.value = false;
  }
}

async function removeProfile(id: string) {
  try {
    await store.api.deleteLlmProviderProfile(id);
    profileDialogOpen.value = false;
    editingProfileId.value = null;
    profileStatus.value = "模型档案已删除";
    await loadIntegrations();
  } catch (error: unknown) {
    profileStatus.value = errorMessage(error);
  }
}

async function testProfile(id: string) {
  profileTesting.value = id;
  try {
    profileTests.value[id] = (await store.api.testLlmProfile(id)).data as ProfileTest;
  } catch (error: unknown) {
    const item = error as { message?: string; correlationId?: string };
    profileTests.value[id] = {
      success: false,
      error: { ...(item.message ? { message: item.message } : {}) },
      ...(item.correlationId ? { correlationId: item.correlationId } : {}),
    };
  } finally {
    profileTesting.value = null;
  }
}

async function saveComfy() {
  comfySaving.value = true;
  comfyStatus.value = "";
  try {
    await store.api.updateComfyUiSettings({
      baseUrl: comfyForm.value.baseUrl,
      timeoutMs: comfyForm.value.timeoutMs,
      autoImageIntentEnabled: comfyForm.value.autoImageIntentEnabled,
      ...(comfyForm.value.defaultWorkflowVersion ? { defaultWorkflowVersion: comfyForm.value.defaultWorkflowVersion } : {}),
    });
    comfyStatus.value = "ComfyUI 设置已保存";
    await loadIntegrations();
  } catch (error: unknown) {
    comfyStatus.value = errorMessage(error);
  } finally {
    comfySaving.value = false;
  }
}

onBeforeUnmount(() => {
  if (backgroundPushTimer) clearTimeout(backgroundPushTimer);
});

void loadIntegrations();
</script>

<template>
  <section class="page">
    <PageHeader eyebrow="创作酒馆" title="集成设置" description="管理模型连接、视觉服务与应用外观。" :status="status">
      <template #actions>
        <Button variant="secondary" @click="loadIntegrations"><RefreshCw :size="15" />刷新</Button>
      </template>
    </PageHeader>

    <div class="studio-grid">
      <section class="appearance-card">
        <div class="card-heading"><span>界面外观</span><i>{{ syncText }}</i></div>
        <p class="intro">主题、聊天背景和视觉装饰会同步保存到当前工作区。</p>
        <div class="theme-tiles" role="radiogroup" aria-label="选择皮肤主题">
          <button v-for="theme in THEMES" :key="theme.id" type="button" role="radio" class="theme-tile" :class="{ 'theme-tile-active': currentTheme === theme.id }" :aria-checked="currentTheme === theme.id" @click="setTheme(theme.id)">
            <span class="tile-dot" :style="{ backgroundColor: theme.dot }">{{ theme.symbol }}</span>
            <span class="tile-label">{{ theme.label }}</span>
            <span class="tile-tagline">{{ theme.tagline }}</span>
          </button>
        </div>
        <div class="background-row">
          <div class="background-preview" :style="backgroundPreviewStyle" aria-hidden="true" />
          <div class="background-controls">
            <div class="background-actions">
              <Button size="sm" @click="pickBackgroundImage">导入背景图片</Button>
              <Button v-if="chatBackground.kind === 'custom'" size="sm" variant="secondary" @click="resetBackground">恢复主题默认</Button>
              <input ref="backgroundInput" type="file" accept="image/*" class="visually-hidden" aria-hidden="true" tabindex="-1" @change="onBackgroundFileChange" />
            </div>
            <label class="slider-row" for="background-opacity"><span>背景不透明度 {{ Math.round(opacityValue * 100) }}%</span><input id="background-opacity" v-model.number="opacityValue" type="range" min="0" max="1" step="0.05" @input="onOpacityInput" /></label>
            <label class="slider-row" for="background-blur"><span>背景模糊 {{ blurValue }}px</span><input id="background-blur" v-model.number="blurValue" type="range" min="0" max="40" step="1" :disabled="chatBackground.kind !== 'custom'" @input="onBlurInput" /></label>
            <p class="background-status">{{ backgroundStatus || (chatBackground.kind === "custom" ? "正在使用自定义图片背景" : "正在使用主题默认纹理背景") }}</p>
          </div>
        </div>
      </section>

      <section class="integration-card model-card">
        <div class="card-heading"><span>模型档案</span><i>{{ profileLoading ? "加载中..." : profiles.length + " 个档案" }}</i></div>
        <p class="intro">点击“启用”立即切换当前模型；详细连接参数只在配置弹窗中编辑。</p>
        <div v-if="profiles.length" class="profile-list">
          <article v-for="profile in profiles" :key="profile.id" class="profile-entry" :class="{ active: profile.isActive }">
            <div class="profile-main">
              <span class="profile-avatar" aria-hidden="true">{{ profile.name.slice(0, 1).toUpperCase() }}</span>
              <div class="profile-copy"><h3>{{ profile.name }}</h3><p>{{ profile.protocol === "ANTHROPIC" ? "Anthropic" : "OpenAI-compatible" }} · {{ profile.model }}</p><small>{{ profile.hasApiKey ? "API Key 已配置" : "未配置 API Key" }}</small></div>
              <span class="profile-state" :class="{ current: profile.isActive }">{{ profile.isActive ? "当前使用" : "未启用" }}</span>
            </div>
            <div class="profile-card-actions">
              <Button v-if="!profile.isActive" size="sm" :disabled="activationId === profile.id" @click="activateProfile(profile)"><Check :size="15" />{{ activationId === profile.id ? "切换中..." : "启用" }}</Button>
              <Button variant="secondary" size="sm" @click="editProfile(profile)"><Settings2 :size="15" />配置</Button>
              <Button variant="ghost" size="icon" :disabled="profileTesting === profile.id" :aria-label="'测试 ' + profile.name" :title="'测试 ' + profile.name" @click="testProfile(profile.id)"><RefreshCw :size="16" /></Button>
            </div>
            <div v-if="profileTests[profile.id]" class="profile-test-result" :class="{ success: profileTests[profile.id]?.success }">
              <strong>{{ profileTests[profile.id]?.success ? "连接成功" : "连接失败" }}</strong>
              <span v-if="profileTests[profile.id]?.latencyMs !== undefined">{{ profileTests[profile.id]?.latencyMs }} ms</span>
              <span v-if="profileTests[profile.id]?.model">{{ profileTests[profile.id]?.model }}</span>
              <p v-if="profileTests[profile.id]?.preview">{{ profileTests[profile.id]?.preview }}</p>
              <p v-if="profileTests[profile.id]?.error?.message">{{ profileTests[profile.id]?.error?.message }}</p>
              <code v-if="profileTests[profile.id]?.correlationId">{{ profileTests[profile.id]?.correlationId }}</code>
            </div>
          </article>
        </div>
        <div v-else class="profile-empty">还没有模型档案，先创建一个连接。</div>
        <Button variant="secondary" size="sm" @click="newProfile"><Plus :size="15" />新建模型档案</Button>
        <p class="integration-status" role="status">{{ profileStatus }}</p>
      </section>

      <section class="integration-card">
        <div class="card-heading"><span>本地 ComfyUI</span><i>{{ comfyLoading ? "加载中..." : "连接配置" }}</i></div>
        <p class="intro">ComfyUI 只由 Worker 访问，浏览器不会直接连接本地图片服务。</p>
        <form class="integration-form" @submit.prevent="saveComfy">
          <Input v-model="comfyForm.baseUrl" placeholder="http://127.0.0.1:8188" aria-label="ComfyUI Base URL" required />
          <Input v-model.number="comfyForm.timeoutMs" type="number" min="1" placeholder="超时毫秒" aria-label="ComfyUI 超时毫秒" />
          <Select v-model="comfyForm.defaultWorkflowVersion" aria-label="默认 Workflow"><option value="">不设默认 Workflow</option><option v-for="workflow in workflows" :key="workflow.id + '@' + workflow.version" :value="workflow.id + '@' + workflow.version">{{ workflow.id }}@{{ workflow.version }}</option></Select>
          <label class="check-row"><input v-model="comfyForm.autoImageIntentEnabled" type="checkbox" /> 启用聊天自动图片意图</label>
          <Button type="submit" :loading="comfySaving">保存 ComfyUI 设置</Button>
          <p class="integration-status" role="status">{{ comfyStatus }}</p>
        </form>
      </section>
    </div>

    <Modal
      :open="profileDialogOpen"
      :title="profileDialogTitle"
      :description="profileDialogMode === 'create' ? '保存后可在列表中一键启用。' : '修改连接参数后保存，空白 API Key 会保留原值。'"
      @close="closeProfileDialog"
    >
      <form id="profile-form" class="dialog-form" @submit.prevent="saveProfile">
        <Input v-model="profileForm.name" placeholder="档案名称" aria-label="档案名称" required />
        <Select v-model="profileForm.protocol" aria-label="协议"><option value="OPENAI_COMPATIBLE">OpenAI-compatible</option><option value="ANTHROPIC">Anthropic</option></Select>
        <Input v-model="profileForm.baseUrl" placeholder="模型 Base URL" aria-label="模型 Base URL" required />
        <Input v-model="profileForm.model" placeholder="模型名称" aria-label="模型名称" required />
        <div class="field-grid">
          <Input v-model.number="profileForm.timeoutMs" type="number" min="1" placeholder="超时毫秒" aria-label="超时毫秒" />
          <Input v-model.number="profileForm.maxTokens" type="number" min="1" placeholder="最大输出 tokens" aria-label="最大输出 tokens" />
        </div>
        <label class="field-label" for="profile-temperature">温度 {{ profileForm.temperature }}</label>
        <input id="profile-temperature" v-model.number="profileForm.temperature" class="range-input" type="range" min="0" max="2" step="0.1" />
        <label v-if="profileDialogMode === 'create'" class="check-row"><input v-model="profileForm.isActive" type="checkbox" /> 保存后立即启用</label>
        <div class="key-row">
          <Input v-model="profileForm.apiKey" :type="showApiKey ? 'text' : 'password'" placeholder="API Key（留空保留原值）" aria-label="API Key" />
          <Button type="button" variant="ghost" size="icon" :aria-label="showApiKey ? '隐藏 API Key' : '显示 API Key'" :title="showApiKey ? '隐藏 API Key' : '显示 API Key'" @click="showApiKey = !showApiKey"><EyeOff v-if="showApiKey" :size="17" /><Eye v-else :size="17" /></Button>
        </div>
      </form>
      <template #footer>
        <Button type="button" variant="ghost" @click="closeProfileDialog">取消</Button>
        <Button v-if="editingProfileId" type="button" variant="danger" @click="removeProfile(editingProfileId)"><Trash2 :size="15" />删除</Button>
        <Button type="submit" form="profile-form" :loading="profileSaving">保存档案</Button>
      </template>
    </Modal>
  </section>
</template>

<style scoped>
.studio-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: var(--space-5); align-items: start; }
.appearance-card { grid-column: 1 / -1; padding: var(--space-5); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
.integration-card { padding: var(--space-5); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
.card-heading { display: flex; justify-content: space-between; color: var(--primary); font-size: var(--text-xs); font-weight: 700; }
.card-heading i { padding: 3px 7px; border-radius: var(--radius-full); background: var(--primary-soft); font-style: normal; }
.intro { margin: 7px 0 var(--space-5); color: var(--muted); font-size: var(--text-sm); line-height: 1.7; }
.profile-list { display: grid; gap: var(--space-3); margin-bottom: var(--space-4); }
.profile-entry { padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-soft); }
.profile-entry.active { border-color: var(--primary); background: var(--primary-faint); }
.profile-main { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.profile-avatar { display: grid; flex: 0 0 38px; place-items: center; width: 38px; height: 38px; border-radius: var(--radius-md); background: var(--primary-soft); color: var(--primary); font-weight: 800; }
.profile-copy { min-width: 0; flex: 1; }
.profile-copy h3 { margin: 0; color: var(--text-strong); font-size: var(--text-sm); }
.profile-copy p { margin: 3px 0 0; color: var(--text); font-size: var(--text-xs); overflow-wrap: anywhere; }
.profile-copy small { display: block; margin-top: 3px; color: var(--muted); font-size: var(--text-xs); }
.profile-state { flex: 0 0 auto; color: var(--muted); font-size: var(--text-xs); }
.profile-state.current { color: var(--primary); font-weight: 700; }
.profile-card-actions { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-3); }
.profile-card-actions .ui-button, .dialog-footer .ui-button { display: inline-flex; align-items: center; gap: 6px; }
.profile-test-result { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--border); color: var(--danger); font-size: var(--text-xs); }
.profile-test-result.success { color: var(--success); }
.profile-test-result p, .profile-test-result code { width: 100%; margin: 0; overflow-wrap: anywhere; color: var(--muted); }
.profile-empty { padding: var(--space-4); margin-bottom: var(--space-4); border: 1px dashed var(--border); border-radius: var(--radius-md); color: var(--muted); font-size: var(--text-sm); text-align: center; }
.integration-form, .dialog-form { display: grid; gap: var(--space-3); margin-top: var(--space-4); }
.key-row, .dialog-footer { display: flex; align-items: center; gap: var(--space-2); }
.key-row .ui-input { flex: 1; min-width: 0; }
.dialog-footer-spacer { flex: 1; }
.check-row, .field-label { color: var(--muted); font-size: var(--text-sm); }
.integration-status { min-height: 1.25rem; margin: 0; color: var(--muted); font-size: var(--text-xs); }
.theme-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap: var(--space-3); margin-bottom: var(--space-5); }
.theme-tile { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-soft); cursor: pointer; text-align: left; transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease; }
.theme-tile:hover { transform: translateY(-1px); }
.theme-tile-active { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary), var(--shadow-sm); background: var(--primary-faint); }
.tile-dot { display: grid; place-items: center; width: 30px; height: 30px; border-radius: var(--radius-full); color: #fff; font-size: 15px; }
.tile-label { color: var(--text-strong); font-size: var(--text-sm); font-weight: 700; }
.tile-tagline { color: var(--muted); font-size: var(--text-xs); line-height: 1.5; }
.background-row { display: grid; grid-template-columns: minmax(180px, 240px) 1fr; gap: var(--space-4); align-items: stretch; }
.background-preview { min-height: 140px; border: 1px solid var(--border); border-radius: var(--radius-md); background-color: var(--surface-soft); background-repeat: repeat; }
.background-controls { display: flex; flex-direction: column; gap: var(--space-3); }
.background-actions { display: flex; flex-wrap: wrap; gap: var(--space-3); }
.slider-row { display: flex; flex-direction: column; gap: 6px; color: var(--muted); font-size: var(--text-xs); }
.slider-row input[type="range"], .range-input { accent-color: var(--primary); }
.background-status { color: var(--muted); font-size: var(--text-xs); }
.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.modal-backdrop { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; padding: 16px; background: rgb(10 12 24 / 62%); }
.profile-dialog { width: min(100%, 560px); max-height: min(88vh, 760px); overflow: auto; padding: var(--space-5); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-lg); }
.dialog-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); }
.dialog-header h2 { margin: 3px 0 4px; color: var(--text-strong); font-size: var(--text-xl); }
.dialog-header p { margin: 0; color: var(--muted); font-size: var(--text-sm); line-height: 1.6; }
.dialog-eyebrow { color: var(--primary) !important; font-size: var(--text-xs) !important; font-weight: 700; }
.dialog-form { margin-top: var(--space-5); }
@media (max-width: 640px) {
  .background-row, .field-grid { grid-template-columns: 1fr; }
  .profile-main { align-items: flex-start; }
  .profile-state { margin-left: auto; }
  .profile-card-actions { flex-wrap: wrap; }
  .profile-dialog { padding: var(--space-4); }
}

.model-card { display: flex; flex-direction: column; min-height: 520px; }
.model-card .profile-list { min-height: 0; max-height: 330px; overflow-y: auto; overscroll-behavior: contain; padding-right: 4px; }
.model-card > .ui-button { align-self: flex-start; }
.dialog-form { margin-top: 0; }
@media (max-width: 640px) { .model-card { min-height: 480px; } .model-card .profile-list { max-height: 290px; } }
</style>
