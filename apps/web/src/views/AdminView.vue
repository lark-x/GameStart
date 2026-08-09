<script setup lang="ts">
import { ref, onMounted } from "vue";
import Button from "../components/ui/Button.vue";
import Input from "../components/ui/Input.vue";
import Select from "../components/ui/Select.vue";
import PageHeader from "../components/layout/PageHeader.vue";
import { useAppStore } from "../stores/app.js";
import {
  errorMessage,
  type ApiCharacter,
  type ApiEvent,
  type ApiRelationship,
  type ApiWorldLore,
  type ApiWorld,
} from "../types";
import type {
  CharacterRole,
  StoryMode,
  TriggerSource,
} from "../../../../packages/contracts/src/index.ts";

const store = useAppStore();
const worlds = ref<ApiWorld[]>([]);
const characters = ref<ApiCharacter[]>([]);
const relationships = ref<ApiRelationship[]>([]);
const events = ref<ApiEvent[]>([]);
const loreEntries = ref<ApiWorldLore[]>([]);
const loreQuery = ref("");
const showCreateLore = ref(true);
const status = ref("准备加载管理数据……");

const showCreateWorld = ref(true);
const newWorld = ref({
  name: "",
  storyMode: "DYNAMIC",
  timezone: "Asia/Shanghai",
});

const showCreateCharacter = ref(true);
const newChar = ref({
  displayName: "",
  role: "AI",
  timezone: "Asia/Shanghai",
  personaPrompt: "",
});

const newRelationship = ref({
  sourceCharacterId: "",
  targetCharacterId: "",
  relationshipType: "",
  affinity: 0 as number | string,
  trust: 0 as number | string,
  conflict: 0 as number | string,
  dependency: 0 as number | string,
  isPublic: true,
  isBidirectional: true,
});

const newEvent = ref({
  eventKey: "",
  name: "",
  triggerSource: "MANUAL",
  runAt: "",
  targetCharacterId: "",
  recipientCharacterId: "",
  sendMessage: true,
  publishMoment: false,
  generateImage: false,
  enabled: true,
});

const newLore = ref({
  category: "General",
  title: "",
  content: "",
  tags: "",
  isEnabled: true,
});

function selectedWorld() {
  return worlds.value.find((world) => world.id === store.currentWorldId) ?? worlds.value[0];
}

function parseLoreTags(tags: string) {
  return [...new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))];
}

function loreTags(entry: ApiWorldLore) {
  return entry.tags.join(", ");
}

function setLoreTags(entry: ApiWorldLore, tags: string) {
  entry.tags = parseLoreTags(tags);
}

async function loadWorldLore() {
  const world = selectedWorld();
  if (!world) {
    loreEntries.value = [];
    return;
  }
  loreEntries.value = (await store.api.getWorldLore(world.id, loreQuery.value)).data ?? [];
}

async function loadAdmin() {
  status.value = "正在读取……";
  try {
    const wResult = await store.api.getWorlds();
    worlds.value = wResult.data ?? [];
    const world =
      worlds.value.find((candidate) => candidate.id === store.currentWorldId) ??
      worlds.value[0];
    if (world) {
      store.currentWorldId = world.id;
      const cResult = await store.api.getCharacters(world.id);
      characters.value = cResult.data ?? [];
      if (
        !characters.value.some(
          (character) =>
            character.id === newRelationship.value.sourceCharacterId,
        )
      ) {
        newRelationship.value.sourceCharacterId = characters.value[0]?.id ?? "";
      }
      if (
        !characters.value.some(
          (character) =>
            character.id === newRelationship.value.targetCharacterId,
        )
      ) {
        newRelationship.value.targetCharacterId =
          characters.value[1]?.id ?? characters.value[0]?.id ?? "";
      }
      if (
        !characters.value.some(
          (character) => character.id === newEvent.value.targetCharacterId,
        )
      ) {
        newEvent.value.targetCharacterId = characters.value[0]?.id ?? "";
      }
      if (!characters.value.some((character) => character.id === newEvent.value.recipientCharacterId)) {
        newEvent.value.recipientCharacterId = newEvent.value.targetCharacterId;
      }
      relationships.value =
        (await store.api.getRelationships(world.id)).data ?? [];
      events.value = (await store.api.getWorldEvents(world.id)).data ?? [];
      await loadWorldLore();
    } else {
      characters.value = [];
      relationships.value = [];
      events.value = [];
      loreEntries.value = [];
    }
    status.value = `${worlds.value.length} 个世界，${characters.value.length} 个角色，${relationships.value.length} 条关系，${events.value.length} 个事件`;
  } catch (e: unknown) {
    status.value = errorMessage(e);
  }
}

