<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import NarrativeWorkbenchLayout from "../layouts/NarrativeWorkbenchLayout.vue";
import type { NarrativeWorkbenchMode } from "../components/topbar/NarrativeModeTabs.vue";
import type { SaveStatus } from "../components/topbar/NarrativeTopBar.vue";
import { useNarrativeOutlineStore } from "../../story/stores/useNarrativeOutlineStore.ts";
import { useSceneDocumentStore } from "../../story/stores/useSceneDocumentStore.ts";
import { useNarrativeDiagnosticsStore } from "../../story/stores/useNarrativeDiagnosticsStore.ts";
import { useNarrativeCanonLookupStore } from "../stores/useNarrativeCanonLookupStore.ts";
import { useNarrativeSessionStore } from "../stores/useNarrativeSessionStore.ts";
import { useNarrativeChoiceStore } from "../stores/useNarrativeChoiceStore.ts";
import { useNarrativeCandidateStore } from "../stores/useNarrativeCandidateStore.ts";
import { useNarrativeRevisionStore } from "../stores/useNarrativeRevisionStore.ts";
import { useSceneNavigationGuard } from "../composables/useSceneNavigationGuard.ts";
import { useNarrativeSceneLoader } from "../composables/useNarrativeSceneLoader.ts";
import { useNarrativeAutosave } from "../composables/useNarrativeAutosave.ts";
import { useNarrativeRouteSync } from "../composables/useNarrativeRouteSync.ts";
import { createNarrativeMutationKey } from "../utils/idempotency.ts";
import NarrativeExplorer from "../components/explorer/NarrativeExplorer.vue";
import NarrativeOutlineBoard from "../components/outline/NarrativeOutlineBoard.vue";
import QuestFlowView from "../components/flow/QuestFlowView.vue";
import ChoiceInspector from "../components/flow/ChoiceInspector.vue";
import CandidateReviewView from "../components/review/CandidateReviewView.vue";
import SceneScriptEditor from "../components/script/SceneScriptEditor.vue";
import NarrativeInspector from "../components/inspector/NarrativeInspector.vue";
import NarrativeBottomPanel from "../components/problems/NarrativeBottomPanel.vue";
import NarrativeCommandPalette from "../components/search/NarrativeCommandPalette.vue";
import Modal from "../../../components/ui/Modal.vue";
import Button from "../../../components/ui/Button.vue";
import { V2NarrativeClient } from "../../story/client.ts";
import type {
  V2ChoiceDto,
  V2NarrativeSearchResultItem,
  V2NarrativeTemplate,
  V2NarrativeTemplateId,
} from "@living-network/contracts/v2";

const route = useRoute();
const router = useRouter();

const storyWorldId = computed(() => (route.params.storyWorldId as string) || "default");

const outlineStore = useNarrativeOutlineStore();
const docStore = useSceneDocumentStore();
const diagStore = useNarrativeDiagnosticsStore();
const canonLookupStore = useNarrativeCanonLookupStore();
const sessionStore = useNarrativeSessionStore();
const revisionStore = useNarrativeRevisionStore();
const choiceStore = useNarrativeChoiceStore();
const candidateStore = useNarrativeCandidateStore();

// Command Palette State
const commandPaletteOpen = ref(false);

// Flow Mode selected choice for Inspector
const activeFlowChoice = ref<V2ChoiceDto | null>(null);

// Unified Session State Getters/Setters
const mode = computed<NarrativeWorkbenchMode>({
  get: () => sessionStore.mode,
  set: (m) => sessionStore.setMode(m),
});

const selectedSceneId = computed<string | null>({
  get: () => sessionStore.activeSceneId,
  set: (id) => sessionStore.selectScene(id),
});

// Mode-aware Left/Right Sidebar collapse state
const isExplorerCollapsed = computed<boolean>(() => {
  if (mode.value === "review") return true;
  return sessionStore.explorerCollapsed;
});

const isInspectorCollapsed = computed<boolean>(() => {
  if (mode.value === "outline" || mode.value === "review") return true;
  if (mode.value === "flow") return !activeFlowChoice.value;
  return sessionStore.inspectorCollapsed;
});

