<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  BookOpen,
  GitBranch,
  Layers3,
  MapPin,
  Plus,
  Sparkles,
  Star,
  Wand2,
} from "@lucide/vue";
import type { V2ArcId, V2SceneId } from "@living-network/contracts/v2";
import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Drawer from "../../../components/ui/Drawer.vue";
import Field from "../../../components/ui/Field.vue";
import Input from "../../../components/ui/Input.vue";
import Textarea from "../../../components/ui/Textarea.vue";
import { useV2WorkspaceStore } from "../../stores/workspace.ts";
import StoryCastPool from "./StoryCastPool.vue";
import StorySceneInspectorDrawer from "./StorySceneInspectorDrawer.vue";
import StoryNodeDrawer, { type CanonEntityKind, type StoryEditingNode } from "./StoryNodeDrawer.vue";
import type {
  V2ArcSummary,
  V2CharacterSummary,
  V2ChoiceSummary,
  V2LocationSummary,
  V2SceneSummary,
  V2WorkspaceSnapshot,
} from "../../adapters/types.ts";

const props = defineProps<{
  snapshot: V2WorkspaceSnapshot | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  refreshed: [];
}>();

const store = useV2WorkspaceStore();

// Scene Inspector Drawer State
const selectedScene = ref<V2SceneSummary | null>(null);
const sceneDrawerOpen = ref(false);
const newSceneArcId = ref<string | null>(null);

// Arc Creation/Edit Drawer State
const arcDrawerOpen = ref(false);
const editingArc = ref<V2ArcSummary | null>(null);
const arcTitle = ref("");
const arcSummary = ref("");
const arcSaving = ref(false);
const arcError = ref<string | null>(null);

// StoryNodeDrawer for Character/Location quick edit
const nodeDrawerOpen = ref(false);
const nodeDrawerKind = ref<CanonEntityKind>("character");
const editingNode = ref<StoryEditingNode | null>(null);

// Smart skeleton generating state
const generatingSkeleton = ref(false);

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    if (sceneDrawerOpen.value) {
      sceneDrawerOpen.value = false;
    } else if (arcDrawerOpen.value) {
      arcDrawerOpen.value = false;
    }
  }
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

// Group scenes by Arc swimlanes
interface ActSwimlane {
  readonly id: string;
  readonly title: string;
  readonly summary?: string;
  readonly isUnassigned: boolean;
  readonly arc?: V2ArcSummary;
  readonly scenes: readonly V2SceneSummary[];
}

const swimlanes = computed<readonly ActSwimlane[]>(() => {
  if (!props.snapshot) return [];
  const allScenes = props.snapshot.sceneGraph.scenes;
  const arcs = props.snapshot.sceneGraph.arcs;

  const result: ActSwimlane[] = [];

  // 1. Arcs as distinct swimlanes
  for (const arc of arcs) {
    const matchedScenes = allScenes.filter((s) => s.arcId === arc.arcId);
    result.push({
      id: arc.arcId,
      title: arc.title,
      ...(arc.summary ? { summary: arc.summary } : {}),
      isUnassigned: false,
      arc,
      scenes: matchedScenes,
    });
  }

  // 2. Unassigned scenes swimlane (if any unassigned scenes exist or if arcs is empty)
  const unassignedScenes = allScenes.filter(
    (s) => !s.arcId || !arcs.some((a) => a.arcId === s.arcId),
  );
  if (unassignedScenes.length > 0 || arcs.length === 0) {
    result.unshift({
      id: "unassigned",
      title: arcs.length === 0 ? "主线故事场景" : "独立与序章场景",
      summary: "未指定篇章归属的场景节点",
      isUnassigned: true,
      scenes: unassignedScenes,
    });
  }

  return result;
});

const totalScenesCount = computed(() => props.snapshot?.sceneGraph.scenes.length ?? 0);
const totalArcsCount = computed(() => props.snapshot?.sceneGraph.arcs.length ?? 0);

// Helper: find outbound choices for a scene
function getSceneChoices(sceneId: string): readonly V2ChoiceSummary[] {
  if (!props.snapshot) return [];
  return props.snapshot.sceneGraph.choices.filter((c) => c.sourceSceneId === sceneId);
}

// Helper: detect mentioned characters in a scene
function getSceneCharacters(scene: V2SceneSummary): readonly V2CharacterSummary[] {
  if (!props.snapshot) return [];
  const text = (scene.title + " " + (scene.body || "")).toLowerCase();
  return props.snapshot.world.characters.filter((c) =>
    text.includes(c.name.toLowerCase()),
  );
}

