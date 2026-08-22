<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Plus, User, MapPin, BookOpen, ShieldAlert, Clock3, Pencil } from "@lucide/vue";
import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Field from "../../../components/ui/Field.vue";
import Input from "../../../components/ui/Input.vue";
import Drawer from "../../../components/ui/Drawer.vue";
import Select from "../../../components/ui/Select.vue";
import Textarea from "../../../components/ui/Textarea.vue";
import type { V2WorkspaceSnapshot } from "../../adapters";
import { useV2WorkspaceStore } from "../../stores/workspace";
import WorkspaceModuleIntro from "./WorkspaceModuleIntro.vue";
import StorySkillTree from "./StorySkillTree.vue";
import { getDataFlowNode, getUsageSummaryForGroup } from "./workspace-data-flow";

const route = useRoute();
const router = useRouter();
const viewMode = ref<"tree" | "list">("tree");

const props = defineProps<{
  snapshot: V2WorkspaceSnapshot | null;
  loading: boolean;
  draftWorldName: string;
  draftPremise: string;
  conflict: string | null;
  hasDraftChanges: boolean;
}>();

const emit = defineEmits<{
  "update:draftWorldName": [value: string];
  "update:draftPremise": [value: string];
  previewCanonDraft: [];
  resetCanonDraft: [];
}>();

const store = useV2WorkspaceStore();

type CanonTab = "all" | "characters" | "locations" | "facts" | "rules" | "timeline";
const validTabs = new Set<CanonTab>(["all", "characters", "locations", "facts", "rules", "timeline"]);
const activeTab = ref<CanonTab>(validTabs.has(route.query.tab as CanonTab) ? (route.query.tab as CanonTab) : "all");
const searchQuery = ref("");
const usageSummary = computed(() => {
  const groups: Record<CanonTab, readonly string[]> = {
    all: [],
    characters: ["character_name", "character_persona", "character_summary"],
    locations: ["location"],
    facts: ["fact"],
    rules: ["rule"],
    timeline: ["timeline"],
  };
  const ids = groups[activeTab.value] ?? [];
  if (ids.length === 0) return [];
  const summary = getUsageSummaryForGroup(ids);
  return Array.from(summary.entries())
    .map(([consumerId, status]) => ({ consumerId, label: getDataFlowNode(consumerId)?.label ?? consumerId, status }))
    .sort((a, b) => a.label.localeCompare(b.label));
});

watch(() => route.query.tab, (tab) => {
  if (typeof tab === "string" && validTabs.has(tab as CanonTab)) {
    activeTab.value = tab as CanonTab;
  }
});

watch(activeTab, (tab) => {
  void router.replace({ query: { ...route.query, tab } });
});

type CanonEntityKind = "location" | "character" | "fact" | "rule" | "timeline";
const entityDrawerOpen = ref(false);
const editingEntityId = ref<string | null>(null);
const entityKind = ref<CanonEntityKind>("location");
const entityName = ref("");
const entitySummary = ref("");
const entityText = ref("");
const entityDate = ref("");
const entityVisibility = ref<"creator_only" | "player_visible">("player_visible");
const entitySeverity = ref<"guideline" | "required">("guideline");
const entityError = ref<string | null>(null);
const entityPersona = ref("");
const entityHomeLocationId = ref("");
const entityLocations = computed(() => props.snapshot?.world.locations ?? []);
function locationNameById(id: string | undefined): string {
  const location = entityLocations.value.find((item) => item.locationId === id);
  return location?.name ?? "";
}
function openEditCharacter(char: { readonly characterId: string; readonly name: string; readonly role: string; readonly summary?: string; readonly personaText?: string; readonly homeLocationId?: string }): void {
  openEditEntity("character", char.characterId, {
    name: char.name,
    ...(char.summary === undefined ? {} : { summary: char.summary }),
  });
  entityPersona.value = char.personaText ?? "";
  entityHomeLocationId.value = char.homeLocationId ?? "";
}

function openEntityDrawer(kind: CanonEntityKind = "location"): void {
  editingEntityId.value = null;
  entityKind.value = kind;
  entityName.value = "";
  entitySummary.value = "";
  entityText.value = "";
  entityDate.value = "";
  entityVisibility.value = "player_visible";
  entitySeverity.value = "guideline";
  entityError.value = null;
  entityPersona.value = "";
  entityHomeLocationId.value = "";
  entityDrawerOpen.value = true;
}

