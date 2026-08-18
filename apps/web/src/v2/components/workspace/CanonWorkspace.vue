<script setup lang="ts">
import { computed, ref } from "vue";
import { Plus, User, MapPin, BookOpen, ShieldAlert, Clock3, Pencil } from "@lucide/vue";
import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Field from "../../../components/ui/Field.vue";
import Input from "../../../components/ui/Input.vue";
import Modal from "../../../components/ui/Modal.vue";
import Drawer from "../../../components/ui/Drawer.vue";
import Select from "../../../components/ui/Select.vue";
import Textarea from "../../../components/ui/Textarea.vue";
import type { V2WorkspaceSnapshot } from "../../adapters";
import { useV2WorkspaceStore } from "../../stores/workspace";

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

const activeTab = ref<"all" | "characters" | "locations" | "facts" | "rules" | "timeline">("all");
const searchQuery = ref("");

const createDialogOpen = ref(false);
const newStoryName = ref("");
const newStoryPremise = ref("");
const createError = ref<string | null>(null);
const creatingStory = computed(() => store.creatingStory);
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
      const input = { name: entityName.value.trim(), ...(entitySummary.value.trim() ? { summary: entitySummary.value.trim() } : {}) };
      if (editingEntityId.value) await store.updateCanonEntity({ kind: "character", id: editingEntityId.value, input }); else await store.createCanonEntity({ kind: "character", input });
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


function openCreateDialog(): void {
  createError.value = null;
  newStoryName.value = "";
  newStoryPremise.value = "";
  createDialogOpen.value = true;
}

async function submitCreateStory(): Promise<void> {
  const name = newStoryName.value.trim();
  if (!name) {
    createError.value = "请填写故事名称。";
    return;
  }
  createError.value = null;
  try {
    const input: { name: string; summary?: string } = { name };
    const premise = newStoryPremise.value.trim();
    if (premise) input.summary = premise;
    await store.createStoryWorld(input);
    createDialogOpen.value = false;
  } catch {
    createError.value = store.error;
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
  return props.snapshot.world.locations.filter(l => l.name.toLowerCase().includes(q) || l.tags.some(t => t.toLowerCase().includes(q)));
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

    <!-- 空库：还没有任何故事世界，从这里创建第一个故事 -->
    <div v-else-if="!snapshot" class="canon-card canon-empty">
      <div class="canon-empty-copy">
        <h3>还没有故事世界</h3>
        <p>从一个故事空间开始：填写名称与世界观前提，创建后即可在总览中编辑正典设定。</p>
      </div>
      <Button variant="primary" size="md" @click="openCreateDialog">
        <Plus :size="16" aria-hidden="true" />
        新建故事
      </Button>
    </div>

    <template v-else>
      <!-- Top Configuration & Revision Controls -->
      <div class="canon-card config-card">
        <div class="card-header">
          <h3>正典修订与设定基线</h3>
          <div class="card-actions">
            <Badge tone="neutral">版本 v{{ snapshot.world.revision }}</Badge>
            <Button variant="secondary" size="sm" @click="openCreateDialog">
              <Plus :size="14" aria-hidden="true" />
              新建故事
            </Button>
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
              <h4>{{ char.name }}</h4>
              <span class="sub">{{ char.role || '\u89d2\u8272' }}</span>
            </div>
            <Badge tone="info">角色</Badge><Button variant="ghost" size="icon" aria-label="编辑角色" @click="openEditEntity('character', char.characterId, { name: char.name, summary: char.role })"><Pencil :size="15" aria-hidden="true" /></Button>
          </div>
          <p class="entity-summary">{{ char.role }}</p>
          
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
            <Badge tone="neutral">地点</Badge><Button variant="ghost" size="icon" aria-label="编辑地点" @click="openEditEntity('location', loc.locationId, { name: loc.name, summary: loc.tags.join(', ') })"><Pencil :size="15" aria-hidden="true" /></Button>
          </div>
          <div v-if="loc.tags?.length" class="tag-list">
            <span v-for="t in loc.tags" :key="t" class="tag">#{{ t }}</span>
          </div>
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
    </template>

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

    <Modal
      :open="createDialogOpen"
      title="新建故事"
      description="创建一个新的故事世界空间，之后可以在总览中继续编辑正典设定。"
      @close="createDialogOpen = false"
    >
      <form class="create-story-form" @submit.prevent="submitCreateStory">
        <Field for-id="v2-new-story-name" label="故事名称" required hint="例如：雾港回声">
          <Input id="v2-new-story-name" v-model="newStoryName" placeholder="故事名称" autofocus />
        </Field>
        <Field for-id="v2-new-story-premise" label="故事前提 / 世界观背景" hint="一句话说明这个世界发生了什么；可留空稍后补充。">
          <Textarea id="v2-new-story-premise" v-model="newStoryPremise" :rows="3" placeholder="可留空，稍后在故事总览中补充。" />
        </Field>
        <p v-if="createError" class="create-story-error" role="alert">{{ createError }}</p>
      </form>
      <template #footer>
        <Button variant="secondary" size="md" :disabled="creatingStory" @click="createDialogOpen = false">取消</Button>
        <Button variant="primary" size="md" :loading="creatingStory" @click="submitCreateStory">创建故事</Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.canon-workspace {
  display: grid;
  gap: var(--space-4);
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

.canon-empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.canon-empty-copy h3 {
  margin: 0 0 var(--space-1);
  color: var(--text-strong);
  font-size: var(--text-lg);
}

.canon-empty-copy p {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-sm);
  line-height: 1.6;
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