const previewActive = computed<boolean>({
  get: () => sessionStore.previewActive,
  set: (v) => { sessionStore.previewActive = v; },
});

const bottomDrawerOpen = computed<boolean>({
  get: () => sessionStore.bottomPanelOpen,
  set: (v) => sessionStore.setBottomPanelOpen(v),
});

const routeSync = useNarrativeRouteSync(route, router);

const sceneLoader = useNarrativeSceneLoader();
const navGuard = useSceneNavigationGuard({
  storyWorldId,
  onNavigateScene: (sceneId) => {
    sessionStore.selectScene(sceneId);
  },
});
const autosave = useNarrativeAutosave({
  storyWorldId,
});

// Template Modal
const templateModalOpen = ref(false);
const availableTemplates = ref<readonly V2NarrativeTemplate[]>([]);
const selectedTemplateId = ref<V2NarrativeTemplateId>("three-act");
const templateApplying = ref(false);

// Active breadcrumb computations
const activeScene = computed(() => {
  if (!selectedSceneId.value || !outlineStore.outline) return null;
  for (const arc of outlineStore.outline.arcs) {
    for (const ch of arc.chapters) {
      for (const q of ch.quests) {
        const sc = q.scenes.find((s) => s.sceneId === selectedSceneId.value);
        if (sc) return { scene: sc, quest: q, chapter: ch, arc };
      }
      const looseSc = ch.looseScenes.find((s) => s.sceneId === selectedSceneId.value);
      if (looseSc) return { scene: looseSc, chapter: ch, arc };
    }
    const looseSc = arc.looseScenes.find((s) => s.sceneId === selectedSceneId.value);
    if (looseSc) return { scene: looseSc, arc };
  }
  const unassigned = outlineStore.outline.unassignedScenes.find((s) => s.sceneId === selectedSceneId.value);
  if (unassigned) return { scene: unassigned };
  return null;
});

const worldName = computed(() => {
  if (storyWorldId.value && storyWorldId.value !== "default") {
    return storyWorldId.value;
  }
  return "故事世界正典";
});

const arcTitle = computed(() => activeScene.value?.arc?.title);
const chapterTitle = computed(() => activeScene.value?.chapter?.title);
const questTitle = computed(() => activeScene.value?.quest?.title);
const sceneTitle = computed(() => activeScene.value?.scene?.title || docStore.document?.title || "");

const saveStatus = computed<SaveStatus>(() => autosave.saveStatus.value);

// On-demand mode data loading
watch(
  () => sessionStore.mode,
  (newMode) => {
    if (storyWorldId.value) {
      if (newMode === "review") {
        void candidateStore.fetchCandidates(storyWorldId.value);
      } else if (newMode === "outline" || newMode === "flow") {
        void choiceStore.fetchChoicesForWorld(storyWorldId.value);
      }
    }
  },
  { immediate: true },
);

watch(
  () => sessionStore.activeSceneId,
  (newSceneId) => {
    if (newSceneId) {
      sceneLoader.loadScene(storyWorldId.value, newSceneId);
    }
  },
);

function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
    e.preventDefault();
    commandPaletteOpen.value = true;
  }
}

onMounted(async () => {
  window.addEventListener("keydown", handleGlobalKeydown);
  routeSync.syncFromRoute();
  if (storyWorldId.value) {
    await Promise.all([
      outlineStore.fetchOutline(storyWorldId.value),
      diagStore.fetchDiagnostics(storyWorldId.value),
    ]);
    if (!sessionStore.activeSceneId && outlineStore.outline) {
      const firstScene = outlineStore.outline.arcs[0]?.chapters[0]?.quests[0]?.scenes[0]
        || outlineStore.outline.arcs[0]?.looseScenes[0]
        || outlineStore.outline.unassignedScenes[0];
      if (firstScene) {
        sessionStore.selectScene(firstScene.sceneId);
      }
    } else if (sessionStore.activeSceneId) {
      await sceneLoader.loadScene(storyWorldId.value, sessionStore.activeSceneId);
    }
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleGlobalKeydown);
});

