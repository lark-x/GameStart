<script setup lang="ts">
import { CheckCircle2, CircleAlert, Clock3, GitBranch } from "@lucide/vue";

import Badge from "../../components/ui/Badge.vue";
import Button from "../../components/ui/Button.vue";
import type { V2WorkspaceSnapshot } from "../adapters";

defineProps<{
  snapshot: V2WorkspaceSnapshot | null;
  loading: boolean;
  error: string | null;
  mode: "mock" | "http";
  graphIssueCount: number;
  typedStatePreviewCount: number;
  candidateStatus: string;
  assetCandidateStatus: string;
  assetLibraryCount: number;
  currentSceneTitle: string;
}>();

const emit = defineEmits<{
  refresh: [];
}>();

function statusLabel(status: string): string {
  return {
    none: "无",
    queued: "排队中",
    running: "执行中",
    succeeded: "已完成",
    pending: "待审核",
    approved: "已通过",
    changes_requested: "要求修改",
    rejected: "已驳回",
    failed: "失败",
  }[status] ?? status;
}
</script>

<template>
  <aside class="v2-status-rail" aria-label="V2 工作区状态">
    <div class="v2-status-rail-head">
      <div>
        <p class="v2-panel-kicker">运行连接</p>
        <h2>{{ mode === "mock" ? "本地演示数据" : "V2 服务端" }}</h2>
      </div>
      <Badge :tone="mode === 'mock' ? 'info' : 'success'">{{ mode === "mock" ? "演示" : "已连接" }}</Badge>
    </div>

    <div class="v2-status-actions" aria-label="运行状态操作">
      <Button
        variant="ghost"
        size="icon"
        :loading="loading"
        aria-label="刷新 V2 状态"
        @click="emit('refresh')"
      >
        <Clock3 v-if="!loading" :size="17" aria-hidden="true" />
      </Button>
    </div>

    <div v-if="error" class="v2-alert" role="alert">
      <CircleAlert :size="18" aria-hidden="true" />
      <span>{{ error }}</span>
    </div>

    <dl v-if="snapshot" class="v2-status-list">
      <div>
        <dt>服务健康</dt>
        <dd>
          <CheckCircle2 :size="16" aria-hidden="true" />
          {{ snapshot.health.version }}
        </dd>
      </div>
      <div>
        <dt>故事空间</dt>
        <dd>{{ snapshot.world.name }}</dd>
      </div>
      <div>
        <dt>版本修订</dt>
        <dd>
          <GitBranch :size="16" aria-hidden="true" />
          {{ snapshot.world.revision }}
        </dd>
      </div>
      <div>
        <dt>候选状态</dt>
        <dd>{{ statusLabel(candidateStatus) }}</dd>
      </div>
      <div>
        <dt>素材候选</dt>
        <dd>{{ statusLabel(assetCandidateStatus) }}</dd>
      </div>
      <div>
        <dt>素材库</dt>
        <dd>{{ assetLibraryCount }}</dd>
      </div>
      <div>
        <dt>发布检查</dt>
        <dd>{{ snapshot.release.valid ? "通过" : "阻塞" }}</dd>
      </div>
      <div>
        <dt>结构诊断</dt>
        <dd>{{ graphIssueCount }}</dd>
      </div>
      <div>
        <dt>状态预览</dt>
        <dd>{{ typedStatePreviewCount }}</dd>
      </div>
      <div>
        <dt>当前场景</dt>
        <dd>{{ currentSceneTitle }}</dd>
      </div>
    </dl>
  </aside>
</template>

<style scoped>
.v2-status-rail {
  min-width: 0;
  padding: var(--space-5);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.v2-status-rail-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.v2-status-rail-head h2 {
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

.v2-status-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.v2-alert {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
  margin-bottom: var(--space-4);
  padding: var(--space-3);
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.v2-status-list {
  display: grid;
  gap: var(--space-3);
  margin: 0;
}

.v2-status-list div {
  display: grid;
  gap: var(--space-1);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border);
}

.v2-status-list div:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.v2-status-list dt {
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: 800;
  text-transform: uppercase;
}

.v2-status-list dd {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--text-strong);
  font-size: var(--text-sm);
  font-weight: 700;
}

@media (max-width: 767px) {
  .v2-status-rail {
    padding: var(--space-4);
  }
}
</style>
