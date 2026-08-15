<script setup lang="ts">
import { computed } from "vue";
import { Boxes, FileCheck2, GitFork, Image as ImageIcon, PlayCircle, Sparkles } from "@lucide/vue";

import Badge from "../../components/ui/Badge.vue";
import Button from "../../components/ui/Button.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import Field from "../../components/ui/Field.vue";
import Input from "../../components/ui/Input.vue";
import Select from "../../components/ui/Select.vue";
import Textarea from "../../components/ui/Textarea.vue";
import type { V2WorkspaceSnapshot } from "../adapters";
import type { V2CandidateReviewAction } from "../adapters/types";
import { v2MediaRefToUrl } from "../adapters";

type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const props = defineProps<{
  area: string;
  snapshot: V2WorkspaceSnapshot | null;
  loading: boolean;
  draftWorldName: string;
  draftPremise: string;
  expectedRevision: number;
  conflict: string | null;
  hasDraftChanges: boolean;
  generationPrompt: string;
  generationMessage: string | null;
  reviewer: string;
  reviewReason: string;
  reviewMessage: string | null;
  canReviewCandidate: boolean;
  assetPrompt: string;
  assetReviewReason: string;
  assetMessage: string | null;
  assetReviewMessage: string | null;
  canReviewAssetCandidate: boolean;
  saveLabel: string;
  exportFormat: "json" | "markdown";
  releaseMessage: string | null;
  playerMessage: string | null;
  exportMessage: string | null;
  releaseReady: boolean;
}>();

const emit = defineEmits<{
  "update:draftWorldName": [value: string];
  "update:draftPremise": [value: string];
  "update:expectedRevision": [value: number];
  "update:generationPrompt": [value: string];
  "update:reviewer": [value: string];
  "update:reviewReason": [value: string];
  "update:assetPrompt": [value: string];
  "update:assetReviewReason": [value: string];
  "update:saveLabel": [value: string];
  "update:exportFormat": [value: "json" | "markdown"];
  previewCanonDraft: [];
  resetCanonDraft: [];
  createGenerationJob: [];
  reviewCandidate: [action: V2CandidateReviewAction];
  createAssetJob: [];
  reviewAssetCandidate: [action: V2CandidateReviewAction];
  createRelease: [];
  startRun: [];
  submitChoice: [choiceId: string];
  saveRun: [];
  restoreSave: [];
  exportRelease: [];
}>();

const areaMeta = computed(() => {
  switch (props.area) {
    case "canon":
      return { icon: Boxes, title: "故事总览", badge: "工作区修订" };
    case "graph":
      return { icon: GitFork, title: "故事结构", badge: "场景图" };
    case "review":
      return { icon: Sparkles, title: "候选审核", badge: "待审核候选" };
    case "assets":
      return { icon: ImageIcon, title: "素材工作台", badge: "候选素材" };
    case "release":
      return { icon: FileCheck2, title: "发布检查", badge: "发布前检查" };
    case "player":
      return { icon: PlayCircle, title: "运行预览", badge: "存档运行" };
    default:
      return { icon: Boxes, title: "运行状态", badge: "状态" };
  }
});

const statusTone = {
  info: "info",
  warning: "warning",
  danger: "danger",
} as const;

function formatValue(value: boolean | number | string) {
  return typeof value === "boolean" ? (value ? "是" : "否") : String(value);
}

function areaLabel(area: string): string {
  return {
    canon: "故事总览",
    graph: "故事结构",
    review: "候选审核",
    assets: "素材工作台",
    release: "发布检查",
    player: "运行预览",
    operations: "运行状态",
  }[area] ?? area;
}

function candidateTone(status: string): BadgeTone {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "changes_requested") return "warning";
  return "warning";
}

function statusLabel(status: string): string {
  return {
    none: "无",
    idle: "空闲",
    queued: "排队中",
    running: "执行中",
    claimed: "已领取",
    succeeded: "已完成",
    approved: "已通过",
    pending: "待审核",
    changes_requested: "要求修改",
    rejected: "已驳回",
    failed: "失败",
    cancelled: "已取消",
  }[status] ?? status;
}