function handleBack() {
  router.push(`/v2/workspace/story`);
}

function handleSelectScene(sceneId: string) {
  if (sessionStore.activeSceneId === sceneId) return;
  navGuard.requestSceneChange(sceneId, () => {
    sessionStore.selectScene(sceneId);
  });
}

function handleOpenSceneFromPanel(sceneId: string, blockId?: string) {
  if (blockId) {
    sessionStore.setActiveBlockId(blockId);
  }
  mode.value = "script";
  handleSelectScene(sceneId);
}

function handleSelectSearchResult(item: V2NarrativeSearchResultItem) {
  if (item.kind === "scene") {
    mode.value = "script";
    handleSelectScene(item.id);
  } else if (item.kind === "scene_block") {
    mode.value = "script";
    const sceneId = item.sceneId || item.parentPath || item.id;
    sessionStore.setActiveBlockId(item.id);
    handleSelectScene(sceneId);
  } else if (item.sceneId) {
    mode.value = "script";
    handleSelectScene(item.sceneId);
  }
}

async function handleCreateScene(payload?: { arcId?: string | undefined; chapterId?: string | undefined; questId?: string | undefined }) {
  const title = prompt("请输入新场景名称：", "新场景");
  if (!title) return;
  const sceneId = await outlineStore.createScene(storyWorldId.value, { ...payload, title });
  sessionStore.selectScene(sceneId);
  mode.value = "script";
}

async function loadTemplates() {
  try {
    const client = new V2NarrativeClient();
    const res = await client.listTemplates();
    availableTemplates.value = res.templates;
  } catch (err) {
    console.error("Failed to list templates:", err);
  }
}

function openTemplateModal() {
  templateModalOpen.value = true;
  loadTemplates();
}

async function handleApplyTemplate() {
  templateApplying.value = true;
  try {
    await outlineStore.applyTemplate(storyWorldId.value, {
      templateId: selectedTemplateId.value,
    });
    templateModalOpen.value = false;
    await Promise.all([
      diagStore.fetchDiagnostics(storyWorldId.value),
      choiceStore.fetchChoicesForWorld(storyWorldId.value),
    ]);
    if (outlineStore.allScenes.length > 0) {
      selectedSceneId.value = outlineStore.allScenes[0]!.sceneId;
    }
  } catch (err) {
    alert(err instanceof Error ? err.message : "套用模版失败");
  } finally {
    templateApplying.value = false;
  }
}

