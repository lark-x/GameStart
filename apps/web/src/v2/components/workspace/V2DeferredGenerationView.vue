<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { Activity, AlertTriangle, Check, FileSearch, RefreshCw, Send, Settings2, Sparkles, X } from "@lucide/vue";
import type { V2PlatformCapabilities } from "@living-network/contracts/v2";

import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import EmptyState from "../../../components/ui/EmptyState.vue";
import Field from "../../../components/ui/Field.vue";
import Input from "../../../components/ui/Input.vue";
import Textarea from "../../../components/ui/Textarea.vue";
import { useV2WorkspaceStore } from "../../stores/workspace";
import { v2MediaRefToUrl } from "../../adapters";
import { createV2PlatformClient } from "../../adapters/platform.ts";
import type { V2CandidateReviewAction, V2WorkspaceSnapshot } from "../../adapters";

const props = defineProps<{ area: string; snapshot: V2WorkspaceSnapshot | null }>();
const store = useV2WorkspaceStore();
const router = useRouter();
const capabilities = ref<V2PlatformCapabilities | null>(null);
const capabilityError = ref<string | null>(null);
const loadingCapabilities = ref(false);

const service = computed(() => props.area.startsWith("comfy-") ? "ComfyUI" : "模型");
const isComfy = computed(() => service.value === "ComfyUI");
const section = computed(() => props.area.endsWith("-jobs") ? "jobs" : props.area.endsWith("-review") ? "review" : "request");
const job = computed(() => isComfy.value ? props.snapshot?.assets.job : props.snapshot?.generation.job);
const sceneCandidate = computed(() => props.snapshot?.candidate ?? null);
const assetCandidate = computed(() => props.snapshot?.assets.candidate ?? null);
const scenePreview = computed(() => store.scenePreparedRequest === null ? "" : JSON.stringify(store.scenePreparedRequest.request, null, 2));
const assetPreview = computed(() => store.assetPreparedRequest === null ? "" : JSON.stringify(store.assetPreparedRequest.request, null, 2));
const previewText = computed(() => isComfy.value ? assetPreview.value : scenePreview.value);
const activeCapability = computed(() => isComfy.value ? capabilities.value?.assetGeneration : capabilities.value?.sceneGeneration);
const capabilityReady = computed(() => activeCapability.value?.configured === true);
const canSubmit = computed(() =>
  props.snapshot !== null &&
  capabilityReady.value &&
  (isComfy.value ? store.canSubmitAssetGeneration : store.canSubmitSceneGeneration),
);
const configurePath = computed(() => isComfy.value ? "/v2/services/comfyui" : "/v2/services/models");

function platformClient() {
  const env = (import.meta as ImportMeta & { readonly env?: Record<string, string | undefined> }).env ?? {};
  const fallback = typeof window === "undefined" ? "http://127.0.0.1:3002" : window.location.origin;
  return createV2PlatformClient({ baseUrl: env.VITE_API_BASE || fallback });
}

async function loadCapabilities(): Promise<void> {
  loadingCapabilities.value = true;
  capabilityError.value = null;
  try {
    capabilities.value = await platformClient().getCapabilities();
  } catch (error) {
    capabilityError.value = error instanceof Error ? error.message : "无法读取外部服务状态";
  } finally {
    loadingCapabilities.value = false;
  }
}

function statusLabel(status: string | undefined): string {
  return {
    queued: "排队中",
    claimed: "已领取",
    running: "执行中",
    succeeded: "已完成",
    "candidate-ready": "候选已回写",
    pending: "待审核",
    approved: "已通过",
    changes_requested: "要求修改",
    rejected: "已驳回",
    failed: "失败",
    cancelled: "已取消",
  }[status ?? ""] ?? (status ?? "暂无");
}

function mediaUrl(mediaRef: string): string | undefined {
  const env = (import.meta as ImportMeta & { readonly env?: Record<string, string | undefined> }).env ?? {};
  return v2MediaRefToUrl(mediaRef, env.VITE_API_BASE || window.location.origin);
}

