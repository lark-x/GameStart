<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Clock3, RefreshCw, Send, ShieldAlert } from "@lucide/vue";
import Badge from "../components/ui/Badge.vue";
import Button from "../components/ui/Button.vue";
import Select from "../components/ui/Select.vue";
import PageHeader from "../components/layout/PageHeader.vue";
import { useAppStore } from "../stores/app";
import {
  errorMessage,
  type CreatorDispatchAction,
  type CreatorEventCandidateDto,
  type EventDispatchBatchDto,
  type EventDispatchPreviewDto,
} from "../types";

const store = useAppStore();
const candidates = ref<CreatorEventCandidateDto[]>([]);
const selections = ref<Record<string, CreatorDispatchAction>>({});
const preview = ref<EventDispatchPreviewDto>();
const batch = ref<EventDispatchBatchDto>();
const loading = ref(false);
const previewing = ref(false);
const dispatching = ref(false);
const error = ref("");
const dispatchAvailable = ref(true);
const workerStatus = ref<string>();
let pollTimer: ReturnType<typeof setTimeout> | undefined;

const categoryLabels: Record<string, string> = {
  OVERDUE: "待补执行",
  UPCOMING: "即将发生",
  FAILED: "可重试",
  STALLED: "疑似卡住",
  MANUAL: "可手动触发",
};
const actionLabels: Record<CreatorDispatchAction, string> = {
  EXECUTE_EXISTING: "补执行",
  RETRY_FAILED: "重试",
  RUN_TRIAL: "立即试演",
};
const terminalStatuses = new Set([
  "COMPLETED",
  "SUCCEEDED",
  "FAILED",
  "PARTIAL_FAILURE",
  "CANCELLED",
]);
const selectionList = computed(() =>
  Object.entries(selections.value).map(([candidateId, action]) => ({
    candidateId,
    action,
  })),
);
const canDispatch = computed(
  () => Boolean(preview.value) && preview.value?.canDispatch === true && dispatchAvailable.value,
);
const workerLabel = computed(() =>
  workerStatus.value ? "Worker：" + workerStatus.value : "",
);

function invalidatePreview() {
  preview.value = undefined;
}

function toggleCandidate(candidate: CreatorEventCandidateDto) {
  if (selections.value[candidate.id]) {
    delete selections.value[candidate.id];
  } else if (candidate.allowedActions[0]) {
    selections.value[candidate.id] = candidate.allowedActions[0];
  }
  invalidatePreview();
}

function updateAction(candidateId: string, action: string) {
  selections.value[candidateId] = action as CreatorDispatchAction;
  invalidatePreview();
}

function outputText(summary: CreatorEventCandidateDto["outputSummary"]) {
  if (!summary) return "未声明输出";
  return summary.join("、");
}

async function loadCandidates() {
  if (!store.currentWorldId) return;
  loading.value = true;
  error.value = "";
  try {
    const response = await store.api.getCreatorEventCandidates(store.currentWorldId, 7);
    const data = response.data;
    candidates.value = Array.isArray(data) ? [...data] : [...data.candidates];
    dispatchAvailable.value = Array.isArray(data) ? true : data.dispatchAvailable ?? true;
    workerStatus.value = Array.isArray(data) ? undefined : data.workerStatus;
    selections.value = {};
    preview.value = undefined;
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    loading.value = false;
  }
}

async function requestPreview() {
  if (!store.currentWorldId || selectionList.value.length === 0) return;
  previewing.value = true;
  error.value = "";
  try {
    preview.value = (
      await store.api.previewCreatorDispatch(store.currentWorldId, {
        selections: selectionList.value,
      })
    ).data;
  } catch (cause) {
    preview.value = undefined;
    error.value = errorMessage(cause);
  } finally {
    previewing.value = false;
  }
}

async function pollBatch(batchId: string, attempts = 0) {
  try {
    batch.value = (await store.api.getCreatorDispatch(batchId)).data;
    if (terminalStatuses.has(batch.value.status) || attempts >= 20) return;
    pollTimer = setTimeout(() => void pollBatch(batchId, attempts + 1), 1500);
  } catch (cause) {
    error.value = errorMessage(cause);
  }
}

async function dispatch() {
  if (!store.currentWorldId || !canDispatch.value) return;
  dispatching.value = true;
  error.value = "";
  try {
    const result = (
      await store.api.createCreatorDispatch(store.currentWorldId, {
        selections: selectionList.value,
        idempotencyKey: crypto.randomUUID(),
      })
    ).data;
    batch.value = result;
    const batchId = result.id;
    if (!batchId) throw new Error("派发响应缺少 batch id");
    selections.value = {};
    preview.value = undefined;
    await pollBatch(batchId);
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    dispatching.value = false;
  }
}

watch(() => store.currentWorldId, () => void loadCandidates(), { immediate: true });
onBeforeUnmount(() => pollTimer && clearTimeout(pollTimer));
</script>

