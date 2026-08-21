<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import {
  BookOpen,
  Database,
  FileText,
  Image as ImageIcon,
  Layers,
  ListChecks,
  MapPin,
  MessageSquare,
  Package,
  Play,
  Route,
  Save,
  SendToBack,
  Share2,
  ShieldAlert,
  Sparkles,
  Type,
  Users,
  Variable,
  Workflow,
  Zap,
} from "@lucide/vue";

import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Drawer from "../../../components/ui/Drawer.vue";
import type { V2WorkspaceSnapshot } from "../../adapters";
import {
  dataFlowFilters,
  getEdgesForFilter,
  getDataFlowNode,
  getNodesForFilter,
  type DataFlowFilterId,
} from "./workspace-data-flow";

const props = defineProps<{ snapshot: V2WorkspaceSnapshot | null }>();

const router = useRouter();
const activeFilter = ref<DataFlowFilterId>("all");
const selectedNodeId = ref<string | null>(null);

const activeFilterDef = computed(() => dataFlowFilters.find((f) => f.id === activeFilter.value) ?? dataFlowFilters[0]!);
const visibleNodes = computed(() => getNodesForFilter(activeFilterDef.value));
const visibleEdges = computed(() => getEdgesForFilter(activeFilterDef.value));

const selectedNode = computed(() => (selectedNodeId.value ? getDataFlowNode(selectedNodeId.value) : undefined));
const selectedNodeIncoming = computed(() =>
  visibleEdges.value.filter((edge) => edge.to === selectedNodeId.value),
);
const selectedNodeOutgoing = computed(() =>
  visibleEdges.value.filter((edge) => edge.from === selectedNodeId.value),
);

function statusLabel(status: string): string {
  switch (status) {
    case "direct": return "直接使用";
    case "partial": return "部分使用";
    case "indirect": return "间接使用";
    default: return "当前未使用";
  }
}

function statusTone(status: string): "success" | "info" | "neutral" | "warning" {
  switch (status) {
    case "direct": return "success";
    case "partial": return "info";
    case "indirect": return "neutral";
    default: return "warning";
  }
}

function categoryLabel(category: string): string {
  switch (category) {
    case "source": return "配置数据";
    case "processor": return "处理链";
    case "output": return "产出物";
    default: return "发布与运行";
  }
}

function nodeIcon(id: string) {
  const icons: Record<string, unknown> = {
    world_summary: BookOpen,
    character_name: Users,
    character_persona: Users,
    character_summary: Users,
    location: MapPin,
    fact: FileText,
    rule: ShieldAlert,
    timeline: Save,
    arc: Layers,
    scene_title: Type,
    scene_body: FileText,
    choice: Route,
    state: Variable,
    memory: Database,
    manual_prompt: ImageIcon,
    formal_asset: ImageIcon,
    chat: MessageSquare,
    story_analyze: Sparkles,
    scene_generation: Zap,
    comfyui: ImageIcon,
    chat_reply: MessageSquare,
    scene_candidate: ListChecks,
    image_candidate: ListChecks,
    canon_release: Package,
    release_manifest: SendToBack,
    player_runtime: Play,
  };
  return icons[id] ?? Database;
}

function nodeCount(id: string): number | null {
  if (!props.snapshot) return null;
  const world = props.snapshot.world;
  switch (id) {
    case "character_name":
    case "character_persona":
    case "character_summary":
      return world.characters.length;
    case "location": return world.locations.length;
    case "fact": return world.facts.length;
    case "rule": return world.rules.length;
    case "timeline": return world.timelineEvents.length;
    case "arc": return props.snapshot.sceneGraph.arcs.length;
    case "scene_title":
    case "scene_body":
      return props.snapshot.sceneGraph.scenes.length;
    case "choice": return props.snapshot.sceneGraph.choices.length;
    case "state": return props.snapshot.typedState.variables.length;
    case "formal_asset": return props.snapshot.assets.library.length;
    default: return null;
  }
}

function openNode(id: string): void {
  selectedNodeId.value = id;
}

function closeDrawer(): void {
  selectedNodeId.value = null;
}

function navigate(path: string): void {
  void router.push(path);
}
</script>

