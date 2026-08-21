<script setup lang="ts">
import { computed } from "vue";
import { Boxes, FileCheck2, GitFork, Image as ImageIcon, PlayCircle } from "@lucide/vue";

import Badge from "../../components/ui/Badge.vue";
import type { V2WorkspaceSnapshot } from "../adapters";

import CanonWorkspace from "./workspace/CanonWorkspace.vue";
import GraphWorkspace from "./workspace/GraphWorkspace.vue";
import StateWorkspace from "./workspace/StateWorkspace.vue";
import AssetsWorkspace from "./workspace/AssetsWorkspace.vue";
import ReleaseWorkspace from "./workspace/ReleaseWorkspace.vue";
import PlayerWorkspace from "./workspace/PlayerWorkspace.vue";
import ProjectOverviewWorkspace from "./workspace/ProjectOverviewWorkspace.vue";
import DataFlowWorkspace from "./workspace/DataFlowWorkspace.vue";
import WorkspaceModuleIntro from "./workspace/WorkspaceModuleIntro.vue";

const props = defineProps<{
  area: string;
  snapshot: V2WorkspaceSnapshot | null;
  loading: boolean;
  draftWorldName: string;
  draftPremise: string;
  conflict: string | null;
  hasDraftChanges: boolean;
  uploadingAsset: boolean;
  manualAssetMessage: string | null;
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
  "update:saveLabel": [value: string];
  "update:exportFormat": [value: "json" | "markdown"];
  previewCanonDraft: [];
  resetCanonDraft: [];
  uploadManualAsset: [input: { readonly file: File; readonly title: string }];
  createRelease: [];
  startRun: [];
  submitChoice: [choiceId: string];
  saveRun: [];
  restoreSave: [];
  exportRelease: [];
}>();

const title = computed(() => {
  switch (props.area) {
    case "canon":
      return "正典世界观 (Canon)";
    case "graph":
      return "故事结构图 (Scene Graph)";
    case "state":
      return "状态变量 (State Schema)";
    case "assets":
      return "正式素材库 (Formal Assets)";
    case "data-flow":
      return "数据流程 (Data Flow)";
    case "release":
      return "发布与导出 (Release & Export)";
    case "player":

      return "游玩预览运行时 (Player Preview)";
    default:
      return "工作空间概览 (Overview)";
  }
});
</script>

