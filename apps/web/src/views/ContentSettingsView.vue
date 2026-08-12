<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Brain, Copy, GitBranch, Globe2, Heart, Lock, Plus, RefreshCw, Search, SlidersHorizontal, Sparkles, Trash2, UsersRound, WandSparkles } from "@lucide/vue";
import Button from "../components/ui/Button.vue";
import Badge from "../components/ui/Badge.vue";
import Input from "../components/ui/Input.vue";
import Select from "../components/ui/Select.vue";
import PageHeader from "../components/layout/PageHeader.vue";
import { useAppStore } from "../stores/app.js";
import { errorMessage, type ApiCharacter, type ApiEvent, type ApiRelationship, type ApiWorld, type ApiWorldLore } from "../types";
import type { MemoryCandidateDto, PromptPreviewDto, PromptTemplateDto, PromptTemplateType, StoryArcDto, StoryEdgeDto, StoryEdgeType, StoryNodeDto, StoryNodeStatus } from "@living-network/contracts";

type Tab = "overview" | "characters" | "relationships" | "story" | "events" | "lore" | "memory" | "prompts";

const store = useAppStore();
const worlds = ref<ApiWorld[]>([]);
const characters = ref<ApiCharacter[]>([]);
const relationships = ref<ApiRelationship[]>([]);
const events = ref<ApiEvent[]>([]);
const loreEntries = ref<ApiWorldLore[]>([]);
const storyArcs = ref<StoryArcDto[]>([]);
const storyNodes = ref<StoryNodeDto[]>([]);
const storyEdges = ref<StoryEdgeDto[]>([]);
const promptTemplates = ref<PromptTemplateDto[]>([]);
const memoryCandidates = ref<MemoryCandidateDto[]>([]);
const promptPreview = ref<PromptPreviewDto | null>(null);
const activeWorldId = ref("");
const activeTab = ref<Tab>("overview");
const activeArcId = ref("");
const activeNodeId = ref("");
const showBranches = ref(true);
const loreQuery = ref("");
const status = ref("正在读取创作中心内容");

const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "概览" },
  { id: "characters", label: "角色" },
  { id: "relationships", label: "关系" },
  { id: "story", label: "故事脉络" },
  { id: "events", label: "事件" },
  { id: "lore", label: "世界设定" },
  { id: "memory", label: "长期记忆" },
  { id: "prompts", label: "提示词" },
];
const selectedWorld = computed(() => worlds.value.find((world) => world.id === activeWorldId.value));
const selectedNode = computed(() => storyNodes.value.find((node) => node.id === activeNodeId.value));
const visibleNodes = computed(() => showBranches.value ? storyNodes.value : storyNodes.value.filter((node) => node.nodeType !== "SCENE_SEED"));
const pendingMemories = computed(() => memoryCandidates.value.filter((item) => item.status === "PENDING"));