<template>
  <div class="page creator-page">
    <PageHeader
      eyebrow="创作中心 · M7A"
      title="事件调度台"
      description="扫描世界事件，确认影响后交给 Worker 执行。"
      :status="workerLabel"
    >
      <template #actions>
        <Button variant="secondary" size="sm" :loading="loading" @click="loadCandidates">
          <RefreshCw :size="15" />
          刷新
        </Button>
      </template>
    </PageHeader>

    <p v-if="!dispatchAvailable" class="creator-alert">
      <ShieldAlert :size="17" />
      当前运行模式不支持派发，可继续扫描和预览。
    </p>
    <p v-if="error" class="creator-alert creator-alert-error">
      <ShieldAlert :size="17" />
      {{ error }}
    </p>

    <div v-if="loading" class="ui-card creator-empty">正在扫描候选事项…</div>
    <div v-else-if="candidates.length === 0" class="ui-card creator-empty">
      <Clock3 :size="28" />
      <strong>当前没有待处理事项</strong>
    </div>
    <div v-else class="candidate-list">
      <article v-for="candidate in candidates" :key="candidate.id" class="candidate-row">
        <input
          class="ui-check"
          type="checkbox"
          :checked="Boolean(selections[candidate.id])"
          :disabled="candidate.allowedActions.length === 0"
          @change="toggleCandidate(candidate)"
        />
        <div class="candidate-copy">
          <div class="candidate-title">
            <strong>{{ candidate.definition.name }}</strong>
            <Badge>{{ categoryLabels[candidate.category] ?? candidate.category }}</Badge>
          </div>
          <p>{{ candidate.scheduledFor ?? "未安排时间" }}</p>
          <small>角色：{{ candidate.targetCharacterIds.join("、") || "未指定" }}</small>
          <small>接收者：{{ candidate.recipientCharacterIds.join("、") || "未指定" }}</small>
          <small>输出：{{ outputText(candidate.outputSummary) }}</small>
          <small v-if="candidate.risks?.length" class="risk">
            风险：{{ candidate.risks.join("、") }}
          </small>
        </div>
        <Select
          v-if="selections[candidate.id]"
          class="action-select"
          :model-value="selections[candidate.id] ?? ''"
          aria-label="选择执行动作"
          @update:model-value="updateAction(candidate.id, $event)"
        >
          <option v-for="action in candidate.allowedActions" :key="action" :value="action">
            {{ actionLabels[action] }}
          </option>
        </Select>
      </article>
    </div>

    <div v-if="selectionList.length" class="dispatch-bar">
      <span>已选择 {{ selectionList.length }} 项</span>
      <Button variant="secondary" size="sm" :loading="previewing" @click="requestPreview">
        查看影响
      </Button>
      <Button v-if="preview" size="sm" :loading="dispatching" :disabled="!canDispatch" @click="dispatch">
        <Send :size="15" />
        确认派发
      </Button>
    </div>

    <section v-if="preview" class="ui-card preview-panel">
      <h2>影响预览</h2>
      <p v-for="item in preview.items" :key="item.candidateId">{{ item.effect }}</p>
    </section>

    <section v-if="batch" class="ui-card batch-panel">
      <div class="candidate-title">
        <h2>派发批次</h2>
        <Badge>{{ batch.status }}</Badge>
      </div>
      <div v-for="item in batch.items" :key="item.candidateId" class="batch-item">
        <span>{{ item.candidateId }}</span>
        <Badge>{{ item.status }}</Badge>
        <small v-if="item.failureReason">{{ item.failureReason }}</small>
      </div>
    </section>
  </div>
</template>

<style scoped>
.creator-page {
  max-width: 1080px;
}
.candidate-list {
  display: grid;
  gap: 8px;
}
.candidate-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 130px;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.candidate-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.candidate-copy p,
.candidate-copy small {
  display: block;
  margin-top: 5px;
  color: var(--muted);
  font-size: var(--text-sm);
  line-height: 1.45;
}
.candidate-copy .risk {
  color: var(--warning);
}
.action-select {
  width: 130px;
}
.creator-empty {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 220px;
  color: var(--muted);
}
.creator-alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 12px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--warning-soft);
  color: var(--warning);
}
.creator-alert-error {
  background: var(--danger-soft);
  color: var(--danger);
}
.dispatch-bar {
  position: sticky;
  z-index: 3;
  bottom: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-glass);
  box-shadow: var(--shadow-md);
}
.dispatch-bar > span {
  margin-right: auto;
  font-weight: 700;
}
.preview-panel,
.batch-panel {
  margin-top: 18px;
}
.preview-panel h2,
.batch-panel h2 {
  margin-bottom: 12px;
  font-size: var(--text-xl);
}
.preview-panel p {
  padding: 10px 0;
  border-top: 1px solid var(--border);
  color: var(--muted);
}
.batch-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid var(--border);
}
.batch-item small {
  grid-column: 1 / -1;
  color: var(--danger);
}
@media (max-width: 640px) {
  .candidate-row {
    grid-template-columns: 20px minmax(0, 1fr);
  }
  .action-select {
    grid-column: 2;
    width: 100%;
  }
  .dispatch-bar {
    flex-wrap: wrap;
  }
  .dispatch-bar > span {
    width: 100%;
  }
}


.candidate-list { height: min(58vh, 600px); min-height: 220px; overflow-y: auto; overscroll-behavior: contain; padding-right: 4px; }
.preview-panel, .batch-panel { max-height: 360px; overflow-y: auto; overscroll-behavior: contain; }
@media (max-width: 640px) { .candidate-list { height: 360px; min-height: 0; } .preview-panel, .batch-panel { max-height: 320px; } }

</style>
