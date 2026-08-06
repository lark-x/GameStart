<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useAppStore } from "../stores/app.js";
import { errorMessage, type ApiCharacter, type ApiEvent, type ApiRelationship, type ApiWorld } from "../types";
import type { CharacterRole, StoryMode, TriggerSource } from "../../../../packages/contracts/src/index.ts";

const store = useAppStore();
const worlds = ref<ApiWorld[]>([]);
const characters = ref<ApiCharacter[]>([]);
const relationships = ref<ApiRelationship[]>([]);
const events = ref<ApiEvent[]>([]);
const status = ref("准备加载管理数据……");

const showCreateWorld = ref(true);
const newWorld = ref<{ name: string; storyMode: StoryMode; timezone: string }>({
  name: "",
  storyMode: "DYNAMIC",
  timezone: "Asia/Shanghai",
});

const showCreateCharacter = ref(true);
const newChar = ref<{ displayName: string; role: CharacterRole; timezone: string }>({
  displayName: "",
  role: "AI",
  timezone: "Asia/Shanghai",
});

const newRelationship = ref({
  sourceCharacterId: "",
  targetCharacterId: "",
  relationshipType: "",
  affinity: 0,
  trust: 0,
  conflict: 0,
  dependency: 0,
  isPublic: true,
  isBidirectional: true,
});

const newEvent = ref({
  eventKey: "",
  name: "",
  triggerSource: "MANUAL" as TriggerSource,
  runAt: "",
  targetCharacterId: "",
  enabled: true,
});

async function loadAdmin() {
  status.value = "正在读取……";
  try {
    const wResult = await store.api.getWorlds();
    worlds.value = wResult.data ?? [];
    const world = worlds.value.find((candidate) => candidate.id === store.currentWorldId) ?? worlds.value[0];
    if (world) {
      store.currentWorldId = world.id;
      const cResult = await store.api.getCharacters(world.id);
      characters.value = cResult.data ?? [];
      if (!characters.value.some((character) => character.id === newRelationship.value.sourceCharacterId)) {
        newRelationship.value.sourceCharacterId = characters.value[0]?.id ?? "";
      }
      if (!characters.value.some((character) => character.id === newRelationship.value.targetCharacterId)) {
        newRelationship.value.targetCharacterId = characters.value[1]?.id ?? characters.value[0]?.id ?? "";
      }
      if (!characters.value.some((character) => character.id === newEvent.value.targetCharacterId)) {
        newEvent.value.targetCharacterId = characters.value[0]?.id ?? "";
      }
      relationships.value = (await store.api.getRelationships(world.id)).data ?? [];
      events.value = (await store.api.getWorldEvents(world.id)).data ?? [];
    } else {
      characters.value = [];
      relationships.value = [];
      events.value = [];
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
      ...newWorld.value,
      relationshipDynamicsEnabled: newWorld.value.storyMode === "DYNAMIC",
    });
    newWorld.value = { name: "", storyMode: "DYNAMIC", timezone: "Asia/Shanghai" };
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
      ...newChar.value,
    });
    newChar.value = { displayName: "", role: "AI", timezone: "Asia/Shanghai" };
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
  if (!world || !newEvent.value.targetCharacterId) return;
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
      triggerSource: newEvent.value.triggerSource,
      recurrence: { kind: "ONCE", runAt: runAt.toISOString() },
      targetCharacterIds: [newEvent.value.targetCharacterId],
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
    });
    status.value = "事件已更新。";
    await loadAdmin();
  } catch (e: unknown) {
    status.value = errorMessage(e);
  }
}

onMounted(loadAdmin);
</script>