// Helper: detect mentioned location in a scene
function getSceneLocationName(scene: V2SceneSummary): string | null {
  if (!props.snapshot) return null;
  const text = (scene.title + " " + (scene.body || "")).toLowerCase();
  const loc = props.snapshot.world.locations.find((l) =>
    text.includes(l.name.toLowerCase()),
  );
  return loc ? loc.name : null;
}

function openAddScene(targetArcId?: string) {
  selectedScene.value = null;
  newSceneArcId.value = targetArcId || null;
  sceneDrawerOpen.value = true;
}

function openEditScene(scene: V2SceneSummary) {
  selectedScene.value = scene;
  sceneDrawerOpen.value = true;
}

function openAddArc() {
  editingArc.value = null;
  arcTitle.value = "";
  arcSummary.value = "";
  arcError.value = null;
  arcDrawerOpen.value = true;
}

function openEditArc(arc: V2ArcSummary) {
  editingArc.value = arc;
  arcTitle.value = arc.title;
  arcSummary.value = arc.summary || "";
  arcError.value = null;
  arcDrawerOpen.value = true;
}

async function handleSaveArc() {
  if (!arcTitle.value.trim()) {
    arcError.value = "请输入篇章标题";
    return;
  }
  arcSaving.value = true;
  arcError.value = null;
  try {
    if (editingArc.value) {
      await store.updateGraphEntity({
        kind: "arc",
        id: editingArc.value.arcId,
        input: {
          title: arcTitle.value.trim(),
          ...(arcSummary.value.trim() ? { summary: arcSummary.value.trim() } : {}),
        },
      });
    } else {
      await store.createGraphEntity({
        kind: "arc",
        input: {
          title: arcTitle.value.trim(),
          ...(arcSummary.value.trim() ? { summary: arcSummary.value.trim() } : {}),
        },
      });
    }
    if (store.error) throw new Error(store.error);
    arcDrawerOpen.value = false;
    emit("refreshed");
  } catch (err) {
    arcError.value = err instanceof Error ? err.message : "保存篇章失败";
  } finally {
    arcSaving.value = false;
  }
}

// Quick edit character/location from CastPool
function handleSelectCharacter(char: V2CharacterSummary) {
  editingNode.value = {
    id: char.characterId,
    tier: 2,
    kind: "character",
    title: char.name,
    subtitle: char.role || "正典角色",
    description: char.personaText || char.summary || "",
    roleImpact: "主线故事参演",
    rawData: char,
  };
  nodeDrawerKind.value = "character";
  nodeDrawerOpen.value = true;
}

function handleSelectLocation(loc: V2LocationSummary) {
  editingNode.value = {
    id: loc.locationId,
    tier: 1,
    kind: "location",
    title: loc.name,
    subtitle: "舞台地点",
    description: loc.summary || "",
    roleImpact: "主线核心舞台",
    rawData: loc,
  };
  nodeDrawerKind.value = "location";
  nodeDrawerOpen.value = true;
}

function handleAddCharacter() {
  editingNode.value = null;
  nodeDrawerKind.value = "character";
  nodeDrawerOpen.value = true;
}

function handleAddLocation() {
  editingNode.value = null;
  nodeDrawerKind.value = "location";
  nodeDrawerOpen.value = true;
}