async function handlePublishRelease() {
  if (diagStore.errorCount > 0) {
    bottomDrawerOpen.value = true;
    alert(`无法发布：当前存在 ${diagStore.errorCount} 项阻碍发布的正典错误，请在下方问题面板中修复后重试。`);
    return;
  }

  const version = prompt("请输入发布版本号 (例如 1.0.0)：", "1.0.0");
  if (!version) return;

  try {
    const releaseId = `rel_${Math.random().toString(36).slice(2, 9)}`;
    const res = await fetch(`/api/v2/core/worlds/${storyWorldId.value}/releases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        releaseId,
        version: version.trim(),
        sourceRevision: revisionStore.requireRevision(),
        idempotencyKey: createNarrativeMutationKey("create_release"),
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `发布失败 (${res.status})`);
    }

    alert(`正典版本 ${version} 发布成功！已生成发布快照。`);
    await diagStore.fetchDiagnostics(storyWorldId.value);
  } catch (err) {
    alert(err instanceof Error ? err.message : "发布失败");
  }
}
</script>

<template>
  <NarrativeWorkbenchLayout
    :world-name="worldName"
    :arc-title="arcTitle"
    :chapter-title="chapterTitle"
    :quest-title="questTitle"
    :scene-title="sceneTitle"
    :mode="mode"
    :save-status="saveStatus"
    :preview-active="previewActive"
    :explorer-collapsed="isExplorerCollapsed"
    :inspector-collapsed="isInspectorCollapsed"
    @update:mode="mode = $event"
    @toggle:explorer="sessionStore.toggleExplorer()"
    @toggle:inspector="sessionStore.toggleInspector()"
    @back="handleBack"
    @search="commandPaletteOpen = true"
    @preview="previewActive = !previewActive"
    @ai-assist="mode = 'review'"
    @template="openTemplateModal"
    @publish="handlePublishRelease"
    @refresh="outlineStore.fetchOutline(storyWorldId)"
  >
    <!-- Left Column: Mode-Aware Explorer -->
    <template #explorer>
      <div v-if="mode !== 'review'" class="h-full flex flex-col">
        <NarrativeExplorer
          :story-world-id="storyWorldId"
          :selected-scene-id="selectedSceneId"
          @select-scene="handleSelectScene"
          @create-scene="handleCreateScene"
        />
      </div>
    </template>

    <!-- Center Column: Primary Work Surface -->
    <template #main>
      <div class="h-full flex flex-col p-4 overflow-y-auto">
        <!-- 1. Outline Mode -->
        <template v-if="mode === 'outline'">
          <NarrativeOutlineBoard
            :story-world-id="storyWorldId"
            :selected-scene-id="selectedSceneId"
            @select-scene="handleSelectScene"
            @open-script="(id) => { selectedSceneId = id; mode = 'script'; }"
            @create-scene="handleCreateScene"
          />
        </template>

        <!-- 2. Flow Mode (Scoped Flow) -->
        <template v-else-if="mode === 'flow'">
          <QuestFlowView
            :story-world-id="storyWorldId"
            :selected-scene-id="selectedSceneId"
            :active-quest-id="sessionStore.activeQuestId"
            :selected-choice-id="activeFlowChoice?.choiceId ?? null"
            @select-scene="handleSelectScene"
            @select-choice="(c) => { activeFlowChoice = c; }"
            @select-quest="(qId) => sessionStore.selectQuest(qId)"
            @open-script="(id) => { selectedSceneId = id; mode = 'script'; }"
            @create-scene="(payload) => handleCreateScene(payload)"
          />
        </template>

        <!-- 3. Review Mode (AI Review Workspace) -->
        <template v-else-if="mode === 'review'">
          <CandidateReviewView
            :story-world-id="storyWorldId"
            @merged="(id) => { selectedSceneId = id; mode = 'script'; }"
          />
        </template>

        <!-- 4. Script Mode (Scene Script Document) -->
        <template v-else-if="selectedSceneId">
          <SceneScriptEditor
            :story-world-id="storyWorldId"
            :scene-id="selectedSceneId"
            :characters="canonLookupStore.characters"
            :is-preview="previewActive"
          />
        </template>

        <!-- Script Empty State -->
        <template v-else>
          <div class="flex-1 flex flex-col items-center justify-center text-stone-400 space-y-2">
            <p class="text-sm font-medium">请在左侧故事大纲树中选择一个场景开始编写剧本</p>
          </div>
        </template>
      </div>
    </template>

    <!-- Right Column: Mode-Aware Inspector -->
    <template #inspector>
      <div class="h-full flex flex-col overflow-y-auto">
        <!-- Flow Mode Inspector: ChoiceInspector when choice is selected -->
        <template v-if="mode === 'flow' && activeFlowChoice">
          <ChoiceInspector
            :story-world-id="storyWorldId"
            :choice="activeFlowChoice"
            :available-scenes="outlineStore.allScenes"
            @close="activeFlowChoice = null"
            @updated="choiceStore.fetchChoicesForWorld(storyWorldId)"
            @deleted="() => { activeFlowChoice = null; choiceStore.fetchChoicesForWorld(storyWorldId); }"
          />
        </template>

        <!-- Script Mode Inspector: NarrativeInspector (References / Choices / AI Context) -->
        <template v-else-if="mode === 'script' && selectedSceneId">
          <NarrativeInspector
            :story-world-id="storyWorldId"
            :scene-id="selectedSceneId"
            :characters="canonLookupStore.characters"
            :locations="canonLookupStore.locations"
            @open-flow="mode = 'flow'"
          />
        </template>
      </div>
    </template>

    <!-- Bottom Status Bar -->
    <template #bottom>
      <div class="h-7 px-3 flex items-center justify-between text-xs text-stone-500 border-t border-stone-200 dark:border-stone-800 select-none bg-stone-50 dark:bg-stone-900">
        <div class="flex items-center gap-4">
          <button
            type="button"
            class="flex items-center gap-1 hover:text-stone-900 dark:hover:text-stone-100 font-medium"
            @click="bottomDrawerOpen = !bottomDrawerOpen"
          >
            <span v-if="!diagStore.report || diagStore.report.errorCount === 0" class="text-emerald-600 dark:text-emerald-400 font-medium">✓ 剧情诊断：无问题</span>
            <span v-else class="text-amber-600 dark:text-amber-400 font-bold">
              ⨯ {{ diagStore.report.errorCount }} 错误 &nbsp; △ {{ diagStore.report.warningCount }} 警告
            </span>
          </button>
        </div>

        <div class="flex items-center gap-3 text-[11px]">
          <span>大纲场景: {{ outlineStore.allScenes.length }} 篇</span>
        </div>
      </div>

      <!-- Collapsible Problems & Diagnostics Drawer -->
      <NarrativeBottomPanel
        :story-world-id="storyWorldId"
        :open="bottomDrawerOpen"
        @close="bottomDrawerOpen = false"
        @open-scene="handleOpenSceneFromPanel"
      />
    </template>

    <!-- Overlays: Modals & Command Palette -->
    <template #overlays>
      <!-- Command Palette Search Overlay -->
      <NarrativeCommandPalette
        :story-world-id="storyWorldId"
        :open="commandPaletteOpen"
        @close="commandPaletteOpen = false"
        @select-item="handleSelectSearchResult"
      />

      <!-- Template Modal Overlay -->
      <Modal :open="templateModalOpen" title="套用故事大纲模版" @close="templateModalOpen = false">
        <div class="space-y-4">
          <p class="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
            选择一个预设剧情结构模板。套用模板将根据经典故事范式生成预置的篇章、章节、任务与初始场景骨架。
          </p>

          <div class="space-y-2">
            <div
              v-for="tpl in availableTemplates"
              :key="tpl.templateId"
              class="p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-3"
              :class="[
                selectedTemplateId === tpl.templateId
                  ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 shadow-xs'
                  : 'border-stone-200 dark:border-stone-800 hover:border-stone-300'
              ]"
              @click="selectedTemplateId = tpl.templateId"
            >
              <div class="flex-1">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-semibold text-stone-900 dark:text-stone-100">{{ tpl.name }}</span>
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">{{ tpl.category }}</span>
                </div>
                <p class="text-xs text-stone-500 leading-normal">{{ tpl.description }}</p>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-3 border-t border-stone-200 dark:border-stone-800">
            <Button variant="ghost" size="sm" @click="templateModalOpen = false">取消</Button>
            <Button variant="primary" size="sm" :loading="templateApplying" @click="handleApplyTemplate">
              立即套用
            </Button>
          </div>
        </div>
      </Modal>

      <!-- Unsaved Changes Confirmation Modal -->
      <Modal :open="navGuard.showConfirmModal.value" title="未保存的场景修改" @close="navGuard.handleCancel()">
        <div class="space-y-4">
          <p class="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
            当前场景存在未保存的剧本草稿修改。切换场景或离开将会使未保存的内容丢失，您希望如何处理？
          </p>

          <div v-if="navGuard.errorMessage.value" class="p-2 rounded bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs">
            {{ navGuard.errorMessage.value }}
          </div>

          <div class="flex justify-end gap-2 pt-3 border-t border-stone-200 dark:border-stone-800">
            <Button variant="ghost" size="sm" @click="navGuard.handleCancel()">取消</Button>
            <Button variant="secondary" size="sm" @click="navGuard.handleDiscardAndProceed()">
              放弃修改并继续
            </Button>
            <Button variant="primary" size="sm" :loading="navGuard.saving.value" @click="navGuard.handleSaveAndProceed()">
              保存并继续
            </Button>
          </div>
        </div>
      </Modal>
    </template>
  </NarrativeWorkbenchLayout>
</template>
