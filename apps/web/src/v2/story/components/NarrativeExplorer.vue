<script setup lang="ts">
import { computed } from "vue";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Layers,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Wand2,
} from "@lucide/vue";
import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Input from "../../../components/ui/Input.vue";
import { useNarrativeOutlineStore } from "../stores/useNarrativeOutlineStore.ts";
import { useNarrativeDiagnosticsStore } from "../stores/useNarrativeDiagnosticsStore.ts";
import type { V2NarrativeOutlineScene } from "@living-network/contracts/v2";

const props = defineProps<{
  storyWorldId: string;
}>();

const emit = defineEmits<{
  createScene: [payload: { arcId?: string; chapterId?: string; questId?: string }];
  applyTemplate: [];
}>();

const outlineStore = useNarrativeOutlineStore();
const diagStore = useNarrativeDiagnosticsStore();

const searchQuery = computed({
  get: () => outlineStore.filterQuery,
  set: (val: string) => {
    outlineStore.filterQuery = val;
  },
});

function getSceneIssues(sceneId: string) {
  return diagStore.issuesBySceneId[sceneId] ?? [];
}

function hasSceneError(sceneId: string): boolean {
  return getSceneIssues(sceneId).some((i) => i.severity === "error");
}

function hasSceneWarning(sceneId: string): boolean {
  return getSceneIssues(sceneId).some((i) => i.severity === "warning");
}

function handleSelectScene(scene: V2NarrativeOutlineScene) {
  outlineStore.selectScene(scene.sceneId);
}

function handleAddChapter(arcId: string) {
  const title = prompt("请输入章节标题：", "新章节");
  if (!title) return;
  outlineStore.createChapter(props.storyWorldId, {
    arcId,
    title,
  });
}

function handleAddQuest(arcId?: string, chapterId?: string) {
  const title = prompt("请输入任务标题：", "新任务");
  if (!title) return;
  outlineStore.createQuest(props.storyWorldId, {
    ...(arcId ? { arcId } : {}),
    ...(chapterId ? { chapterId } : {}),
    title,
  });
}

function handleAddScene(arcId?: string, chapterId?: string, questId?: string) {
  emit("createScene", {
    ...(arcId ? { arcId } : {}),
    ...(chapterId ? { chapterId } : {}),
    ...(questId ? { questId } : {}),
  });
}
</script>

