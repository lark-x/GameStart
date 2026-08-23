<script setup lang="ts">
import { ref, watch } from "vue";
import {
  GitFork,
  X,
  Save,
  Plus,
  Trash2,
  Lock,
  Zap,
  ArrowRight,
} from "@lucide/vue";
import type {
  V2ChoiceDto,
  V2StateComparisonOperator,
  V2StateConsequenceOperation,
  V2StateGateDto,
  V2StateConsequenceDto,
} from "@living-network/contracts/v2";
import { useNarrativeChoiceStore } from "../../stores/useNarrativeChoiceStore.ts";

const props = defineProps<{
  storyWorldId: string;
  choice: V2ChoiceDto;
  availableScenes: readonly { sceneId: string; title: string }[];
}>();

const emit = defineEmits<{
  close: [];
  updated: [];
  deleted: [];
}>();

const choiceStore = useNarrativeChoiceStore();

// Local edit state
const label = ref(props.choice.label);
const targetSceneId = ref(props.choice.targetSceneId || "");
const gates = ref<V2StateGateDto[]>([...props.choice.gates]);
const consequences = ref<V2StateConsequenceDto[]>([
  ...(props.choice.consequences.filter((c) => !c.kind || c.kind === "story") as V2StateConsequenceDto[]),
]);

const saving = ref(false);
const error = ref<string | null>(null);

watch(
  () => props.choice,
  (newVal) => {
    label.value = newVal.label;
    targetSceneId.value = newVal.targetSceneId || "";
    gates.value = [...newVal.gates];
    consequences.value = [
      ...(newVal.consequences.filter((c) => !c.kind || c.kind === "story") as V2StateConsequenceDto[]),
    ];
  },
);

function addGate() {
  gates.value.push({
    stateKey: "Variable",
    operator: "eq" as V2StateComparisonOperator,
    value: true,
  });
}

function removeGate(index: number) {
  gates.value.splice(index, 1);
}

function addConsequence() {
  consequences.value.push({
    kind: "story",
    stateKey: "Variable",
    operation: "set" as V2StateConsequenceOperation,
    value: true,
  });
}

function removeConsequence(index: number) {
  consequences.value.splice(index, 1);
}

async function handleSave() {
  saving.value = true;
  error.value = null;
  try {
    await choiceStore.updateChoice(props.storyWorldId, props.choice.choiceId, {
      sourceSceneId: props.choice.sourceSceneId,
      targetSceneId: targetSceneId.value ? targetSceneId.value : undefined,
      label: label.value.trim() || props.choice.label,
      gates: gates.value,
      consequences: consequences.value,
    });
    emit("updated");
  } catch (err) {
    error.value = err instanceof Error ? err.message : "保存分支设置失败";
  } finally {
    saving.value = false;
  }
}