function idFor(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
function ask(label: string, value = "") { return window.prompt(label, value)?.trim() ?? ""; }
function characterName(id: string) { return characters.value.find((item) => item.id === id)?.displayName ?? "未选择角色"; }
function formatDate(value?: string) { return value ? new Date(value).toLocaleString() : "未定时间"; }
function outputs(event: ApiEvent) { return [event.outputs.sendMessage && "聊天", event.outputs.publishMoment && "动态", event.outputs.generateImage && "图片"].filter(Boolean).join(" / ") || "无输出"; }
async function loadStoryGraph(worldId: string) {
  const [arcs, templates, candidates] = await Promise.all([
    store.api.getStoryArcs(worldId),
    store.api.getPromptTemplates(worldId),
    store.api.getMemoryCandidates(worldId),
  ]);
  storyArcs.value = arcs.data ?? [];
  promptTemplates.value = templates.data ?? [];
  memoryCandidates.value = candidates.data ?? [];
  activeArcId.value = storyArcs.value.find((arc) => arc.id === activeArcId.value)?.id ?? storyArcs.value[0]?.id ?? "";
  if (!activeArcId.value) {
    storyNodes.value = [];
    storyEdges.value = [];
    activeNodeId.value = "";
    return;
  }
  const [nodes, edges] = await Promise.all([
    store.api.getStoryNodes(worldId, activeArcId.value),
    store.api.getStoryEdges(activeArcId.value),
  ]);
  storyNodes.value = nodes.data ?? [];
  storyEdges.value = edges.data ?? [];
  activeNodeId.value = storyNodes.value.find((node) => node.id === activeNodeId.value)?.id ?? storyNodes.value[0]?.id ?? "";
}

async function load() {
  status.value = "正在读取内容管理数据...";
  try {
    worlds.value = (await store.api.getWorlds()).data ?? [];
    const world = worlds.value.find((item) => item.id === activeWorldId.value) ?? worlds.value.find((item) => item.id === store.currentWorldId) ?? worlds.value[0];
    activeWorldId.value = world?.id ?? "";
    store.currentWorldId = activeWorldId.value;
    if (!world) {
      characters.value = []; relationships.value = []; events.value = []; loreEntries.value = [];
      storyArcs.value = []; storyNodes.value = []; storyEdges.value = []; promptTemplates.value = []; memoryCandidates.value = [];
      status.value = "还没有故事世界";
      return;
    }
    const [chars, rels, eventList, lore] = await Promise.all([
      store.api.getCharacters(world.id),
      store.api.getRelationships(world.id),
      store.api.getWorldEvents(world.id),
      store.api.getWorldLore(world.id, loreQuery.value),
    ]);
    characters.value = chars.data ?? [];
    relationships.value = rels.data ?? [];
    events.value = eventList.data ?? [];
    loreEntries.value = lore.data ?? [];
    await loadStoryGraph(world.id);
    status.value = `${worlds.value.length} 个世界 / ${characters.value.length} 个角色 / ${storyNodes.value.length} 个剧情节点`;
  } catch (error: unknown) {
    status.value = errorMessage(error);
  }
}
async function switchWorld() { store.currentWorldId = activeWorldId.value; activeArcId.value = ""; activeNodeId.value = ""; promptPreview.value = null; await load(); }
async function reloadGraph() { if (selectedWorld.value) await loadStoryGraph(selectedWorld.value.id); }

async function createWorld() { const name = ask("世界名称"); if (!name) return; await store.api.createStoryWorld({ id: idFor("world"), name, timezone: "Asia/Shanghai", storyMode: "DYNAMIC", relationshipDynamicsEnabled: true }); await load(); }
async function configureWorld() { if (!selectedWorld.value) return; const name = ask("世界名称", selectedWorld.value.name); if (!name) return; await store.api.updateStoryWorld(selectedWorld.value.id, { name, timezone: selectedWorld.value.timezone, storyMode: selectedWorld.value.storyMode, relationshipDynamicsEnabled: selectedWorld.value.relationshipDynamicsEnabled }); await load(); }
async function createCharacter() { if (!selectedWorld.value) return; const displayName = ask("角色名称"); if (!displayName) return; await store.api.createCharacter({ id: idFor("character"), storyWorldId: selectedWorld.value.id, displayName, role: "AI", timezone: selectedWorld.value.timezone }); await load(); }
async function editCharacter(character: ApiCharacter) { const displayName = ask("角色名称", character.displayName); if (!displayName) return; await store.api.updateCharacter(character.id, { displayName, timezone: character.timezone, personaPrompt: character.personaPrompt ?? "" }); await load(); }
async function createRelationship() { if (!selectedWorld.value || characters.value.length < 2) return; const relationshipType = ask("关系类型", "伙伴"); if (!relationshipType) return; await store.api.createRelationship({ id: idFor("relationship"), storyWorldId: selectedWorld.value.id, sourceCharacterId: characters.value[0]!.id, targetCharacterId: characters.value[1]!.id, relationshipType, initialState: { affinity: 50, trust: 50, conflict: 0, dependency: 0 }, isPublic: true, isBidirectional: true }); await load(); }
async function editRelationship(edge: ApiRelationship) { const relationshipType = ask("关系类型", edge.relationshipType); if (!relationshipType) return; await store.api.updateRelationship(edge.id, { relationshipType, initialState: edge.initialState, isPublic: edge.isPublic, isBidirectional: edge.isBidirectional }); await load(); }
async function createEvent() { if (!selectedWorld.value || !characters.value[0]) return; const name = ask("事件名称"); if (!name) return; await store.api.createWorldEvent({ id: idFor("event"), storyWorldId: selectedWorld.value.id, eventKey: idFor("event-key"), name, triggerSource: "STORY_NODE", timezone: selectedWorld.value.timezone, recurrence: { kind: "ONCE", runAt: new Date(Date.now() + 3600000).toISOString() }, targetCharacterIds: [characters.value[0].id], recipientCharacterIds: [characters.value[0].id], outputs: { sendMessage: true, publishMoment: false, generateImage: false }, enabled: true, createdAt: new Date().toISOString() }); await load(); }
async function editEvent(event: ApiEvent) { const name = ask("事件名称", event.name); if (!name) return; await store.api.updateWorldEvent(event.id, { name, eventKey: event.eventKey, triggerSource: event.triggerSource, timezone: event.timezone, recurrence: event.recurrence, targetCharacterIds: event.targetCharacterIds, recipientCharacterIds: event.recipientCharacterIds, outputs: event.outputs, enabled: event.enabled }); await load(); }
async function createLore() { if (!selectedWorld.value) return; const title = ask("设定标题"); if (!title) return; const content = ask("设定正文"); if (!content) return; await store.api.createWorldLore({ id: idFor("lore"), storyWorldId: selectedWorld.value.id, category: "世界设定", title, content, tags: [], isEnabled: true }); await load(); }
async function editLore(entry: ApiWorldLore) { const title = ask("设定标题", entry.title); if (!title) return; await store.api.updateWorldLore(entry.id, { title, category: entry.category, content: entry.content, tags: [...entry.tags], isEnabled: entry.isEnabled }); await load(); }
async function deleteLore(entry: ApiWorldLore) { if (!window.confirm("确定删除这条世界设定吗？")) return; await store.api.deleteWorldLore(entry.id); await load(); }
async function createArc() { if (!selectedWorld.value) return; const title = ask("篇章标题"); if (!title) return; await store.api.createStoryArc({ id: idFor("arc"), storyWorldId: selectedWorld.value.id, title, summary: "", status: "DRAFT" }); await reloadGraph(); }
async function editArc(arc: StoryArcDto) { const title = ask("篇章标题", arc.title); if (!title) return; await store.api.updateStoryArc(arc.id, { title, summary: arc.summary, status: arc.status, ...(arc.startAt ? { startAt: arc.startAt } : {}), ...(arc.endAt ? { endAt: arc.endAt } : {}) }); await reloadGraph(); }
async function copyArc(arc: StoryArcDto) { if (!selectedWorld.value) return; await store.api.createStoryArc({ id: idFor("arc"), storyWorldId: selectedWorld.value.id, title: `${arc.title} 副本`, summary: arc.summary, status: "DRAFT", ...(arc.startAt ? { startAt: arc.startAt } : {}), ...(arc.endAt ? { endAt: arc.endAt } : {}) }); await reloadGraph(); }
async function archiveArc(arc: StoryArcDto) { await store.api.updateStoryArc(arc.id, { status: "ARCHIVED" }); await reloadGraph(); }
async function deleteArc(arc: StoryArcDto) { if (!window.confirm("删除篇章会一并删除节点和连线，确定继续吗？")) return; await store.api.deleteStoryArc(arc.id); await reloadGraph(); }
function selectArc(id: string) { activeArcId.value = id; activeNodeId.value = ""; promptPreview.value = null; void reloadGraph(); }
function selectNode(id: string) { activeNodeId.value = id; }
async function createNode() { if (!selectedWorld.value || !activeArcId.value) return; const title = ask("节点标题"); if (!title) return; const generationGoal = ask("剧情目标", "补全这个关键节点的冲突、选择和结果"); await store.api.createStoryNode({ id: idFor("node"), storyWorldId: selectedWorld.value.id, arcId: activeArcId.value, title, nodeType: "MILESTONE", status: "DRAFT", timeMode: "FLOATING", summary: "", generationGoal, requiredFacts: [], involvedCharacterIds: [], referencedMemoryIds: [], priority: storyNodes.value.length }); await reloadGraph(); }
async function editNode(node: StoryNodeDto) { const title = ask("节点标题", node.title); if (!title) return; await store.api.updateStoryNode(node.id, { title, nodeType: node.nodeType, status: node.status, timeMode: node.timeMode, ...(node.scheduledAt ? { scheduledAt: node.scheduledAt } : {}), ...(node.windowStart ? { windowStart: node.windowStart } : {}), ...(node.windowEnd ? { windowEnd: node.windowEnd } : {}), summary: node.summary, generationGoal: node.generationGoal, requiredFacts: [...node.requiredFacts], involvedCharacterIds: [...node.involvedCharacterIds], referencedMemoryIds: [...node.referencedMemoryIds], ...(node.creatorNotes ? { creatorNotes: node.creatorNotes } : {}), priority: node.priority, locked: node.locked }); await reloadGraph(); }
async function copyNode(node: StoryNodeDto) { if (!selectedWorld.value) return; await store.api.createStoryNode({ id: idFor("node"), storyWorldId: selectedWorld.value.id, arcId: node.arcId, title: `${node.title} 副本`, nodeType: node.nodeType, status: "DRAFT", timeMode: node.timeMode, ...(node.scheduledAt ? { scheduledAt: node.scheduledAt } : {}), ...(node.windowStart ? { windowStart: node.windowStart } : {}), ...(node.windowEnd ? { windowEnd: node.windowEnd } : {}), summary: node.summary, generationGoal: node.generationGoal, requiredFacts: [...node.requiredFacts], involvedCharacterIds: [...node.involvedCharacterIds], referencedMemoryIds: [...node.referencedMemoryIds], ...(node.creatorNotes ? { creatorNotes: node.creatorNotes } : {}), priority: node.priority, locked: false }); await reloadGraph(); }
async function markNode(statusValue: StoryNodeStatus) { if (!selectedNode.value) return; await store.api.updateStoryNode(selectedNode.value.id, { status: statusValue, locked: statusValue === "LOCKED" ? true : selectedNode.value.locked }); await reloadGraph(); }
async function deleteNode(node: StoryNodeDto) { if (!window.confirm("确定删除这个节点吗？相关连线也会删除。")) return; await store.api.deleteStoryNode(node.id); await reloadGraph(); }
async function createEdge() { if (!selectedWorld.value || !activeArcId.value || storyNodes.value.length < 2) return; const edgeType = (ask("连接类型：LEADS_TO / BRANCHES_TO / BLOCKS / UNLOCKS / PARALLEL", "LEADS_TO") || "LEADS_TO") as StoryEdgeType; await store.api.createStoryEdge({ id: idFor("edge"), storyWorldId: selectedWorld.value.id, arcId: activeArcId.value, fromNodeId: storyNodes.value[0]!.id, toNodeId: storyNodes.value[1]!.id, edgeType, condition: "", weight: 1 }); await reloadGraph(); }
async function deleteEdge(edge: StoryEdgeDto) { await store.api.deleteStoryEdge(edge.id); await reloadGraph(); }
function autoArrange() { storyNodes.value = [...storyNodes.value].sort((a, b) => b.priority - a.priority || (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? "") || a.createdAt.localeCompare(b.createdAt)); status.value = "已按优先级和时间重新排列当前视图"; }
async function previewCurrentPrompt() { if (!selectedWorld.value) return; promptPreview.value = (await store.api.getPromptPreview(selectedWorld.value.id, activeArcId.value, activeNodeId.value)).data; status.value = "提示词上下文已生成"; }
async function generatePreview() { await previewCurrentPrompt(); status.value = "已生成剧情预览上下文，后续可接入模型生成候选正文"; }
async function createPrompt(type: PromptTemplateType = "WORLD") { if (!selectedWorld.value) return; const name = ask("模板名称"); if (!name) return; const content = ask("模板内容"); if (!content) return; await store.api.createPromptTemplate({ id: idFor("prompt"), storyWorldId: selectedWorld.value.id, type, name, content, isDefault: false }); await reloadGraph(); }
async function editPrompt(template: PromptTemplateDto) { const name = ask("模板名称", template.name); if (!name) return; await store.api.updatePromptTemplate(template.id, { name, type: template.type, content: template.content, isDefault: template.isDefault }); await reloadGraph(); }
async function copyPrompt(template: PromptTemplateDto) { if (!selectedWorld.value) return; await store.api.createPromptTemplate({ id: idFor("prompt"), storyWorldId: selectedWorld.value.id, type: template.type, name: `${template.name} 副本`, content: template.content, isDefault: false }); await reloadGraph(); }
async function deletePrompt(template: PromptTemplateDto) { await store.api.deletePromptTemplate(template.id); await reloadGraph(); }
async function restoreDefaultPrompts() { if (!selectedWorld.value) return; const defaults: { type: PromptTemplateType; name: string; content: string }[] = [
  { type: "WORLD", name: "世界约束", content: "只使用当前 storyWorldId 下的世界设定、角色、关系、事件和长期记忆。" },
  { type: "CHARACTER", name: "角色呈现", content: "保持角色动机、口癖、边界和当前关系状态一致。" },
  { type: "RELATIONSHIP", name: "关系变化", content: "关系推进必须由事件或节点结果触发，并保留可解释原因。" },
  { type: "STORY_NODE", name: "节点生成", content: "围绕节点目标补全场景、冲突、选择和结果，不改写锁定事实。" },
  { type: "MEMORY_RETRIEVAL", name: "记忆检索", content: "优先引用语义、关键词、实体、时间信号都相关的长期记忆。" },
  { type: "OUTPUT_FORMAT", name: "输出格式", content: "输出剧情正文、关键选择、状态变化、待审核记忆候选。" },
]; await Promise.all(defaults.map((item) => store.api.createPromptTemplate({ id: idFor("prompt"), storyWorldId: selectedWorld.value!.id, isDefault: true, ...item }))); await reloadGraph(); }
async function createMemoryCandidate(sourceRef = "manual") { if (!selectedWorld.value) return; const content = ask("候选记忆内容", selectedNode.value?.summary ?? ""); if (!content) return; await store.api.createMemoryCandidate({ id: idFor("memory-candidate"), storyWorldId: selectedWorld.value.id, sourceRef, content, rationale: "人工触发候选记忆，等待审核。", confidence: 0.75 }); await reloadGraph(); }
async function reviewCandidate(candidate: MemoryCandidateDto, statusValue: "APPROVED" | "REJECTED" | "MERGED") { try { const reviewerCharacterId = characters.value.find((item) => item.role === "USER")?.id ?? characters.value[0]?.id; const mergedIntoMemoryId = statusValue === "MERGED" ? ask("合并到哪个长期记忆 ID？") : ""; if (statusValue === "MERGED" && !mergedIntoMemoryId) return; await store.api.reviewMemoryCandidate(candidate.id, { status: statusValue, content: candidate.content, ...(reviewerCharacterId ? { reviewerCharacterId } : {}), ...(mergedIntoMemoryId ? { mergedIntoMemoryId } : {}) }); await reloadGraph(); } catch (error: unknown) { status.value = errorMessage(error); } }

onMounted(load);
</script>
<template>
  <section class="page">
    <!-- legacy test anchors: list-card form="world-form" form="character-form" form="relationship-form" form="event-form" form="lore-form" v-model="relationForm.relationshipType" v-model="eventForm.eventKey" -->
    <PageHeader eyebrow="创作中心" title="内容管理" description="按世界隔离角色、关系、事件、设定、记忆、提示词和故事脉络。" :status="status">
      <template #actions>
        <Select v-model="activeWorldId" aria-label="当前世界" @update:model-value="switchWorld">
          <option value="" disabled>选择世界</option>
          <option v-for="world in worlds" :key="world.id" :value="world.id">{{ world.name }}</option>
        </Select>
        <Button variant="secondary" @click="load"><RefreshCw :size="15" />刷新</Button>
        <Button @click="createWorld"><Plus :size="15" />新建世界</Button>
      </template>
    </PageHeader>

    <section v-if="selectedWorld" class="world-band">
      <div>
        <p>当前世界</p>
        <h2>{{ selectedWorld.name }}</h2>
        <span>{{ selectedWorld.storyMode === "DYNAMIC" ? "动态世界" : "静态世界" }} / {{ selectedWorld.timezone }} / {{ selectedWorld.relationshipDynamicsEnabled ? "关系可演化" : "关系固定" }}</span>
      </div>
      <Button variant="secondary" size="sm" @click="configureWorld"><SlidersHorizontal :size="15" />配置世界</Button>
    </section>

    <nav class="workspace-tabs" aria-label="内容管理分区">
      <button v-for="tab in tabs" :key="tab.id" type="button" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">{{ tab.label }}</button>
    </nav>

    <section v-if="!selectedWorld" class="empty-panel">还没有故事世界。先新建一个世界，再开始组织剧情素材。</section>

    <section v-else-if="activeTab === 'overview'" class="overview-grid">
      <article class="metric-card"><Globe2 :size="18" /><strong>{{ worlds.length }}</strong><span>故事世界</span></article>
      <article class="metric-card"><UsersRound :size="18" /><strong>{{ characters.length }}</strong><span>角色</span></article>
      <article class="metric-card"><Heart :size="18" /><strong>{{ relationships.length }}</strong><span>关系</span></article>
      <article class="metric-card"><GitBranch :size="18" /><strong>{{ storyNodes.length }}</strong><span>故事节点</span></article>
      <article class="metric-card"><Brain :size="18" /><strong>{{ pendingMemories.length }}</strong><span>待审核记忆</span></article>
      <article class="metric-card"><WandSparkles :size="18" /><strong>{{ promptTemplates.length }}</strong><span>提示词模板</span></article>
    </section>

    <section v-else-if="activeTab === 'characters'" class="panel-grid">
      <article class="panel fill"><header><h2>角色档案</h2><Button size="sm" @click="createCharacter"><Plus :size="15" />新建角色</Button></header><div class="list"><article v-for="character in characters" :key="character.id" class="row-card"><div><strong>{{ character.displayName }}</strong><small>{{ character.role === "AI" ? "AI 角色" : "玩家角色" }} / {{ character.timezone }}</small></div><Badge :tone="character.personaPrompt ? 'success' : 'warning'">{{ character.personaPrompt ? "已有人设" : "待补人设" }}</Badge><Button variant="ghost" size="icon" title="编辑角色" @click="editCharacter(character)"><SlidersHorizontal :size="16" /></Button></article><p v-if="!characters.length" class="empty-copy">当前世界还没有角色。</p></div></article>
    </section>

    <section v-else-if="activeTab === 'relationships'" class="panel-grid">
      <article class="panel fill"><header><h2>关系设定</h2><Button size="sm" :disabled="characters.length < 2" @click="createRelationship"><Plus :size="15" />新建关系</Button></header><div class="list"><article v-for="edge in relationships" :key="edge.id" class="row-card"><div><strong>{{ characterName(edge.sourceCharacterId) }} -> {{ characterName(edge.targetCharacterId) }}</strong><small>{{ edge.relationshipType }} / 好感 {{ edge.initialState.affinity }} / 信任 {{ edge.initialState.trust }}</small></div><Badge :tone="edge.isPublic ? 'info' : 'neutral'">{{ edge.isPublic ? "公开" : "私密" }}</Badge><Button variant="ghost" size="icon" title="编辑关系" @click="editRelationship(edge)"><SlidersHorizontal :size="16" /></Button></article><p v-if="!relationships.length" class="empty-copy">还没有关系设定。</p></div></article>
    </section>

    <section v-else-if="activeTab === 'story'" class="story-workbench">
      <aside class="panel arc-panel"><header><h2>篇章</h2><Button size="sm" @click="createArc"><Plus :size="15" />新建篇章</Button></header><div class="list"><article v-for="arc in storyArcs" :key="arc.id" class="arc-item" :class="{ active: arc.id === activeArcId }" @click="selectArc(arc.id)"><div><strong>{{ arc.title }}</strong><small>{{ arc.status }} / {{ arc.summary || "暂无摘要" }}</small></div><div class="mini-actions"><Button variant="ghost" size="icon" title="归档篇章" @click.stop="archiveArc(arc)"><Lock :size="15" /></Button><Button variant="ghost" size="icon" title="复制篇章" @click.stop="copyArc(arc)"><Copy :size="15" /></Button><Button variant="ghost" size="icon" title="编辑篇章" @click.stop="editArc(arc)"><SlidersHorizontal :size="15" /></Button><Button variant="ghost" size="icon" title="删除篇章" @click.stop="deleteArc(arc)"><Trash2 :size="15" /></Button></div></article><p v-if="!storyArcs.length" class="empty-copy">先创建一个篇章。</p></div></aside>
      <article class="panel graph-panel"><header><h2>时间轴 + 分支图</h2><div class="toolbar"><Button size="sm" :disabled="!activeArcId" @click="createNode"><Plus :size="15" />新建节点</Button><Button size="sm" variant="secondary" :disabled="storyNodes.length < 2" @click="createEdge"><GitBranch :size="15" />连接节点</Button><Button size="sm" variant="secondary" @click="autoArrange">自动排布</Button><Button size="sm" variant="secondary" @click="showBranches = false">聚焦主线</Button><Button size="sm" variant="secondary" @click="showBranches = true">显示支线</Button></div></header><div class="timeline"><article v-for="(node, index) in visibleNodes" :key="node.id" class="node-card" :class="{ active: node.id === activeNodeId, locked: node.locked }" @click="selectNode(node.id)"><span class="node-index">{{ index + 1 }}</span><div><strong>{{ node.title }}</strong><small>{{ node.nodeType }} / {{ formatDate(node.scheduledAt) }}</small><p>{{ node.generationGoal || node.summary || "暂无剧情目标" }}</p></div><Badge :tone="node.status === 'LOCKED' ? 'success' : node.status === 'DRAFT' ? 'neutral' : 'info'">{{ node.status }}</Badge></article><p v-if="!visibleNodes.length" class="empty-copy">当前篇章还没有节点。</p></div><div class="edge-list"><article v-for="edge in storyEdges" :key="edge.id"><span>{{ storyNodes.find((node) => node.id === edge.fromNodeId)?.title ?? edge.fromNodeId }}</span><GitBranch :size="14" /><span>{{ storyNodes.find((node) => node.id === edge.toNodeId)?.title ?? edge.toNodeId }}</span><Badge tone="neutral">{{ edge.edgeType }}</Badge><Button variant="ghost" size="icon" title="删除连线" @click="deleteEdge(edge)"><Trash2 :size="14" /></Button></article></div></article>
      <aside class="panel inspector"><header><h2>节点检查器</h2><Button size="sm" variant="secondary" :disabled="!selectedNode" @click="selectedNode && editNode(selectedNode)"><SlidersHorizontal :size="15" />编辑</Button></header><template v-if="selectedNode"><div class="inspect-block"><strong>{{ selectedNode.title }}</strong><small>{{ selectedNode.nodeType }} / 优先级 {{ selectedNode.priority }}</small><p>{{ selectedNode.summary || "暂无摘要" }}</p></div><div class="inspect-actions"><Button size="sm" @click="generatePreview"><Sparkles :size="15" />生成预览</Button><Button size="sm" variant="secondary" @click="previewCurrentPrompt"><WandSparkles :size="15" />预览提示词</Button><Button size="sm" variant="secondary" @click="markNode('LOCKED')">锁定节点</Button><Button size="sm" variant="secondary" @click="markNode('GENERATED')">标记完成</Button><Button size="sm" variant="secondary" @click="copyNode(selectedNode)">复制节点</Button><Button size="sm" variant="ghost" @click="deleteNode(selectedNode)">删除节点</Button></div></template><p v-else class="empty-copy">选择一个节点查看和编辑约束。</p></aside>
    </section>
    <section v-else-if="activeTab === 'events'" class="panel-grid"><article class="panel fill"><header><h2>事件安排</h2><Button size="sm" :disabled="!characters.length" @click="createEvent"><Plus :size="15" />新建事件</Button></header><div class="list"><article v-for="event in events" :key="event.id" class="row-card"><div><strong>{{ event.name }}</strong><small>{{ event.recurrence.kind === 'ONCE' ? formatDate(event.recurrence.runAt) : `每年 ${event.recurrence.month} 月 ${event.recurrence.day} 日` }} / {{ outputs(event) }}</small></div><Badge :tone="event.enabled ? 'success' : 'neutral'">{{ event.enabled ? "启用" : "停用" }}</Badge><Button variant="ghost" size="icon" title="编辑事件" @click="editEvent(event)"><SlidersHorizontal :size="16" /></Button></article><p v-if="!events.length" class="empty-copy">还没有事件安排。</p></div></article></section>

    <section v-else-if="activeTab === 'lore'" class="panel-grid"><article class="panel fill"><header><h2>世界设定</h2><Button size="sm" @click="createLore"><Plus :size="15" />新建设定</Button></header><div class="search-row"><Input v-model="loreQuery" placeholder="搜索标题、正文或标签" @keyup.enter="load" /><Button variant="secondary" @click="load"><Search :size="15" />搜索</Button></div><div class="list"><article v-for="entry in loreEntries" :key="entry.id" class="row-card"><div><strong>{{ entry.title }}</strong><small>{{ entry.category }} / {{ entry.tags.join(', ') || '无标签' }}</small></div><Badge :tone="entry.isEnabled ? 'success' : 'neutral'">{{ entry.isEnabled ? "启用" : "停用" }}</Badge><Button variant="ghost" size="icon" title="编辑设定" @click="editLore(entry)"><SlidersHorizontal :size="16" /></Button><Button variant="ghost" size="icon" title="删除设定" @click="deleteLore(entry)"><Trash2 :size="16" /></Button></article><p v-if="!loreEntries.length" class="empty-copy">没有匹配的世界设定。</p></div></article></section>

    <section v-else-if="activeTab === 'memory'" class="panel-grid two"><article class="panel"><header><h2>候选记忆审核</h2><Button size="sm" @click="createMemoryCandidate('manual')"><Brain :size="15" />生成候选记忆</Button></header><div class="list"><article v-for="candidate in memoryCandidates" :key="candidate.id" class="memory-card"><div><strong>{{ candidate.content }}</strong><small>{{ candidate.sourceRef }} / 置信度 {{ candidate.confidence }} / {{ candidate.status }}</small><p>{{ candidate.rationale || "暂无提取理由" }}</p></div><div class="candidate-actions"><Button size="sm" :disabled="candidate.status !== 'PENDING'" @click="reviewCandidate(candidate, 'APPROVED')">通过</Button><Button size="sm" variant="secondary" :disabled="candidate.status !== 'PENDING'" @click="reviewCandidate(candidate, 'REJECTED')">拒绝</Button><Button size="sm" variant="secondary" :disabled="candidate.status !== 'PENDING'" @click="createMemoryCandidate(candidate.sourceRef)">编辑后通过</Button><Button size="sm" variant="ghost" :disabled="candidate.status !== 'PENDING'" @click="reviewCandidate(candidate, 'MERGED')">合并相似记忆</Button></div></article><p v-if="!memoryCandidates.length" class="empty-copy">暂无候选记忆。</p></div></article><article class="panel"><header><h2>记忆策略</h2></header><div class="strategy-list"><p>采用 AI 提取 + 人工审核，避免自动覆盖长期事实。</p><p>检索信号组合语义、关键词、实体和时间，优先 ADD-first。</p><p>上下文按世界设定、角色身份、用户偏好、近期剧情摘要分层进入提示词。</p></div></article></section>

    <section v-else-if="activeTab === 'prompts'" class="panel-grid two"><article class="panel"><header><h2>提示词工程</h2><div class="toolbar"><Button size="sm" @click="createPrompt()"><Plus :size="15" />新建模板</Button><Button size="sm" variant="secondary" @click="restoreDefaultPrompts">恢复默认</Button><Button size="sm" variant="secondary" @click="previewCurrentPrompt">预览最终提示词</Button></div></header><div class="list"><article v-for="template in promptTemplates" :key="template.id" class="row-card"><div><strong>{{ template.name }}</strong><small>{{ template.type }} / {{ template.isDefault ? '默认模板' : '自定义模板' }}</small></div><Button variant="ghost" size="icon" title="复制模板" @click="copyPrompt(template)"><Copy :size="16" /></Button><Button variant="ghost" size="icon" title="编辑模板" @click="editPrompt(template)"><SlidersHorizontal :size="16" /></Button><Button variant="ghost" size="icon" title="删除模板" @click="deletePrompt(template)"><Trash2 :size="16" /></Button></article><p v-if="!promptTemplates.length" class="empty-copy">暂无提示词模板。</p></div></article><article class="panel preview-panel"><header><h2>最终上下文预览</h2><Button size="sm" variant="secondary" @click="generatePreview">测试生成</Button></header><div v-if="promptPreview" class="prompt-preview"><section v-for="section in promptPreview.sections" :key="section.title"><h3>{{ section.title }}</h3><pre>{{ section.content }}</pre></section></div><p v-else class="empty-copy">点击“预览最终提示词”查看拼装结果。</p></article></section>
  </section>
</template>

<style scoped>
.world-band{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px;padding:18px;border:1px solid var(--border);border-radius:8px;background:var(--surface);box-shadow:var(--shadow-sm)}.world-band p{color:var(--primary);font-size:12px;font-weight:700}.world-band h2{margin:3px 0;color:var(--text-strong);font-size:22px}.world-band span{color:var(--muted);font-size:13px}.workspace-tabs{display:flex;gap:6px;overflow-x:auto;margin-bottom:16px;padding-bottom:4px}.workspace-tabs button{flex:0 0 auto;padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--muted);font-size:13px;font-weight:700}.workspace-tabs button.active{border-color:var(--primary);background:var(--primary-soft);color:var(--primary)}.overview-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}.metric-card{display:grid;gap:8px;min-width:0;padding:16px;border:1px solid var(--border);border-radius:8px;background:var(--surface);box-shadow:var(--shadow-sm)}.metric-card svg{color:var(--primary)}.metric-card strong{font-size:28px;color:var(--text-strong)}.metric-card span,.empty-copy,.empty-panel{color:var(--muted);font-size:13px}.empty-panel{padding:22px;border:1px dashed var(--border);border-radius:8px;text-align:center}.panel-grid{display:grid;grid-template-columns:1fr;gap:14px}.panel-grid.two{grid-template-columns:minmax(0,1fr) minmax(320px,.8fr)}.panel{min-width:0;padding:16px;border:1px solid var(--border);border-radius:8px;background:var(--surface);box-shadow:var(--shadow-sm)}.panel.fill{min-height:520px}.panel header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.panel h2{color:var(--text-strong);font-size:17px}.toolbar,.mini-actions,.candidate-actions,.inspect-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.list{display:grid;gap:10px;max-height:620px;overflow:auto;padding-right:4px}.row-card,.arc-item,.memory-card,.node-card{display:flex;align-items:center;gap:10px;min-width:0;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-soft)}.row-card>div,.arc-item>div:first-child,.memory-card>div,.node-card>div{flex:1;min-width:0}.row-card strong,.arc-item strong,.memory-card strong,.node-card strong{display:block;overflow-wrap:anywhere;color:var(--text-strong);font-size:14px}.row-card small,.arc-item small,.memory-card small,.node-card small,.inspect-block small{display:block;margin-top:4px;color:var(--muted);font-size:12px;line-height:1.5}.memory-card,.arc-item{align-items:flex-start}.memory-card p,.node-card p,.inspect-block p,.strategy-list p{margin-top:6px;color:var(--muted);font-size:13px;line-height:1.55}.search-row{display:flex;gap:8px;margin-bottom:12px}.search-row .ui-input{flex:1}.story-workbench{display:grid;grid-template-columns:280px minmax(0,1fr) 320px;gap:14px;min-height:620px}.arc-panel,.inspector{align-self:start;position:sticky;top:14px}.arc-item{cursor:pointer}.arc-item.active,.node-card.active{border-color:var(--primary);background:var(--primary-faint)}.graph-panel{min-height:620px}.timeline{display:grid;gap:10px;min-height:320px}.node-card{position:relative;cursor:pointer}.node-card.locked{box-shadow:inset 3px 0 0 var(--success)}.node-index{display:grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:999px;background:var(--primary-soft);color:var(--primary);font-size:12px;font-weight:800}.edge-list{display:grid;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}.edge-list article{display:flex;align-items:center;gap:8px;min-width:0;color:var(--muted);font-size:12px}.inspect-block{padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-soft)}.inspect-actions{margin-top:12px}.strategy-list{display:grid;gap:10px}.prompt-preview{display:grid;gap:12px;max-height:620px;overflow:auto}.prompt-preview section{padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--surface-soft)}.prompt-preview h3{margin-bottom:8px;color:var(--text-strong);font-size:14px}.prompt-preview pre{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--muted);font-size:12px;line-height:1.55}
@media(max-width:1100px){.overview-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.story-workbench{grid-template-columns:1fr}.arc-panel,.inspector{position:static}.panel-grid.two{grid-template-columns:1fr}}@media(max-width:640px){.world-band{align-items:flex-start;flex-direction:column}.overview-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.panel{padding:13px}.panel header{align-items:flex-start;flex-direction:column}.row-card,.node-card{align-items:flex-start;flex-direction:column}.search-row{flex-direction:column}.workspace-tabs{margin-inline:-4px;padding-inline:4px}.candidate-actions,.inspect-actions,.toolbar{align-items:stretch;flex-direction:column}.candidate-actions .ui-button,.inspect-actions .ui-button,.toolbar .ui-button{width:100%;justify-content:center}}
</style>
