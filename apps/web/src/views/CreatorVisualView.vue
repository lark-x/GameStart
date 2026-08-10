<script setup lang="ts">
import { ref, watch } from "vue";
import { FileJson, RefreshCw, Upload } from "@lucide/vue";
import Button from "../components/ui/Button.vue";
import Input from "../components/ui/Input.vue";
import Select from "../components/ui/Select.vue";
import Textarea from "../components/ui/Textarea.vue";
import PageHeader from "../components/layout/PageHeader.vue";
import { useAppStore } from "../stores/app.js";
import { errorMessage, type ApiWorkflow } from "../types";
import type { CharacterVisualIdentityDto } from "../../../../packages/contracts/src/index.ts";

const store = useAppStore();
const identity = ref<CharacterVisualIdentityDto | null>(null);
const workflows = ref<ApiWorkflow[]>([]);
const selectedWorkflow = ref("");
const workflowJson = ref("");
const validationStatus = ref("");
const status = ref("准备加载视觉档案…");
const workflowFileInput = ref<HTMLInputElement | null>(null);
const importId = ref("comfy-anima");
const importVersion = ref("v1");
const importStatus = ref("");
const importing = ref(false);

async function loadVisuals() {
  if (!store.currentCharacterId) return;
  status.value = "正在读取视觉档案和 Workflow…";
  try {
    identity.value = (await store.api.getCharacterVisualIdentity(store.currentCharacterId)).data;
  } catch {
    identity.value = null;
  }
  try {
    const result = await store.api.getWorkflows();
    workflows.value = result.data ?? [];
    const selected = workflows.value.find((item) => `${item.id}@${item.version}` === selectedWorkflow.value) ?? workflows.value[0];
    selectedWorkflow.value = selected ? `${selected.id}@${selected.version}` : "";
    workflowJson.value = selected ? JSON.stringify(selected, null, 2) : "";
    status.value = `${workflows.value.length} 个 Workflow 模板`;
  } catch (error: unknown) {
    status.value = errorMessage(error);
  }
}

function onWorkflowChange() {
  const workflow = workflows.value.find((item) => `${item.id}@${item.version}` === selectedWorkflow.value);
  workflowJson.value = workflow ? JSON.stringify(workflow, null, 2) : "";
  validationStatus.value = "";
}

async function validateWorkflow() {
  try {
    const result = await store.api.validateWorkflow(JSON.parse(workflowJson.value));
    validationStatus.value = `验证通过：${result.data.id}@${result.data.version}`;
  } catch (error: unknown) {
    validationStatus.value = error instanceof SyntaxError ? "Workflow JSON 格式无效。" : errorMessage(error);
  }
}

async function importWorkflowFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (!importId.value.trim() || !importVersion.value.trim()) {
    importStatus.value = "请先填写模板 ID 和版本。";
    return;
  }
  importing.value = true;
  importStatus.value = `正在导入 ${file.name}…`;
  try {
    const parsed = JSON.parse(await file.text()) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new TypeError("Workflow JSON 顶层必须是对象");
    const result = await store.api.importWorkflow({
      id: importId.value.trim(),
      version: importVersion.value.trim(),
      workflow: parsed as Record<string, unknown>,
    });
    const imported = result.data;
    await loadVisuals();
    selectedWorkflow.value = `${imported.id}@${imported.version}`;
    workflowJson.value = JSON.stringify(imported, null, 2);
    importStatus.value = `已保存 ${imported.id}@${imported.version}`;
    validationStatus.value = "";
  } catch (error: unknown) {
    importStatus.value = errorMessage(error);
  } finally {
    importing.value = false;
  }
}

watch(() => store.currentCharacterId, () => void loadVisuals(), { immediate: true });
</script>