async function handleDelete() {
  if (!confirm(`确定要删除选项「${props.choice.label}」吗？`)) return;
  saving.value = true;
  try {
    await choiceStore.deleteChoice(props.storyWorldId, props.choice.choiceId);
    emit("deleted");
    emit("close");
  } catch (err) {
    error.value = err instanceof Error ? err.message : "删除分支选项失败";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-800 text-xs shadow-xl">
    <!-- Header -->
    <div class="p-3.5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between bg-stone-50/60 dark:bg-stone-950/40">
      <div class="flex items-center gap-2">
        <div class="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
          <GitFork class="h-4 w-4" />
        </div>
        <div>
          <h3 class="font-bold text-stone-900 dark:text-stone-100">分支选项属性</h3>
          <span class="text-[10px] text-stone-400 font-mono">{{ choice.choiceId }}</span>
        </div>
      </div>
      <button
        type="button"
        class="p-1.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
        @click="emit('close')"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <!-- Body -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      <!-- Error notice -->
      <div v-if="error" class="p-2.5 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900/60">
        {{ error }}
      </div>

      <!-- Choice Label -->
      <div class="space-y-1.5">
        <label class="font-semibold text-stone-700 dark:text-stone-300">选项文本</label>
        <input
          v-model="label"
          type="text"
          placeholder="例如：询问真相 / 拔剑而战"
          class="w-full px-3 py-1.5 rounded-xl bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 outline-none focus:border-amber-500 font-medium text-xs"
        />
      </div>

      <!-- Target Scene Selector -->
      <div class="space-y-1.5">
        <label class="font-semibold text-stone-700 dark:text-stone-300">后继导向场景</label>
        <div class="relative flex items-center">
          <ArrowRight class="absolute left-3 h-3.5 w-3.5 text-stone-400 pointer-events-none" />
          <select
            v-model="targetSceneId"
            class="w-full pl-8 pr-3 py-1.5 rounded-xl bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 outline-none focus:border-amber-500 font-medium cursor-pointer text-xs"
          >
            <option value="">(无目标场景 / 结束节点)</option>
            <option v-for="s in availableScenes" :key="s.sceneId" :value="s.sceneId">
              {{ s.title }}
            </option>
          </select>
        </div>
      </div>

      <!-- State Gates (Conditions) -->
      <div class="space-y-2.5 pt-2 border-t border-stone-100 dark:border-stone-800">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5 font-semibold text-stone-700 dark:text-stone-300">
            <Lock class="h-3.5 w-3.5 text-amber-500" />
            <span>前置条件</span>
            <span class="font-mono text-stone-400">({{ gates.length }})</span>
          </div>
          <button
            type="button"
            class="text-amber-600 dark:text-amber-400 hover:underline font-medium flex items-center gap-0.5 text-[11px]"
            @click="addGate"
          >
            <Plus class="h-3 w-3" />
            <span>添加条件</span>
          </button>
        </div>

        <div v-if="gates.length > 0" class="space-y-2">
          <div
            v-for="(g, idx) in gates"
            :key="idx"
            class="p-2.5 bg-stone-50 dark:bg-stone-800/60 rounded-xl border border-stone-200/60 dark:border-stone-700/60 space-y-2"
          >
            <div class="flex items-center gap-2">
              <input
                v-model="g.stateKey"
                type="text"
                placeholder="变量名"
                class="flex-1 px-2 py-1 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 font-mono text-[11px]"
              />
              <select
                v-model="g.operator"
                class="px-2 py-1 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 font-mono text-[11px]"
              >
                <option value="eq">== (等于)</option>
                <option value="neq">!= (不等于)</option>
                <option value="gt">&gt; (大于)</option>
                <option value="gte">&gt;= (大于等于)</option>
                <option value="lt">&lt; (小于)</option>
                <option value="lte">&lt;= (小于等于)</option>
              </select>
              <button
                type="button"
                class="p-1 text-stone-400 hover:text-red-500 rounded transition-colors"
                @click="removeGate(idx)"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
            <div>
              <input
                v-model="g.value"
                type="text"
                placeholder="目标值"
                class="w-full px-2 py-1 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 font-mono text-[11px]"
              />
            </div>
          </div>
        </div>
        <p v-else class="text-stone-400 italic">无前置条件限制</p>
      </div>

      <!-- State Consequences -->
      <div class="space-y-2.5 pt-2 border-t border-stone-100 dark:border-stone-800">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5 font-semibold text-stone-700 dark:text-stone-300">
            <Zap class="h-3.5 w-3.5 text-purple-500" />
            <span>状态变更结果</span>
            <span class="font-mono text-stone-400">({{ consequences.length }})</span>
          </div>
          <button
            type="button"
            class="text-purple-600 dark:text-purple-400 hover:underline font-medium flex items-center gap-0.5 text-[11px]"
            @click="addConsequence"
          >
            <Plus class="h-3 w-3" />
            <span>添加变更</span>
          </button>
        </div>

        <div v-if="consequences.length > 0" class="space-y-2">
          <div
            v-for="(c, idx) in consequences"
            :key="idx"
            class="p-2.5 bg-stone-50 dark:bg-stone-800/60 rounded-xl border border-stone-200/60 dark:border-stone-700/60 space-y-2"
          >
            <div class="flex items-center gap-2">
              <input
                v-model="c.stateKey"
                type="text"
                placeholder="变量名"
                class="flex-1 px-2 py-1 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 font-mono text-[11px]"
              />
              <select
                v-model="c.operation"
                class="px-2 py-1 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 font-mono text-[11px]"
              >
                <option value="set">set (赋值)</option>
                <option value="increment">increment (增加)</option>
                <option value="decrement">decrement (减少)</option>
                <option value="toggle">toggle (反转)</option>
              </select>
              <button
                type="button"
                class="p-1 text-stone-400 hover:text-red-500 rounded transition-colors"
                @click="removeConsequence(idx)"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
            <div>
              <input
                v-model="c.value"
                type="text"
                placeholder="变更值"
                class="w-full px-2 py-1 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 font-mono text-[11px]"
              />
            </div>
          </div>
        </div>
        <p v-else class="text-stone-400 italic">无状态变更</p>
      </div>
    </div>

    <!-- Footer Actions -->
    <div class="p-3 border-t border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-950/40 flex items-center justify-between gap-2">
      <button
        type="button"
        class="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 font-medium flex items-center gap-1 transition-all"
        :disabled="saving"
        @click="handleDelete"
      >
        <Trash2 class="h-3.5 w-3.5" />
        <span>删除选项</span>
      </button>

      <button
        type="button"
        class="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold flex items-center gap-1.5 shadow-sm transition-all"
        :disabled="saving"
        @click="handleSave"
      >
        <Save class="h-3.5 w-3.5" />
        <span>{{ saving ? '保存中...' : '保存更改' }}</span>
      </button>
    </div>
  </div>
</template>
