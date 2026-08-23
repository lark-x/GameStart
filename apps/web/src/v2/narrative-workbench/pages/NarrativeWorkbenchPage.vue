<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import NarrativeWorkbenchLayout from "../layouts/NarrativeWorkbenchLayout.vue";
import type { NarrativeWorkbenchMode } from "../components/topbar/NarrativeModeTabs.vue";
import type { SaveStatus } from "../components/topbar/NarrativeTopBar.vue";
import { useNarrativeOutlineStore } from "../../story/stores/useNarrativeOutlineStore.ts";
import { useSceneDocumentStore } from "../../story/stores/useSceneDocumentStore.ts";
import { useNarrativeReferenceStore } from "../../story/stores/useNarrativeReferenceStore.ts";
import { useNarrativeDiagnosticsStore } from "../../story/stores/useNarrativeDiagnosticsStore.ts";
import { useNarrativeCanonLookupStore } from "../stores/useNarrativeCanonLookupStore.ts";
import { useNarrativeSessionStore } from "../stores/useNarrativeSessionStore.ts";
import { useNarrativeChoiceStore } from "../stores/useNarrativeChoiceStore.ts";
import { useNarrativeCandidateStore } from "../stores/useNarrativeCandidateStore.ts";
import NarrativeExplorer from "../components/explorer/NarrativeExplorer.vue";
import NarrativeOutlineBoard from "../components/outline/NarrativeOutlineBoard.vue";
import QuestFlowView from "../components/flow/QuestFlowView.vue";
import CandidateReviewView from "../components/review/CandidateReviewView.vue";
import SceneScriptEditor from "../components/script/SceneScriptEditor.vue";
import NarrativeInspector from "../components/inspector/NarrativeInspector.vue";
import NarrativeBottomPanel from "../components/problems/NarrativeBottomPanel.vue";
import Modal from "../../../components/ui/Modal.vue";
import Button from "../../../components/ui/Button.vue";
import { V2NarrativeClient } from "../../story/client.ts";
import type {
  V2ArcId,
  V2IdempotencyKey,
  V2NarrativeTemplate,
  V2NarrativeTemplateId,
  V2Revision,
} from "@living-network/contracts/v2";

const route = useRoute();
const router = useRouter();

const storyWorldId = computed(() => (route.params.storyWorldId as string) || "default");
const mode = ref<NarrativeWorkbenchMode>((route.query.mode as NarrativeWorkbenchMode) || "script");
const selectedSceneId = ref<string | null>((route.query.scene as string) || null);

const outlineStore = useNarrativeOutlineStore();
const docStore = useSceneDocumentStore();
const refStore = useNarrativeReferenceStore();
const diagStore = useNarrativeDiagnosticsStore();
const canonLookupStore = useNarrativeCanonLookupStore();
const sessionStore = useNarrativeSessionStore();
const choiceStore = useNarrativeChoiceStore();
const candidateStore = useNarrativeCandidateStore();

const explorerCollapsed = ref(false);
const inspectorCollapsed = ref(false);
const previewActive = ref(false);
const bottomDrawerOpen = ref(false);

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

const worldName = computed(() => "提瓦特故事正典");
const arcTitle = computed(() => activeScene.value?.arc?.title);
const chapterTitle = computed(() => activeScene.value?.chapter?.title);
const questTitle = computed(() => activeScene.value?.quest?.title);
const sceneTitle = computed(() => activeScene.value?.scene?.title || docStore.document?.title || "");

const saveStatus = computed<SaveStatus>(() => {
  if (docStore.saving) return "saving";
  if (docStore.isDirty) return "dirty";
  return "saved";
});

// Sync query params
watch(mode, (newMode) => {
  router.replace({ query: { ...route.query, mode: newMode } });
});

watch(selectedSceneId, (newSceneId) => {
  router.replace({ query: { ...route.query, scene: newSceneId || undefined } });
  if (newSceneId) {
    docStore.fetchDocument(storyWorldId.value, newSceneId);
    refStore.fetchSceneReferences(storyWorldId.value, newSceneId);
  }
});

onMounted(async () => {
  if (storyWorldId.value) {
    sessionStore.initSession(storyWorldId.value, mode.value, selectedSceneId.value || undefined);
    await Promise.all([
      outlineStore.fetchOutline(storyWorldId.value),
      diagStore.fetchDiagnostics(storyWorldId.value),
      canonLookupStore.fetchWorldCanon(storyWorldId.value),
      choiceStore.fetchChoicesForWorld(storyWorldId.value),
      candidateStore.fetchCandidates(storyWorldId.value),
    ]);
    if (!selectedSceneId.value && outlineStore.outline) {
      const firstScene = outlineStore.outline.arcs[0]?.chapters[0]?.quests[0]?.scenes[0]
        || outlineStore.outline.arcs[0]?.looseScenes[0]
        || outlineStore.outline.unassignedScenes[0];
      if (firstScene) {
        selectedSceneId.value = firstScene.sceneId;
      }
    } else if (selectedSceneId.value) {
      await docStore.fetchDocument(storyWorldId.value, selectedSceneId.value);
      await refStore.fetchSceneReferences(storyWorldId.value, selectedSceneId.value);
    }
  }
});

