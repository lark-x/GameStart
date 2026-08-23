<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  BookOpen,
  Check,
  FileText,
  RefreshCw,
  Search,
  Sparkles,
  Wand2,
} from "@lucide/vue";
import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Modal from "../../../components/ui/Modal.vue";
import NarrativeExplorer from "./NarrativeExplorer.vue";
import SceneScriptEditor from "./SceneScriptEditor.vue";
import NarrativeInspector from "./NarrativeInspector.vue";
import NarrativeDiagnosticsPanel from "./NarrativeDiagnosticsPanel.vue";
import StoryCastPool from "../../components/workspace/StoryCastPool.vue";
import { useNarrativeOutlineStore } from "../stores/useNarrativeOutlineStore.ts";
import { useNarrativeDiagnosticsStore } from "../stores/useNarrativeDiagnosticsStore.ts";
import { useNarrativeSearchStore } from "../stores/useNarrativeSearchStore.ts";
import type { V2CharacterSummary, V2LocationSummary, V2WorkspaceSnapshot } from "../../adapters/types.ts";
import type {
  V2ArcId,
  V2IdempotencyKey,
  V2NarrativeSearchResultItem,
  V2NarrativeTemplate,
  V2NarrativeTemplateId,
  V2Revision,
} from "@living-network/contracts/v2";
import { V2NarrativeClient } from "../client.ts";

const props = defineProps<{
  storyWorldId: string;
  snapshot: V2WorkspaceSnapshot | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  refreshed: [];
}>();

const outlineStore = useNarrativeOutlineStore();
const diagStore = useNarrativeDiagnosticsStore();
const searchStore = useNarrativeSearchStore();

// Template Modal
const templateModalOpen = ref(false);
const availableTemplates = ref<readonly V2NarrativeTemplate[]>([]);
const selectedTemplateId = ref<V2NarrativeTemplateId>("three-act");
const templateApplying = ref(false);

const characters = computed<readonly V2CharacterSummary[]>(() => props.snapshot?.world.characters ?? []);
const locations = computed<readonly V2LocationSummary[]>(() => props.snapshot?.world.locations ?? []);

async function loadTemplates() {
  try {
    const client = new V2NarrativeClient();
    const res = await client.listTemplates();
    availableTemplates.value = res.templates;
  } catch (err) {
    console.error("Failed to list templates:", err);
  }
}

async function handleApplyTemplate() {
  templateApplying.value = true;
  try {
    await outlineStore.applyTemplate(props.storyWorldId, {
      templateId: selectedTemplateId.value,
      expectedRevision: 1 as V2Revision,
      idempotencyKey: `tpl_app_${Date.now()}` as V2IdempotencyKey,
    });
    templateModalOpen.value = false;
    await diagStore.fetchDiagnostics(props.storyWorldId);
    emit("refreshed");
  } catch (err) {
    console.error("Failed to apply template:", err);
  } finally {
    templateApplying.value = false;
  }
}

function handleCreateScene(payload: { arcId?: string; chapterId?: string; questId?: string }) {
  const title = prompt("请输入新场景名称：", "新场景");
  if (!title) return;

  // We can save a new scene document via docStore/API
  const sceneId = `scene_${Date.now().toString(36)}`;
  const client = new V2NarrativeClient();
  client.saveSceneDocument(props.storyWorldId, sceneId, {
    title,
    documentMode: "blocks",
    ...(payload.arcId ? { arcId: payload.arcId as V2ArcId } : {}),
    ...(payload.chapterId ? { chapterId: payload.chapterId } : {}),
    ...(payload.questId ? { questId: payload.questId } : {}),
    blocks: [
      {
        kind: "narration",
        text: "初始场景叙述...",
      },
    ],
    expectedSceneRevision: 1,
    expectedRevision: 1 as V2Revision,
    idempotencyKey: `create_scene_${Date.now()}` as V2IdempotencyKey,
  }).then(async () => {
    await outlineStore.fetchOutline(props.storyWorldId);
    outlineStore.selectScene(sceneId);
    emit("refreshed");
  });
}

function handleSearchInput(e: Event) {
  const target = e.target as HTMLInputElement;
  searchStore.performSearch(props.storyWorldId, target.value);
}