<template>
  <section class="admin-page"><header class="page-header"><div><p>世界资料室</p><h1>内容管理</h1><span>在这里创建角色、设定关系，并安排这个世界接下来会发生的事。</span></div><div class="header-right"><small id="admin-status">{{ status }}</small><button @click="loadAdmin">刷新</button></div></header>
    <div class="admin-grid">
      <article class="admin-card"><header><span class="card-icon">◇</span><div><h2>故事世界</h2><p>世界的基础设定</p></div><button class="text-button" @click="showCreateWorld=!showCreateWorld">{{showCreateWorld?'收起':'新建'}}</button></header><form id="world-form" v-show="showCreateWorld" @submit.prevent="createWorld" class="entry-form"><input id="world-name" v-model="newWorld.name" required placeholder="世界名称"/><div><select id="world-mode" v-model="newWorld.storyMode"><option value="STATIC">静态剧情</option><option value="DYNAMIC">动态生活</option></select><input id="world-timezone" v-model="newWorld.timezone" placeholder="时区"/></div><button type="submit">创建世界</button></form><div id="admin-worlds-list" class="record-list"><div v-for="w in worlds" :key="w.id"><input name="name" :value="w.name" readonly/><small>{{w.storyMode}} · {{w.timezone}}</small></div></div></article>
      <article class="admin-card"><header><span class="card-icon">◉</span><div><h2>角色档案</h2><p>这个世界的参与者</p></div><button class="text-button" @click="showCreateCharacter=!showCreateCharacter">{{showCreateCharacter?'收起':'新建'}}</button></header><form id="character-form" v-show="showCreateCharacter" @submit.prevent="createCharacter" class="entry-form"><input id="character-name" v-model="newChar.displayName" required placeholder="角色名称"/><div><select id="character-role" v-model="newChar.role"><option value="USER">用户角色</option><option value="AI">AI 角色</option></select><input id="character-timezone" v-model="newChar.timezone" placeholder="时区"/></div><button type="submit">创建角色</button></form><div id="admin-characters-list" class="record-list"><div v-for="c in characters" :key="c.id"><strong>{{c.displayName}}</strong><small>{{c.role}} · {{c.timezone}}</small></div></div></article>
      <article class="admin-card"><header><span class="card-icon">♡</span><div><h2>关系设定</h2><p>人物之间的牵绊</p></div></header><form id="relationship-form" @submit.prevent="createRelationship" class="entry-form"><div><select id="relationship-source" v-model="newRelationship.sourceCharacterId" :disabled="characters.length<2" required><option v-for="c in characters" :key="`source-${c.id}`" :value="c.id">{{c.displayName}}</option></select><select id="relationship-target" v-model="newRelationship.targetCharacterId" :disabled="characters.length<2" required><option v-for="c in characters" :key="`target-${c.id}`" :value="c.id">{{c.displayName}}</option></select></div><input id="relationship-type" v-model="newRelationship.relationshipType" required placeholder="关系类型，例如：青梅竹马"/><div class="numbers"><input v-model.number="newRelationship.affinity" name="affinity" type="number" min="0" max="100" placeholder="好感"/><input v-model.number="newRelationship.trust" name="trust" type="number" min="0" max="100" placeholder="信任"/><input v-model.number="newRelationship.conflict" name="conflict" type="number" min="0" max="100" placeholder="冲突"/><input v-model.number="newRelationship.dependency" name="dependency" type="number" min="0" max="100" placeholder="依赖"/></div><label><input id="relationship-public" v-model="newRelationship.isPublic" type="checkbox"/> 公开</label><label><input id="relationship-bidirectional" v-model="newRelationship.isBidirectional" type="checkbox"/> 双向关系</label><button type="submit" :disabled="characters.length<2">创建关系</button></form><div id="admin-relationships-list" class="record-list"><form v-for="edge in relationships" :key="edge.id" @submit.prevent="updateRelationship(edge)"><input v-model="edge.relationshipType" name="relationshipType" required aria-label="关系类型"/><button type="submit">保存</button></form></div></article>
      <article class="admin-card"><header><span class="card-icon">□</span><div><h2>事件安排</h2><p>为世界写下下一件事</p></div></header><form id="event-form" @submit.prevent="createWorldEvent" class="entry-form"><div><input id="event-key" v-model="newEvent.eventKey" required placeholder="事件 Key"/><input id="event-name" v-model="newEvent.name" required placeholder="事件名称"/></div><div><select id="event-trigger-source" v-model="newEvent.triggerSource"><option value="MANUAL">手动触发</option><option value="WORLD_HOLIDAY">世界节日</option><option value="STORY_NODE">剧情节点</option><option value="BIRTHDAY">生日</option></select><input id="event-run-at" v-model="newEvent.runAt" type="datetime-local" required/></div><div><select id="event-target" v-model="newEvent.targetCharacterId" :disabled="!characters.length" required><option v-for="c in characters" :key="`event-${c.id}`" :value="c.id">{{c.displayName}}</option></select><label><input id="event-enabled" v-model="newEvent.enabled" type="checkbox"/> 启用</label></div><button type="submit" :disabled="!characters.length">创建事件</button></form><div id="admin-events-list" class="record-list"><form v-for="event in events" :key="event.id" @submit.prevent="updateWorldEvent(event)"><input v-model="event.name" name="name" required aria-label="事件名称"/><button type="submit">保存</button></form></div></article>
    </div>
  </section>
