<script setup lang="ts">
import { computed, ref } from "vue";
import {
  BookOpen,
  GitFork,
  Layers3,
  MapPin,
  Maximize2,
  Plus,
  ShieldAlert,
  Sparkles,
  User,
  X,
} from "@lucide/vue";
import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import type { V2WorkspaceSnapshot } from "../../adapters";
import StoryInspectionCard, { type StorySkillNode } from "./StoryInspectionCard.vue";
import StoryNodeDrawer, { type CanonEntityKind } from "./StoryNodeDrawer.vue";

const props = defineProps<{
  snapshot: V2WorkspaceSnapshot | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  refreshed: [];
}>();

const selectedNode = ref<StorySkillNode | null>(null);
const drawerOpen = ref(false);
const drawerInitialKind = ref<CanonEntityKind>("character");
const editingNode = ref<StorySkillNode | null>(null);
const topologyModalOpen = ref(false);
const topologyFocusNode = ref<StorySkillNode | null>(null);

// Transform snapshot into 4-tier node arrays
const tier1WorldNodes = computed<readonly StorySkillNode[]>(() => {
  if (!props.snapshot) return [];
  const nodes: StorySkillNode[] = [
    {
      id: props.snapshot.world.storyWorldId,
      tier: 1,
      kind: "world",
      title: props.snapshot.world.name,
      subtitle: `v${props.snapshot.world.revision} 设定基线`,
      description: props.snapshot.world.premise || "暂无世界观背景描述。",
      roleImpact: "整个故事项目的最高世界观基石，约束下游全部角色与场景",
      rawData: props.snapshot.world,
    },
  ];

  for (const loc of props.snapshot.world.locations) {
    nodes.push({
      id: loc.locationId,
      tier: 1,
      kind: "location",
      title: loc.name,
      subtitle: "核心舞台地点",
      description: loc.summary || "未填写地点环境与特征描述。",
      roleImpact: "作为剧情场景发生的地理舞台或角色的常驻居所",
      rawData: loc,
    });
  }

  for (const rule of props.snapshot.world.rules) {
    nodes.push({
      id: rule.ruleId,
      tier: 1,
      kind: "rule",
      title: rule.text.slice(0, 24) + (rule.text.length > 24 ? "…" : ""),
      subtitle: rule.severity === "hard" ? "硬约束规则" : "软约束指导",
      description: rule.text,
      roleImpact: rule.severity === "hard" ? "AI 扩写与审校时必须严格遵循的不可逆规则" : "叙事风格参考规则",
      rawData: rule,
    });
  }

  for (const fact of props.snapshot.world.facts) {
    nodes.push({
      id: fact.factId,
      tier: 1,
      kind: "fact",
      title: fact.text.slice(0, 24) + (fact.text.length > 24 ? "…" : ""),
      subtitle: fact.visibility === "player" ? "公开事实" : "隐藏暗线",
      description: fact.text,
      roleImpact: "注入全局提示词常识库，提供世界观背景上下文",
      rawData: fact,
    });
  }

  return nodes;
});

const tier2CharacterNodes = computed<readonly StorySkillNode[]>(() => {
  if (!props.snapshot) return [];
  return props.snapshot.world.characters.map((c) => ({
    id: c.characterId,
    tier: 2,
    kind: "character",
    title: c.name,
    subtitle: c.role || "正典角色",
    description: c.personaText || c.summary || "由用户设定的正典角色。",
    roleImpact: "主线故事推进者、对话交互伙伴及伴侣生活物语主角",
    rawData: c,
  }));
});

const tier3SceneNodes = computed<readonly StorySkillNode[]>(() => {
  if (!props.snapshot) return [];
  return props.snapshot.sceneGraph.scenes.map((s) => ({
    id: s.sceneId,
    tier: 3,
    kind: "scene",
    title: s.title || `场景 ${s.sceneId.slice(0, 8)}`,
    subtitle: s.isEntry ? "故事起点 / Entry" : "剧情发展节点",
    description: s.body ? s.body.slice(0, 100) : "尚未编写场景正文剧情。",
    roleImpact: "向玩家呈现的视觉与文字场景，包含选择分支与状态跳转",
    rawData: s,
  }));
});