// Smart 3-Act Skeleton Generator
async function generateThreeActSkeleton() {
  generatingSkeleton.value = true;
  try {
    // 1. Create Arc 1
    await store.createGraphEntity({
      kind: "arc",
      input: { title: "序章 · 初入与启程", summary: "踏入未知的世界，在核心舞台邂逅关键同伴。" },
    });
    const arc1 = store.snapshot?.sceneGraph.arcs.find((a) => a.title === "序章 · 初入与启程");

    // 2. Create Arc 2
    await store.createGraphEntity({
      kind: "arc",
      input: { title: "第一幕 · 冲突与暗流", summary: "暗中涌动的矛盾浮出水面，面临重大抉择。" },
    });
    const arc2 = store.snapshot?.sceneGraph.arcs.find((a) => a.title === "第一幕 · 冲突与暗流");

    // 3. Create Arc 3
    await store.createGraphEntity({
      kind: "arc",
      input: { title: "第二幕 · 抉择与终局", summary: "分支决战与命运交汇，迎来属于你的故事结局。" },
    });
    const arc3 = store.snapshot?.sceneGraph.arcs.find((a) => a.title === "第二幕 · 抉择与终局");

    // 4. Create Scene 1 (in Arc 1)
    await store.createGraphEntity({
      kind: "scene",
      input: {
        title: "歌剧院初遇",
        body: "在宏伟的歌剧院舞台前，与正典伙伴第一次展开命定对话。",
        ...(arc1?.arcId ? { arcId: arc1.arcId as V2ArcId } : {}),
        isEntry: true,
      },
    });
    const scene1 = store.snapshot?.sceneGraph.scenes.find((s) => s.title === "歌剧院初遇");

    // 5. Create Scene 2 (in Arc 2)
    await store.createGraphEntity({
      kind: "scene",
      input: {
        title: "审判席上的对峙",
        body: "冲突爆发，双方在审判席前据理力争，寻求真相。",
        ...(arc2?.arcId ? { arcId: arc2.arcId as V2ArcId } : {}),
        isEntry: false,
      },
    });
    const scene2 = store.snapshot?.sceneGraph.scenes.find((s) => s.title === "审判席上的对峙");

    // 6. Create Scene 3 (in Arc 3)
    await store.createGraphEntity({
      kind: "scene",
      input: {
        title: "破晓之光 (结局 A)",
        body: "真相大白，黎明之光重新普照大地，与同伴共同守护正义。",
        ...(arc3?.arcId ? { arcId: arc3.arcId as V2ArcId } : {}),
        isEntry: false,
      },
    });
    const scene3 = store.snapshot?.sceneGraph.scenes.find((s) => s.title === "破晓之光 (结局 A)");

    // 7. Create Choices connecting them
    if (scene1 && scene2) {
      await store.createGraphEntity({
        kind: "choice",
        input: {
          sourceSceneId: scene1.sceneId as V2SceneId,
          targetSceneId: scene2.sceneId as V2SceneId,
          label: "挺身而出，介入这场突如其来的纷争",
          gates: [],
          consequences: [],
        },
      });
    }
    if (scene2 && scene3) {
      await store.createGraphEntity({
        kind: "choice",
        input: {
          sourceSceneId: scene2.sceneId as V2SceneId,
          targetSceneId: scene3.sceneId as V2SceneId,
          label: "出示决定性证据，彻底终结审判",
          gates: [],
          consequences: [],
        },
      });
    }
    emit("refreshed");
  } catch (err) {
    console.error("Failed to generate skeleton:", err);
  } finally {
    generatingSkeleton.value = false;
  }
}
</script>

