<script setup lang="ts">
import { computed, ref } from "vue";
import { Plus, User, MapPin, BookOpen, ShieldAlert } from "@lucide/vue";
import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Field from "../../../components/ui/Field.vue";
import Input from "../../../components/ui/Input.vue";
import Modal from "../../../components/ui/Modal.vue";
import Textarea from "../../../components/ui/Textarea.vue";
import type { V2WorkspaceSnapshot } from "../../adapters";
import { useV2WorkspaceStore } from "../../stores/workspace";

const props = defineProps<{
  snapshot: V2WorkspaceSnapshot | null;
  loading: boolean;
  draftWorldName: string;
  draftPremise: string;
  expectedRevision: number;
  conflict: string | null;
  hasDraftChanges: boolean;
}>();

const emit = defineEmits<{
  "update:draftWorldName": [value: string];
  "update:draftPremise": [value: string];
  "update:expectedRevision": [value: number];
  previewCanonDraft: [];
  resetCanonDraft: [];
}>();

const store = useV2WorkspaceStore();

const activeTab = ref<"all" | "characters" | "locations" | "facts" | "rules">("all");
const searchQuery = ref("");

const createDialogOpen = ref(false);
const newStoryName = ref("");
const newStoryPremise = ref("");
const createError = ref<string | null>(null);
const creatingStory = computed(() => store.creatingStory);

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

      <form class="v2-canon-form" aria-label="故事设定预览" @submit.prevent="emit('previewCanonDraft')">
        <div class="form-row">
          <Field label="故事空间名称" hint="修改后先预览修订，通过版本号避免并发冲突">
            <Input
              :model-value="draftWorldName"
              :disabled="loading"
              id="v2-world-name"
              aria-label="故事空间名称"
              @update:model-value="emit('update:draftWorldName', $event)"
            />
          </Field>
          <Field :label="conflict ? '期望版本 (冲突)' : '期望版本'" :error="conflict || ''">
            <Input
              :model-value="expectedRevision"
              :disabled="loading"
              id="v2-expected-revision"
              type="number"
              aria-label="期望版本"
              @update:model-value="emit('update:expectedRevision', Number($event))"
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
            预览修订
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
      </div>

      <div class="search-box">
        <Input
          v-model="searchQuery"
          placeholder="搜索角色、地点、事实规则..."
          size="sm"
        />
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
            <Badge tone="info">角色</Badge>
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
            <Badge tone="neutral">地点</Badge>
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
            <span class="fact-id">{{ fact.factId }}</span>
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
            <span class="rule-id">{{ rule.ruleId }}</span>
          </div>
          <p class="rule-text">{{ rule.text }}</p>
        </article>
      </template>
    </div>
    </template>

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
  font-size: 11px;
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
