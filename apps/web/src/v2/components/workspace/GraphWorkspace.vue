<script setup lang="ts">
import { ref, computed } from "vue";
import { AlertCircle, CheckCircle2, ArrowRight, Plus, Pencil } from "@lucide/vue";
import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Drawer from "../../../components/ui/Drawer.vue";
import Field from "../../../components/ui/Field.vue";
import Input from "../../../components/ui/Input.vue";
import Select from "../../../components/ui/Select.vue";
import Textarea from "../../../components/ui/Textarea.vue";
import type { V2ArcId, V2SceneId } from "@living-network/contracts/v2";
import type { V2GraphCreateInput, V2WorkspaceSnapshot } from "../../adapters";
import type { V2ArcSummary, V2ChoiceSummary } from "../../adapters/types";
import { useV2WorkspaceStore } from "../../stores/workspace";
import ModulePurposeCard from "./ModulePurposeCard.vue";

const props = defineProps<{
  snapshot: V2WorkspaceSnapshot;
  loading: boolean;
}>();

const selectedSceneId = ref<string | null>(
  props.snapshot.sceneGraph.scenes[0]?.sceneId ?? null
);

const selectedScene = computed(() => {
  return props.snapshot.sceneGraph.scenes.find(s => s.sceneId === selectedSceneId.value) || props.snapshot.sceneGraph.scenes[0];
});

const diagnostics = computed(() => props.snapshot.sceneGraph.diagnostics);
const hasErrors = computed(() => diagnostics.value.some(d => d.severity === 'danger'));

function formatValue(value: boolean | number | string) {
  return typeof value === "boolean" ? (value ? "是" : "否") : String(value);
}

