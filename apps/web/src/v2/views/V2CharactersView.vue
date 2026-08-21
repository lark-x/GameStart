<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "../../components/ui/Button.vue";
import { useV2WorkspaceStore } from "../stores/workspace";

const route = useRoute();
const router = useRouter();
const store = useV2WorkspaceStore();
const activeTab = ref("overview");
const character = computed(() => store.snapshot?.world.characters.find((item) => item.characterId === route.params.characterId));
const tabs = ["overview", "persona", "relationships", "visual", "memory", "state", "events", "usage"] as const;
const traces = ref<readonly { task: string; contextHash: string; sources: readonly { path: string; reason: string; tokens: number }[]; omittedSources: readonly { path: string; reason: string; tokens: number }[] }[]>([]);
const relationships = ref<readonly Record<string, unknown>[]>([]);
const visualVariants = ref<readonly Record<string, unknown>[]>([]);
const stateDefinitions = ref<readonly Record<string, unknown>[]>([]);
const events = ref<readonly Record<string, unknown>[]>([]);
onMounted(async () => {
  const worldId = store.snapshot?.world.storyWorldId;
  if (!worldId) return;
  try {
    const base = `/api/v2/worlds/${encodeURIComponent(worldId)}/characters/${encodeURIComponent(String(route.params.characterId))}`;
    const [response, relationshipResponse, visualResponse, stateResponse, eventResponse] = await Promise.all([
      fetch(`/api/v2/worlds/${encodeURIComponent(worldId)}/character-context-traces`), fetch(`${base}/relationships`), fetch(`${base}/visual-variants`), fetch(`${base}/state-definitions`), fetch(`${base}/events`),
    ]);
    if (response.ok) traces.value = (await response.json() as { traces?: typeof traces.value }).traces ?? [];
    if (relationshipResponse.ok) relationships.value = (await relationshipResponse.json() as { relationships?: readonly Record<string, unknown>[] }).relationships ?? [];
    if (visualResponse.ok) visualVariants.value = (await visualResponse.json() as { variants?: readonly Record<string, unknown>[] }).variants ?? [];
    if (stateResponse.ok) stateDefinitions.value = (await stateResponse.json() as { definitions?: readonly Record<string, unknown>[] }).definitions ?? [];
    if (eventResponse.ok) events.value = (await eventResponse.json() as { events?: readonly Record<string, unknown>[] }).events ?? [];
  } catch { /* usage remains available when the API is offline */ }
});
const relevantTraces = computed(() => traces.value.filter((trace) => trace.sources.some((source) => source.path.includes("character"))));
function participantCount(item: Record<string, unknown>): number { return Array.isArray(item.participantCharacterIds) ? item.participantCharacterIds.length : 0; }
</script>

