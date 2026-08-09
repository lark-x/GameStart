<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "../components/ui/Button.vue";
import Select from "../components/ui/Select.vue";
import Textarea from "../components/ui/Textarea.vue";
import Input from "../components/ui/Input.vue";
import PageHeader from "../components/layout/PageHeader.vue";
import { useAppStore } from "../stores/app.js";
import { importChatBackgroundFile, useTheme } from "../lib/theme";
import { errorMessage, type ApiComfyUiSettings, type ApiLlmProviderProfile, type ApiWorkflow } from "../types";
import type { CharacterVisualIdentityDto } from "../../../../packages/contracts/src/index.ts";
const store = useAppStore();
const identity = ref<CharacterVisualIdentityDto | null>(null);
const workflows = ref<ApiWorkflow[]>([]);
const selectedWorkflow = ref("");
const workflowJson = ref("");
const validationStatus = ref("");
const profiles = ref<ApiLlmProviderProfile[]>([]);
const profileLoading = ref(false);
const profileSaving = ref(false);
const profileStatus = ref("");
const showApiKey = ref(false);
const editingProfileId = ref<string | null>(null);
const profileForm = ref({ id: "", name: "", protocol: "OPENAI_COMPATIBLE" as "OPENAI_COMPATIBLE" | "ANTHROPIC", baseUrl: "", model: "", timeoutMs: 60000, maxTokens: 4096, temperature: 0.7, isActive: false, apiKey: "" });
const comfySettings = ref<ApiComfyUiSettings | null>(null);
const comfyLoading = ref(false);
const comfySaving = ref(false);
const comfyStatus = ref("");
const comfyForm = ref({ baseUrl: "", timeoutMs: 60000, defaultWorkflowVersion: "", autoImageIntentEnabled: false });
const status = ref("准备加载设置……");

const { currentTheme, chatBackground, syncState, setTheme, setChatBackground, THEMES } = useTheme();
const backgroundInput = ref<HTMLInputElement | null>(null);
const backgroundStatus = ref("");
const opacityValue = ref(chatBackground.opacity);
const blurValue = ref(chatBackground.blur);
watch(
  () => chatBackground.opacity,
  (value) => {
    opacityValue.value = value;
  },
);
watch(
  () => chatBackground.blur,
  (value) => {
    blurValue.value = value;
  },
);

/** 外观同步状态：持久化在服务端数据库，失败时退回本地缓存 */
const syncText = computed(() => {
  switch (syncState.value) {
    case "loading":
      return "读取中…";
    case "saving":
      return "保存中…";
    case "synced":
      return "已同步到服务端";
    case "error":
      return "同步失败，已存本地缓存";
    default:
      return "未连接服务端";
  }
});