function handleSelectSearchResult(item: V2NarrativeSearchResultItem) {
  if (item.sceneId) {
    outlineStore.selectScene(item.sceneId);
  }
  searchStore.closeSearch();
}

onMounted(() => {
  if (props.storyWorldId) {
    outlineStore.fetchOutline(props.storyWorldId);
    diagStore.fetchDiagnostics(props.storyWorldId);
    loadTemplates();
  }
});

watch(
  () => props.storyWorldId,
  (newId) => {
    if (newId) {
      outlineStore.fetchOutline(newId);
      diagStore.fetchDiagnostics(newId);
    }
  },
);
</script>

<template>
  <div class="story-workspace-root">
    <!-- Top Action Bar -->
    <header class="story-top-bar">
      <div class="bar-left">
        <div class="title-wrap">
          <BookOpen :size="18" class="main-icon" />
          <h1>剧情正典创作工作台 (Narrative Authoring System)</h1>
        </div>
        <Badge tone="info">V2 结构化剧本引擎</Badge>
      </div>

      <div class="bar-right">
        <!-- Quick Search -->
        <Button size="sm" variant="secondary" @click="searchStore.openSearch()">
          <Search :size="14" />
          <span>全域搜索 (Ctrl+K)</span>
        </Button>

        <Button size="sm" variant="secondary" @click="templateModalOpen = true">
          <Wand2 :size="14" />
          <span>套用剧情模版</span>
        </Button>

        <Button size="sm" variant="secondary" :loading="outlineStore.loading" @click="outlineStore.fetchOutline(props.storyWorldId)">
          <RefreshCw :size="14" />
          <span>刷新</span>
        </Button>
      </div>
    </header>

    <!-- Main 3-Column Layout -->
    <div class="story-layout-grid">
      <!-- Column 1: Explorer Tree & Cast Pool -->
      <section class="layout-col explorer-col">
        <div class="explorer-section">
          <NarrativeExplorer
            :story-world-id="props.storyWorldId"
            @create-scene="handleCreateScene"
            @apply-template="templateModalOpen = true"
          />
        </div>
        <div class="cast-pool-section">
          <StoryCastPool
            :snapshot="props.snapshot"
            :loading="props.loading"
          />
        </div>
      </section>

      <!-- Column 2: Center Scene Script Editor -->
      <section class="layout-col editor-col">
        <SceneScriptEditor
          v-if="outlineStore.activeSceneId"
          :story-world-id="props.storyWorldId"
          :scene-id="outlineStore.activeSceneId"
          :characters="characters"
          @saved="diagStore.fetchDiagnostics(props.storyWorldId)"
        />
        <div v-else class="no-scene-selected">
          <FileText :size="48" class="placeholder-icon" />
          <h3>未选择场景</h3>
          <p>请在左侧故事大纲树中选择或创建一个场景以开始编写剧本</p>
          <Button size="sm" tone="accent" @click="templateModalOpen = true">
            <Wand2 :size="14" />
            <span>套用经典剧情模版</span>
          </Button>
        </div>
      </section>

      <!-- Column 3: Inspector & Diagnostics -->
      <section class="layout-col inspector-col">
        <div class="inspector-section">
          <NarrativeInspector
            :story-world-id="props.storyWorldId"
            :characters="characters"
            :locations="locations"
          />
        </div>
        <div class="diagnostics-section">
          <NarrativeDiagnosticsPanel
            :story-world-id="props.storyWorldId"
            @jump-to-scene="(sid) => outlineStore.selectScene(sid)"
          />
        </div>
      </section>
    </div>

    <!-- Template Selection Modal -->
    <Modal
      :open="templateModalOpen"
      title="套用剧情大纲模版"
      @close="templateModalOpen = false"
    >
      <div class="template-modal-body">
        <p class="modal-intro">
          选择一个经过领域验证的标准剧情结构。模版将自动生成完整的篇章、章节、任务、场景分块及初始分支。
        </p>

        <div class="templates-grid">
          <div
            v-for="tpl in availableTemplates"
            :key="tpl.templateId"
            class="template-card"
            :class="{ selected: selectedTemplateId === tpl.templateId }"
            @click="selectedTemplateId = tpl.templateId"
          >
            <div class="tpl-top">
              <span class="tpl-name">{{ tpl.name }}</span>
              <Badge size="xs" tone="neutral">{{ tpl.category }}</Badge>
            </div>
            <p class="tpl-desc">{{ tpl.description }}</p>
          </div>
        </div>

        <div class="modal-footer">
          <Button variant="secondary" @click="templateModalOpen = false">取消</Button>
          <Button
            tone="accent"
            :loading="templateApplying"
            @click="handleApplyTemplate"
          >
            <Check :size="14" />
            <span>确认套用模版</span>
          </Button>
        </div>
      </div>
    </Modal>

    <!-- Global Search Palette Modal -->
    <Modal
      :open="searchStore.isOpen"
      title="正典剧情全域检索"
      @close="searchStore.closeSearch()"
    >
      <div class="search-modal-body">
        <div class="search-input-wrap">
          <Search :size="16" class="search-input-icon" />
          <input
            class="palette-input"
            placeholder="搜索篇章、章节、任务、场景台词或世界观设定..."
            autoFocus
            @input="handleSearchInput"
          />
        </div>

        <div v-if="searchStore.searching" class="search-status">
          <Sparkles :size="14" class="spin" />
          <span>正在检索正典事实库与剧情文本...</span>
        </div>

        <div v-else-if="searchStore.results.length === 0 && searchStore.query" class="search-status">
          <span>未找到与 "{{ searchStore.query }}" 相关的剧情内容</span>
        </div>

        <div v-else class="results-list">
          <div
            v-for="item in searchStore.results"
            :key="item.id"
            class="search-result-item"
            @click="handleSelectSearchResult(item)"
          >
            <div class="result-top">
              <Badge size="xs" tone="neutral">{{ item.kind }}</Badge>
              <span class="result-title">{{ item.title }}</span>
            </div>
            <p class="result-snippet">{{ item.snippet }}</p>
          </div>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.story-workspace-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-canvas, #121216);
  overflow: hidden;
}