async function createWorld() {
  try {
    await store.api.createStoryWorld({
      id: `world-${crypto.randomUUID()}`,
      name: newWorld.value.name,
      storyMode: newWorld.value.storyMode as StoryMode,
      timezone: newWorld.value.timezone,
      relationshipDynamicsEnabled: newWorld.value.storyMode === "DYNAMIC",
    });
    newWorld.value = {
      name: "",
      storyMode: "DYNAMIC",
      timezone: "Asia/Shanghai",
    };
    await loadAdmin();
  } catch (e: unknown) {
    status.value = errorMessage(e);
  }
}

async function createCharacter() {
  const world = worlds.value[0];
  if (!world) return;
  try {
    await store.api.createCharacter({
      id: `char-${crypto.randomUUID()}`,
      storyWorldId: world.id,
      displayName: newChar.value.displayName,
      role: newChar.value.role as CharacterRole,
      timezone: newChar.value.timezone,
      ...(newChar.value.personaPrompt.trim() ? { personaPrompt: newChar.value.personaPrompt.trim() } : {}),
    });
    newChar.value = { displayName: "", role: "AI", timezone: "Asia/Shanghai", personaPrompt: "" };
    await loadAdmin();
  } catch (e: unknown) {
    status.value = errorMessage(e);
  }
}

async function createRelationship() {
  const world = worlds.value[0];
  if (!world || characters.value.length < 2) return;
  try {
    await store.api.createRelationship({
      id: `relationship-${crypto.randomUUID()}`,
      storyWorldId: world.id,
      sourceCharacterId: newRelationship.value.sourceCharacterId,
      targetCharacterId: newRelationship.value.targetCharacterId,
      relationshipType: newRelationship.value.relationshipType,
      initialState: {
        affinity: Number(newRelationship.value.affinity),
        trust: Number(newRelationship.value.trust),
        conflict: Number(newRelationship.value.conflict),
        dependency: Number(newRelationship.value.dependency),
      },
      isPublic: newRelationship.value.isPublic,
      isBidirectional: newRelationship.value.isBidirectional,
    });
    newRelationship.value.relationshipType = "";
    status.value = "关系已创建。";
    await loadAdmin();
  } catch (e: unknown) {
    status.value = errorMessage(e);
  }
}

async function createWorldEvent() {
  const world = worlds.value[0];
  if (!world || !newEvent.value.targetCharacterId || !newEvent.value.recipientCharacterId) return;
  const runAt = new Date(newEvent.value.runAt);
  if (Number.isNaN(runAt.getTime())) {
    status.value = "请选择有效执行时间。";
    return;
  }
  try {
    await store.api.createWorldEvent({
      id: `event-${crypto.randomUUID()}`,
      storyWorldId: world.id,
      eventKey: newEvent.value.eventKey,
      name: newEvent.value.name,
      triggerSource: newEvent.value.triggerSource as TriggerSource,
      recurrence: { kind: "ONCE", runAt: runAt.toISOString() },
      targetCharacterIds: [newEvent.value.targetCharacterId],
      recipientCharacterIds: [newEvent.value.recipientCharacterId],
      outputs: {
        sendMessage: newEvent.value.sendMessage,
        publishMoment: newEvent.value.publishMoment,
        generateImage: newEvent.value.generateImage,
      },
      enabled: newEvent.value.enabled,
      createdAt: new Date().toISOString(),
    });
    newEvent.value.eventKey = "";
    newEvent.value.name = "";
    newEvent.value.runAt = "";
    status.value = "事件已创建。";
    await loadAdmin();
  } catch (e: unknown) {
    status.value = errorMessage(e);
  }
}