<template>
  <div class="story-act-flow-root">
    <!-- 1. 顶部全局角色与世界资产池 (折叠/展开) -->
    <StoryCastPool
      :snapshot="snapshot"
      :loading="loading"
      @select-character="handleSelectCharacter"
      @select-location="handleSelectLocation"
      @add-character="handleAddCharacter"
      @add-location="handleAddLocation"
    />

    <!-- 2. 篇章剧情树主工具栏 -->
    <div class="act-tree-toolbar">
      <div class="toolbar-left">
        <div class="toolbar-title-group">
          <Layers3 :size="17" class="toolbar-icon" />
          <h3>篇章剧幕与分支剧情树</h3>
        </div>
        <span class="toolbar-stats">
          {{ totalArcsCount }} 个篇章 · {{ totalScenesCount }} 个场景节点
        </span>
      </div>

      <div class="toolbar-right">
        <Button
          v-if="totalScenesCount === 0"
          variant="primary"
          size="sm"
          :loading="generatingSkeleton"
          @click="generateThreeActSkeleton"
        >
          <Wand2 :size="14" /> 一键生成三幕式骨架
        </Button>
        <Button variant="ghost" size="sm" @click="openAddArc">
          <Plus :size="14" /> 新增篇章 (Arc)
        </Button>
        <Button variant="primary" size="sm" @click="openAddScene()">
          <Plus :size="14" /> 新增场景 (Scene)
        </Button>
      </div>
    </div>

    <!-- 3. 篇章横向泳道流 (Act Swimlanes) -->
    <div v-if="swimlanes.length > 0 && totalScenesCount > 0" class="act-swimlanes-container">
      <div
        v-for="lane in swimlanes"
        :key="lane.id"
        class="act-swimlane"
        :class="{ 'is-unassigned': lane.isUnassigned }"
      >
        <!-- 泳道头部 -->
        <div class="swimlane-head">
          <div class="swimlane-title-block">
            <BookOpen :size="14" class="swimlane-icon" />
            <h4 class="swimlane-title">{{ lane.title }}</h4>
            <Badge tone="neutral">{{ lane.scenes.length }} 场景</Badge>
          </div>

          <div class="swimlane-actions">
            <Button
              v-if="lane.arc"
              variant="ghost"
              size="icon"
              title="编辑篇章"
              aria-label="编辑篇章"
              @click="openEditArc(lane.arc)"
            >
              <Sparkles :size="13" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="在此篇章中新增场景"
              aria-label="在此篇章中新增场景"
              @click="openAddScene(lane.arc?.arcId)"
            >
              <Plus :size="14" />
            </Button>
          </div>
        </div>

        <p v-if="lane.summary" class="swimlane-desc">{{ lane.summary }}</p>

        <!-- 场景节点卡片栈 -->
        <div class="swimlane-scenes-stack">
          <article
            v-for="scene in lane.scenes"
            :key="scene.sceneId"
            class="act-scene-card"
            :class="{ 'is-entry': scene.isEntry, 'is-selected': selectedScene?.sceneId === scene.sceneId }"
            @click="openEditScene(scene)"
          >
            <!-- 卡片顶部 -->
            <div class="scene-card-top">
              <span v-if="scene.isEntry" class="entry-badge">
                <Star :size="11" /> 起始入口
              </span>
              <span v-else class="scene-kind-badge">剧幕节点</span>

              <span v-if="getSceneLocationName(scene)" class="scene-location-tag">
                <MapPin :size="11" />
                {{ getSceneLocationName(scene) }}
              </span>
            </div>

            <!-- 卡片标题与摘要 -->
            <h5 class="scene-card-title">{{ scene.title }}</h5>
            <p v-if="scene.body" class="scene-card-body">
              {{ scene.body }}
            </p>

            <!-- 参演角色头像组 -->
            <div v-if="getSceneCharacters(scene).length > 0" class="scene-cast-group">
              <div class="avatar-stack">
                <div
                  v-for="char in getSceneCharacters(scene).slice(0, 4)"
                  :key="char.characterId"
                  class="cast-avatar-pill"
                  :title="char.name"
                >
                  {{ char.name.slice(0, 1) }}
                </div>
                <span
                  v-if="getSceneCharacters(scene).length > 4"
                  class="avatar-overflow"
                >
                  +{{ getSceneCharacters(scene).length - 4 }}
                </span>
              </div>
              <span class="cast-names">
                {{ getSceneCharacters(scene).map((c) => c.name).join(' · ') }}
              </span>
            </div>

            <!-- 分支选择指示条 -->
            <div class="scene-card-foot">
              <div v-if="getSceneChoices(scene.sceneId).length > 0" class="choice-indicator">
                <GitBranch :size="12" class="choice-icon" />
                <span class="choice-count">{{ getSceneChoices(scene.sceneId).length }} 个分支走向</span>
              </div>
              <div v-else class="choice-indicator open-ended">
                <span>开放式场景</span>
              </div>
              <span class="click-hint">点击检视/编辑 ➔</span>
            </div>
          </article>

          <!-- 底部新增场景插槽 -->
          <button
            type="button"
            class="add-scene-slot-btn"
            @click="openAddScene(lane.arc?.arcId)"
          >
            <Plus :size="14" />
            <span>新增场景</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 4. 空状态智能起步引导 -->
    <div v-else class="act-tree-empty-card">
      <div class="empty-icon-wrap">
        <Sparkles :size="32" />
      </div>
      <h4>开始编排你的故事剧幕</h4>
      <p>
        你可以一键生成经典的「三幕式剧情骨架（序章起因 → 发展冲突 → 抉择结局）」，也可以根据需要自由创建篇章与场景节点。
      </p>
      <div class="empty-actions">
        <Button
          variant="primary"
          size="md"
          :loading="generatingSkeleton"
          @click="generateThreeActSkeleton"
        >
          <Wand2 :size="15" /> 一键生成经典三幕式骨架
        </Button>
        <Button variant="secondary" size="md" @click="openAddScene()">
          <Plus :size="15" /> 手动创建第一个场景
        </Button>
      </div>
    </div>

    <!-- 场景剧本与分支深度检视抽屉 -->
    <StorySceneInspectorDrawer
      v-model:open="sceneDrawerOpen"
      :scene="selectedScene"
      :snapshot="snapshot"
      :initial-arc-id="newSceneArcId"
      @saved="store.loadSnapshot(); emit('refreshed')"
    />

    <!-- 篇章创建/编辑抽屉 -->
    <Drawer
      :open="arcDrawerOpen"
      :title="editingArc ? '编辑故事篇章 (Arc)' : '新增故事篇章 (Arc)'"
      description="篇章用于将连续的故事场景划分为起承转合的剧幕阶段"
      @close="arcDrawerOpen = false"
      @update:open="arcDrawerOpen = $event"
    >
      <form class="arc-form" @submit.prevent="handleSaveArc">
        <p v-if="arcError" class="form-error" role="alert">{{ arcError }}</p>
        <Field label="篇章标题" hint="例如：序章 · 初入与启程 或 第二幕 · 审判席上的对峙" required>
          <Input
            v-model="arcTitle"
            placeholder="篇章标题"
            required
            aria-label="篇章标题"
          />
        </Field>
        <Field label="篇章概要" hint="简述本篇章的核心冲突与阶段目标">
          <Textarea
            v-model="arcSummary"
            :rows="4"
            placeholder="描述此篇章的故事主线、背景氛围与核心转折点..."
            aria-label="篇章概要"
          />
        </Field>
        <div class="arc-form-actions">
          <Button variant="primary" size="md" type="submit" :loading="arcSaving">
            {{ editingArc ? "保存篇章修改" : "创建篇章" }}
          </Button>
          <Button variant="ghost" size="md" type="button" @click="arcDrawerOpen = false">
            取消
          </Button>
        </div>
      </form>
    </Drawer>

    <!-- 正典设定与角色录入/编辑抽屉 -->
    <StoryNodeDrawer
      v-model:open="nodeDrawerOpen"
      :initial-kind="nodeDrawerKind"
      :editing-node="editingNode"
      :snapshot="snapshot"
      @saved="store.loadSnapshot(); emit('refreshed')"
    />
  </div>