function severityTone(severity: string): "danger" | "warning" | "info" {
  if (severity === "danger" || severity === "error") return "danger";
  if (severity === "warning") return "warning";
  return "info";
}
const store = useV2WorkspaceStore();
type GraphEntityKind = "arc" | "scene" | "choice";
const drawerOpen = ref(false);
const entityKind = ref<GraphEntityKind>("scene");
const title = ref("");
const body = ref("");
const sourceSceneId = ref("");
const targetSceneId = ref("");
const label = ref("");
const isEntry = ref<"true" | "false">("false");
const editingId = ref<string | null>(null);
const arcId = ref("");
const formError = ref<string | null>(null);
const gates = ref<Array<{ stateKey: string; operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte"; value: string }>>([]);
const consequences = ref<Array<{ stateKey: string; operation: "set" | "increment"; value: string }>>([]);

function resetForm(): void {
  title.value = "";
  body.value = "";
  sourceSceneId.value = props.snapshot.sceneGraph.scenes[0]?.sceneId ?? "";
  targetSceneId.value = "";
  label.value = "";
  isEntry.value = "false";
  arcId.value = "";
  gates.value = [];
  consequences.value = [];
  formError.value = null;
}

function openEditScene(): void {
  if (!selectedScene.value) return;
  editingId.value = selectedScene.value.sceneId;
  entityKind.value = "scene";
  title.value = selectedScene.value.title;
  body.value = selectedScene.value.body ?? "";
  arcId.value = selectedScene.value.arcId ?? "";
  isEntry.value = selectedScene.value.sceneId === props.snapshot.sceneGraph.entrySceneId ? "true" : "false";
  gates.value = [];
  consequences.value = [];
  formError.value = null;
  drawerOpen.value = true;
}

function openEditArc(arc: V2ArcSummary): void {
  editingId.value = arc.arcId;
  entityKind.value = "arc";
  title.value = arc.title;
  body.value = arc.summary ?? "";
  formError.value = null;
  drawerOpen.value = true;
}

function openEditChoice(choice: V2ChoiceSummary): void {
  editingId.value = choice.choiceId;
  entityKind.value = "choice";
  label.value = choice.label;
  sourceSceneId.value = choice.sourceSceneId;
  targetSceneId.value = choice.targetSceneId ?? "";
  gates.value = choice.gates.map((gate) => ({ stateKey: gate.stateKey, operator: gate.operator, value: String(gate.value) }));
  consequences.value = choice.consequences.map((consequence) => ({ stateKey: consequence.stateKey, operation: consequence.operation, value: String(consequence.value) }));
  formError.value = null;
  drawerOpen.value = true;
}

function openCreate(kind: GraphEntityKind): void {
  editingId.value = null;
  entityKind.value = kind;
  resetForm();
  drawerOpen.value = true;
}

function addGate(): void {
  gates.value.push({ stateKey: "", operator: "eq", value: "" });
}

function removeGate(index: number): void {
  gates.value.splice(index, 1);
}

function addConsequence(): void {
  consequences.value.push({ stateKey: "", operation: "set", value: "" });
}

function removeConsequence(index: number): void {
  consequences.value.splice(index, 1);
}

function stateEditorType(stateKey: string): "string" | "number" | "boolean" | undefined {
  const type = props.snapshot.typedState.variables.find((variable) => variable.key === stateKey)?.type;
  if (type === "flag") return "boolean";
  if (type === "number") return "number";
  if (type === "text") return "string";
  return undefined;
}

function normalizeRuleValue(stateKey: string, value: string | number | boolean): string | number | boolean {
  const type = stateEditorType(stateKey);
  if (type === "boolean") return value === true || value === "true";
  if (type === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "boolean") return value;
  const text = String(value).trim();
  if (text === "true") return true;
  if (text === "false") return false;
  if (text !== "" && !Number.isNaN(Number(text))) return Number(text);
  return text;
}

function validateForm(): string | null {
  if (entityKind.value === "arc" && !title.value.trim()) return "请输入 Arc 标题。";
  if (entityKind.value === "scene" && !title.value.trim()) return "请输入场景标题。";
  if (entityKind.value === "choice") {
    if (!label.value.trim()) return "请输入选项文本。";
    if (!sourceSceneId.value) return "请选择源场景。";
    for (const gate of gates.value) {
      if (!gate.stateKey.trim()) return "分支条件缺少状态变量 key。";
    }
    for (const consequence of consequences.value) {
      if (!consequence.stateKey.trim()) return "状态后果缺少状态变量 key。";
    }
  }
  return null;
}

async function submitCreate(): Promise<void> {
  formError.value = validateForm();
  if (formError.value) return;
  const trimmedTitle = title.value.trim();
  const trimmedBody = body.value.trim();
  const trimmedLabel = label.value.trim();
  const gatesPayload = gates.value.map((gate) => ({ stateKey: gate.stateKey.trim(), operator: gate.operator, value: normalizeRuleValue(gate.stateKey, gate.value) }));
  const consequencesPayload = consequences.value.map((consequence) => ({ stateKey: consequence.stateKey.trim(), operation: consequence.operation, value: normalizeRuleValue(consequence.stateKey, consequence.value) }));
  try {
    if (editingId.value) {
      if (entityKind.value === "arc") {
        await store.updateGraphEntity({ kind: "arc", id: editingId.value, input: { title: trimmedTitle, ...(trimmedBody ? { summary: trimmedBody } : {}) } });
      } else if (entityKind.value === "scene") {
        await store.updateGraphEntity({ kind: "scene", id: editingId.value, input: { title: trimmedTitle, ...(trimmedBody ? { body: trimmedBody } : {}), ...(arcId.value ? { arcId: arcId.value as V2ArcId } : {}), isEntry: isEntry.value === "true" } });
      } else if (entityKind.value === "choice") {
        await store.updateGraphEntity({ kind: "choice", id: editingId.value, input: { sourceSceneId: sourceSceneId.value as V2SceneId, ...(targetSceneId.value ? { targetSceneId: targetSceneId.value as V2SceneId } : {}), label: trimmedLabel, gates: gatesPayload, consequences: consequencesPayload } });
      }
    } else {
      const input: V2GraphCreateInput = entityKind.value === "arc"
        ? { kind: "arc", input: { title: trimmedTitle, ...(trimmedBody ? { summary: trimmedBody } : {}) } }
        : entityKind.value === "scene"
          ? { kind: "scene", input: { title: trimmedTitle, ...(trimmedBody ? { body: trimmedBody } : {}), ...(arcId.value ? { arcId: arcId.value as V2ArcId } : {}), ...(isEntry.value === "true" ? { isEntry: true } : {}) } }
          : { kind: "choice", input: { sourceSceneId: sourceSceneId.value as V2SceneId, ...(targetSceneId.value ? { targetSceneId: targetSceneId.value as V2SceneId } : {}), label: trimmedLabel, gates: gatesPayload, consequences: consequencesPayload } };
      await store.createGraphEntity(input);
    }
    if (store.error) throw new Error(store.error);
    drawerOpen.value = false;
  } catch (error) {
    formError.value = error instanceof Error ? error.message : "保存失败";
  }
}

</script>

<template>
    <ModulePurposeCard
      title="故事结构"
      description="故事结构决定故事如何从一个场景推进到另一个场景。Arc 用于组织剧情，Scene 是正式剧情节点，Choice 从一个场景跳到另一个场景并读取或修改状态变量。"
      :usages="[
        { label: 'Player Runtime', status: 'direct' },
        { label: 'Release', status: 'indirect' },
        { label: 'Scene Generation', status: 'partial' },
      ]"
    />
    <div class="graph-authoring-toolbar">
      <div><strong>故事结构</strong><span>新增 Arc、场景和分支选项</span></div>
      <div class="graph-authoring-actions">
        <Button variant="secondary" size="sm" :disabled="loading" @click="openCreate('arc')"><Plus :size="14" aria-hidden="true" />新增 Arc</Button>
        <Button variant="secondary" size="sm" :disabled="loading" @click="openCreate('scene')"><Plus :size="14" aria-hidden="true" />新增场景</Button>
        <Button variant="primary" size="sm" :disabled="loading" @click="openCreate('choice')"><Plus :size="14" aria-hidden="true" />新增选项</Button>
      </div>
    </div>

  <div class="graph-workspace">
    <!-- Diagnostics Banner -->
    <div class="diagnostics-summary" :class="{ 'has-errors': hasErrors }">
      <div class="diag-icon">
        <AlertCircle v-if="diagnostics.length > 0" :size="20" />
        <CheckCircle2 v-else :size="20" />
      </div>
      <div class="diag-text">
        <strong>结构诊断检查</strong>
        <span v-if="diagnostics.length === 0">所有场景可达且分支逻辑完整，未发现结构冲突。</span>
        <span v-else>检测到 {{ diagnostics.length }} 个待处理项（{{ diagnostics.filter(d => d.severity === 'danger').length }} 个严重阻断）。</span>
      </div>
      <Badge :tone="diagnostics.length === 0 ? 'success' : hasErrors ? 'danger' : 'warning'">
        {{ diagnostics.length === 0 ? '正常' : `${diagnostics.length} 项诊断` }}
      </Badge>
    </div>

    <div v-if="diagnostics.length > 0" class="diagnostics-list">
      <article
        v-for="diag in diagnostics"
        :key="`${diag.code}-${diag.targetId}`"
        class="diag-item"
      >
        <Badge :tone="severityTone(diag.severity)">{{ diag.code }}</Badge>
        <span class="diag-target">目标: {{ diag.targetId }}</span>
        <p class="diag-msg">{{ diag.message }}</p>
      </article>
    </div>

    <!-- Main Visual Split: Graph Flow & Detail Inspector -->
    <div class="graph-layout">
      <!-- Visual Scene Flow Column -->
      <div class="scenes-tree-container">
        <div class="tree-header">
          <h4>场景剧情节点图 ({{ snapshot.sceneGraph.scenes.length }})</h4>
          <span class="sub">点击节点查看详细状态与分支走向</span>
        </div>

        <div class="scenes-flow">
          <div
            v-for="(scene, index) in snapshot.sceneGraph.scenes"
            :key="scene.sceneId"
            class="scene-flow-node"
            :class="{ active: selectedScene?.sceneId === scene.sceneId, unreachable: !scene.reachable }"
            @click="selectedSceneId = scene.sceneId"
          >
            <div class="node-indicator">
              <span class="step-num">{{ index + 1 }}</span>
              <div v-if="index < snapshot.sceneGraph.scenes.length - 1" class="node-line"></div>
            </div>

            <div class="node-content">
              <div class="node-header">
                <strong>{{ scene.title }}</strong>
                <Badge :tone="scene.reachable ? 'success' : 'warning'">
                  {{ scene.reachable ? "可达" : "不可达" }}
                </Badge>
              </div>
              <div class="node-meta">
                <span class="scene-id">{{ scene.sceneId }}</span>
                <span class="choices-count">{{ scene.choiceCount }} 个分支选项</span>
              </div>
              <div v-if="scene.stateDeltaPreview.length > 0" class="state-pills">
                <span v-for="d in scene.stateDeltaPreview" :key="d.key" class="state-pill">
                  {{ d.key }}: {{ formatValue(d.before) }} → {{ formatValue(d.after) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Scene Detail Inspector Column -->
      <div v-if="selectedScene" class="scene-inspector">
        <div class="inspector-header">
          <div class="title-wrap">
            <span class="kicker">节点详情检查器</span>
            <h3>{{ selectedScene.title }}</h3>
            <span class="scene-key">ID: {{ selectedScene.sceneId }}</span>
          </div>
          <Button variant="ghost" size="icon" aria-label="编辑场景" @click="openEditScene"><Pencil :size="15" aria-hidden="true" /></Button>
          <Badge :tone="selectedScene.reachable ? 'success' : 'warning'">
            {{ selectedScene.reachable ? "可到达节点" : "孤立节点" }}
          </Badge>
        </div>

        <!-- State Transitions Preview -->
        <div class="inspector-section">
          <h5>类型化状态变更预览 (State Delta)</h5>
          <div v-if="selectedScene.stateDeltaPreview.length === 0" class="empty-state-notice">
            本场景节点不改变任何剧情变量。
          </div>
          <div v-else class="delta-list">
            <div v-for="delta in selectedScene.stateDeltaPreview" :key="delta.key" class="delta-row">
              <span class="var-name">{{ delta.key }}</span>
              <div class="var-flow">
                <span class="val before">{{ formatValue(delta.before) }}</span>
                <ArrowRight :size="12" />
                <span class="val after">{{ formatValue(delta.after) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Global Typed State Summary -->
        <div class="inspector-section">
          <h5>全局变量表 (Variables)</h5>
          <div class="variables-table">
            <div v-for="v in snapshot.typedState.variables" :key="v.key" class="var-card">
              <span class="var-label">{{ v.label }}</span>
              <span class="var-val">{{ formatValue(v.value) }}</span>
              <span class="var-type">({{ v.type }})</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Arc & Choice Authoring Lists -->
    <div class="graph-authoring-lists">
      <section class="arc-list-card">
        <div class="list-head">
          <h4>Arc 归属</h4>
          <span>{{ snapshot.sceneGraph.arcs.length }} 条</span>
        </div>
        <div v-if="snapshot.sceneGraph.arcs.length === 0" class="empty-state-notice">还没有 Arc，先新增一条。</div>
        <article v-for="arc in snapshot.sceneGraph.arcs" :key="arc.arcId" class="arc-item">
          <div class="item-main">
            <strong>{{ arc.title }}</strong>
            <span class="muted-id">{{ arc.arcId }}</span>
          </div>
          <p v-if="arc.summary" class="item-summary">{{ arc.summary }}</p>
          <Button variant="ghost" size="icon" aria-label="编辑 Arc" @click="openEditArc(arc)"><Pencil :size="15" aria-hidden="true" /></Button>
        </article>
      </section>

      <section class="choice-list-card">
        <div class="list-head">
          <h4>分支选项</h4>
          <span>{{ snapshot.sceneGraph.choices.length }} 条</span>
        </div>
        <div v-if="snapshot.sceneGraph.choices.length === 0" class="empty-state-notice">还没有分支选项，先新增一条。</div>
        <article v-for="choice in snapshot.sceneGraph.choices" :key="choice.choiceId" class="choice-item">
          <div class="item-main">
            <strong>{{ choice.label }}</strong>
            <span class="muted-id">{{ choice.choiceId }}</span>
          </div>
          <div class="choice-meta">
            <span>源: {{ choice.sourceSceneId }}</span>
            <span v-if="choice.targetSceneId">目标: {{ choice.targetSceneId }}</span>
          </div>
          <div v-if="choice.gates.length" class="choice-rules">
            <span v-for="gate in choice.gates" :key="`${choice.choiceId}-gate-${gate.stateKey}-${gate.operator}`" class="rule-chip">{{ gate.stateKey }} {{ gate.operator }} {{ formatValue(gate.value) }}</span>
          </div>
          <div v-if="choice.consequences.length" class="choice-rules">
            <span v-for="consequence in choice.consequences" :key="`${choice.choiceId}-consequence-${consequence.stateKey}-${consequence.operation}`" class="rule-chip consequence">{{ consequence.stateKey }} {{ consequence.operation }} {{ formatValue(consequence.value) }}</span>
          </div>
          <Button variant="ghost" size="icon" aria-label="编辑选项" @click="openEditChoice(choice)"><Pencil :size="15" aria-hidden="true" /></Button>
        </article>
      </section>
    </div>
  </div>
    <Drawer :open="drawerOpen" :title="editingId ? '编辑故事结构' : '新增故事结构'" description="ID 会自动生成，保存时会校验当前故事版本。" @close="drawerOpen = false">
      <form class="graph-create-form" @submit.prevent="submitCreate">
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <Field v-if="entityKind === 'arc' || entityKind === 'scene'" for-id="graph-title" :label="entityKind === 'arc' ? 'Arc 标题' : '场景标题'" required><Input id="graph-title" v-model="title" required /></Field>
        <Field v-if="entityKind === 'arc' || entityKind === 'scene'" for-id="graph-body" :label="entityKind === 'arc' ? 'Arc 摘要' : '场景正文'"><Textarea id="graph-body" v-model="body" :rows="6" /></Field>
        <Field v-if="entityKind === 'scene'" for-id="graph-arc" label="Arc 归属">
          <Select id="graph-arc" v-model="arcId" aria-label="Arc 归属"><option value="">不归属</option><option v-for="arc in snapshot.sceneGraph.arcs" :key="arc.arcId" :value="arc.arcId">{{ arc.title }}</option></Select>
        </Field>
        <Field v-if="entityKind === 'scene'" for-id="graph-entry" label="入口场景">
          <Select id="graph-entry" v-model="isEntry" aria-label="入口场景"><option value="false">否</option><option value="true">是</option></Select>
        </Field>
        <template v-if="entityKind === 'choice'">
          <Field for-id="graph-source" label="源场景" required><Select id="graph-source" v-model="sourceSceneId" aria-label="源场景"><option v-for="scene in snapshot.sceneGraph.scenes" :key="scene.sceneId" :value="scene.sceneId">{{ scene.title }}</option></Select></Field>
          <Field for-id="graph-target" label="目标场景"><Select id="graph-target" v-model="targetSceneId" aria-label="目标场景"><option value="">不指定</option><option v-for="scene in snapshot.sceneGraph.scenes" :key="scene.sceneId" :value="scene.sceneId">{{ scene.title }}</option></Select></Field>
          <Field for-id="graph-label" label="选项文本" required><Input id="graph-label" v-model="label" required /></Field>

          <div class="rule-editor">
            <div class="rule-editor-head">
              <strong>分支条件 Gates</strong>
              <Button variant="ghost" size="sm" type="button" @click="addGate"><Plus :size="14" aria-hidden="true" />添加条件</Button>
            </div>
            <div v-if="gates.length === 0" class="empty-state-notice">无条件限制。</div>
            <div v-for="(gate, index) in gates" :key="index" class="rule-row">
              <Select v-model="gate.stateKey" aria-label="条件状态变量"><option value="" disabled>选择状态变量</option><option v-for="variable in snapshot.typedState.variables" :key="variable.key" :value="variable.key">{{ variable.label }} ({{ variable.key }})</option></Select>
              <Select v-model="gate.operator" aria-label="条件运算符"><option value="eq">=</option><option value="neq">≠</option><option value="gt">&gt;</option><option value="gte">≥</option><option value="lt">&lt;</option><option value="lte">≤</option></Select>
              <Select v-if="stateEditorType(gate.stateKey) === 'boolean'" v-model="gate.value" aria-label="条件值"><option value="true">是</option><option value="false">否</option></Select>
              <Input v-else-if="stateEditorType(gate.stateKey) === 'number'" v-model="gate.value" type="number" placeholder="值" aria-label="条件值" />
              <Input v-else v-model="gate.value" placeholder="值" aria-label="条件值" />
              <Button variant="ghost" size="icon" type="button" aria-label="删除条件" @click="removeGate(index)">×</Button>
            </div>
          </div>

          <div class="rule-editor">
            <div class="rule-editor-head">
              <strong>状态后果 Consequences</strong>
              <Button variant="ghost" size="sm" type="button" @click="addConsequence"><Plus :size="14" aria-hidden="true" />添加后果</Button>
            </div>
            <div v-if="consequences.length === 0" class="empty-state-notice">无状态后果。</div>
            <div v-for="(consequence, index) in consequences" :key="index" class="rule-row">
              <Select v-model="consequence.stateKey" aria-label="后果状态变量"><option value="" disabled>选择状态变量</option><option v-for="variable in snapshot.typedState.variables" :key="variable.key" :value="variable.key">{{ variable.label }} ({{ variable.key }})</option></Select>
              <Select v-model="consequence.operation" aria-label="后果操作"><option value="set">set</option><option value="increment">increment</option></Select>
              <Select v-if="stateEditorType(consequence.stateKey) === 'boolean'" v-model="consequence.value" aria-label="后果值"><option value="true">是</option><option value="false">否</option></Select>
              <Input v-else-if="stateEditorType(consequence.stateKey) === 'number'" v-model="consequence.value" type="number" placeholder="值" aria-label="后果值" />
              <Input v-else v-model="consequence.value" placeholder="值" aria-label="后果值" />
              <Button variant="ghost" size="icon" type="button" aria-label="删除后果" @click="removeConsequence(index)">×</Button>
            </div>
          </div>
        </template>
      </form>
      <template #footer><Button variant="secondary" size="md" @click="drawerOpen = false">取消</Button><Button variant="primary" size="md" :loading="loading" @click="submitCreate">保存</Button></template>
    </Drawer>
</template>

<style scoped>
.graph-workspace {
  display: grid;
  gap: var(--space-4);

}
.graph-authoring-toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-soft); }
.graph-authoring-toolbar strong { display: block; color: var(--text-strong); }
.graph-authoring-toolbar span { display: block; margin-top: 2px; color: var(--muted); font-size: var(--text-xs); }
.graph-authoring-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.graph-create-form { display: grid; gap: var(--space-4); }
@media (max-width: 640px) { .graph-authoring-toolbar { align-items: stretch; flex-direction: column; } .graph-authoring-actions { display: grid; grid-template-columns: 1fr; } }


.diagnostics-summary {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.diagnostics-summary.has-errors {
  background: #fef2f2;
  border-color: #fecaca;
}

.diag-icon {
  color: var(--primary);
  display: grid;
  place-items: center;
}

.diagnostics-summary.has-errors .diag-icon {
  color: #dc2626;
}

.diag-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.diag-text strong {
  font-size: var(--text-sm);
  color: var(--text-strong);
}

.diag-text span {
  font-size: var(--text-xs);
  color: var(--muted);
}

.diagnostics-list {
  display: grid;
  gap: var(--space-2);
}

.diag-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
}

.diag-target {
  color: var(--muted);
  font-family: monospace;
}

.diag-msg {
  margin: 0;
  color: var(--text);
  flex: 1;
}

.graph-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.scenes-tree-container {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.tree-header h4 {
  margin: 0;
  font-size: var(--text-md);
  color: var(--text-strong);
}

.tree-header .sub {
  font-size: var(--text-xs);
  color: var(--muted);
}

.scenes-flow {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.scene-flow-node {
  display: flex;
  gap: var(--space-3);
  cursor: pointer;
  position: relative;
}

.node-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 24px;
}

.step-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--surface);
  border: 2px solid var(--border);
  display: grid;
  place-items: center;
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--text);
  z-index: 2;
  transition: all 0.2s ease;
}