<template>
  <aside class="narrative-explorer">
    <div class="explorer-header">
      <div class="header-top">
        <div class="header-title-group">
          <BookOpen :size="16" class="header-icon" />
          <h3>故事结构大纲</h3>
        </div>
        <div class="header-actions">
          <Button
            size="sm"
            tone="accent"
            variant="secondary"
            @click="emit('applyTemplate')"
          >
            <Wand2 :size="12" />
            <span>套用模版</span>
          </Button>
        </div>
      </div>

      <div class="search-box">
        <Input
          v-model="searchQuery"
          size="sm"
          placeholder="搜索大纲、章节、任务或场景..."
        >
          <template #prefix>
            <Search :size="14" class="search-icon" />
          </template>
        </Input>
      </div>
    </div>

    <div v-if="outlineStore.loading" class="explorer-loading">
      <Sparkles :size="16" class="spin" />
      <span>加载大纲中...</span>
    </div>

    <div v-else-if="outlineStore.error" class="explorer-error">
      <span>{{ outlineStore.error }}</span>
      <Button size="sm" variant="secondary" @click="outlineStore.fetchOutline(props.storyWorldId)">重试</Button>
    </div>

    <div v-else-if="!outlineStore.filteredOutline?.arcs.length && !outlineStore.filteredOutline?.unassignedScenes.length" class="explorer-empty">
      <Layers :size="32" class="empty-icon" />
      <p>暂无故事篇章与场景</p>
      <div class="empty-actions">
        <Button size="sm" tone="accent" @click="emit('applyTemplate')">
          <Wand2 :size="14" />
          <span>套用剧情模版</span>
        </Button>
        <Button size="sm" variant="secondary" @click="handleAddScene()">
          <Plus :size="14" />
          <span>创建独立场景</span>
        </Button>
      </div>
    </div>

    <div v-else class="explorer-tree">
      <!-- Arcs -->
      <div
        v-for="arc in outlineStore.filteredOutline.arcs"
        :key="arc.arcId"
        class="tree-node arc-node"
      >
        <div
          class="node-row arc-row"
          :class="{ active: outlineStore.activeArcId === arc.arcId }"
          @click="outlineStore.toggleExpanded(arc.arcId)"
        >
          <button class="expand-toggle">
            <ChevronDown v-if="outlineStore.isExpanded(arc.arcId)" :size="14" />
            <ChevronRight v-else :size="14" />
          </button>
          <Layers :size="14" class="node-icon arc-icon" />
          <span class="node-title" :title="arc.title">{{ arc.title }}</span>

          <div class="node-actions" @click.stop>
            <button class="action-btn" title="新建章节" @click="handleAddChapter(arc.arcId)">
              <Plus :size="12" />
            </button>
          </div>
        </div>

        <!-- Arc Children -->
        <div v-if="outlineStore.isExpanded(arc.arcId)" class="node-children">
          <!-- Chapters -->
          <div
            v-for="chapter in arc.chapters"
            :key="chapter.chapterId"
            class="tree-node chapter-node"
          >
            <div
              class="node-row chapter-row"
              :class="{ active: outlineStore.activeChapterId === chapter.chapterId }"
              @click="outlineStore.toggleExpanded(chapter.chapterId)"
            >
              <button class="expand-toggle">
                <ChevronDown v-if="outlineStore.isExpanded(chapter.chapterId)" :size="14" />
                <ChevronRight v-else :size="14" />
              </button>
              <FolderOpen v-if="outlineStore.isExpanded(chapter.chapterId)" :size="14" class="node-icon ch-icon" />
              <Folder v-else :size="14" class="node-icon ch-icon" />
              <span class="node-title" :title="chapter.title">{{ chapter.title }}</span>

              <div class="node-actions" @click.stop>
                <button class="action-btn" title="新建任务" @click="handleAddQuest(arc.arcId, chapter.chapterId)">
                  <Plus :size="12" />
                </button>
                <button class="action-btn delete-btn" title="删除章节" @click="outlineStore.deleteChapter(props.storyWorldId, chapter.chapterId)">
                  <Trash2 :size="12" />
                </button>
              </div>
            </div>

            <!-- Chapter Quests & Loose Scenes -->
            <div v-if="outlineStore.isExpanded(chapter.chapterId)" class="node-children">
              <!-- Quests -->
              <div
                v-for="quest in chapter.quests"
                :key="quest.questId"
                class="tree-node quest-node"
              >
                <div
                  class="node-row quest-row"
                  :class="{ active: outlineStore.activeQuestId === quest.questId }"
                  @click="outlineStore.toggleExpanded(quest.questId)"
                >
                  <button class="expand-toggle">
                    <ChevronDown v-if="outlineStore.isExpanded(quest.questId)" :size="14" />
                    <ChevronRight v-else :size="14" />
                  </button>
                  <Sparkles :size="13" class="node-icon quest-icon" />
                  <span class="node-title" :title="quest.title">{{ quest.title }}</span>
                  <Badge size="xs" tone="neutral">{{ quest.kind }}</Badge>

                  <div class="node-actions" @click.stop>
                    <button class="action-btn" title="新建场景" @click="handleAddScene(arc.arcId, chapter.chapterId, quest.questId)">
                      <Plus :size="12" />
                    </button>
                    <button class="action-btn delete-btn" title="删除任务" @click="outlineStore.deleteQuest(props.storyWorldId, quest.questId)">
                      <Trash2 :size="12" />
                    </button>
                  </div>
                </div>

                <!-- Quest Scenes -->
                <div v-if="outlineStore.isExpanded(quest.questId)" class="node-children">
                  <div
                    v-for="scene in quest.scenes"
                    :key="scene.sceneId"
                    class="node-row scene-row"
                    :class="{
                      active: outlineStore.activeSceneId === scene.sceneId,
                      'has-error': hasSceneError(scene.sceneId),
                      'has-warning': hasSceneWarning(scene.sceneId),
                    }"
                    @click="handleSelectScene(scene)"
                  >
                    <FileText :size="13" class="node-icon scene-icon" />
                    <span class="node-title" :title="scene.title">{{ scene.title }}</span>
                    <Star v-if="scene.isEntry" :size="11" class="entry-star" title="入局场景" />

                    <div class="scene-badges">
                      <span v-if="scene.blockCount > 0" class="mini-badge block-badge">{{ scene.blockCount }}块</span>
                      <span v-if="scene.choiceCount > 0" class="mini-badge choice-badge">{{ scene.choiceCount }}分支</span>
                      <span v-if="hasSceneError(scene.sceneId)" class="mini-badge error-badge">错误</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Chapter Loose Scenes -->
              <div
                v-for="scene in chapter.looseScenes"
                :key="scene.sceneId"
                class="node-row scene-row"
                :class="{
                  active: outlineStore.activeSceneId === scene.sceneId,
                  'has-error': hasSceneError(scene.sceneId),
                  'has-warning': hasSceneWarning(scene.sceneId),
                }"
                @click="handleSelectScene(scene)"
              >
                <FileText :size="13" class="node-icon scene-icon" />
                <span class="node-title" :title="scene.title">{{ scene.title }}</span>
                <Star v-if="scene.isEntry" :size="11" class="entry-star" title="入局场景" />
                <div class="scene-badges">
                  <span v-if="scene.blockCount > 0" class="mini-badge block-badge">{{ scene.blockCount }}块</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Arc Loose Quests -->
          <div
            v-for="quest in arc.looseQuests"
            :key="quest.questId"
            class="tree-node quest-node"
          >
            <div
              class="node-row quest-row"
              :class="{ active: outlineStore.activeQuestId === quest.questId }"
              @click="outlineStore.toggleExpanded(quest.questId)"
            >
              <button class="expand-toggle">
                <ChevronDown v-if="outlineStore.isExpanded(quest.questId)" :size="14" />
                <ChevronRight v-else :size="14" />
              </button>
              <Sparkles :size="13" class="node-icon quest-icon" />
              <span class="node-title" :title="quest.title">{{ quest.title }}</span>

              <div class="node-actions" @click.stop>
                <button class="action-btn" title="新建场景" @click="handleAddScene(arc.arcId, undefined, quest.questId)">
                  <Plus :size="12" />
                </button>
              </div>
            </div>

            <!-- Quest Scenes -->
            <div v-if="outlineStore.isExpanded(quest.questId)" class="node-children">
              <div
                v-for="scene in quest.scenes"
                :key="scene.sceneId"
                class="node-row scene-row"
                :class="{ active: outlineStore.activeSceneId === scene.sceneId }"
                @click="handleSelectScene(scene)"
              >
                <FileText :size="13" class="node-icon scene-icon" />
                <span class="node-title" :title="scene.title">{{ scene.title }}</span>
              </div>
            </div>
          </div>

          <!-- Arc Loose Scenes -->
          <div
            v-for="scene in arc.looseScenes"
            :key="scene.sceneId"
            class="node-row scene-row"
            :class="{ active: outlineStore.activeSceneId === scene.sceneId }"
            @click="handleSelectScene(scene)"
          >
            <FileText :size="13" class="node-icon scene-icon" />
            <span class="node-title" :title="scene.title">{{ scene.title }}</span>
          </div>
        </div>
      </div>

      <!-- Unassigned Scenes -->
      <div v-if="outlineStore.filteredOutline.unassignedScenes.length" class="tree-node unassigned-section">
        <div class="section-divider-label">
          <span>未归类场景 ({{ outlineStore.filteredOutline.unassignedScenes.length }})</span>
        </div>
        <div
          v-for="scene in outlineStore.filteredOutline.unassignedScenes"
          :key="scene.sceneId"
          class="node-row scene-row"
          :class="{ active: outlineStore.activeSceneId === scene.sceneId }"
          @click="handleSelectScene(scene)"
        >
          <FileText :size="13" class="node-icon scene-icon" />
          <span class="node-title" :title="scene.title">{{ scene.title }}</span>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.narrative-explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-surface, #1e1e24);
  border-right: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  overflow: hidden;
  user-select: none;
}