<template>
  <div class="data-flow-workspace">
    <!-- Filter Tabs -->
    <div class="flow-filters" role="tablist" aria-label="数据流过滤器">
      <button
        v-for="filter in dataFlowFilters"
        :key="filter.id"
        type="button"
        role="tab"
        :aria-selected="activeFilter === filter.id"
        :class="['flow-filter-btn', { active: activeFilter === filter.id }]"
        @click="activeFilter = filter.id"
      >
        {{ filter.label }}
      </button>
    </div>

    <!-- Flow Map -->
    <div class="flow-map" aria-label="数据流程图">
      <template v-for="(node, index) in visibleNodes" :key="node.id">
        <button type="button" class="flow-node" :class="'category-' + node.category" @click="openNode(node.id)">
          <span class="flow-node-icon"><component :is="nodeIcon(node.id)" :size="16" aria-hidden="true" /></span>
          <span class="flow-node-body">
            <strong>{{ node.label }}</strong>
            <small v-if="node.secondaryLabel">{{ node.secondaryLabel }}</small>
          </span>
          <Badge v-if="nodeCount(node.id) !== null" tone="neutral">{{ nodeCount(node.id) }}</Badge>
        </button>
        <div v-if="index < visibleNodes.length - 1" class="flow-arrow" aria-hidden="true">→</div>
      </template>
    </div>

    <!-- Edge Legend -->
    <div class="flow-legend">
      <span><Badge tone="success">直接使用</Badge></span>
      <span><Badge tone="info">部分使用</Badge></span>
      <span><Badge tone="neutral">间接使用</Badge></span>
      <span><Badge tone="warning">当前未使用</Badge></span>
    </div>

    <!-- Node Drawer -->
    <Drawer
      :open="selectedNode !== undefined"
      :title="selectedNode?.label ?? ''"
      :description="selectedNode?.secondaryLabel ?? ''"
      @close="closeDrawer"
    >
      <div v-if="selectedNode" class="drawer-content">
        <p>{{ selectedNode.description }}</p>

        <section v-if="selectedNodeIncoming.length">
          <h4>输入来源</h4>
          <ul>
            <li v-for="edge in selectedNodeIncoming" :key="edge.from + edge.to">
              {{ getDataFlowNode(edge.from)?.label ?? edge.from }}
              <Badge :tone="statusTone(edge.status)">{{ statusLabel(edge.status) }}</Badge>
            </li>
          </ul>
        </section>

        <section v-if="selectedNodeOutgoing.length">
          <h4>输出去向</h4>
          <ul>
            <li v-for="edge in selectedNodeOutgoing" :key="edge.from + edge.to">
              {{ getDataFlowNode(edge.to)?.label ?? edge.to }}
              <Badge :tone="statusTone(edge.status)">{{ statusLabel(edge.status) }}</Badge>
            </li>
          </ul>
        </section>

        <p v-if="!selectedNodeIncoming.length && !selectedNodeOutgoing.length" class="drawer-empty">
          当前过滤器下没有显示连接关系。
        </p>

        <div class="drawer-actions">
          <Button v-if="selectedNode.managePath" variant="secondary" size="md" @click="navigate(selectedNode.managePath)">
            管理配置
          </Button>
          <Button v-if="selectedNode.actionPath" variant="primary" size="md" @click="navigate(selectedNode.actionPath)">
            前往使用
          </Button>
        </div>
      </div>
    </Drawer>
  </div>
</template>

<style scoped>
.data-flow-workspace {
  display: grid;
  gap: var(--space-4);
}

.flow-filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.flow-filter-btn {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s ease;
}

.flow-filter-btn.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.flow-map {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
}

.flow-node {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.flow-node:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow-sm);
}

.flow-node.category-source { border-left: 3px solid var(--primary); }
.flow-node.category-processor { border-left: 3px solid var(--warning); }
.flow-node.category-output { border-left: 3px solid var(--success); }
.flow-node.category-runtime { border-left: 3px solid var(--info); }

.flow-node-icon {
  display: grid;
  place-items: center;
  color: var(--primary);
}

.flow-node-body {
  display: grid;
  line-height: 1.3;
}

.flow-node-body strong {
  font-size: var(--text-sm);
  color: var(--text-strong);
}

.flow-node-body small {
  font-size: var(--text-xs);
  color: var(--muted);
}

.flow-arrow {
  color: var(--muted);
  font-size: var(--text-lg);
  user-select: none;
}

.flow-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  font-size: var(--text-xs);
}

.drawer-content {
  display: grid;
  gap: var(--space-4);
}

.drawer-content > p {
  margin: 0;
  color: var(--text);
  font-size: var(--text-sm);
  line-height: 1.6;
}

.drawer-content h4 {
  margin: 0 0 var(--space-1);
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  color: var(--muted);
}

.drawer-content ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: var(--space-1);
}

.drawer-content li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text);
}

.drawer-empty {
  color: var(--muted);
  font-size: var(--text-sm);
}

.drawer-actions {
  display: flex;
  gap: var(--space-2);
}

@media (max-width: 640px) {
  .flow-map {
    flex-direction: column;
    align-items: stretch;
  }
  .flow-arrow {
    display: none;
  }
}
</style>