function sourceLabel(kind: string): string {
  return { world: "故事空间", character: "角色", location: "地点", fact: "事实", scene: "场景" }[kind] ?? kind;
}

function severityLabel(severity: string): string {
  return { info: "提示", warning: "警告", danger: "严重", error: "错误" }[severity] ?? severity;
}

function visibilityLabel(visibility: string): string {
  return visibility === "creator" ? "创作者可见" : "玩家可见";
}

function ruleSeverityLabel(severity: string): string {
  return severity === "hard" ? "硬约束" : "软约束";
}

function mediaUrl(mediaRef: string): string | undefined {
  const env = (import.meta as ImportMeta & { readonly env?: Record<string, string | undefined> }).env ?? {};
  return v2MediaRefToUrl(mediaRef, env.VITE_API_BASE || window.location.origin);
}
</script>

<template>
  <section class="v2-workspace-panel" :aria-labelledby="`v2-${area}-title`">
    <div class="v2-panel-head">
      <div class="v2-panel-title">
        <component :is="areaMeta.icon" :size="20" aria-hidden="true" />
        <div>
          <p class="v2-panel-kicker">{{ areaLabel(area) }}</p>
          <h2 :id="`v2-${area}-title`">{{ areaMeta.title }}</h2>
        </div>
      </div>
      <Badge tone="neutral">{{ areaMeta.badge }}</Badge>
    </div>

    <div v-if="loading" class="v2-loading" role="status" aria-live="polite">
      正在加载 V2 工作区状态
    </div>

    <EmptyState
      v-else-if="!snapshot"
      title="尚未加载工作区"
      description="点击右上角刷新状态，读取当前故事空间。"
    >
      <template #icon>
        <Boxes :size="24" aria-hidden="true" />
      </template>
    </EmptyState>

    <div v-else class="v2-panel-grid">
      <template v-if="area === 'canon'">
        <form class="v2-canon-form" aria-label="故事设定预览" @submit.prevent="emit('previewCanonDraft')">
          <Field label="故事空间名称" hint="先预览修订，并使用版本号检查避免覆盖他人修改。">
            <Input
              :model-value="draftWorldName"
              :disabled="loading"
              id="v2-world-name"
              aria-label="故事空间名称"
              @update:model-value="emit('update:draftWorldName', $event)"
            />
          </Field>
          <Field label="故事前提">
            <Textarea
              :model-value="draftPremise"
              :disabled="loading"
              id="v2-world-premise"
              aria-label="故事前提"
              :rows="4"
              @update:model-value="emit('update:draftPremise', $event)"
            />
          </Field>
          <Field v-if="conflict" label="期望版本" :error="conflict">
            <Input
              :model-value="expectedRevision"
              :disabled="loading"
              id="v2-expected-revision"
              type="number"
              aria-label="期望版本"
              @update:model-value="emit('update:expectedRevision', Number($event))"
            />
          </Field>
          <Field v-else label="期望版本">
            <Input
              :model-value="expectedRevision"
              :disabled="loading"
              id="v2-expected-revision"
              type="number"
              aria-label="期望版本"
              @update:model-value="emit('update:expectedRevision', Number($event))"
            />
          </Field>
          <div class="v2-form-actions">
            <Button variant="primary" size="md" type="submit" :disabled="!hasDraftChanges || loading">
              预览修订
            </Button>
            <Button variant="secondary" size="md" :disabled="loading" @click="emit('resetCanonDraft')">
              重置草稿
            </Button>
          </div>
        </form>

        <div class="v2-list-grid" aria-label="故事事实与规则">
          <article class="v2-metric">
            <span>角色</span>
            <strong>{{ snapshot.world.characters.length }}</strong>
            <small>{{ snapshot.world.characters.map((character) => character.name).join(", ") }}</small>
          </article>
          <article class="v2-metric">
            <span>地点</span>
            <strong>{{ snapshot.world.locations.length }}</strong>
            <small>{{ snapshot.world.locations.map((location) => location.name).join(", ") }}</small>
          </article>
          <article v-for="fact in snapshot.world.facts" :key="fact.factId" class="v2-record">
            <Badge :tone="fact.visibility === 'creator' ? 'warning' : 'info'">{{ visibilityLabel(fact.visibility) }}</Badge>
            <p>{{ fact.text }}</p>
          </article>
          <article v-for="rule in snapshot.world.rules" :key="rule.ruleId" class="v2-record">
            <Badge :tone="rule.severity === 'hard' ? 'danger' : 'neutral'">{{ ruleSeverityLabel(rule.severity) }}</Badge>
            <p>{{ rule.text }}</p>
          </article>
        </div>
      </template>

      <template v-else-if="area === 'graph'">
        <div class="v2-list-grid">
          <article v-for="scene in snapshot.sceneGraph.scenes" :key="scene.sceneId" class="v2-record">
            <div class="v2-record-head">
              <strong>{{ scene.title }}</strong>
              <Badge :tone="scene.reachable ? 'success' : 'warning'">
                {{ scene.reachable ? "可到达" : "不可到达" }}
              </Badge>
            </div>
            <p>{{ scene.choiceCount }} 个选项 · {{ scene.stateDeltaPreview.length }} 个状态预览</p>
          </article>
        </div>

        <div class="v2-diagnostics" aria-label="结构诊断">
          <article
            v-for="diagnostic in snapshot.sceneGraph.diagnostics"
            :key="`${diagnostic.code}-${diagnostic.targetId}`"
            class="v2-record"
          >
            <Badge :tone="statusTone[diagnostic.severity]">{{ severityLabel(diagnostic.severity) }}</Badge>
            <p>{{ diagnostic.message }}</p>
          </article>
        </div>
      </template>

      <template v-else-if="area === 'review'">
        <form class="v2-canon-form" aria-label="生成任务控制" @submit.prevent="emit('createGenerationJob')">
          <Field label="生成提示词" hint="生成结果会先作为候选，不会直接写入 Canon。">
            <Textarea
              :model-value="generationPrompt"
              :disabled="loading"
              id="v2-generation-prompt"
              aria-label="生成提示词"
              :rows="3"
              @update:model-value="emit('update:generationPrompt', $event)"
            />
          </Field>
          <div class="v2-form-actions">
            <Button variant="primary" size="md" type="submit" :loading="loading">
              创建生成任务
            </Button>
            <Badge tone="info">{{ statusLabel(snapshot.generation.job?.status ?? "idle") }}</Badge>
          </div>
          <p v-if="generationMessage" class="v2-feedback">{{ generationMessage }}</p>
        </form>

        <div class="v2-list-grid" aria-label="生成上下文来源">
          <article v-for="source in snapshot.generation.context.sources" :key="source.id" class="v2-record">
            <div class="v2-record-head">
              <strong>{{ source.label }}</strong>
              <Badge tone="neutral">{{ sourceLabel(source.kind) }}</Badge>
            </div>
            <p>{{ source.id }}</p>
          </article>
        </div>

        <article v-if="snapshot.candidate" class="v2-record" aria-label="候选差异">
          <div class="v2-record-head">
            <strong>{{ snapshot.generation.diff.title }}</strong>
            <Badge :tone="snapshot.candidate.status === 'pending' ? 'warning' : 'success'">
              {{ statusLabel(snapshot.candidate.status) }}
            </Badge>
          </div>
          <p>基础版本 {{ snapshot.candidate.baseCanonRevision }} · {{ snapshot.generation.context.contextHash }}</p>
          <ul class="v2-plain-list">
            <li v-for="addition in snapshot.generation.diff.additions" :key="addition">{{ addition }}</li>
          </ul>
          <ul class="v2-plain-list v2-warning-list">
            <li v-for="warning in snapshot.generation.diff.warnings" :key="warning">{{ warning }}</li>
          </ul>
        </article>

        <form class="v2-canon-form" aria-label="候选审核操作" @submit.prevent="emit('reviewCandidate', 'approve')">
          <Field label="审核人">
            <Input
              :model-value="reviewer"
              :disabled="loading || !canReviewCandidate"
              id="v2-reviewer"
              aria-label="审核人"
              @update:model-value="emit('update:reviewer', $event)"
            />
          </Field>
          <Field label="审核意见">
            <Textarea
              :model-value="reviewReason"
              :disabled="loading || !canReviewCandidate"
              id="v2-review-reason"
              aria-label="审核意见"
              :rows="3"
              @update:model-value="emit('update:reviewReason', $event)"
            />
          </Field>
          <div class="v2-form-actions">
            <Button variant="primary" size="md" type="submit" :disabled="!canReviewCandidate" :loading="loading">
              通过
            </Button>
            <Button
              variant="secondary"
              size="md"
              :disabled="!canReviewCandidate || loading"
              @click="emit('reviewCandidate', 'request_changes')"
            >
              要求修改
            </Button>
            <Button
              variant="danger"
              size="md"
              :disabled="!canReviewCandidate || loading"
              @click="emit('reviewCandidate', 'reject')"
            >
              驳回
            </Button>
          </div>
          <p v-if="reviewMessage" class="v2-feedback">{{ reviewMessage }}</p>
          <p v-if="snapshot.candidate?.reviewReason" class="v2-feedback">
            {{ snapshot.candidate.reviewer }}: {{ snapshot.candidate.reviewReason }}
          </p>
        </form>
        <EmptyState
          v-if="!snapshot.candidate"
          title="没有待审核候选"
          description="创建并完成生成任务后，候选内容会出现在这里。"
        />
      </template>

      <template v-else-if="area === 'assets'">
        <form class="v2-canon-form" aria-label="素材任务控制" @submit.prevent="emit('createAssetJob')">
          <Field label="素材提示词" hint="素材生成结果会先进入候选审核，不会直接进入发布素材库。">
            <Textarea
              :model-value="assetPrompt"
              :disabled="loading"
              id="v2-asset-prompt"
              aria-label="素材提示词"
              :rows="3"
              @update:model-value="emit('update:assetPrompt', $event)"
            />
          </Field>
          <div class="v2-form-actions">
            <Button variant="primary" size="md" type="submit" :loading="loading">
              创建素材任务
            </Button>
            <Badge tone="info">{{ snapshot.assets.workflowName }}</Badge>
            <Badge :tone="candidateTone(snapshot.assets.job?.status ?? 'idle')">{{ statusLabel(snapshot.assets.job?.status ?? "idle") }}</Badge>
          </div>
          <p v-if="assetMessage" class="v2-feedback">{{ assetMessage }}</p>
        </form>

        <article v-if="snapshot.assets.candidate && snapshot.assets.job" class="v2-record" aria-label="素材候选">
          <div class="v2-record-head">
            <strong>{{ snapshot.assets.candidate.title }}</strong>
            <Badge :tone="candidateTone(snapshot.assets.candidate.status)">
              {{ statusLabel(snapshot.assets.candidate.status) }}
            </Badge>
          </div>
          <dl class="v2-detail-list">
            <div>
              <dt>工作流</dt>
              <dd>{{ snapshot.assets.job.workflowVersion }}</dd>
            </div>
            <div>
              <dt>随机种子</dt>
              <dd>{{ snapshot.assets.job.seed }}</dd>
            </div>
            <div>
              <dt>媒体地址</dt>
              <dd>{{ snapshot.assets.candidate.mediaRef }}</dd>
            </div>
            <div>
              <dt>缩略图</dt>
              <dd>{{ snapshot.assets.candidate.thumbnailRef }}</dd>
            </div>
          </dl>
          <img
            v-if="mediaUrl(snapshot.assets.candidate.mediaRef)"
            class="v2-asset-preview"
            :src="mediaUrl(snapshot.assets.candidate.mediaRef)"
            :alt="snapshot.assets.candidate.title"
          />
          <p>{{ snapshot.assets.candidate.provenanceSummary }}</p>
          <ul class="v2-plain-list">
            <li v-for="note in snapshot.assets.candidate.validationNotes" :key="note">{{ note }}</li>
          </ul>
          <p v-if="snapshot.assets.candidate.reviewReason" class="v2-feedback">
            {{ snapshot.assets.candidate.reviewer }}: {{ snapshot.assets.candidate.reviewReason }}
          </p>
        </article>
        <EmptyState
          v-else
          title="没有素材候选"
          description="创建并完成素材任务后，候选媒体会出现在这里。"
        />

        <form
          class="v2-canon-form"
          aria-label="素材审核操作"
          @submit.prevent="emit('reviewAssetCandidate', 'approve')"
        >
          <Field label="素材审核意见">
            <Textarea
              :model-value="assetReviewReason"
              :disabled="loading || !canReviewAssetCandidate"
              id="v2-asset-review-reason"
              aria-label="素材审核意见"
              :rows="3"
              @update:model-value="emit('update:assetReviewReason', $event)"
            />
          </Field>
          <div class="v2-form-actions">
            <Button variant="primary" size="md" type="submit" :disabled="!canReviewAssetCandidate" :loading="loading">
              通过素材
            </Button>
            <Button
              variant="secondary"
              size="md"
              :disabled="!canReviewAssetCandidate || loading"
              @click="emit('reviewAssetCandidate', 'request_changes')"
            >
              要求修改素材
            </Button>
            <Button
              variant="danger"
              size="md"
              :disabled="!canReviewAssetCandidate || loading"
              @click="emit('reviewAssetCandidate', 'reject')"
            >
              驳回素材
            </Button>
          </div>
          <p v-if="assetReviewMessage" class="v2-feedback">{{ assetReviewMessage }}</p>
        </form>

        <div class="v2-list-grid" aria-label="已通过素材库">
          <article v-for="asset in snapshot.assets.library" :key="asset.assetId" class="v2-record">
            <div class="v2-record-head">
              <strong>{{ asset.title }}</strong>
              <Badge :tone="asset.approved ? 'success' : 'warning'">{{ asset.kind === "scene_background" ? "场景背景" : asset.kind === "character_sprite" ? "角色立绘" : "道具" }}</Badge>
            </div>
            <p>{{ asset.mediaRef }}</p>
            <img
              v-if="mediaUrl(asset.mediaRef)"
              class="v2-asset-preview"
              :src="mediaUrl(asset.mediaRef)"
              :alt="asset.title"
            />
            <small>{{ asset.workflowVersion }} - seed {{ asset.seed }}</small>
          </article>
        </div>
      </template>

      <template v-else-if="area === 'release'">
        <div class="v2-list-grid" aria-label="发布前检查">
          <article class="v2-metric">
            <span>发布检查</span>
            <strong>{{ snapshot.release.valid ? "通过" : "阻塞" }}</strong>
            <small>版本 {{ snapshot.release.revision }}</small>
          </article>
          <article class="v2-metric">
            <span>发布版本</span>
            <strong>{{ snapshot.releasePackage?.version ?? "尚未创建" }}</strong>
            <small>{{ snapshot.releasePackage?.manifestHash ?? "请先运行发布检查" }}</small>
          </article>
          <article class="v2-metric">
            <span>不可变性</span>
            <strong>{{ snapshot.releasePackage?.immutable ? "已锁定" : "尚未发布" }}</strong>
            <small>{{ snapshot.releasePackage?.releaseId ?? snapshot.world.storyWorldId }}</small>
          </article>
        </div>

        <div class="v2-form-actions">
          <Button variant="primary" size="md" :disabled="!releaseReady || loading" :loading="loading" @click="emit('createRelease')">
            创建发布版本
          </Button>
          <Button variant="secondary" size="md" :disabled="!snapshot.releasePackage || loading" @click="emit('startRun')">
            启动运行预览
          </Button>
          <Badge :tone="releaseReady ? 'success' : 'warning'">{{ releaseReady ? "可发布" : "待处理" }}</Badge>
        </div>
        <p v-if="releaseMessage" class="v2-feedback">{{ releaseMessage }}</p>

        <form class="v2-canon-form" aria-label="发布导出控制" @submit.prevent="emit('exportRelease')">
          <Field label="导出格式">
            <Select
              :model-value="exportFormat"
              aria-label="导出格式"
              id="v2-export-format"
              @update:model-value="emit('update:exportFormat', $event === 'markdown' ? 'markdown' : 'json')"
            >
              <option value="json">JSON</option>
              <option value="markdown">Markdown 文档</option>
            </Select>
          </Field>
          <div class="v2-form-actions">
            <Button variant="secondary" size="md" type="submit" :loading="loading">
              导出
            </Button>
            <Badge tone="info">{{ snapshot.exportBundle?.format ?? exportFormat }}</Badge>
          </div>
          <p v-if="exportMessage" class="v2-feedback">{{ exportMessage }}</p>
          <pre v-if="snapshot.exportBundle" class="v2-export-preview">{{ snapshot.exportBundle.preview }}</pre>
        </form>
      </template>

      <template v-else-if="area === 'player'">
        <article v-if="snapshot.player && snapshot.run" class="v2-record" aria-label="运行场景">
          <div class="v2-record-head">
            <strong>{{ snapshot.player.title }}</strong>
            <Badge tone="info">{{ snapshot.run.releaseVersion }}</Badge>
          </div>
          <p>{{ snapshot.player.body }}</p>
          <div class="v2-form-actions">
            <Button
              v-for="choice in snapshot.player.choices"
              :key="choice.choiceId"
              variant="secondary"
              size="md"
              :disabled="choice.disabled || loading"
              @click="emit('submitChoice', choice.choiceId)"
            >
              {{ choice.label }}
            </Button>
          </div>
        </article>
        <EmptyState
          v-else
          title="尚未启动运行"
          description="先创建不可变发布版本，再从该版本启动运行预览。"
        />

        <form class="v2-canon-form" aria-label="存档与恢复控制" @submit.prevent="emit('saveRun')">
          <Field label="存档名称">
            <Input
              :model-value="saveLabel"
              :disabled="loading"
              id="v2-save-label"
              aria-label="存档名称"
              @update:model-value="emit('update:saveLabel', $event)"
            />
          </Field>
          <div class="v2-form-actions">
            <Button variant="primary" size="md" type="submit" :disabled="!snapshot.run" :loading="loading">
              保存运行
            </Button>
            <Button variant="secondary" size="md" :disabled="loading || !snapshot.save" @click="emit('restoreSave')">
              恢复存档
            </Button>
          </div>
          <p v-if="playerMessage" class="v2-feedback">{{ playerMessage }}</p>
        </form>

        <div v-if="snapshot.save" class="v2-list-grid" aria-label="存档详情">
          <article class="v2-metric">
            <span>存档</span>
            <strong>{{ snapshot.save.label }}</strong>
            <small>{{ snapshot.save.saveId }}</small>
          </article>
          <article class="v2-metric">
            <span>场景</span>
            <strong>{{ snapshot.save.currentSceneId }}</strong>
            <small>{{ snapshot.save.savedAt }}</small>
          </article>
        </div>
      </template>

      <template v-else-if="area === 'operations'">
        <div class="v2-list-grid">
          <article v-for="variable in snapshot.typedState.variables" :key="variable.key" class="v2-record">
            <div class="v2-record-head">
              <strong>{{ variable.label }}</strong>
              <Badge tone="neutral">{{ variable.type }}</Badge>
            </div>
            <p>{{ variable.key }} = {{ formatValue(variable.value) }}</p>
          </article>
        </div>
        <div class="v2-diagnostics" aria-label="类型化状态变化预览">
          <article v-for="delta in snapshot.typedState.preview" :key="delta.key" class="v2-record">
            <Badge tone="info">{{ delta.sourceSceneId }}</Badge>
            <p>{{ delta.key }}: {{ formatValue(delta.before) }} -> {{ formatValue(delta.after) }}</p>
          </article>
        </div>
      </template>

      <template v-else>
        <article class="v2-metric">
          <span>故事空间</span>
          <strong>{{ snapshot.world.name }}</strong>
          <small>版本 {{ snapshot.world.revision }}</small>
        </article>
        <article class="v2-metric">
          <span>故事结构</span>
          <strong>{{ snapshot.sceneGraph.scenes.length }} 个场景</strong>
          <small>{{ snapshot.sceneGraph.diagnostics.length }} 条诊断</small>
        </article>
        <article class="v2-metric">
          <span>候选内容</span>
          <strong>{{ snapshot.candidate?.status ?? "无" }}</strong>
          <small>{{ snapshot.candidate?.provenance.source ?? "暂无候选" }}</small>
        </article>
        <article class="v2-metric">
          <span>运行预览</span>
          <strong>{{ snapshot.run?.releaseVersion ?? "未启动" }}</strong>
          <small>{{ snapshot.run?.currentSceneId ?? "暂无场景" }}</small>
        </article>
      </template>
    </div>
  </section>