const backgroundPreviewStyle = computed(() => ({
  ...(chatBackground.kind === "custom" && chatBackground.imageRef
    ? {
        backgroundImage: `url("${chatBackground.imageRef}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        backgroundImage: "var(--chat-texture)",
        backgroundSize: "var(--chat-texture-size)",
      }),
  opacity: opacityValue.value,
  filter:
    chatBackground.kind === "custom" && blurValue.value > 0
      ? `blur(${blurValue.value}px)`
      : undefined,
}));

let backgroundPushTimer: ReturnType<typeof setTimeout> | undefined;
/** 滑杆拖动时防抖写入，避免每一次 input 都触发一次服务端保存 */
function scheduleBackgroundPatch(patch: { opacity?: number; blur?: number }) {
  if (backgroundPushTimer) clearTimeout(backgroundPushTimer);
  backgroundPushTimer = setTimeout(() => setChatBackground(patch), 300);
}
function onOpacityInput() {
  scheduleBackgroundPatch({ opacity: opacityValue.value });
}
function onBlurInput() {
  scheduleBackgroundPatch({ blur: blurValue.value });
}
function pickBackgroundImage() {
  backgroundInput.value?.click();
}
async function onBackgroundFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  backgroundStatus.value = "正在导入背景…";
  try {
    const imageRef = await importChatBackgroundFile(file);
    setChatBackground({ kind: "custom", imageRef });
    backgroundStatus.value = "聊天背景已更新";
  } catch (e: unknown) {
    backgroundStatus.value = errorMessage(e);
  }
}
function resetBackground() {
  setChatBackground({ kind: "theme" });
  backgroundStatus.value = "已恢复为主题默认背景";
}
async function loadSettings() {
  if (!store.currentCharacterId) return;
  status.value = "正在读取视觉档案与 Workflow……";
  try {
    identity.value = (
      await store.api.getCharacterVisualIdentity(store.currentCharacterId)
    ).data;
  } catch {
    identity.value = null;
  }
  try {
    const result = await store.api.getWorkflows();
    workflows.value = result.data ?? [];
    const first = workflows.value[0];
    if (first) {
      selectedWorkflow.value = `${first.id}@${first.version}`;
      workflowJson.value = JSON.stringify(first, null, 2);
    }
    status.value = `${workflows.value.length} 个 Workflow 模板`;
  } catch (e: unknown) {
    status.value = errorMessage(e);
  }
}
function onWorkflowChange() {
  const wf = workflows.value.find(
    (w) => `${w.id}@${w.version}` === selectedWorkflow.value,
  );
  workflowJson.value = wf ? JSON.stringify(wf, null, 2) : "";
  validationStatus.value = "";
}
async function validateWorkflow() {
  let parsed: unknown;
  try {
    parsed = JSON.parse(workflowJson.value);
  } catch {
    validationStatus.value = "Workflow JSON 格式无效。";
    return;
  }
  try {
    const result = await store.api.validateWorkflow(parsed);
    validationStatus.value = `验证通过：${result.data.id}@${result.data.version}`;
  } catch (e: unknown) {
    validationStatus.value = errorMessage(e);
  }
}
async function loadIntegrations() {
  profileLoading.value = true;
  comfyLoading.value = true;
  try {
    profiles.value = (await store.api.getLlmProviderProfiles()).data ?? [];
  } catch (e: unknown) {
    profileStatus.value = errorMessage(e);
  } finally { profileLoading.value = false; }
  try {
    const result = await store.api.getComfyUiSettings();
    comfySettings.value = result.data;
    comfyForm.value = {
      baseUrl: result.data.baseUrl, timeoutMs: result.data.timeoutMs,
      defaultWorkflowVersion: result.data.defaultWorkflowVersion ?? "",
      autoImageIntentEnabled: result.data.autoImageIntentEnabled,
    };
  } catch (e: unknown) {
    comfyStatus.value = errorMessage(e);
  } finally { comfyLoading.value = false; }
}
function editProfile(profile: ApiLlmProviderProfile) {
  editingProfileId.value = profile.id;
  profileForm.value = { id: profile.id, name: profile.name, protocol: profile.protocol, baseUrl: profile.baseUrl, model: profile.model, timeoutMs: profile.timeoutMs, maxTokens: profile.maxTokens, temperature: profile.temperature, isActive: profile.isActive, apiKey: "" };
  showApiKey.value = false;
}
function newProfile() {
  editingProfileId.value = null;
  profileForm.value = { id: crypto.randomUUID(), name: "", protocol: "OPENAI_COMPATIBLE", baseUrl: "", model: "", timeoutMs: 60000, maxTokens: 4096, temperature: 0.7, isActive: profiles.value.length === 0, apiKey: "" };
}
async function saveProfile() {
  profileSaving.value = true; profileStatus.value = "";
  try {
    const input = { ...profileForm.value, ...(profileForm.value.apiKey ? { apiKey: profileForm.value.apiKey } : {}) };
    await store.api.saveLlmProviderProfile(input);
    profileForm.value.apiKey = "";
    profileStatus.value = "模型档案已保存";
    await loadIntegrations();
  } catch (e: unknown) { profileStatus.value = errorMessage(e); } finally { profileSaving.value = false; }
}
async function removeProfile(id: string) {
  try { await store.api.deleteLlmProviderProfile(id); await loadIntegrations(); } catch (e: unknown) { profileStatus.value = errorMessage(e); }
}
async function saveComfy() {
  comfySaving.value = true; comfyStatus.value = "";
  try {
    await store.api.updateComfyUiSettings({
      baseUrl: comfyForm.value.baseUrl,
      timeoutMs: comfyForm.value.timeoutMs,
      autoImageIntentEnabled: comfyForm.value.autoImageIntentEnabled,
      ...(comfyForm.value.defaultWorkflowVersion ? { defaultWorkflowVersion: comfyForm.value.defaultWorkflowVersion } : {}),
    });
    comfyStatus.value = "ComfyUI 设置已保存";
    await loadIntegrations();
  } catch (e: unknown) { comfyStatus.value = errorMessage(e); } finally { comfySaving.value = false; }
}
watch(
  () => store.currentCharacterId,
  () => void loadSettings(),
  { immediate: true },
);
void loadIntegrations();
</script>
<template>
  <section class="page">
    <PageHeader
      eyebrow="创作酒馆"
      title="视觉工作台"
      description="在这里保存角色的外观线索，也管理生成工作流。"
      :status="status"
    >
      <template #actions>
        <Button @click="loadSettings">刷新</Button>
      </template>
    </PageHeader>
    <div class="studio-grid">
      <section class="appearance-card">
        <div class="card-heading">
          <span>界面外观</span><i>{{ syncText }}</i>
        </div>
        <p class="intro">
          切换皮肤会联动全站配色、点缀动效、朋友圈横幅与聊天背景纹理，改动会自动保存到服务端数据库。
        </p>
        <div class="theme-tiles" role="radiogroup" aria-label="选择皮肤主题">
          <button
            v-for="theme in THEMES"
            :key="theme.id"
            type="button"
            role="radio"
            class="theme-tile"
            :class="{ 'theme-tile-active': currentTheme === theme.id }"
            :aria-checked="currentTheme === theme.id"
            @click="setTheme(theme.id)"
          >
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
              <Button
                v-if="chatBackground.kind === 'custom'"
                size="sm"
                variant="secondary"
                @click="resetBackground"
                >恢复主题默认</Button
              >
              <input
                ref="backgroundInput"
                type="file"
                accept="image/*"
                class="visually-hidden"
                aria-hidden="true"
                tabindex="-1"
                @change="onBackgroundFileChange"
              />
            </div>
            <label class="slider-row" for="background-opacity">
              <span>背景不透明度 {{ Math.round(opacityValue * 100) }}%</span>
              <input
                id="background-opacity"
                v-model.number="opacityValue"
                type="range"
                min="0"
                max="1"
                step="0.05"
                @input="onOpacityInput"
              />
            </label>
            <label class="slider-row" for="background-blur">
              <span>背景模糊 {{ blurValue }}px（仅自定义图片生效）</span>
              <input
                id="background-blur"
                v-model.number="blurValue"
                type="range"
                min="0"
                max="40"
                step="1"
                :disabled="chatBackground.kind !== 'custom'"
                @input="onBlurInput"
              />
            </label>
            <p class="background-status">
              {{
                backgroundStatus ||
                (chatBackground.kind === "custom"
                  ? "正在使用自定义图片背景"
                  : "正在使用主题默认纹理背景")
              }}
            </p>
          </div>
        </div>
      </section>
      <section class="integration-card">
        <div class="card-heading"><span>模型档案</span><i>{{ profileLoading ? "加载中" : `${profiles.length} 个档案` }}</i></div>
        <p class="intro">当前激活的档案会立即用于新的私聊回复。已保存的密钥只显示掩码。</p>
        <div class="profile-list">
          <button v-for="profile in profiles" :key="profile.id" type="button" class="profile-row" :class="{ active: profile.isActive }" @click="editProfile(profile)">
            <span><strong>{{ profile.name }}</strong><small>{{ profile.protocol }} · {{ profile.model }}</small></span>
            <span>{{ profile.isActive ? "当前使用" : "编辑" }}</span>
          </button>
        </div>
        <Button size="sm" variant="secondary" @click="newProfile">新建模型档案</Button>
        <form class="integration-form" @submit.prevent="saveProfile">
          <Input v-model="profileForm.name" placeholder="档案名称" aria-label="档案名称" required />
          <Select v-model="profileForm.protocol" aria-label="协议"><option value="OPENAI_COMPATIBLE">OpenAI-compatible</option><option value="ANTHROPIC">Anthropic</option></Select>
          <Input v-model="profileForm.baseUrl" placeholder="Base URL" aria-label="模型 Base URL" required />
          <Input v-model="profileForm.model" placeholder="模型名称" aria-label="模型名称" required />
          <Input v-model.number="profileForm.timeoutMs" type="number" min="1" placeholder="超时毫秒" aria-label="超时毫秒" />
          <Input v-model.number="profileForm.maxTokens" type="number" min="1" placeholder="最大输出 tokens" aria-label="最大输出 tokens" />
          <label class="check-row"><input v-model="profileForm.isActive" type="checkbox" /> 设为当前激活模型</label>
          <div class="key-row"><Input v-model="profileForm.apiKey" :type="showApiKey ? 'text' : 'password'" placeholder="API Key（留空则保留原值）" aria-label="API Key" /><Button type="button" variant="ghost" size="sm" @click="showApiKey = !showApiKey">{{ showApiKey ? "隐藏" : "显示" }}</Button></div>
          <div class="integration-actions"><Button type="submit" :disabled="profileSaving">{{ profileSaving ? "保存中" : "保存档案" }}</Button><Button v-if="editingProfileId" type="button" variant="danger" @click="removeProfile(editingProfileId)">删除</Button></div>
          <p class="integration-status">{{ profileStatus }}</p>
        </form>
      </section>
      <section class="integration-card">
        <div class="card-heading"><span>本地 ComfyUI</span><i>{{ comfyLoading ? "加载中" : "连接配置" }}</i></div>
        <p class="intro">ComfyUI 只由 Worker 访问，浏览器不会直接连接本地图片服务。</p>
        <form class="integration-form" @submit.prevent="saveComfy">
          <Input v-model="comfyForm.baseUrl" placeholder="http://127.0.0.1:8188" aria-label="ComfyUI Base URL" required />
          <Input v-model.number="comfyForm.timeoutMs" type="number" min="1" placeholder="超时毫秒" aria-label="ComfyUI 超时毫秒" />
          <Select v-model="comfyForm.defaultWorkflowVersion" aria-label="默认 Workflow"><option value="">不设默认 Workflow</option><option v-for="wf in workflows" :key="`${wf.id}@${wf.version}`" :value="`${wf.id}@${wf.version}`">{{ wf.id }}@{{ wf.version }}</option></Select>
          <label class="check-row"><input v-model="comfyForm.autoImageIntentEnabled" type="checkbox" /> 启用聊天自动图片意图</label>
          <Button type="submit" :disabled="comfySaving">{{ comfySaving ? "保存中" : "保存 ComfyUI 设置" }}</Button><p class="integration-status">{{ comfyStatus }}</p>
        </form>
      </section>
      <aside class="identity-card">
        <div class="card-heading">
          <span>角色档案</span><i>v{{ identity?.revision ?? "—" }}</i>
        </div>
        <div class="identity-avatar">
          {{ store.currentCharacter?.displayName?.slice(0, 1) || "?" }}
        </div>
        <h2>{{ store.currentCharacter?.displayName || "当前角色" }}</h2>
        <p class="intro">
          {{
            identity
              ? "这份档案会在生成角色视觉内容时作为基础参考。"
              : "这个角色尚未创建视觉档案。"
          }}
        </p>
        <template v-if="identity"
          ><h3>视觉关键词</h3>
          <div class="tags">
            <span v-for="tag in identity.styleTags" :key="tag">{{ tag }}</span>
          </div>
          <h3>正向提示词</h3>
          <p class="prompt">{{ identity.positivePrompt }}</p>
          <template v-if="identity.negativePrompt"
            ><h3>避免出现</h3>
            <p class="prompt muted">{{ identity.negativePrompt }}</p></template
          ></template
        >
      </aside>
      <main class="workflow-card">
        <div class="workflow-head">
          <div>
            <p>生成配方</p>
            <h2>Workflow 编辑器</h2>
          </div>
          <Select
            id="workflow-select"
            v-model="selectedWorkflow"
            aria-label="选择 Workflow 模板"
            :disabled="!workflows.length"
            @change="onWorkflowChange"
          >
            <option
              v-for="wf in workflows"
              :key="`${wf.id}@${wf.version}`"
              :value="`${wf.id}@${wf.version}`"
            >
              {{ wf.id }}@{{ wf.version }}
            </option>
          </Select>
        </div>
        <p class="workflow-note">
          编辑前请确认节点字段与当前的 ComfyUI 工作流一致。
        </p>
        <Textarea
          id="workflow-json"
          v-model="workflowJson"
          :rows="18"
          spellcheck="false"
          placeholder="选择一个 Workflow 模板后开始编辑…"
        />
        <footer>
          <p
            id="workflow-validation"
            :class="{ success: validationStatus.includes('验证通过') }"
          >
            {{ validationStatus }}
          </p>
          <Button id="validate-workflow" @click="validateWorkflow"
            >检查并验证</Button
          >
        </footer>
      </main>
    </div>
  </section>
</template>
<style scoped>
/* 档案 / 编辑器双栏，窄屏自动降为单列 */
.studio-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
  gap: var(--space-5);
  align-items: start;
}
/* 外观管理卡片横跨整行 */
.appearance-card {
  grid-column: 1 / -1;
  padding: var(--space-5);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
.integration-card {
  padding: var(--space-5);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
.profile-list { display: grid; gap: var(--space-2); margin: 0 0 var(--space-3); }
.profile-row { display: flex; justify-content: space-between; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-soft); color: var(--text); text-align: left; cursor: pointer; }
.profile-row.active { border-color: var(--primary); background: var(--primary-faint); }
.profile-row small { display: block; margin-top: 3px; color: var(--muted); font-size: var(--text-xs); }
.integration-form { display: grid; gap: var(--space-3); margin-top: var(--space-4); }
.key-row, .integration-actions { display: flex; gap: var(--space-2); align-items: center; }
.key-row .ui-input { flex: 1; }
.check-row { color: var(--muted); font-size: var(--text-sm); }
.integration-status { min-height: 1.25rem; margin: 0; color: var(--muted); font-size: var(--text-xs); }
.theme-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}
.theme-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}
.theme-tile:hover {
  transform: translateY(-1px);
}
.theme-tile-active {
  border-color: var(--primary);
  box-shadow:
    0 0 0 1px var(--primary),
    var(--shadow-sm);
  background: var(--primary-faint);
}
.tile-dot {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-full);
  color: #fff;
  font-size: 15px;
}
.tile-label {
  color: var(--text-strong);
  font-size: var(--text-sm);
  font-weight: 700;
}
.tile-tagline {
  color: var(--muted);
  font-size: var(--text-xs);
  line-height: 1.5;
}
.background-row {
  display: grid;
  grid-template-columns: minmax(180px, 240px) 1fr;
  gap: var(--space-4);
  align-items: stretch;
}
@media (max-width: 640px) {
  .background-row {
    grid-template-columns: 1fr;
  }
}
.background-preview {
  min-height: 140px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background-color: var(--surface-soft);
  background-repeat: repeat;
}
.background-controls {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.background-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.slider-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--muted);
  font-size: var(--text-xs);
}
.slider-row input[type="range"] {
  accent-color: var(--primary);
}
.background-status {
  color: var(--muted);
  font-size: var(--text-xs);
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.identity-card,
.workflow-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
.identity-card {
  padding: var(--space-5);
}
.card-heading {
  display: flex;
  justify-content: space-between;
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 700;
}
.card-heading i {
  padding: 3px 7px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  font-style: normal;
}
.identity-avatar {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  margin: var(--space-5) 0 10px;
  border-radius: var(--radius-lg);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 24px;
  font-weight: 700;
}
.identity-card h2 {
  color: var(--text-strong);
  font-size: var(--text-xl);
}
.intro {
  margin: 7px 0 var(--space-5);
  color: var(--muted);
  font-size: var(--text-sm);
  line-height: 1.7;
}
.identity-card h3 {
  margin: var(--space-5) 0 var(--space-2);
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tags span {
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: var(--text-xs);
}
.prompt {
  padding: 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
  color: var(--text);
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: var(--text-xs);
  line-height: 1.7;
  white-space: pre-wrap;
}
.prompt.muted {
  color: var(--muted);
}
.workflow-card {
  padding: var(--space-6);
}
.workflow-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4);
  flex-wrap: wrap;
}
.workflow-head p {
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 700;
}
.workflow-head h2 {
  font-size: 18px;
  color: var(--text-strong);
}
.workflow-head .ui-select {
  max-width: 270px;
}
.workflow-note {
  margin: var(--space-4) 0 10px;
  color: var(--muted);
  font-size: var(--text-xs);
}
.workflow-card .ui-textarea {
  display: block;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: var(--text-xs);
}
.workflow-card footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-top: var(--space-4);
}
.workflow-card footer p {
  color: var(--danger);
  font-size: var(--text-xs);
}
.workflow-card footer p.success {
  color: var(--success);
}
</style>