.story-top-bar {
  padding: 10px 16px;
  background: var(--bg-surface, #1e1e24);
  border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.bar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.main-icon {
  color: var(--accent-primary, #6366f1);
}

.title-wrap h1 {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary, #f9fafb);
}

.bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.story-layout-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr 340px;
  overflow: hidden;
}

.layout-col {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.explorer-col {
  border-right: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
}

.explorer-section {
  flex: 1;
  overflow: hidden;
}

.cast-pool-section {
  max-height: 220px;
  border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
}

.editor-col {
  background: var(--bg-canvas, #121216);
  position: relative;
}

.no-scene-selected {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--text-muted, #9ca3af);
  text-align: center;
  padding: 32px;
}

.placeholder-icon {
  color: var(--text-subtle, #4b5563);
}

.no-scene-selected h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-secondary, #e5e7eb);
  margin: 0;
}

.no-scene-selected p {
  font-size: 13px;
  max-width: 320px;
  margin: 0 0 8px;
}

.inspector-col {
  border-left: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
}

.inspector-section {
  flex: 1;
  overflow: hidden;
}

.diagnostics-section {
  border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
}

.template-modal-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0;
}

.modal-intro {
  font-size: 13px;
  color: var(--text-secondary, #d1d5db);
  margin: 0;
  line-height: 1.5;
}

.templates-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
}

.template-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.template-card:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
}

.template-card.selected {
  background: rgba(99, 102, 241, 0.12);
  border-color: var(--accent-primary, #6366f1);
}

.tpl-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.tpl-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #f9fafb);
}

.tpl-desc {
  font-size: 12px;
  color: var(--text-muted, #9ca3af);
  margin: 0;
  line-height: 1.4;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.search-modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0;
}

.search-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.15));
  border-radius: 8px;
  padding: 8px 12px;
}

.search-input-icon {
  color: var(--text-muted, #9ca3af);
}

.palette-input {
  flex: 1;
  background: none;
  border: none;
  color: var(--text-primary, #ffffff);
  font-size: 14px;
  outline: none;
}

.search-status {
  padding: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted, #9ca3af);
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 360px;
  overflow-y: auto;
}

.search-result-item {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06));
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.search-result-item:hover {
  background: rgba(99, 102, 241, 0.1);
  border-color: var(--accent-primary, #6366f1);
}

.result-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.result-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #f9fafb);
}

.result-snippet {
  font-size: 12px;
  color: var(--text-muted, #9ca3af);
  margin: 0;
  line-height: 1.4;
}

.spin {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