<template>
  <section class="page visual-page">
    <PageHeader eyebrow="创作中心" title="视觉工作台" description="管理角色视觉档案和 ComfyUI 工作流。" :status="status">
      <template #actions><Button variant="secondary" @click="loadVisuals"><RefreshCw :size="16" />刷新</Button></template>
    </PageHeader>
    <div class="studio-grid">
      <aside class="identity-panel identity-card">
        <div class="panel-heading"><span>角色档案</span><i>v{{ identity?.revision ?? "-" }}</i></div>
        <div class="identity-avatar">{{ store.currentCharacter?.displayName?.slice(0, 1) || "?" }}</div>
        <h2>{{ store.currentCharacter?.displayName || "当前角色" }}</h2>
        <p class="intro">{{ identity ? "生成角色图片时会合并这份视觉档案。" : "当前角色还没有视觉档案。" }}</p>
        <template v-if="identity">
          <h3>风格标签</h3><div class="tags"><span v-for="tag in identity.styleTags" :key="tag">{{ tag }}</span></div>
          <h3>正向提示词</h3><p class="prompt">{{ identity.positivePrompt }}</p>
          <template v-if="identity.negativePrompt"><h3>负向提示词</h3><p class="prompt muted">{{ identity.negativePrompt }}</p></template>
        </template>
      </aside>
      <main class="workflow-panel">
        <div class="workflow-head">
          <div><p>生成配方</p><h2>Workflow 管理</h2></div>
          <Select id="workflow-select" v-model="selectedWorkflow" aria-label="选择 Workflow 模板" :disabled="!workflows.length" @change="onWorkflowChange">
            <option v-for="workflow in workflows" :key="`${workflow.id}@${workflow.version}`" :value="`${workflow.id}@${workflow.version}`">{{ workflow.id }}@{{ workflow.version }}</option>
          </Select>
        </div>
        <section class="workflow-import" aria-label="导入 Workflow">
          <input ref="workflowFileInput" class="visually-hidden" type="file" accept="application/json,.json" @change="importWorkflowFile" />
          <FileJson :size="18" />
          <Input v-model="importId" aria-label="模板 ID" placeholder="模板 ID" />
          <Input v-model="importVersion" aria-label="模板版本" placeholder="版本，例如 v1" />
          <Button variant="secondary" :disabled="importing" @click="workflowFileInput?.click()"><Upload :size="16" />{{ importing ? "导入中" : "导入 JSON" }}</Button>
          <span>{{ importStatus }}</span>
        </section>
        <Textarea id="workflow-json" v-model="workflowJson" :rows="18" spellcheck="false" placeholder="导入或选择一个 Workflow 模板。" />
        <footer><p :class="{ success: validationStatus.startsWith('验证通过') }">{{ validationStatus }}</p><Button id="validate-workflow" :disabled="!workflowJson" @click="validateWorkflow">检查绑定</Button></footer>
      </main>
    </div>
  </section>
</template>

<style scoped>
.visual-page { width: min(100%, 1320px); margin: 0 auto; }
.studio-grid { display: grid; grid-template-columns: minmax(270px, .7fr) minmax(0, 1.5fr); gap: var(--space-5); align-items: start; }
.identity-panel, .workflow-panel { min-width: 0; padding: var(--space-5); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-sm); }
.identity-panel { height: 590px; overflow-y: auto; overscroll-behavior: contain; }
.panel-heading { display: flex; justify-content: space-between; color: var(--primary); font-size: var(--text-xs); font-weight: 700; }
.panel-heading i { padding: 3px 7px; color: var(--muted); background: var(--surface-soft); border-radius: var(--radius-sm); font-style: normal; }
.identity-avatar { display: grid; place-items: center; width: 58px; height: 58px; margin: var(--space-5) 0 10px; border-radius: var(--radius-md); background: var(--primary-soft); color: var(--primary); font-size: 24px; font-weight: 700; }
.identity-panel h2 { color: var(--text-strong); font-size: var(--text-xl); }
.intro { margin: 7px 0 var(--space-5); color: var(--muted); font-size: var(--text-sm); line-height: 1.7; }
.identity-panel h3 { margin: var(--space-5) 0 var(--space-2); color: var(--muted); font-size: var(--text-xs); }
.tags { display: flex; flex-wrap: wrap; gap: 6px; }
.tags span { padding: 5px 8px; border-radius: var(--radius-sm); background: var(--primary-soft); color: var(--primary); font-size: var(--text-xs); }
.prompt { padding: 10px; border-radius: var(--radius-sm); background: var(--surface-soft); color: var(--text); font-family: ui-monospace, SFMono-Regular, monospace; font-size: var(--text-xs); line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.prompt.muted { color: var(--muted); }
.workflow-head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-4); flex-wrap: wrap; }
.workflow-head p { color: var(--primary); font-size: var(--text-xs); font-weight: 700; }
.workflow-head h2 { color: var(--text-strong); font-size: 18px; }
.workflow-head .ui-select { max-width: 290px; }
.workflow-import { display: grid; grid-template-columns: auto minmax(130px, 1fr) minmax(110px, .7fr) auto; gap: 8px; align-items: center; margin: var(--space-4) 0; padding: 10px 0; border-block: 1px solid var(--border); }
.workflow-import > svg { color: var(--muted); }
.workflow-import > span { grid-column: 2 / -1; min-height: 18px; color: var(--muted); font-size: var(--text-xs); }
.workflow-panel .ui-textarea { display: block; width: 100%; font-family: ui-monospace, SFMono-Regular, monospace; font-size: var(--text-xs); }
.workflow-panel footer { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); margin-top: var(--space-4); }
.workflow-panel footer p { min-height: 18px; color: var(--danger); font-size: var(--text-xs); }
.workflow-panel footer p.success { color: var(--success); }
@media (max-width: 780px) { .studio-grid { grid-template-columns: 1fr; } .identity-panel { height: 420px; } .workflow-import { grid-template-columns: auto 1fr; } .workflow-import :deep(.ui-input), .workflow-import :deep(.ui-button), .workflow-import > span { grid-column: 1 / -1; } }
</style>