async function updateRelationship(edge: ApiRelationship) {
  try {
    await store.api.updateRelationship(edge.id, {
      relationshipType: edge.relationshipType,
      isPublic: edge.isPublic,
    });
    status.value = "关系已更新。";
    await loadAdmin();
  } catch (e: unknown) {
    status.value = errorMessage(e);
  }
}

async function updateWorldEvent(event: ApiEvent) {
  try {
    await store.api.updateWorldEvent(event.id, {
      name: event.name,
      enabled: event.enabled,
      outputs: event.outputs,
    });
    status.value = "事件已更新。";
    await loadAdmin();
  } catch (e: unknown) {
    status.value = errorMessage(e);
  }
}

async function createWorldLore() {
  const world = selectedWorld();
  if (!world) return;
  try {
    await store.api.createWorldLore({
      id: `lore-${crypto.randomUUID()}`,
      storyWorldId: world.id,
      category: newLore.value.category.trim(),
      title: newLore.value.title.trim(),
      content: newLore.value.content.trim(),
      tags: parseLoreTags(newLore.value.tags),
      isEnabled: newLore.value.isEnabled,
    });
    newLore.value = { category: "General", title: "", content: "", tags: "", isEnabled: true };
    await loadWorldLore();
    status.value = "World lore created.";
  } catch (e: unknown) {
    status.value = errorMessage(e);
  }
}

async function updateWorldLore(entry: ApiWorldLore) {
  try {
    await store.api.updateWorldLore(entry.id, {
      category: entry.category.trim(),
      title: entry.title.trim(),
      content: entry.content.trim(),
      tags: [...entry.tags],
      isEnabled: entry.isEnabled,
    });
    await loadWorldLore();
    status.value = "World lore updated.";
  } catch (e: unknown) {
    status.value = errorMessage(e);
  }
}

async function deleteWorldLore(entry: ApiWorldLore) {
  try {
    await store.api.deleteWorldLore(entry.id);
    await loadWorldLore();
    status.value = "World lore deleted.";
  } catch (e: unknown) {
    status.value = errorMessage(e);
  }
}

onMounted(loadAdmin);
</script>