</template>

<style scoped>
.story-act-flow-root {
  display: grid;
  gap: var(--space-4);
}

.act-tree-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface);
  border: 1px solid var(--border);
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.toolbar-title-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.toolbar-icon {
  color: var(--primary);
}

.toolbar-title-group h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-strong);
}

.toolbar-stats {
  font-size: 12px;
  color: var(--muted);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

/* 篇章横向泳道容器 */
.act-swimlanes-container {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(280px, 1fr);
  gap: var(--space-4);
  overflow-x: auto;
  padding-bottom: var(--space-2);
  scrollbar-width: thin;
}

.act-swimlane {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-lg);
  background: var(--surface-soft);
  border: 1px solid var(--border);
  min-width: 280px;
}

.act-swimlane.is-unassigned {
  background: var(--surface);
}

.swimlane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.swimlane-title-block {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.swimlane-icon {
  color: var(--primary);
  flex-shrink: 0;
}

.swimlane-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.swimlane-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.swimlane-desc {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.swimlane-scenes-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 100px;
}

/* 场景节点卡片 */
.act-scene-card {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: all var(--motion-fast);
  text-align: left;
}

.act-scene-card:hover {
  border-color: var(--primary);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.act-scene-card.is-entry {
  border-left: 3px solid var(--warning, #f59e0b);
}

.act-scene-card.is-selected {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.scene-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.entry-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 700;
  color: var(--warning, #f59e0b);
  background: var(--warning-soft, #fef3c7);
  padding: 1px 6px;
  border-radius: var(--radius-full);
}

.scene-kind-badge {
  font-size: 10px;
  font-weight: 600;
  color: var(--muted);
}

.scene-location-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scene-card-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-strong);
  line-height: 1.4;
}

.scene-card-body {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.scene-cast-group {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 4px;
  border-top: 1px dashed var(--border-subtle, var(--border));
}

.avatar-stack {
  display: flex;
  align-items: center;
}

.cast-avatar-pill {
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  background: var(--primary);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--surface);
  margin-left: -4px;
}

.cast-avatar-pill:first-child {
  margin-left: 0;
}

.avatar-overflow {
  font-size: 9px;
  font-weight: 700;
  color: var(--muted);
  margin-left: 3px;
}

.cast-names {
  font-size: 10px;
  color: var(--text-strong);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scene-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding-top: 4px;
  border-top: 1px solid var(--border);
  font-size: 11px;
}

.choice-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--primary);
  font-weight: 600;
}

.choice-indicator.open-ended {
  color: var(--muted);
  font-weight: normal;
}

.choice-icon {
  flex-shrink: 0;
}

.click-hint {
  font-size: 10px;
  color: var(--muted);
  opacity: 0.8;
}

.add-scene-slot-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  border: 1px dashed var(--border);
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--motion-fast);
}

.add-scene-slot-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-soft);
}

/* 空状态卡片 */
.act-tree-empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--space-8) var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px dashed var(--border);
  gap: var(--space-3);
}

.empty-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.act-tree-empty-card h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-strong);
}

.act-tree-empty-card p {
  margin: 0;
  max-width: 460px;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
}

.empty-actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.arc-form {
  display: grid;
  gap: var(--space-4);
}

.arc-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}

.form-error {
  margin: 0;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  border: 1px solid var(--danger);
  color: var(--danger);
  font-size: 12px;
}
</style>