function openEditEntity(kind: CanonEntityKind, id: string, value: { name?: string; summary?: string; text?: string; localDate?: string; visibility?: "creator_only" | "player_visible"; severity?: "guideline" | "required" }): void {
  editingEntityId.value = id;
  entityKind.value = kind;
  entityName.value = value.name ?? "";
  entitySummary.value = value.summary ?? "";
  entityText.value = value.text ?? "";
  entityVisibility.value = value.visibility ?? "player_visible";
  entitySeverity.value = value.severity ?? "guideline";
  entityDate.value = value.localDate ?? "";
  entityError.value = null;
  entityPersona.value = "";
  entityHomeLocationId.value = "";
  entityDrawerOpen.value = true;
}
async function submitEntity(): Promise<void> {
  entityError.value = null;
  try {
    if (entityKind.value === "location") {
      const input = { name: entityName.value.trim(), ...(entitySummary.value.trim() ? { summary: entitySummary.value.trim() } : {}) };
      if (editingEntityId.value) await store.updateCanonEntity({ kind: "location", id: editingEntityId.value, input }); else await store.createCanonEntity({ kind: "location", input });
    }
    if (entityKind.value === "character") {
      const characterInput = {
        name: entityName.value.trim(),
        ...(editingEntityId.value === null
          ? (entitySummary.value.trim() ? { summary: entitySummary.value.trim() } : {})
          : { summary: entitySummary.value.trim() || null }),
        ...(editingEntityId.value === null
          ? (entityPersona.value.trim() ? { personaText: entityPersona.value.trim() } : {})
          : { personaText: entityPersona.value.trim() || null }),
        ...(entityHomeLocationId.value ? { homeLocationId: entityHomeLocationId.value as never } : {}),
        ...(editingEntityId.value !== null && !entityHomeLocationId.value ? { homeLocationId: null as never } : {}),
      };
      if (editingEntityId.value) await store.updateCanonEntity({ kind: "character", id: editingEntityId.value, input: characterInput }); else await store.createCanonEntity({ kind: "character", input: characterInput });
    }
    if (entityKind.value === "fact") {
      const input = { text: entityText.value.trim(), visibility: entityVisibility.value };
      if (editingEntityId.value) await store.updateCanonEntity({ kind: "fact", id: editingEntityId.value, input }); else await store.createCanonEntity({ kind: "fact", input });
    }
    if (entityKind.value === "rule") {
      const input = { text: entityText.value.trim(), severity: entitySeverity.value };
      if (editingEntityId.value) await store.updateCanonEntity({ kind: "rule", id: editingEntityId.value, input }); else await store.createCanonEntity({ kind: "rule", input });
    }
    if (entityKind.value === "timeline") {
      const input = { localDate: entityDate.value, title: entityName.value.trim(), ...(entitySummary.value.trim() ? { summary: entitySummary.value.trim() } : {}) };
      if (editingEntityId.value) await store.updateCanonEntity({ kind: "timeline", id: editingEntityId.value, input }); else await store.createCanonEntity({ kind: "timeline", input });
    }
    if (store.error) throw new Error(store.error);
    entityDrawerOpen.value = false;
  } catch (error) {
    entityError.value = error instanceof Error ? error.message : "保存失败";
  }
}


const filteredCharacters = computed(() => {
  if (!props.snapshot) return [];
  if (!searchQuery.value.trim()) return props.snapshot.world.characters;
  const q = searchQuery.value.toLowerCase();
  return props.snapshot.world.characters.filter(c => c.name.toLowerCase().includes(q) || c.role.toLowerCase().includes(q));
});

const filteredLocations = computed(() => {
  if (!props.snapshot) return [];
  if (!searchQuery.value.trim()) return props.snapshot.world.locations;
  const q = searchQuery.value.toLowerCase();
  return props.snapshot.world.locations.filter(l => l.name.toLowerCase().includes(q) || (l.summary ?? "").toLowerCase().includes(q));
});

const filteredFacts = computed(() => {
  if (!props.snapshot) return [];
  if (!searchQuery.value.trim()) return props.snapshot.world.facts;
  const q = searchQuery.value.toLowerCase();
  return props.snapshot.world.facts.filter(f => f.text.toLowerCase().includes(q));
});