const tier4StateNodes = computed<readonly StorySkillNode[]>(() => {
  if (!props.snapshot) return [];
  return props.snapshot.typedState.variables.map((v) => ({
    id: v.key,
    tier: 4,
    kind: "state",
    title: v.key,
    subtitle: `${v.type} 类型变量`,
    description: `初始默认值：${String(v.defaultValue)}`,
    roleImpact: "控制剧情分支选项的进入条件（Gate）与状态后置变更（Consequence）",
    rawData: v,
  }));
});

function openCreateSlot(kind: CanonEntityKind) {
  editingNode.value = null;
  drawerInitialKind.value = kind;
  drawerOpen.value = true;
}

function handleNodeClick(node: StorySkillNode) {
  selectedNode.value = node;
}

function handleEditNode(node: StorySkillNode) {
  editingNode.value = node;
  drawerInitialKind.value = node.kind as CanonEntityKind;
  drawerOpen.value = true;
}

function openTopology(node: StorySkillNode) {
  topologyFocusNode.value = node;
  topologyModalOpen.value = true;
}
</script>

<template>
  <div class="story-skill-tree-root">
    <!-- 技能树主舞台 -->
    <div class="skill-tree-layout" :class="{ 'with-inspection': selectedNode !== null }">
      <!-- 左/中：4 阶层技能树矩阵 -->
      <div class="skill-tree-matrix">
        <!-- TIER 1: 世界基石 -->
        <section class="skill-tier-column" aria-labelledby="tier-1-title">
          <div class="tier-column-head tier-1-head">
            <div class="tier-badge-wrap">
              <BookOpen :size="15" aria-hidden="true" />
              <span id="tier-1-title">TIER 1 · 世界基石</span>
            </div>
            <Badge tone="info">{{ tier1WorldNodes.length }}</Badge>
          </div>
          <p class="tier-desc">世界前提、地理版图与公理规则</p>

          <div class="tier-nodes-stack">
            <div
              v-for="node in tier1WorldNodes"
              :key="node.id"
              class="skill-node-card"
              :class="{ selected: selectedNode?.id === node.id }"
              @click="handleNodeClick(node)"
            >
              <div class="skill-node-header">
                <div class="skill-node-icon tier-1-icon">
                  <MapPin v-if="node.kind === 'location'" :size="15" />
                  <ShieldAlert v-else-if="node.kind === 'rule'" :size="15" />
                  <BookOpen v-else :size="15" />
                </div>
                <div class="skill-node-info">
                  <strong>{{ node.title }}</strong>
                  <span class="skill-node-sub">{{ node.subtitle }}</span>
                </div>
              </div>
              <p class="skill-node-desc">{{ node.description }}</p>
              <div class="skill-node-foot">
                <span class="skill-impact-tag">🎯 {{ node.roleImpact ? node.roleImpact.slice(0, 18) + '…' : '世界设定' }}</span>
                <button
                  type="button"
                  class="node-drilldown-btn"
                  title="查看局部拓扑"
                  aria-label="查看局部拓扑"
                  @click.stop="openTopology(node)"
                >
                  <Maximize2 :size="12" />
                </button>
              </div>
            </div>

            <!-- 空白新增插槽 -->
            <button type="button" class="skill-slot-btn" @click="openCreateSlot('location')">
              <Plus :size="14" />
              <span>新增世界设定 / 地点</span>
            </button>
          </div>
        </section>

        <!-- TIER 2: 正典角色 -->
        <section class="skill-tier-column" aria-labelledby="tier-2-title">
          <div class="tier-column-head tier-2-head">
            <div class="tier-badge-wrap">
              <User :size="15" aria-hidden="true" />
              <span id="tier-2-title">TIER 2 · 正典角色</span>
            </div>
            <Badge tone="success">{{ tier2CharacterNodes.length }}</Badge>
          </div>
          <p class="tier-desc">登场主角、伙伴与羁绊角色</p>

          <div class="tier-nodes-stack">
            <div
              v-for="node in tier2CharacterNodes"
              :key="node.id"
              class="skill-node-card character-skill-node"
              :class="{ selected: selectedNode?.id === node.id }"
              @click="handleNodeClick(node)"
            >
              <div class="skill-node-header">
                <div class="skill-node-icon tier-2-icon">
                  <User :size="15" />
                </div>
                <div class="skill-node-info">
                  <strong>{{ node.title }}</strong>
                  <span class="skill-node-sub">{{ node.subtitle }}</span>
                </div>
              </div>
              <p class="skill-node-desc">{{ node.description }}</p>
              <div class="skill-node-foot">
                <span class="skill-impact-tag">🎯 {{ node.roleImpact ? node.roleImpact.slice(0, 18) + '…' : '主线角色' }}</span>
                <button
                  type="button"
                  class="node-drilldown-btn"
                  title="查看局部拓扑"
                  aria-label="查看局部拓扑"
                  @click.stop="openTopology(node)"
                >
                  <Maximize2 :size="12" />
                </button>
              </div>
            </div>

            <!-- 空白新增插槽 -->
            <button type="button" class="skill-slot-btn" @click="openCreateSlot('character')">
              <Plus :size="14" />
              <span>新增正典角色</span>
            </button>
          </div>
        </section>

        <!-- TIER 3: 故事大纲与场景 -->
        <section class="skill-tier-column" aria-labelledby="tier-3-title">
          <div class="tier-column-head tier-3-head">
            <div class="tier-badge-wrap">
              <GitFork :size="15" aria-hidden="true" />
              <span id="tier-3-title">TIER 3 · 故事大纲</span>
            </div>
            <Badge tone="info">{{ tier3SceneNodes.length }}</Badge>
          </div>
          <p class="tier-desc">剧情篇章、核心事件与场景图谱</p>

          <div class="tier-nodes-stack">
            <div
              v-for="node in tier3SceneNodes"
              :key="node.id"
              class="skill-node-card scene-skill-node"
              :class="{ selected: selectedNode?.id === node.id }"
              @click="handleNodeClick(node)"
            >
              <div class="skill-node-header">
                <div class="skill-node-icon tier-3-icon">
                  <GitFork :size="15" />
                </div>
                <div class="skill-node-info">
                  <strong>{{ node.title }}</strong>
                  <span class="skill-node-sub">{{ node.subtitle }}</span>
                </div>
              </div>
              <p class="skill-node-desc">{{ node.description }}</p>
              <div class="skill-node-foot">
                <span class="skill-impact-tag">🎯 {{ node.roleImpact ? node.roleImpact.slice(0, 18) + '…' : '核心剧情' }}</span>
                <button
                  type="button"
                  class="node-drilldown-btn"
                  title="查看局部拓扑"
                  aria-label="查看局部拓扑"
                  @click.stop="openTopology(node)"
                >
                  <Maximize2 :size="12" />
                </button>
              </div>
            </div>

            <div v-if="tier3SceneNodes.length === 0" class="empty-tier-hint">
              <span>暂无场景节点，可前往「故事结构」或「AI 扩写」编排剧情</span>
            </div>
          </div>
        </section>

        <!-- TIER 4: 逻辑变量与门禁 -->
        <section class="skill-tier-column" aria-labelledby="tier-4-title">
          <div class="tier-column-head tier-4-head">
            <div class="tier-badge-wrap">
              <Layers3 :size="15" aria-hidden="true" />
              <span id="tier-4-title">TIER 4 · 决策门禁</span>
            </div>
            <Badge tone="warning">{{ tier4StateNodes.length }}</Badge>
          </div>
          <p class="tier-desc">好感度、关键线索与分支跳转判定</p>

          <div class="tier-nodes-stack">
            <div
              v-for="node in tier4StateNodes"
              :key="node.id"
              class="skill-node-card state-skill-node"
              :class="{ selected: selectedNode?.id === node.id }"
              @click="handleNodeClick(node)"
            >
              <div class="skill-node-header">
                <div class="skill-node-icon tier-4-icon">
                  <Layers3 :size="15" />
                </div>
                <div class="skill-node-info">
                  <strong>{{ node.title }}</strong>
                  <span class="skill-node-sub">{{ node.subtitle }}</span>
                </div>
              </div>
              <p class="skill-node-desc">{{ node.description }}</p>
              <div class="skill-node-foot">
                <span class="skill-impact-tag">🎯 {{ node.roleImpact ? node.roleImpact.slice(0, 18) + '…' : '分支判定' }}</span>
              </div>
            </div>

            <div v-if="tier4StateNodes.length === 0" class="empty-tier-hint">
              <span>暂无逻辑变量，可在「状态与逻辑」中添加剧情判定</span>
            </div>
          </div>
        </section>
      </div>

      <!-- 右侧：检视面板 -->
      <div v-if="selectedNode" class="skill-tree-inspector-wrap">
        <StoryInspectionCard
          :node="selectedNode"
          :snapshot="snapshot"
          @close="selectedNode = null"
          @edit="handleEditNode"
        />
      </div>
    </div>

    <!-- 局部拓扑流程图钻取弹窗 -->
    <div v-if="topologyModalOpen" class="topology-modal-overlay" @click.self="topologyModalOpen = false">
      <div class="topology-modal-card">
        <div class="topology-modal-head">
          <div class="topology-head-title">
            <Sparkles :size="18" class="topology-head-icon" />
            <h3>局部叙事拓扑图 · {{ topologyFocusNode?.title }}</h3>
          </div>
          <Button variant="ghost" size="icon" aria-label="关闭拓扑图" @click="topologyModalOpen = false">
            <X :size="16" aria-hidden="true" />
          </Button>
        </div>

        <div class="topology-canvas-area">
          <div class="topology-graph-flow">
            <!-- 根设定节点 -->
            <div class="topology-node topology-node-root">
              <span class="topo-tag">世界基石</span>
              <strong>{{ snapshot?.world.name }}</strong>
            </div>

            <div class="topology-connector">→</div>

            <!-- 当前聚焦节点 -->
            <div class="topology-node topology-node-focus">
              <span class="topo-tag">当前节点</span>
              <strong>{{ topologyFocusNode?.title }}</strong>
              <small>{{ topologyFocusNode?.roleImpact }}</small>
            </div>

            <div class="topology-connector">→</div>

            <!-- 下游消费终端 -->
            <div class="topology-node topology-node-consumer">
              <span class="topo-tag">下游消费</span>
              <strong>AI 场景推理 / 试玩决策</strong>
              <small>已自动注册至正典知识库</small>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 影响驱动型新增/编辑抽屉 -->
    <StoryNodeDrawer
      v-model:open="drawerOpen"
      :initial-kind="drawerInitialKind"
      :editing-node="editingNode"
      :snapshot="snapshot"
      @saved="emit('refreshed')"
    />
  </div>
