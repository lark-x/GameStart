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

    <ProjectOverviewWorkspace v-else :snapshot="null" :loading="loading" />
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