.explorer-header {
  padding: 12px;
  border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  color: var(--accent-primary, #6366f1);
}

.header-title-group h3 {
  font-size: 13px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary, #f3f4f6);
}

.search-box {
  width: 100%;
}

.search-icon {
  color: var(--text-muted, #9ca3af);
}

.explorer-loading,
.explorer-error,
.explorer-empty {
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
  color: var(--text-muted, #9ca3af);
  font-size: 13px;
}

.empty-icon {
  color: var(--text-subtle, #6b7280);
  opacity: 0.5;
  margin-bottom: 4px;
}

.empty-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  margin-top: 8px;
}

.explorer-tree {
  flex: 1;
  overflow-y: auto;
  padding: 8px 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tree-node {
  display: flex;
  flex-direction: column;
}

.node-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary, #d1d5db);
  transition: background 0.15s ease, color 0.15s ease;
  position: relative;
}

.node-row:hover {
  background: var(--bg-hover, rgba(255, 255, 255, 0.05));
  color: var(--text-primary, #f9fafb);
}

.node-row.active {
  background: var(--accent-surface, rgba(99, 102, 241, 0.15));
  color: var(--accent-primary, #818cf8);
  font-weight: 500;
}

.arc-row {
  font-weight: 600;
  color: var(--text-primary, #f3f4f6);
}

.chapter-row {
  font-weight: 500;
}

.scene-row {
  padding-left: 24px;
}

.node-children {
  margin-left: 10px;
  padding-left: 6px;
  border-left: 1px dashed var(--border-subtle, rgba(255, 255, 255, 0.08));
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.expand-toggle {
  background: none;
  border: none;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted, #9ca3af);
  cursor: pointer;
  width: 14px;
  height: 14px;
}

.node-icon {
  flex-shrink: 0;
}

.arc-icon {
  color: #818cf8;
}

.ch-icon {
  color: #fbbf24;
}

.quest-icon {
  color: #34d399;
}

.scene-icon {
  color: #9ca3af;
}

.node-title {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entry-star {
  color: #f59e0b;
  flex-shrink: 0;
}

.scene-badges {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.mini-badge {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-muted, #9ca3af);
}

.choice-badge {
  background: rgba(129, 140, 248, 0.15);
  color: #a5b4fc;
}

.error-badge {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.node-actions {
  display: none;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}

.node-row:hover .node-actions {
  display: flex;
}

.action-btn {
  background: none;
  border: none;
  padding: 2px;
  border-radius: 4px;
  color: var(--text-muted, #9ca3af);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #ffffff);
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.unassigned-section {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
}

.section-divider-label {
  padding: 4px 8px;
  font-size: 11px;
  color: var(--text-muted, #9ca3af);
  font-weight: 500;
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