<template>
  <section class="v2-workspace-panel">
    <div class="v2-panel-head">
      <div class="v2-panel-title">
        <Boxes v-if="area === 'canon'" :size="20" aria-hidden="true" />
        <GitFork v-else-if="area === 'graph'" :size="20" aria-hidden="true" />
        <ImageIcon v-else-if="area === 'assets'" :size="20" aria-hidden="true" />
        <FileCheck2 v-else-if="area === 'release'" :size="20" aria-hidden="true" />
        <PlayCircle v-else-if="area === 'player'" :size="20" aria-hidden="true" />
        <div>
          <p class="v2-panel-kicker">工作区模块</p>
          <h2>{{ title }}</h2>
        </div>
      </div>
      <Badge tone="info">{{ area }}</Badge>
    </div>

    <!-- 1. Canon Area：无快照时也渲染，由组件内部给出空库创建入口 -->
    <CanonWorkspace
      v-if="area === 'canon'"
      :snapshot="snapshot"
      :loading="loading"
      :draft-world-name="draftWorldName"
      :draft-premise="draftPremise"
      :conflict="conflict"
      :has-draft-changes="hasDraftChanges"
      @update:draft-world-name="emit('update:draftWorldName', $event)"
      @update:draft-premise="emit('update:draftPremise', $event)"
      @preview-canon-draft="emit('previewCanonDraft')"
      @reset-canon-draft="emit('resetCanonDraft')"
    />

    <ProjectOverviewWorkspace
      v-else-if="area === 'overview'"
      :snapshot="snapshot"
      :loading="loading"
    />

    <DataFlowWorkspace v-else-if="area === 'data-flow'" :snapshot="snapshot" />

    <template v-else-if="snapshot">
      <div class="v2-panel-content">
        <!-- 2. Graph Area -->
        <GraphWorkspace
        v-if="area === 'graph'"
        :snapshot="snapshot"
        :loading="loading"
      />
        <StateWorkspace
          v-else-if="area === 'state'"
          :snapshot="snapshot"
          :loading="loading"
        />

      <!-- 3. Assets Area -->
      <AssetsWorkspace
        v-else-if="area === 'assets'"
        :snapshot="snapshot"
        :loading="loading"
        :uploading="uploadingAsset"
        :upload-message="manualAssetMessage"
        @upload-manual-asset="emit('uploadManualAsset', $event)"
      />

      <!-- 4. Release Area -->
      <ReleaseWorkspace
        v-else-if="area === 'release'"
        :snapshot="snapshot"
        :loading="loading"
        :release-ready="releaseReady"
        :release-message="releaseMessage"
        :export-format="exportFormat"
        :export-message="exportMessage"
        @update:export-format="emit('update:exportFormat', $event)"
        @create-release="emit('createRelease')"
        @start-run="emit('startRun')"
        @export-release="emit('exportRelease')"
      />

      <!-- 5. Player Area -->
      <PlayerWorkspace
        v-else-if="area === 'player'"
        :snapshot="snapshot"
        :loading="loading"
        :save-label="saveLabel"
        :player-message="playerMessage"
        @update:save-label="emit('update:saveLabel', $event)"
        @submit-choice="emit('submitChoice', $event)"
        @save-run="emit('saveRun')"
        @restore-save="emit('restoreSave')"
      />

      <ProjectOverviewWorkspace v-else :snapshot="snapshot" :loading="loading" />
      </div>
    </template>

    <template v-else>
      <WorkspaceModuleIntro
        v-if="area === 'state'"
        title="状态与逻辑"
        description="这里定义故事运行时会变化的数据。这些变量会被剧情选择条件读取、选择结果修改，并由 Player Runtime 保存和恢复。当前状态变量不会自动发送给场景生成模型。"
        :examples="['好感度 = 20', '是否拿到钥匙 = 否', '当前阵营 = neutral']"
        :consumers="['剧情选择条件', '选择结果修改', 'Player Runtime 保存和恢复']"
        :notes="['当前状态变量不会自动发送给场景生成模型。']"
      />
      <WorkspaceModuleIntro
        v-else-if="area === 'graph'"
        title="故事结构"
        description="这里定义故事如何推进。主要包含 Arc（剧情分组）、Scene（剧情场景）和 Choice（玩家选择和跳转）。Choice 可以读取状态变量，并在玩家选择后修改状态。需要先创建故事才能建立剧情结构。"
        :prerequisites="['先创建一个故事空间']"
      />
      <WorkspaceModuleIntro
        v-else-if="area === 'assets'"
        title="正式素材库"
        description="管理审核通过的正式图片素材，并使用 ComfyUI 生成新图片候选。素材随发布包导出。"
        :prerequisites="['先创建一个故事空间']"
      />
      <WorkspaceModuleIntro
        v-else-if="area === 'release'"
        title="发布与导出"
        description="将 Canon、故事结构和状态 Schema 打包为不可变发布清单，供 Player Runtime 使用。"
        :prerequisites="['先创建一个故事空间']"
      />
      <WorkspaceModuleIntro
        v-else-if="area === 'player'"
        title="运行预览"
        description="以玩家视角运行发布包中的故事：阅读场景、做出选择、查看状态变化。"
        :prerequisites="['先创建并发布一个故事']"
      />
      <ProjectOverviewWorkspace v-else :snapshot="null" :loading="loading" />
    </template>
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
  align-items: flex-start;
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
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-xl);
  line-height: 1.2;
}

.v2-panel-kicker {
  margin: 0 0 var(--space-1) 0;
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
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