<template>
  <section class="page">
    <PageHeader
      eyebrow="世界资料室"
      title="内容管理"
      description="在这里创建角色、设定关系，并安排这个世界接下来会发生的事。"
      :status="status"
    >
      <template #actions>
        <Button variant="secondary" @click="loadAdmin">刷新</Button>
      </template>
    </PageHeader>
    <div class="page-grid page-grid-wide">
      <article class="admin-card">
        <header>
          <span class="card-icon">◇</span>
          <div>
            <h2>故事世界</h2>
            <p>世界的基础设定</p>
          </div>
          <Button
            variant="link"
            size="sm"
            @click="showCreateWorld = !showCreateWorld"
          >
            {{ showCreateWorld ? "收起" : "新建" }}
          </Button>
        </header>
        <form
          id="world-form"
          v-show="showCreateWorld"
          @submit.prevent="createWorld"
          class="entry-form"
        >
          <Input
            id="world-name"
            v-model="newWorld.name"
            required
            placeholder="世界名称"
          />
          <div>
            <Select id="world-mode" v-model="newWorld.storyMode">
              <option value="STATIC">静态剧情</option>
              <option value="DYNAMIC">动态生活</option></Select
            ><Input
              id="world-timezone"
              v-model="newWorld.timezone"
              placeholder="时区"
            />
          </div>
          <Button type="submit">创建世界</Button>
        </form>
        <div id="admin-worlds-list" class="record-list">
          <div v-for="w in worlds" :key="w.id">
            <Input name="name" :model-value="w.name" readonly /><small
              >{{ w.storyMode }} · {{ w.timezone }}</small
            >
          </div>
        </div>
      </article>
      <article class="admin-card">
        <header>
          <span class="card-icon">◉</span>
          <div>
            <h2>角色档案</h2>
            <p>这个世界的参与者</p>
          </div>
          <Button
            variant="link"
            size="sm"
            @click="showCreateCharacter = !showCreateCharacter"
          >
            {{ showCreateCharacter ? "收起" : "新建" }}
          </Button>
        </header>
        <form
          id="character-form"
          v-show="showCreateCharacter"
          @submit.prevent="createCharacter"
          class="entry-form"
        >
          <Input
            id="character-name"
            v-model="newChar.displayName"
            required
            placeholder="角色名称"
          />
          <div>
            <Select id="character-role" v-model="newChar.role">
              <option value="USER">用户角色</option>
              <option value="AI">AI 角色</option></Select
            ><Input
              id="character-timezone"
              v-model="newChar.timezone"
              placeholder="时区"
            />
          </div>
          <Button type="submit">创建角色</Button>
        </form>
        <div id="admin-characters-list" class="record-list">
          <div v-for="c in characters" :key="c.id">
            <strong>{{ c.displayName }}</strong
            ><small>{{ c.role }} · {{ c.timezone }}</small>
          </div>
        </div>
      </article>
      <article class="admin-card">
        <header>
          <span class="card-icon">♡</span>
          <div>
            <h2>关系设定</h2>
            <p>人物之间的牵绊</p>
          </div>
        </header>
        <form
          id="relationship-form"
          @submit.prevent="createRelationship"
          class="entry-form"
        >
          <div>
            <Select
              id="relationship-source"
              v-model="newRelationship.sourceCharacterId"
              :disabled="characters.length < 2"
              required
            >
              <option
                v-for="c in characters"
                :key="`source-${c.id}`"
                :value="c.id"
              >
                {{ c.displayName }}
              </option></Select
            ><Select
              id="relationship-target"
              v-model="newRelationship.targetCharacterId"
              :disabled="characters.length < 2"
              required
            >
              <option
                v-for="c in characters"
                :key="`target-${c.id}`"
                :value="c.id"
              >
                {{ c.displayName }}
              </option>
            </Select>
          </div>
          <Input
            id="relationship-type"
            v-model="newRelationship.relationshipType"
            required
            placeholder="关系类型，例如：青梅竹马"
          />
          <div class="numbers">
            <Input
              v-model="newRelationship.affinity"
              name="affinity"
              type="number"
              min="0"
              max="100"
              placeholder="好感"
            /><Input
              v-model="newRelationship.trust"
              name="trust"
              type="number"
              min="0"
              max="100"
              placeholder="信任"
            /><Input
              v-model="newRelationship.conflict"
              name="conflict"
              type="number"
              min="0"
              max="100"
              placeholder="冲突"
            /><Input
              v-model="newRelationship.dependency"
              name="dependency"
              type="number"
              min="0"
              max="100"
              placeholder="依赖"
            />
          </div>
          <label
            ><input
              id="relationship-public"
              v-model="newRelationship.isPublic"
              type="checkbox"
              class="ui-check"
            />
            公开</label
          ><label
            ><input
              id="relationship-bidirectional"
              v-model="newRelationship.isBidirectional"
              type="checkbox"
              class="ui-check"
            />
            双向关系</label
          ><Button type="submit" :disabled="characters.length < 2">
            创建关系
          </Button>
        </form>
        <div id="admin-relationships-list" class="record-list">
          <form
            v-for="edge in relationships"
            :key="edge.id"
            @submit.prevent="updateRelationship(edge)"
          >
            <Input
              v-model="edge.relationshipType"
              name="relationshipType"
              required
              aria-label="关系类型"
            /><Button type="submit" variant="secondary" size="sm">保存</Button>
          </form>
        </div>
      </article>
      <article class="admin-card">
        <header>
          <span class="card-icon">□</span>
          <div>
            <h2>事件安排</h2>
            <p>为世界写下下一件事</p>
          </div>
        </header>
        <form
          id="event-form"
          @submit.prevent="createWorldEvent"
          class="entry-form"
        >
          <div>
            <Input
              id="event-key"
              v-model="newEvent.eventKey"
              required
              placeholder="事件 Key"
            /><Input
              id="event-name"
              v-model="newEvent.name"
              required
              placeholder="事件名称"
            />
          </div>
          <div>
            <Select id="event-trigger-source" v-model="newEvent.triggerSource">
              <option value="MANUAL">手动触发</option>
              <option value="WORLD_HOLIDAY">世界节日</option>
              <option value="STORY_NODE">剧情节点</option>
              <option value="BIRTHDAY">生日</option></Select
            ><Input
              id="event-run-at"
              v-model="newEvent.runAt"
              type="datetime-local"
              required
            />
          </div>
          <div>
            <Select
              id="event-target"
              v-model="newEvent.targetCharacterId"
              :disabled="!characters.length"
              required
            >
              <option
                v-for="c in characters"
                :key="`event-${c.id}`"
                :value="c.id"
              >
                {{ c.displayName }}
              </option></Select
            ><Select id="event-recipient" v-model="newEvent.recipientCharacterId" :disabled="!characters.length" required>
              <option v-for="c in characters" :key="`event-recipient-${c.id}`" :value="c.id">{{ c.displayName }}</option>
            </Select
            ><label
              ><input
                id="event-enabled"
                v-model="newEvent.enabled"
                type="checkbox"
                class="ui-check"
              />
              启用</label
            >
          </div>
          <div class="event-output-options">
            <label><input v-model="newEvent.sendMessage" type="checkbox" class="ui-check" /> 发送消息</label>
            <label><input v-model="newEvent.publishMoment" type="checkbox" class="ui-check" /> 发布动态</label>
            <label><input v-model="newEvent.generateImage" type="checkbox" class="ui-check" /> 生成图片</label>
          </div>
          <Button type="submit" :disabled="!characters.length">创建事件</Button>
        </form>
        <div id="admin-events-list" class="record-list">
          <form
            v-for="event in events"
            :key="event.id"
            @submit.prevent="updateWorldEvent(event)"
          >
            <Input
              v-model="event.name"
              name="name"
              required
              aria-label="事件名称"
            /><Button type="submit" variant="secondary" size="sm">保存</Button>
          </form>
        </div>
      </article>
      <article class="admin-card lore-card">
        <header>
          <span class="card-icon">◆</span>
          <div>
            <h2>World lore</h2>
            <p>Reusable setting, facts, and terminology for this world.</p>
          </div>
          <Button variant="link" size="sm" @click="showCreateLore = !showCreateLore">
            {{ showCreateLore ? "Collapse" : "New entry" }}
          </Button>
        </header>
        <div class="lore-toolbar">
          <Select v-model="store.currentWorldId" aria-label="World lore world" @update:model-value="loadAdmin">
            <option v-for="world in worlds" :key="world.id" :value="world.id">{{ world.name }}</option>
          </Select>
          <form class="lore-search" @submit.prevent="loadWorldLore">
            <Input v-model="loreQuery" placeholder="Search title, content, or tags" aria-label="Search world lore" />
            <Button type="submit" variant="secondary" size="sm">Search</Button>
          </form>
        </div>
        <form v-show="showCreateLore" class="entry-form lore-form" @submit.prevent="createWorldLore">
          <div>
            <Input v-model="newLore.category" required placeholder="Category (for example: Location)" />
            <Input v-model="newLore.title" required placeholder="Title" />
          </div>
          <textarea v-model="newLore.content" class="lore-textarea" required rows="4" placeholder="World-lore content" />
          <div>
            <Input v-model="newLore.tags" placeholder="Tags, separated with commas" />
            <label><input v-model="newLore.isEnabled" type="checkbox" class="ui-check" /> Enabled</label>
          </div>
          <Button type="submit" :disabled="!selectedWorld()">Create entry</Button>
        </form>
        <div class="record-list lore-list">
          <form v-for="entry in loreEntries" :key="entry.id" class="lore-entry" @submit.prevent="updateWorldLore(entry)">
            <div class="lore-entry-head">
              <Input v-model="entry.category" required aria-label="Category" />
              <Input v-model="entry.title" required aria-label="Title" />
              <label><input v-model="entry.isEnabled" type="checkbox" class="ui-check" /> Enabled</label>
            </div>
            <textarea v-model="entry.content" class="lore-textarea" required rows="4" aria-label="Content" />
            <div class="lore-entry-actions">
              <Input :model-value="loreTags(entry)" placeholder="Tags, separated with commas" aria-label="Tags" @update:model-value="setLoreTags(entry, $event)" />
              <Button type="submit" variant="secondary" size="sm">Save</Button>
              <Button type="button" variant="danger" size="sm" @click="deleteWorldLore(entry)">Delete</Button>
            </div>
          </form>
          <p v-if="!loreEntries.length" class="lore-empty">No world-lore entries match this view.</p>
        </div>
      </article>
    </div>
  </section>