const filteredRules = computed(() => {
  if (!props.snapshot) return [];
  if (!searchQuery.value.trim()) return props.snapshot.world.rules;
  const q = searchQuery.value.toLowerCase();
  return props.snapshot.world.rules.filter(r => r.text.toLowerCase().includes(q));
});

const filteredTimelineEvents = computed(() => {
  if (!props.snapshot) return [];
  if (!searchQuery.value.trim()) return props.snapshot.world.timelineEvents;
  const q = searchQuery.value.toLowerCase();
  return props.snapshot.world.timelineEvents.filter(event => event.title.toLowerCase().includes(q) || event.summary?.toLowerCase().includes(q));
});

function visibilityLabel(visibility: string): string {
  return visibility === "creator" ? "创作者可见" : "玩家可见";
}

function ruleSeverityLabel(severity: string): string {
  return severity === "hard" ? "硬约束" : "软约束";
}
</script>

<template>
  <div class="canon-workspace">
    <div v-if="!snapshot && loading" class="canon-loading">正在加载工作区快照...</div>

    <!-- 空库：显示模块说明，引导用户先创建故事 -->
    <WorkspaceModuleIntro
      v-else-if="!snapshot"
      title="世界设定"
      description="这里用于定义故事中的基础事实和对象。这些内容属于一个具体故事，因此需要先创建故事。"
      :examples="['角色', '地点', '世界事实', '世界规则', '时间线']"
      :consumers="['Chat 对话上下文', '场景生成 Context（部分）', '剧情分析']"
    />

    <template v-else>
      <!-- Top Configuration & Revision Controls -->
      <div class="canon-card config-card">
        <div class="card-header">
          <h3>正典修订与设定基线</h3>
          <div class="card-actions">
            <Badge tone="neutral">版本 v{{ snapshot.world.revision }}</Badge>
          </div>
        </div>

      <form class="v2-canon-form" aria-label="保存故事设定" @submit.prevent="emit('previewCanonDraft')">
        <div class="form-row">
          <Field label="故事空间名称" hint="保存时会校验版本，避免覆盖其他创作者的修改">
            <Input
              :model-value="draftWorldName"
              :disabled="loading"
              id="v2-world-name"
              aria-label="故事空间名称"
              @update:model-value="emit('update:draftWorldName', $event)"
            />
          </Field>
        </div>

        <Field label="故事前提 / 世界观背景">
          <Textarea
            :model-value="draftPremise"
            :disabled="loading"
            id="v2-world-premise"
            aria-label="故事前提"
            :rows="3"
            @update:model-value="emit('update:draftPremise', $event)"
          />
        </Field>

        <div class="v2-form-actions">
          <Button variant="primary" size="md" type="submit" :disabled="!hasDraftChanges || loading">
            保存修改
          </Button>
          <Button variant="secondary" size="md" :disabled="loading" @click="emit('resetCanonDraft')">
            重置草稿
          </Button>
        </div>
      </form>
    </div>

    <!-- 视图模式切换 -->
    <div class="view-mode-bar">
      <div class="view-mode-tabs">
        <button
          type="button"
          class="view-mode-tab"
          :class="{ active: viewMode === 'tree' }"
          @click="viewMode = 'tree'"
        >
          <GitFork :size="15" /> 故事技能树视图
        </button>
        <button
          type="button"
          class="view-mode-tab"
          :class="{ active: viewMode === 'list' }"
          @click="viewMode = 'list'"
        >
          <BookOpen :size="15" /> 经典卡片列表
        </button>
      </div>
    </div>

    <!-- 技能树主视图 -->
    <StorySkillTree
      v-if="viewMode === 'tree'"
      :snapshot="snapshot"
      :loading="loading"
      @refreshed="store.loadSnapshot()"
    />

    <!-- 经典列表视图 -->
    <div v-else class="canon-classic-list-view">
    <!-- Filters & Metrics Summary -->
    <div class="canon-overview">
      <div class="filter-tabs">
        <button
          type="button"
          :class="['filter-btn', { active: activeTab === 'all' }]"
          @click="activeTab = 'all'"
        >
          全部正典
        </button>
        <button
          type="button"
          :class="['filter-btn', { active: activeTab === 'characters' }]"
          @click="activeTab = 'characters'"
        >
          <User :size="14" /> 角色 ({{ snapshot.world.characters.length }})
        </button>
        <button
          type="button"
          :class="['filter-btn', { active: activeTab === 'locations' }]"
          @click="activeTab = 'locations'"
        >
          <MapPin :size="14" /> 地点 ({{ snapshot.world.locations.length }})
        </button>
        <button
          type="button"
          :class="['filter-btn', { active: activeTab === 'facts' }]"
          @click="activeTab = 'facts'"
        >
          <BookOpen :size="14" /> 事实 ({{ snapshot.world.facts.length }})
        </button>
        <button
          type="button"
          :class="['filter-btn', { active: activeTab === 'rules' }]"
          @click="activeTab = 'rules'"
        >
          <ShieldAlert :size="14" /> 规则 ({{ snapshot.world.rules.length }})
        </button>
        <button
          type="button"
          :class="['filter-btn', { active: activeTab === 'timeline' }]"
          @click="activeTab = 'timeline'"
        >
          <Clock3 :size="14" /> 时间线 ({{ snapshot.world.timelineEvents.length }})
        </button>
      </div>

      <div v-if="usageSummary.length" class="canon-usage-summary" aria-label="当前数据用途">
        <span class="canon-usage-label">当前用途</span>
        <span v-for="item in usageSummary" :key="item.consumerId" class="canon-usage-item">
          <Badge :tone="item.status === 'direct' ? 'success' : item.status === 'partial' ? 'info' : 'neutral'">{{ item.label }}</Badge>
          <span class="canon-usage-status">{{ item.status === 'direct' ? '使用' : item.status === 'partial' ? '部分' : '间接' }}</span>
        </span>
      </div>

      <div class="search-box">
        <Input
          v-model="searchQuery"
          placeholder="搜索角色、地点、事实规则..."
          size="sm"
        />
      <Button variant="primary" size="md" :disabled="loading" @click="openEntityDrawer(activeTab === 'all' ? 'location' : activeTab as CanonEntityKind)">
        <Plus :size="16" aria-hidden="true" />
        新增正典数据
      </Button>
      </div>
    </div>

    <!-- Entity Cards Grid -->
    <div class="entities-grid">
      <!-- Characters -->
      <template v-if="activeTab === 'all' || activeTab === 'characters'">
        <article
          v-for="char in filteredCharacters"
          :key="char.characterId"
          class="entity-card character-card"
        >
          <div class="entity-header">
            <div class="avatar-placeholder">
              <User :size="18" />
            </div>
          <div class="header-info">
            <h4><button class="character-link" type="button" @click="router.push(`/v2/workspace/characters/${char.characterId}`)">{{ char.name }}</button></h4>
            <span class="sub">{{ char.role || '\u89d2\u8272' }}</span>
          </div>
          <Badge tone="info">角色</Badge><Button variant="ghost" size="icon" aria-label="编辑角色" @click="openEditCharacter(char)"><Pencil :size="15" aria-hidden="true" /></Button>
          </div>
          <p class="entity-summary">{{ char.summary ?? char.role }}</p>
          <p v-if="char.personaText" class="entity-sub-summary">Persona：{{ char.personaText.slice(0, 120) }}{{ char.personaText.length > 120 ? '…' : '' }}</p>
          <p v-if="locationNameById(char.homeLocationId)" class="entity-sub-summary">常驻：{{ locationNameById(char.homeLocationId) }}</p>
          
        </article>
      </template>

      <!-- Locations -->
      <template v-if="activeTab === 'all' || activeTab === 'locations'">
        <article
          v-for="loc in filteredLocations"
          :key="loc.locationId"
          class="entity-card location-card"
        >
          <div class="entity-header">
            <div class="avatar-placeholder location-icon">
              <MapPin :size="18" />
            </div>
            <div class="header-info">
              <h4>{{ loc.name }}</h4>
              <span class="sub">场景地点</span>
            </div>
            <Badge tone="neutral">地点</Badge><Button variant="ghost" size="icon" aria-label="编辑地点" @click="openEditEntity('location', loc.locationId, { name: loc.name, ...(loc.summary === undefined ? {} : { summary: loc.summary }) })"><Pencil :size="15" aria-hidden="true" /></Button>
          </div>
          <p v-if="loc.summary" class="entity-summary">{{ loc.summary }}</p>
        </article>
      </template>

      <!-- Facts -->
      <template v-if="activeTab === 'all' || activeTab === 'facts'">
        <article
          v-for="fact in filteredFacts"
          :key="fact.factId"
          class="entity-card fact-card"
        >
          <div class="entity-header">
            <Badge :tone="fact.visibility === 'creator' ? 'warning' : 'info'">
              {{ visibilityLabel(fact.visibility) }}
            </Badge>
            <span class="fact-id">{{ fact.factId }}</span><Button variant="ghost" size="icon" aria-label="编辑事实" @click="openEditEntity('fact', fact.factId, { text: fact.text, visibility: fact.visibility === 'creator' ? 'creator_only' : 'player_visible' })"><Pencil :size="15" aria-hidden="true" /></Button>
          </div>
          <p class="fact-text">{{ fact.text }}</p>
        </article>
      </template>

      <!-- Rules -->
      <template v-if="activeTab === 'all' || activeTab === 'rules'">
        <article
          v-for="rule in filteredRules"
          :key="rule.ruleId"
          class="entity-card rule-card"
        >
          <div class="entity-header">
            <Badge :tone="rule.severity === 'hard' ? 'danger' : 'neutral'">
              {{ ruleSeverityLabel(rule.severity) }}
            </Badge>
            <span class="rule-id">{{ rule.ruleId }}</span><Button variant="ghost" size="icon" aria-label="编辑规则" @click="openEditEntity('rule', rule.ruleId, { text: rule.text, severity: rule.severity === 'hard' ? 'required' : 'guideline' })"><Pencil :size="15" aria-hidden="true" /></Button>
          </div>
          <p class="rule-text">{{ rule.text }}</p>
        </article>
      </template>

      <!-- Timeline -->
      <template v-if="activeTab === 'all' || activeTab === 'timeline'">
        <article
          v-for="event in filteredTimelineEvents"
          :key="event.timelineEventId"
          class="entity-card timeline-card"
        >
          <div class="entity-header">
            <div class="avatar-placeholder timeline-icon"><Clock3 :size="18" /></div>
            <div class="header-info">
              <h4>{{ event.title }}</h4>
              <span class="sub">{{ event.localDate }}</span>
            </div>
            <Badge tone="neutral">时间线</Badge><Button variant="ghost" size="icon" aria-label="编辑时间线事件" @click="openEditEntity('timeline', event.timelineEventId, { name: event.title, localDate: event.localDate, ...(event.summary === undefined ? {} : { summary: event.summary }) })"><Pencil :size="15" aria-hidden="true" /></Button>
          </div>
          <p v-if="event.summary" class="entity-summary">{{ event.summary }}</p>
        </article>
      </template>
    </div>
    </div>

    <Drawer
      :open="entityDrawerOpen"
      :title="editingEntityId ? '编辑正典数据' : '新增正典数据'"
      description="系统会自动生成业务 ID，并使用当前修订号保存。"
      @close="entityDrawerOpen = false"
    >
      <form class="create-story-form" @submit.prevent="submitEntity">
        <Field for-id="v2-entity-kind" label="数据类型" required>
          <Select id="v2-entity-kind" v-model="entityKind" aria-label="数据类型">
            <option value="location">地点</option>
            <option value="character">角色</option>
            <option value="fact">事实</option>
            <option value="rule">规则</option>
            <option value="timeline">时间线事件</option>
          </Select>
        </Field>
        <Field v-if="entityKind === 'location' || entityKind === 'character' || entityKind === 'timeline'" for-id="v2-entity-name" :label="entityKind === 'timeline' ? '事件标题' : '名称'" required>
          <Input id="v2-entity-name" v-model="entityName" :placeholder="entityKind === 'timeline' ? '事件标题' : '名称'" required />
        </Field>
        <Field v-if="entityKind === 'location' || entityKind === 'character' || entityKind === 'timeline'" for-id="v2-entity-summary" label="说明">
          <Textarea id="v2-entity-summary" v-model="entitySummary" :rows="4" placeholder="可选说明" />
        </Field>
        <Field v-if="entityKind === 'character'" for-id="v2-entity-persona" label="角色人设 Persona">
          <Textarea id="v2-entity-persona" v-model="entityPersona" :rows="5" placeholder="角色的性格、说话方式、背景……" />
        </Field>
        <Field v-if="entityKind === 'character'" for-id="v2-entity-home-location" label="常驻地点">
          <Select id="v2-entity-home-location" v-model="entityHomeLocationId" aria-label="常驻地点">
            <option value="">无</option>
            <option v-for="location in entityLocations" :key="location.locationId" :value="location.locationId">{{ location.name }}</option>
          </Select>
        </Field>
        <Field v-if="entityKind === 'fact' || entityKind === 'rule'" for-id="v2-entity-text" :label="entityKind === 'fact' ? '事实内容' : '规则内容'" required>
          <Textarea id="v2-entity-text" v-model="entityText" :rows="5" required />
        </Field>
        <Field v-if="entityKind === 'fact'" for-id="v2-entity-visibility" label="可见范围" required>
          <Select id="v2-entity-visibility" v-model="entityVisibility" aria-label="可见范围"><option value="player_visible">玩家可见</option><option value="creator_only">仅创作者可见</option></Select>
        </Field>
        <Field v-if="entityKind === 'rule'" for-id="v2-entity-severity" label="规则级别" required>
          <Select id="v2-entity-severity" v-model="entitySeverity" aria-label="规则级别"><option value="guideline">指导</option><option value="required">必须遵守</option></Select>
        </Field>
        <Field v-if="entityKind === 'timeline'" for-id="v2-entity-date" label="日期" required>
          <Input id="v2-entity-date" v-model="entityDate" type="date" required />
        </Field>
        <p v-if="entityError" class="create-story-error" role="alert">{{ entityError }}</p>
      </form>
      <template #footer>
        <Button variant="secondary" size="md" :disabled="loading" @click="entityDrawerOpen = false">取消</Button>
        <Button variant="primary" size="md" :loading="loading" @click="submitEntity">保存数据</Button>
      </template>
    </Drawer>
    </template>
  </div>