</template>

<style scoped>
.story-skill-tree-root {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: 100%;
}

.skill-tree-layout {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  align-items: stretch;
  width: 100%;
}

.skill-tree-matrix {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
  align-items: start;
  width: 100%;
}

.skill-tier-column {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  min-width: 0;
  overflow: hidden;
}

.tier-column-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border);
  min-width: 0;
}

.tier-badge-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 800;
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.tier-1-head .tier-badge-wrap { color: var(--primary); }
.tier-2-head .tier-badge-wrap { color: var(--success); }
.tier-3-head .tier-badge-wrap { color: var(--info); }
.tier-4-head .tier-badge-wrap { color: var(--warning); }

.tier-desc {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tier-nodes-stack {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-1);
  min-width: 0;
}

.skill-node-card {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface-soft);
  cursor: pointer;
  transition: all var(--motion-fast);
  min-width: 0;
  overflow: hidden;
}

.skill-node-card:hover {
  background: var(--surface);
  border-color: var(--primary);
  transform: translateY(-1px);
}

.skill-node-card.selected {
  border-color: var(--primary);
  background: var(--primary-soft);
  box-shadow: 0 0 12px var(--focus-ring);
}

.skill-node-header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  min-width: 0;
}

.skill-node-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.tier-1-icon { color: var(--primary); }
.tier-2-icon { color: var(--success); }
.tier-3-icon { color: var(--info); }
.tier-4-icon { color: var(--warning); }