</template>
<style scoped>
.admin-card {
  min-width: 0;
  padding: var(--space-5);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
.admin-card > header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: var(--space-4);
}
.card-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-md);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 18px;
}
.admin-card header div {
  flex: 1;
  min-width: 0;
}
.admin-card h2 {
  font-size: var(--text-lg);
  color: var(--text-strong);
}
.admin-card header p {
  margin-top: 4px;
  color: var(--muted);
  font-size: var(--text-xs);
}
.entry-form {
  display: grid;
  gap: 9px;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
}
.entry-form > div {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.entry-form > div > * {
  flex: 1;
  min-width: 0;
}
.entry-form label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--muted);
  font-size: var(--text-sm);
}
.numbers :deep(.ui-input) {
  text-align: center;
}
.record-list {
  display: grid;
  gap: 7px;
  margin-top: var(--space-3);
}
.record-list > div,
.record-list > form {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
}
.record-list strong {
  flex: 1;
  font-size: var(--text-sm);
}
.record-list small {
  color: var(--muted);
  font-size: var(--text-xs);
  white-space: nowrap;
}
.record-list :deep(.ui-input[readonly]) {
  border-color: transparent;
  background: transparent;
  font-weight: 700;
}
.lore-toolbar,
.lore-search,
.lore-entry-head,
.lore-entry-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.lore-toolbar {
  margin-bottom: var(--space-3);
}
.lore-toolbar > :first-child,
.lore-search,
.lore-entry-head > :nth-child(2),
.lore-entry-actions > :first-child {
  flex: 1;
  min-width: 0;
}
.lore-form {
  margin-bottom: var(--space-3);
}
.lore-entry {
  display: grid !important;
  align-items: stretch !important;
  gap: var(--space-2) !important;
}
.lore-entry-head label,
.lore-entry-actions label {
  flex: none;
  white-space: nowrap;
}
.lore-textarea {
  width: 100%;
  resize: vertical;
  min-height: 88px;
  padding: 10px 12px;
  color: var(--text);
  font: inherit;
  line-height: 1.55;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.lore-textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}
.lore-empty {
  padding: var(--space-3);
  color: var(--muted);
  font-size: var(--text-sm);
  text-align: center;
}
@media (max-width: 767px) {
  .entry-form > div {
    display: grid;
    grid-template-columns: 1fr;
  }
  .numbers {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .lore-toolbar,
  .lore-search,
  .lore-entry-head,
  .lore-entry-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