function handleBack() {
  router.push(`/v2/workspace/story`);
}

function handleSelectScene(sceneId: string) {
  selectedSceneId.value = sceneId;
  if (mode.value === "outline") {
    mode.value = "script";
  }
}

async function handleCreateScene(payload?: { arcId?: string; chapterId?: string; questId?: string }) {
  const title = prompt("请输入新场景名称：", "新场景");
  if (!title) return;

  const sceneId = `scene_${Date.now().toString(36)}`;
  const client = new V2NarrativeClient();
  await client.saveSceneDocument(storyWorldId.value, sceneId, {
    title,
    documentMode: "blocks",
    ...(payload?.arcId ? { arcId: payload.arcId as V2ArcId } : {}),
    ...(payload?.chapterId ? { chapterId: payload.chapterId } : {}),
    ...(payload?.questId ? { questId: payload.questId } : {}),
    blocks: [
      {
        kind: "narration",
        text: `${title} 场景开幕。`,
      },
    ],
  });
  await outlineStore.fetchOutline(storyWorldId.value);
  selectedSceneId.value = sceneId;
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
      expectedRevision: 1 as V2Revision,
      idempotencyKey: `tpl_app_${Date.now()}` as V2IdempotencyKey,
    });
    templateModalOpen.value = false;
    await diagStore.fetchDiagnostics(storyWorldId.value);
  } catch (err) {
    console.error("Failed to apply template:", err);
  } finally {
    templateApplying.value = false;
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
    :explorer-collapsed="explorerCollapsed"
    :inspector-collapsed="inspectorCollapsed"
    @update:mode="mode = $event"
    @back="handleBack"
    @search="bottomDrawerOpen = true"
    @preview="previewActive = !previewActive"
    @ai-assist="mode = 'review'"
    @template="openTemplateModal"
    @refresh="outlineStore.fetchOutline(storyWorldId)"
  >
    <!-- Left Column: Explorer -->
    <template #explorer>
      <div class="h-full flex flex-col">
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
        <template v-if="mode === 'outline'">
          <NarrativeOutlineBoard
            :story-world-id="storyWorldId"
            :selected-scene-id="selectedSceneId"
            @select-scene="handleSelectScene"
            @open-script="(id) => { selectedSceneId = id; mode = 'script'; }"
            @create-scene="handleCreateScene"
          />
        </template>
        <template v-else-if="mode === 'flow'">
          <QuestFlowView
            :story-world-id="storyWorldId"
            :selected-scene-id="selectedSceneId"
            @select-scene="handleSelectScene"
            @open-script="(id) => { selectedSceneId = id; mode = 'script'; }"
            @create-scene="() => handleCreateScene()"
          />
        </template>
        <template v-else-if="mode === 'review'">
          <CandidateReviewView
            :story-world-id="storyWorldId"
            @merged="(id) => { selectedSceneId = id; mode = 'script'; }"
          />
        </template>
        <template v-else-if="selectedSceneId">
          <SceneScriptEditor
            :story-world-id="storyWorldId"
            :scene-id="selectedSceneId"
            :characters="canonLookupStore.characters"
            :is-preview="previewActive"
          />
        </template>
        <template v-else>
          <div class="flex-1 flex flex-col items-center justify-center text-stone-500">
            <p class="text-sm">请在左侧大纲树中选择一个场景开始编写剧本</p>
          </div>
        </template>
      </div>
    </template>

    <!-- Right Column: Inspector -->
    <template #inspector>
      <div class="h-full flex flex-col overflow-y-auto">
        <template v-if="selectedSceneId">
          <NarrativeInspector
            :story-world-id="storyWorldId"
            :scene-id="selectedSceneId"
            :characters="canonLookupStore.characters"
            :locations="canonLookupStore.locations"
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
          <span>模式: {{ mode }}</span>
          <span>•</span>
          <span>大纲节点: {{ outlineStore.allScenes.length }} 场景</span>
        </div>
      </div>

      <!-- Collapsible Problems & Diagnostics Drawer -->
      <NarrativeBottomPanel
        :story-world-id="storyWorldId"
        :open="bottomDrawerOpen"
        @close="bottomDrawerOpen = false"
        @open-scene="handleSelectScene"
      />
    </template>

    <!-- Template Modal Overlay -->
    <template #overlays>
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
                  ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm'
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
    </template>
  </NarrativeWorkbenchLayout>
</template>