</template>

<style scoped>
.v2-workspace-panel {
  min-width: 0;
  padding: var(--space-5);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.v2-panel-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.v2-panel-title {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  color: var(--primary);
}

.v2-panel-title h2 {
  color: var(--text-strong);
  font-size: var(--text-xl);
  line-height: 1.2;
}

.v2-panel-kicker {
  margin-bottom: var(--space-1);
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.v2-panel-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3);
}

.v2-list-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: var(--space-3);
}

.v2-canon-form {
  display: grid;
  gap: var(--space-3);
}

.v2-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.v2-metric {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
}

.v2-record {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
}

.v2-record p {
  overflow-wrap: anywhere;
  color: var(--text);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.v2-record small {
  overflow-wrap: anywhere;
  color: var(--muted);
  font-size: var(--text-sm);
}

.v2-record-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.v2-record-head strong {
  overflow-wrap: anywhere;
  color: var(--text-strong);
  font-size: var(--text-md);
}

.v2-diagnostics {
  display: grid;
  gap: var(--space-3);
}

.v2-detail-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr));
  gap: var(--space-2);
  margin: 0;
}

.v2-detail-list div {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.v2-detail-list dt {
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: 800;
  text-transform: uppercase;
}

.v2-detail-list dd {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--text-strong);
  font-size: var(--text-sm);
  font-weight: 700;
}

.v2-feedback {
  color: var(--muted);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.v2-plain-list {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding-left: var(--space-5);
  color: var(--text);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.v2-warning-list {
  color: var(--warning);
}

.v2-export-preview {
  overflow: auto;
  max-width: 100%;
  margin: 0;
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
  color: var(--text);
  font-size: var(--text-sm);
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.v2-metric span {
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: 800;
  text-transform: uppercase;
}

.v2-metric strong {
  overflow-wrap: anywhere;
  color: var(--text-strong);
  font-size: var(--text-lg);
}

.v2-metric small {
  overflow-wrap: anywhere;
  color: var(--muted);
  font-size: var(--text-sm);
}

.v2-loading {
  display: grid;
  place-items: center;
  min-height: 220px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: var(--text-md);
}

@media (max-width: 767px) {
  .v2-workspace-panel {
    padding: var(--space-4);
  }
}
</style>
