<script setup lang="ts">
import { ref, watch } from "vue";
import Button from "../components/ui/Button.vue";
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

async function loadVisuals() {
  if (!store.currentCharacterId) return;
  status.value = "正在读取视觉档案与 Workflow…";
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

watch(
  () => store.currentCharacterId,
  () => void loadVisuals(),
  { immediate: true },
);
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
        <Button @click="loadVisuals">刷新</Button>
      </template>
    </PageHeader>
    <div class="studio-grid">
      <aside class="identity-card">
        <div class="card-heading">
          <span>角色档案</span><i>v{{ identity?.revision ?? "–" }}</i>
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
        <template v-if="identity">
          <h3>视觉关键词</h3>
          <div class="tags">
            <span v-for="tag in identity.styleTags" :key="tag">{{ tag }}</span>
          </div>
          <h3>正向提示词</h3>
          <p class="prompt">{{ identity.positivePrompt }}</p>
          <template v-if="identity.negativePrompt">
            <h3>避免出现</h3>
            <p class="prompt muted">{{ identity.negativePrompt }}</p>
          </template>
        </template>
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
          placeholder="选择一个 Workflow 模板后开始编辑。"
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
.studio-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
  gap: var(--space-5);
  align-items: start;
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


.identity-card { height: 560px; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
@media (max-width: 640px) { .identity-card { height: 420px; } }

</style>