.skill-node-info {
  display: grid;
  gap: 2px;
  min-width: 0;
  overflow: hidden;
}

.skill-node-info strong {
  color: var(--text-strong);
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-node-sub {
  color: var(--muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-node-desc {
  margin: 0;
  color: var(--text);
  font-size: 12px;
  line-height: 1.4;
  opacity: 0.85;
  word-break: break-word;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.skill-node-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-1);
  padding-top: var(--space-1);
  border-top: 1px dashed var(--border);
  min-width: 0;
}

.skill-impact-tag {
  color: var(--primary);
  font-size: 11px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}

.node-drilldown-btn {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-sm);
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all var(--motion-fast);
}

.node-drilldown-btn:hover {
  background: var(--surface-soft);
  color: var(--primary);
}

.skill-slot-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  border: 1px dashed var(--border-strong);
  background: transparent;
  color: var(--primary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--motion-fast);
}

.skill-slot-btn:hover {
  background: var(--primary-soft);
  border-color: var(--primary);
  transform: translateY(-1px);
}

.empty-tier-hint {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  border: 1px dashed var(--border);
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}

.skill-tree-inspector-wrap {
  position: sticky;
  top: var(--space-4);
  max-height: calc(100vh - 200px);
  overflow-y: auto;
}

/* 局部拓扑弹窗 */
.topology-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.65);
  display: grid;
  place-items: center;
  padding: var(--space-4);
}

