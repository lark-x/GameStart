<script setup lang="ts">
import { ref, watch } from "vue";
import Button from "../components/ui/Button.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import PageHeader from "../components/layout/PageHeader.vue";
import { useAppStore } from "../stores/app.js";
import { errorMessage, type ApiRelationship } from "../types";
const store = useAppStore();
const edges = ref<ApiRelationship[]>([]);
const status = ref("准备加载关系网……");
async function loadRelationships() {
  if (!store.currentWorldId) return;
  status.value = "正在读取关系网……";
  try {
    const result = await store.api.getRelationships(store.currentWorldId);
    edges.value = result.data ?? [];
    status.value = `${edges.value.length} 条关系 · ${store.characters.length} 个角色`;
  } catch (e: unknown) {
    status.value = errorMessage(e);
  }
}
function name(id: string) {
  return (
    store.characters.find((c) => c.id === id)?.displayName ?? id.slice(0, 6)
  );
}
function value(n: number) {
  return `${Math.min(100, Math.max(0, n))}%`;
}
watch(
  () => store.currentWorldId,
  () => void loadRelationships(),
  { immediate: true },
);
</script>
<template>
  <section class="page">
    <PageHeader
      eyebrow="人物档案"
      title="关系与羁绊"
      description="每一段关系，都会在故事里留下痕迹。"
      :status="status"
    >
      <template #actions>
        <Button @click="loadRelationships">刷新</Button>
      </template>
    </PageHeader>
    <div v-if="edges.length" class="page-grid">
      <article v-for="edge in edges" :key="edge.id" class="bond-card">
        <div class="people">
          <div>
            <span class="portrait">{{
              name(edge.sourceCharacterId).slice(0, 1)
            }}</span
            ><strong>{{ name(edge.sourceCharacterId) }}</strong>
          </div>
          <span class="link">{{ edge.isBidirectional ? "↔" : "→" }}</span>
          <div>
            <span class="portrait warm">{{
              name(edge.targetCharacterId).slice(0, 1)
            }}</span
            ><strong>{{ name(edge.targetCharacterId) }}</strong>
          </div>
        </div>
        <div class="bond-tag">{{ edge.relationshipType }}</div>
        <div class="metrics">
          <div>
            <label
              >好感 <b>{{ edge.initialState.affinity }}</b></label
            ><i
              ><em
                class="affinity"
                :style="{ width: value(edge.initialState.affinity) }"
              ></em
            ></i>
          </div>
          <div>
            <label
              >信任 <b>{{ edge.initialState.trust }}</b></label
            ><i
              ><em
                class="trust"
                :style="{ width: value(edge.initialState.trust) }"
              ></em
            ></i>
          </div>
          <div>
            <label
              >冲突 <b>{{ edge.initialState.conflict }}</b></label
            ><i
              ><em
                class="conflict"
                :style="{ width: value(edge.initialState.conflict) }"
              ></em
            ></i>
          </div>
          <div>
            <label
              >依赖 <b>{{ edge.initialState.dependency }}</b></label
            ><i
              ><em
                class="dependency"
                :style="{ width: value(edge.initialState.dependency) }"
              ></em
            ></i>
          </div>
        </div>
        <footer>
          {{ edge.isPublic ? "公开关系" : "私密关系"
          }}<span>{{ edge.isBidirectional ? "双向互动" : "单向牵绊" }}</span>
        </footer>
      </article>
    </div>
    <EmptyState
      title="暂时还没有建立羁绊"
      description="创建角色之间的关系后，会在这里展示。"
      ><template #icon>♡</template></EmptyState
    >
  </section>
</template>
<style scoped>
.bond-card {
  min-width: 0;
  padding: var(--space-5);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
.people {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.people > div {
  display: grid;
  justify-items: center;
  gap: 7px;
  min-width: 72px;
}
.people strong {
  font-size: var(--text-sm);
}
.portrait {
  display: grid;
  place-items: center;
  width: 43px;
  height: 43px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: var(--text-lg);
  font-weight: 700;
}
.portrait.warm {
  background: var(--primary-faint);
}
.link {
  color: var(--primary);
  font-size: 20px;
}
.bond-tag {
  display: table;
  margin: var(--space-4) auto var(--space-4);
  padding: 5px 11px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 700;
}
.metrics {
  display: grid;
  gap: 10px;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
}
.metrics label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
  color: var(--muted);
  font-size: var(--text-xs);
}
.metrics b {
  color: var(--text);
}
.metrics i {
  display: block;
  height: 5px;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: var(--surface-muted);
}
.metrics em {
  display: block;
  height: 100%;
  border-radius: var(--radius-full);
}
.affinity {
  background: #d97d65;
}
.trust {
  background: #a990c5;
}
.conflict {
  background: #d9a26e;
}
.dependency {
  background: #82b2b1;
}
.bond-card footer {
  display: flex;
  justify-content: space-between;
  margin-top: var(--space-4);
  color: var(--faint);
  font-size: var(--text-xs);
}
</style>