<template>
  <main class="character-center" aria-labelledby="character-center-title">
    <header class="character-header">
      <div class="portrait" aria-hidden="true">{{ character?.name?.slice(0, 1) ?? "?" }}</div>
      <div>
        <p class="eyebrow">角色中心</p>
        <h1 id="character-center-title">{{ character?.name ?? "未找到角色" }}</h1>
        <p class="muted">{{ character?.summary ?? "结构化人格、关系、视觉与运行态的统一入口" }}</p>
      </div>
      <div class="actions">
        <Button size="sm" variant="secondary" @click="router.push('/v2/chat')">聊天</Button>
        <Button size="sm" variant="secondary" @click="router.push('/v2/workspace/comfy-request')">生成图片</Button>
        <Button size="sm" variant="primary" @click="router.push({ path: '/v2/workspace/world', query: { tab: 'characters' } })">编辑</Button>
      </div>
    </header>
    <nav class="tabs" aria-label="角色中心标签">
      <button v-for="tab in tabs" :key="tab" :class="{ active: activeTab === tab }" type="button" @click="activeTab = tab">{{ tab }}</button>
    </nav>
    <section class="panel">
      <template v-if="character">
        <h2>{{ activeTab }}</h2>
        <p v-if="activeTab === 'overview'">{{ character.summary || "暂无简介" }}</p>
        <dl v-else-if="activeTab === 'persona'"><dt>身份</dt><dd>{{ character.profile?.identity || "暂无" }}</dd><dt>别名 / 标签</dt><dd>{{ [...(character.profile?.aliases ?? []), ...(character.profile?.tags ?? [])].join("、") || "暂无" }}</dd><dt>特质</dt><dd>{{ character.profile?.persona.traits.join("、") || "暂无" }}</dd><dt>说话风格</dt><dd>{{ character.profile?.persona.speechStyle || character.personaText || "暂无" }}</dd></dl>
        <div v-else-if="activeTab === 'relationships'"><p v-if="relationships.length === 0">暂无正式关系。</p><ul v-else><li v-for="item in relationships" :key="String(item.relationshipId)">{{ item.fromCharacterId }} → {{ item.toCharacterId }} · {{ item.type }} · {{ item.strength }}</li></ul></div>
        <div v-else-if="activeTab === 'visual'"><p v-if="visualVariants.length === 0">暂无视觉变体。</p><ul v-else><li v-for="item in visualVariants" :key="String(item.visualVariantId)">{{ item.name }}<span v-if="item.isDefault"> · 默认</span></li></ul></div>
        <div v-else-if="activeTab === 'state'"><p v-if="stateDefinitions.length === 0">暂无角色状态定义。</p><ul v-else><li v-for="item in stateDefinitions" :key="String(item.stateDefinitionId)">{{ item.key }} · {{ item.valueType }} · 默认 {{ item.defaultValue }}</li></ul></div>
        <div v-else-if="activeTab === 'events'"><p v-if="events.length === 0">暂无事件定义。</p><ul v-else><li v-for="item in events" :key="String(item.eventDefinitionId)">{{ item.name }} · {{ participantCount(item) }} 位参与者</li></ul></div>
        <div v-else-if="activeTab === 'usage'">
          <p v-if="relevantTraces.length === 0">暂无调用记录；角色字段会在 Chat、Story、Image 和 Release 使用时写入 Context Trace。</p>
          <ul v-else><li v-for="trace in relevantTraces" :key="trace.contextHash"><strong>{{ trace.task }}</strong> · {{ trace.contextHash.slice(0, 12) }}<span v-for="source in trace.sources" :key="source.path"> {{ source.path }}（{{ source.reason }}，{{ source.tokens }} tokens）</span><small v-if="trace.omittedSources.length">；省略 {{ trace.omittedSources.length }} 项</small></li></ul>
        </div>
        <p v-else>该模块已接入角色聚合边界，详细数据将在对应资产建立后显示。</p>
      </template>
      <p v-else role="alert">角色不存在或尚未加载。</p>
    </section>
  </main>
</template>

<style scoped>
.character-center { max-width: 1100px; margin: 0 auto; padding: var(--space-6); }
.character-header { display: flex; gap: var(--space-4); align-items: center; flex-wrap: wrap; }
.portrait { width: 72px; height: 72px; border-radius: 18px; display: grid; place-items: center; background: var(--color-accent-soft); color: var(--color-accent-strong); font-size: 2rem; font-weight: 700; }
.eyebrow { margin: 0; color: var(--color-text-secondary); font-size: .8rem; }
h1 { margin: 0; }
.muted { color: var(--color-text-secondary); }
.actions { margin-left: auto; display: flex; gap: var(--space-2); }
.tabs { display: flex; gap: var(--space-1); overflow-x: auto; border-bottom: 1px solid var(--color-border); margin-top: var(--space-6); }
.tabs button { border: 0; background: transparent; padding: .7rem .9rem; color: var(--color-text-secondary); cursor: pointer; white-space: nowrap; }
.tabs button.active { color: var(--color-accent-strong); border-bottom: 2px solid var(--color-accent-strong); }
.panel { margin-top: var(--space-5); padding: var(--space-5); border: 1px solid var(--color-border); border-radius: 16px; background: var(--color-surface); min-height: 220px; }
dt { font-weight: 600; } dd { white-space: pre-wrap; color: var(--color-text-secondary); }
</style>