.scene-flow-node.active .step-num {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.node-line {
  flex: 1;
  width: 2px;
  background: var(--border);
  min-height: 20px;
}

.node-content {
  flex: 1;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  transition: all 0.15s ease;
}

.scene-flow-node:hover .node-content {
  border-color: var(--border-strong);
}

.scene-flow-node.active .node-content {
  border-color: var(--primary);
  box-shadow: var(--shadow-sm);
}

.node-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
}

.node-header strong {
  font-size: var(--text-sm);
  color: var(--text-strong);
}

.node-meta {
  display: flex;
  gap: var(--space-3);
  font-size: var(--text-xs);
  color: var(--muted);
  margin-top: 4px;
}

.scene-id {
  font-family: monospace;
}

.state-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: var(--space-2);
}

.state-pill {
  font-size: var(--text-xs);
  padding: 1px 6px;
  background: #f0fdf4;
  color: #15803d;
  border-radius: var(--radius-xs);
  border: 1px solid #bbf7d0;
}

.scene-inspector {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.inspector-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 1px solid var(--border);
  padding-bottom: var(--space-3);
}

.kicker {
  font-size: var(--text-xs);
  color: var(--primary);
  font-weight: 700;
  text-transform: uppercase;
}

.title-wrap h3 {
  margin: 2px 0;
  font-size: var(--text-lg);
  color: var(--text-strong);
}

.scene-key {
  font-size: var(--text-xs);
  color: var(--muted);
  font-family: monospace;
}

.inspector-section h5 {
  margin: 0 0 var(--space-2) 0;
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  color: var(--muted);
}

.empty-state-notice {
  font-size: var(--text-xs);
  color: var(--muted);
  padding: var(--space-2);
}

.delta-list {
  display: grid;
  gap: var(--space-2);
}

.delta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
}

.var-name {
  font-weight: 600;
  color: var(--text-strong);
}

.var-flow {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.val {
  padding: 1px 6px;
  border-radius: var(--radius-xs);
}

.val.before {
  background: #f1f5f9;
  color: #64748b;
}

.val.after {
  background: #dcfce7;
  color: #15803d;
  font-weight: 600;
}

.variables-table {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: var(--space-2);
}

.var-card {
  display: flex;
  flex-direction: column;
  padding: var(--space-2);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
}

.var-label {
  color: var(--muted);
}

.var-val {
  font-weight: 700;
  color: var(--text-strong);
  margin-top: 2px;
}

.var-type {
  font-size: 10px;
  color: var(--muted);
}

@media (max-width: 768px) {
  .graph-layout {
    grid-template-columns: 1fr;
  }
}
</style>