</template>

<style scoped>
.canon-workspace {
  display: grid;
  gap: var(--space-4);
}

.view-mode-bar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-2);
}

.view-mode-tabs {
  display: inline-flex;
  padding: 3px;
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  border: 1px solid var(--border);
  gap: 2px;
}

.view-mode-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--motion-fast);
}

.view-mode-tab:hover {
  color: var(--text-strong);
}

.view-mode-tab.active {
  background: var(--surface);
  color: var(--primary);
  box-shadow: var(--shadow-sm);
}

.canon-card {
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
}

.card-header h3 {
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--text-strong);
  margin: 0;
}

.card-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.canon-loading {
  padding: var(--space-6);
  color: var(--muted);
  font-size: var(--text-sm);
  text-align: center;
}

.create-story-form {
  display: grid;
  gap: var(--space-4);
}

.create-story-error {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-xs);
}

.form-row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--space-3);
}

.v2-canon-form {
  display: grid;
  gap: var(--space-3);
}

.v2-form-actions {
  display: flex;
  gap: var(--space-2);
}

.canon-overview {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

.canon-usage-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
}

.canon-usage-label {
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--muted);
}

.canon-usage-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.canon-usage-status {
  font-size: var(--text-xs);
  color: var(--muted);
}

.filter-tabs {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.filter-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-btn.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.search-box {
  min-width: 240px;
}

.entities-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-3);
}

.entity-card {
  padding: var(--space-3);
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.entity-card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
}

.entity-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.avatar-placeholder {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--primary-soft, #eef2ff);
  color: var(--primary);
  display: grid;
  place-items: center;
}

.avatar-placeholder.location-icon {
  background: #ecfdf5;
  color: #059669;
}

.header-info {
  flex: 1;
  min-width: 0;
}

.header-info h4 {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--text-strong);
}

.character-link { border: 0; padding: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; text-align: left; }
.character-link:hover { color: var(--primary); text-decoration: underline; }

.header-info .sub {
  font-size: var(--text-xs);
  color: var(--muted);
}

.entity-summary, .fact-text, .rule-text {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text);
  line-height: 1.4;
  word-break: break-word;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: auto;
}

.tag {
  font-size: var(--text-xs);
  padding: 1px 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  color: var(--muted);
}

.fact-id, .rule-id {
  font-size: var(--text-xs);
  color: var(--muted);
  margin-left: auto;
}

@media (max-width: 640px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}
</style>