function updateSeed(value: string): void {
  const parsed = Number.parseInt(value, 10);
  store.assetSeed = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function reviewScene(action: V2CandidateReviewAction): void {
  void store.reviewCandidate(action);
}

function reviewAsset(action: V2CandidateReviewAction): void {
  void store.reviewAssetCandidate(action);
}

function goToConfigure(): void {
  void router.push(configurePath.value);
}

onMounted(() => {
  void loadCapabilities();
});
</script>

<template>
  <section class="generation-module" :aria-labelledby="`v2-${area}-title`">
    <header class="module-header">
      <div>
        <p>{{ service }} 隔离模块</p>
        <h2 :id="`v2-${area}-title`">
          <template v-if="section === 'request'">创建请求</template>
          <template v-else-if="section === 'jobs'">任务状态</template>
          <template v-else>候选审核</template>
        </h2>
      </div>
      <Badge :tone="job?.status === 'failed' ? 'danger' : job ? 'info' : 'neutral'">
        {{ statusLabel(job?.readableStatus ?? job?.status) }}
      </Badge>
    </header>

    <div v-if="section === 'request'" class="module-body">
      <div class="capability-strip">
        <div>
          <Badge :tone="capabilityReady ? 'success' : 'warning'">
            {{ capabilityReady ? "能力已配置" : "配置未完成" }}
          </Badge>
          <span v-if="activeCapability">
            开关 {{ activeCapability.enabled ? "enabled" : "disabled" }} · 配置 {{ activeCapability.configuration }} · 绑定 {{ activeCapability.binding }} · 连接 {{ activeCapability.connection }}
          </span>
          <span v-else-if="capabilityError">{{ capabilityError }}</span>
          <span v-else>{{ loadingCapabilities ? "读取外部服务状态..." : "尚未读取外部服务状态" }}</span>
        </div>
        <div class="capability-actions">
          <Button variant="ghost" size="sm" type="button" :loading="loadingCapabilities" @click="loadCapabilities">
            <RefreshCw :size="14" /> 刷新
          </Button>
          <Button variant="secondary" size="sm" type="button" @click="goToConfigure">
            <Settings2 :size="14" /> 前往配置
          </Button>
        </div>
      </div>

      <form v-if="!isComfy" class="request-form" @submit.prevent="store.createGenerationJob">
        <Field label="业务输入">
          <Textarea
            v-model="store.generationPrompt"
            :disabled="store.loading || store.preparingGenerationRequest"
            :rows="4"
            placeholder="描述要生成的场景、冲突、角色行动或选择目标..."
          />
        </Field>
        <div class="action-row">
          <Button variant="secondary" size="md" type="button" :loading="store.preparingGenerationRequest" :disabled="!snapshot" @click="store.prepareGenerationRequest">
            <FileSearch :size="16" /> 生成预览
          </Button>
          <Button variant="primary" size="md" type="submit" :loading="store.loading" :disabled="!canSubmit">
            <Send :size="16" /> 提交给模型
          </Button>
          <span v-if="store.generationMessage">{{ store.generationMessage }}</span>
        </div>
      </form>

      <form v-else class="request-form" @submit.prevent="store.createAssetJob">
        <Field label="业务输入">
          <Textarea
            v-model="store.assetPrompt"
            :disabled="store.loading || store.preparingAssetRequest"
            :rows="4"
            placeholder="描述要生成的正式候选素材画面..."
          />
        </Field>
        <div class="compact-grid">
          <Field label="Workflow Version">
            <Input v-model="store.assetWorkflowVersion" :disabled="store.loading || store.preparingAssetRequest" />
          </Field>
          <Field label="Seed">
            <Input :model-value="String(store.assetSeed)" :disabled="store.loading || store.preparingAssetRequest" @update:model-value="updateSeed" />
          </Field>
        </div>
        <Field label="Negative Prompt">
          <Input v-model="store.assetNegativePrompt" :disabled="store.loading || store.preparingAssetRequest" placeholder="可选" />
        </Field>
        <div class="action-row">
          <Button variant="secondary" size="md" type="button" :loading="store.preparingAssetRequest" :disabled="!snapshot" @click="store.prepareAssetRequest">
            <FileSearch :size="16" /> 生成预览
          </Button>
          <Button variant="primary" size="md" type="submit" :loading="store.loading" :disabled="!canSubmit">
            <Send :size="16" /> 提交给 ComfyUI
          </Button>
          <span v-if="store.assetMessage">{{ store.assetMessage }}</span>
        </div>
      </form>

      <Field :label="isComfy ? '最终 ComfyUI payload（只读）' : '最终模型 messages（只读）'">
        <Textarea
          :model-value="previewText || '先生成预览。提交按钮只在预览与当前输入一致时开放。'"
          :rows="12"
          disabled
        />
      </Field>
    </div>

    <div v-else-if="section === 'jobs'" class="module-body">
      <div v-if="job" class="job-card">
        <Activity :size="22" aria-hidden="true" />
        <div>
          <strong>{{ job.jobId }}</strong>
          <span>状态：{{ statusLabel(job.readableStatus ?? job.status) }}</span>
          <span>创建：{{ job.createdAt }}</span>
          <span>更新：{{ job.updatedAt }}</span>
          <span v-if="job.candidateId">候选：{{ job.candidateId }}</span>
          <span v-if="'workflowVersion' in job">Workflow：{{ job.workflowVersion }} · Seed {{ job.seed }}</span>
          <span v-if="job.terminalMessage" class="error-line">{{ job.terminalMessage }}</span>
        </div>
      </div>
      <EmptyState v-else title="暂无真实任务" description="请求页提交后，任务会从 queued/running 更新到候选就绪或失败。">
        <template #icon><Activity :size="24" /></template>
      </EmptyState>
      <Button variant="secondary" size="sm" type="button" :loading="store.loading" @click="store.loadSnapshot">
        <RefreshCw :size="14" /> 刷新状态
      </Button>
    </div>

    <div v-else class="module-body">
      <article v-if="!isComfy && sceneCandidate" class="candidate-card">
        <div class="candidate-head">
          <div>
            <Badge tone="warning">{{ statusLabel(sceneCandidate.status) }}</Badge>
            <h3>{{ sceneCandidate.payload.scene.title }}</h3>
            <span>基线版本 v{{ sceneCandidate.baseCanonRevision }}</span>
          </div>
        </div>
        <p>{{ sceneCandidate.payload.scene.body }}</p>
        <ul>
          <li v-for="choice in sceneCandidate.payload.choices" :key="choice.label">{{ choice.label }}</li>
        </ul>
        <Field label="审核意见">
          <Input v-model="store.reviewReason" :disabled="store.loading || !store.canReviewCandidate" />
        </Field>
        <div class="action-row">
          <Button variant="primary" size="sm" :disabled="!store.canReviewCandidate" :loading="store.loading" @click="reviewScene('approve')"><Check :size="14" /> 通过</Button>
          <Button variant="secondary" size="sm" :disabled="!store.canReviewCandidate || store.loading" @click="reviewScene('request_changes')"><AlertTriangle :size="14" /> 要求修改</Button>
          <Button variant="danger" size="sm" :disabled="!store.canReviewCandidate || store.loading" @click="reviewScene('reject')"><X :size="14" /> 驳回</Button>
          <span v-if="store.reviewMessage">{{ store.reviewMessage }}</span>
        </div>
      </article>

      <article v-else-if="isComfy && assetCandidate" class="candidate-card">
        <div class="candidate-head">
          <div>
            <Badge tone="warning">{{ statusLabel(assetCandidate.status) }}</Badge>
            <h3>{{ assetCandidate.title }}</h3>
            <span>{{ assetCandidate.provenanceSummary }}</span>
          </div>
        </div>
        <img v-if="mediaUrl(assetCandidate.thumbnailRef)" :src="mediaUrl(assetCandidate.thumbnailRef)" :alt="assetCandidate.title" />
        <span v-else>{{ assetCandidate.mediaRef }}</span>
        <ul>
          <li v-for="note in assetCandidate.validationNotes" :key="note">{{ note }}</li>
        </ul>
        <Field label="审核意见">
          <Input v-model="store.assetReviewReason" :disabled="store.loading || !store.canReviewAssetCandidate" />
        </Field>
        <div class="action-row">
          <Button variant="primary" size="sm" :disabled="!store.canReviewAssetCandidate" :loading="store.loading" @click="reviewAsset('approve')"><Check :size="14" /> 通过</Button>
          <Button variant="secondary" size="sm" :disabled="!store.canReviewAssetCandidate || store.loading" @click="reviewAsset('request_changes')"><AlertTriangle :size="14" /> 要求修改</Button>
          <Button variant="danger" size="sm" :disabled="!store.canReviewAssetCandidate || store.loading" @click="reviewAsset('reject')"><X :size="14" /> 驳回</Button>
          <span v-if="store.assetReviewMessage">{{ store.assetReviewMessage }}</span>
        </div>
      </article>

      <EmptyState v-else title="暂无真实候选" description="Worker 回写候选后，会在当前模块中审核，不进入全局审核页。">
        <template #icon><Sparkles :size="24" /></template>
      </EmptyState>
    </div>
  </section>
</template>

<style scoped>
.generation-module { display: grid; gap: var(--space-4); padding: var(--space-5); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); }
.module-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
.module-header p { margin: 0 0 var(--space-1); color: var(--primary); font-size: var(--text-xs); font-weight: 800; }
.module-header h2 { margin: 0; color: var(--text-strong); font-size: var(--text-xl); }
.module-body, .request-form, .candidate-card { display: grid; gap: var(--space-4); }
.capability-strip { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-soft); }
.capability-strip > div:first-child { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); color: var(--muted); font-size: var(--text-sm); }
.capability-actions { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); }
.action-row { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); color: var(--muted); font-size: var(--text-sm); }
.compact-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(140px, 180px); gap: var(--space-3); }
.job-card, .candidate-card { padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-soft); }
.job-card { display: flex; gap: var(--space-3); align-items: flex-start; }
.job-card div { display: grid; gap: var(--space-1); }
.job-card strong, .candidate-card h3 { color: var(--text-strong); }
.job-card span, .candidate-card span, .candidate-card p, .candidate-card li { color: var(--text); font-size: var(--text-sm); }
.error-line { color: var(--danger) !important; }
.candidate-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
.candidate-head h3 { margin: var(--space-2) 0 var(--space-1); font-size: var(--text-lg); }
.candidate-card p { margin: 0; line-height: 1.7; }
.candidate-card ul { margin: 0; padding-left: var(--space-5); }
.candidate-card img { width: min(100%, 520px); aspect-ratio: 16 / 10; object-fit: cover; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); }
.module-body :deep(textarea) { width: 100%; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

@media (max-width: 720px) {
  .compact-grid { grid-template-columns: 1fr; }
}
</style>