</template>
<style scoped>
.admin-page{position:relative;z-index:1;height:100%;overflow:auto;padding:38px 54px;color:#4d433d}.page-header{max-width:1160px;margin:0 auto 27px;display:flex;justify-content:space-between;align-items:end}.page-header p{margin:0 0 6px;color:#b36d57;font-size:11px;font-weight:700;letter-spacing:.16em}.page-header h1{margin:0;color:#463b34;font-size:26px}.page-header>div>span{display:block;margin-top:9px;color:#a29891;font-size:13px}.header-right{display:flex;align-items:center;gap:13px}.header-right small{color:#a79b94;font-size:11px}.header-right>button,.entry-form>button{border:0;border-radius:999px;padding:10px 16px;background:#b96049;color:#fff;font-size:12px;cursor:pointer}.admin-grid{max-width:1160px;margin:auto;display:grid;grid-template-columns:repeat(2,1fr);gap:18px}.admin-card{padding:20px;background:#fffdfa;border:1px solid #eee2da;border-radius:18px;box-shadow:0 10px 28px rgba(119,82,60,.06)}.admin-card>header{display:flex;align-items:center;gap:10px;margin-bottom:16px}.card-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:#f8e6de;color:#b66850;font-size:18px}.admin-card header div{flex:1}.admin-card h2{margin:0;font-size:15px;color:#51443c}.admin-card header p{margin:4px 0 0;color:#a3978e;font-size:10px}.text-button{border:0;background:transparent;color:#b96750;font-size:11px;cursor:pointer}.entry-form{display:grid;gap:9px;padding:13px;border-radius:13px;background:#fbf7f3}.entry-form>div{display:flex;gap:8px}.entry-form input,.entry-form select,.record-list input{min-width:0;width:100%;border:1px solid #e9ddd5;border-radius:9px;background:#fff;color:#62534b;padding:8px;font-size:11px;outline:none}.entry-form select{flex:1}.entry-form input{flex:1}.entry-form label{color:#877870;font-size:10px}.entry-form>button{padding:8px 12px;border-radius:9px;font-size:11px}.entry-form>button:disabled{opacity:.45}.numbers input{text-align:center}.record-list{display:grid;gap:7px;margin-top:12px}.record-list>div,.record-list>form{display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:10px;background:#fdfaf8}.record-list strong{flex:1;font-size:11px}.record-list small{color:#a3968e;font-size:10px}.record-list input[readonly]{border:0;background:transparent;padding:0;font-weight:700}.record-list form input{flex:1}.record-list form button{border:0;border-radius:7px;background:#f4e3da;color:#a75b45;padding:6px 9px;font-size:10px;cursor:pointer}@media(max-width:900px){.admin-grid{grid-template-columns:1fr}.admin-page{padding:30px}}
</style>