.topology-modal-card {
  width: min(100%, 720px);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--space-4);
  display: grid;
  gap: var(--space-4);
}

.topology-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.topology-head-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.topology-head-icon {
  color: var(--primary);
}

.topology-modal-head h3 {
  margin: 0;
  font-size: var(--text-md);
  font-weight: 800;
  color: var(--text-strong);
}

.topology-canvas-area {
  padding: var(--space-6) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  border: 1px solid var(--border);
}

.topology-graph-flow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.topology-node {
  display: grid;
  gap: 3px;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface);
  flex: 1;
  min-width: 0;
}

.topology-node-focus {
  border-color: var(--primary);
  background: var(--primary-soft);
  box-shadow: 0 0 12px var(--focus-ring);
}

.topo-tag {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.topology-node strong {
  color: var(--text-strong);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topology-node small {
  color: var(--muted);
  font-size: 11px;
}

.topology-connector {
  color: var(--primary);
  font-size: 18px;
  font-weight: 800;
}

@media (max-width: 1200px) {
  .skill-tree-matrix {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .skill-tree-layout.with-inspection {
    grid-template-columns: 1fr;
  }
  .skill-tree-inspector-wrap {
    position: static;
    max-height: none;
  }
}

@media (max-width: 680px) {
  .skill-tree-matrix {
    grid-template-columns: 1fr;
  }
  .topology-graph-flow {
    flex-direction: column;
  }
  .topology-connector {
    transform: rotate(90deg);
  }
}
</style>
