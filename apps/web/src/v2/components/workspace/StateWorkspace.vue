<script setup lang="ts">
import { ref } from "vue";
import { Pencil, Plus, Variable } from "@lucide/vue";

import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Drawer from "../../../components/ui/Drawer.vue";
import Field from "../../../components/ui/Field.vue";
import Input from "../../../components/ui/Input.vue";
import Select from "../../../components/ui/Select.vue";
import type { V2WorkspaceSnapshot } from "../../adapters";
import { useV2WorkspaceStore } from "../../stores/workspace";

defineProps<{ snapshot: V2WorkspaceSnapshot; loading: boolean }>();
const store = useV2WorkspaceStore();
const open = ref(false);
const editingKey = ref<string | null>(null);
const key = ref("");
const valueType = ref<"string" | "number" | "boolean">("string");
const defaultValue = ref("");
const formError = ref<string | null>(null);

function reset(): void {
  editingKey.value = null;
  key.value = "";
  valueType.value = "string";
  defaultValue.value = "";
  formError.value = null;
}

function openEdit(variable: { readonly key: string; readonly type: "flag" | "number" | "text"; readonly defaultValue: boolean | number | string }): void {
  editingKey.value = variable.key;
  key.value = variable.key;
  valueType.value = variable.type === "flag" ? "boolean" : variable.type === "number" ? "number" : "string";
  defaultValue.value = String(variable.defaultValue);
  formError.value = null;
  open.value = true;
}

function parseDefault(): string | number | boolean {
  if (valueType.value === "number") return Number(defaultValue.value);
  if (valueType.value === "boolean") return defaultValue.value === "true";
  return defaultValue.value;
}

async function submit(): Promise<void> {
  formError.value = null;
  const trimmedKey = key.value.trim();
  if (!trimmedKey) {
    formError.value = "请输入变量 key。";
    return;
  }
  try {
    if (editingKey.value) {
      await store.updateGraphEntity({
        kind: "state",
        id: editingKey.value,
        input: { defaultValue: parseDefault() },
      });
    } else {
      await store.createGraphEntity({
        kind: "state",
        input: {
          key: trimmedKey,
          valueType: valueType.value,
          defaultValue: parseDefault(),
        },
      });
    }
    if (store.error) throw new Error(store.error);
    open.value = false;
  } catch (error) {
    formError.value = error instanceof Error ? error.message : "保存状态变量失败";
  }
}
</script>

<template>
  <section class="state-workspace">
    <div class="state-toolbar">
      <div>
        <p class="state-kicker">状态变量</p>
        <h3>剧情状态 schema</h3>
        <p>先声明变量，再在 Choice 中使用条件和状态后果。</p>
      </div>
      <Button variant="primary" size="md" :disabled="loading" @click="reset(); open = true">
        <Plus :size="16" aria-hidden="true" />
        新增变量
      </Button>
    </div>
    <div v-if="snapshot.typedState.variables.length === 0" class="state-empty">
      <Variable :size="22" aria-hidden="true" />
      <strong>还没有状态变量</strong>
      <span>创建第一个变量，为分支逻辑提供可验证的状态基础。</span>
    </div>
    <div v-else class="state-grid">
      <article v-for="variable in snapshot.typedState.variables" :key="variable.key" class="state-card">
        <div class="state-card-head"><strong>{{ variable.label }}</strong><Badge tone="neutral">{{ variable.type }}</Badge></div>
        <code>{{ variable.key }}</code>
        <span>默认值：{{ String(variable.defaultValue) }}</span>
        <Button variant="ghost" size="sm" aria-label="编辑状态变量" @click="openEdit(variable)"><Pencil :size="14" aria-hidden="true" />编辑默认值</Button>
      </article>
    </div>
    <Drawer :open="open" :title="editingKey ? '编辑状态变量' : '新增状态变量'" description="key 和类型创建后不可修改。" @close="open = false">
      <form class="state-form" @submit.prevent="submit">
        <Field for-id="state-key" label="变量 key" required><Input id="state-key" v-model="key" placeholder="例如：has_ticket" :disabled="editingKey !== null" required /></Field>
        <Field for-id="state-type" label="类型" required><Select id="state-type" v-model="valueType" aria-label="变量类型" :disabled="editingKey !== null"><option value="string">文本</option><option value="number">数字</option><option value="boolean">布尔</option></Select></Field>
        <Field for-id="state-default" label="默认值" required><Input id="state-default" v-model="defaultValue" placeholder="默认值" required /></Field>
        <p v-if="formError" class="state-error" role="alert">{{ formError }}</p>
      </form>
      <template #footer>
        <Button variant="secondary" size="md" @click="open = false">取消</Button>
        <Button variant="primary" size="md" :loading="loading" @click="submit">保存变量</Button>
      </template>
    </Drawer>
  </section>
</template>

<style scoped>
.state-workspace { display: grid; gap: var(--space-4); }
.state-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-soft); }
.state-kicker { margin: 0 0 var(--space-1); color: var(--primary); font-size: var(--text-xs); font-weight: 800; }
.state-toolbar h3 { margin: 0; color: var(--text-strong); font-size: var(--text-lg); }
.state-toolbar p:last-child { margin: var(--space-1) 0 0; color: var(--muted); font-size: var(--text-sm); }
.state-empty { display: grid; justify-items: center; gap: var(--space-2); padding: var(--space-8); border: 1px dashed var(--border-strong); border-radius: var(--radius-md); color: var(--muted); }
.state-empty strong { color: var(--text-strong); }
.state-empty span { font-size: var(--text-sm); }
.state-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-3); }
.state-card { display: grid; gap: var(--space-2); padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-soft); }
.state-card-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
</style>
