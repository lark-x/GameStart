<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronDown, ChevronUp, MapPin, Plus, Sparkles, User } from "@lucide/vue";
import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import type { V2CharacterSummary, V2LocationSummary, V2WorkspaceSnapshot } from "../../adapters/types.ts";

const props = defineProps<{
  snapshot: V2WorkspaceSnapshot | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  selectCharacter: [char: V2CharacterSummary];
  selectLocation: [loc: V2LocationSummary];
  addCharacter: [];
  addLocation: [];
}>();

const isCollapsed = ref(false);

const characters = computed<readonly V2CharacterSummary[]>(() => props.snapshot?.world.characters ?? []);
const locations = computed<readonly V2LocationSummary[]>(() => props.snapshot?.world.locations ?? []);
const rulesCount = computed<number>(() => (props.snapshot?.world.rules.length ?? 0) + (props.snapshot?.world.facts.length ?? 0));

function characterSceneAppearances(char: V2CharacterSummary): number {
  if (!props.snapshot) return 0;
  let count = 0;
  for (const scene of props.snapshot.sceneGraph.scenes) {
    if (scene.body && (scene.body.includes(char.name) || (char.summary && scene.body.includes(char.summary.slice(0, 10))))) {
      count++;
    }
  }
  return count;
}

const sortedCharacters = computed(() => {
  return [...characters.value].sort((a, b) => {
    return characterSceneAppearances(b) - characterSceneAppearances(a);
  });
});
</script>

<template>
  <section class="story-cast-pool" :class="{ collapsed: isCollapsed }">
    <div class="pool-header">
      <div class="pool-title-group" @click="isCollapsed = !isCollapsed">
        <div class="pool-icon-wrap">
          <Sparkles :size="16" />
        </div>
        <div class="pool-title-text">
          <span class="pool-kicker">正典世界资源池</span>
          <h4>参演角色与舞台资产 ({{ characters.length }}位角色 · {{ locations.length }}处地点)</h4>
        </div>
        <Badge tone="neutral">{{ characters.length }} 角色</Badge>
        <Badge tone="info">{{ locations.length }} 地点</Badge>
        <Badge v-if="rulesCount > 0" tone="warning">{{ rulesCount }} 规则事实</Badge>
      </div>

      <div class="pool-actions">
        <Button variant="ghost" size="sm" @click="emit('addCharacter')">
          <Plus :size="14" /> 新增角色
        </Button>
        <Button variant="ghost" size="sm" @click="emit('addLocation')">
          <Plus :size="14" /> 新增地点
        </Button>
        <Button
          variant="ghost"
          size="icon"
          :aria-label="isCollapsed ? '展开资产池' : '收起资产池'"
          :title="isCollapsed ? '展开资产池' : '收起资产池'"
          @click="isCollapsed = !isCollapsed"
        >
          <ChevronUp v-if="!isCollapsed" :size="16" />
          <ChevronDown v-else :size="16" />
        </Button>
      </div>
    </div>

    <div v-show="!isCollapsed" class="pool-body">
      <div class="pool-row">
        <div class="pool-row-label">
          <User :size="13" />
          <span>参演角色库</span>
        </div>
        <div v-if="sortedCharacters.length > 0" class="character-chips-scroll">
          <button
            v-for="char in sortedCharacters"
            :key="char.characterId"
            type="button"
            class="character-chip"
            :title="char.personaText || char.summary || char.name"
            @click="emit('selectCharacter', char)"
          >
            <div class="chip-avatar">
              {{ char.name.slice(0, 1) }}
            </div>
            <div class="chip-info">
              <span class="chip-name">{{ char.name }}</span>
              <small v-if="characterSceneAppearances(char) > 0" class="chip-appearances">
                {{ characterSceneAppearances(char) }} 幕参演
              </small>
              <small v-else class="chip-unassigned">未入剧幕</small>
            </div>
          </button>
        </div>
        <div v-else class="pool-empty-hint">
          <span>暂无角色，点击右上角「+ 新增角色」添加。</span>
        </div>
      </div>

      <div v-if="locations.length > 0" class="pool-row locations-row">
        <div class="pool-row-label">
          <MapPin :size="13" />
          <span>主要舞台</span>
        </div>
        <div class="location-chips-scroll">
          <button
            v-for="loc in locations"
            :key="loc.locationId"
            type="button"
            class="location-chip"
            :title="loc.summary || loc.name"
            @click="emit('selectLocation', loc)"
          >
            <MapPin :size="12" class="chip-loc-icon" />
            <span class="chip-loc-name">{{ loc.name }}</span>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.story-cast-pool {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  transition: all var(--motion-normal);
}

.story-cast-pool.collapsed {
  padding: var(--space-2) var(--space-4);
}

.pool-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.pool-title-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  user-select: none;
}

.pool-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary);
}

.pool-title-text {
  display: flex;
  flex-direction: column;
}

.pool-kicker {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--primary);
}

.pool-title-text h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-strong);
}

.pool-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.pool-body {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-2);
  border-top: 1px solid var(--border);
}

.pool-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.pool-row-label {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  width: 90px;
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
}

.character-chips-scroll,
.location-chips-scroll {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  overflow-x: auto;
  min-width: 0;
  padding-bottom: 2px;
  scrollbar-width: thin;
}

.character-chip {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 10px 4px 6px;
  border-radius: var(--radius-full);
  background: var(--surface-soft);
  border: 1px solid var(--border);
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--motion-fast);
}

.character-chip:hover {
  border-color: var(--primary);
  background: var(--primary-soft);
  transform: translateY(-1px);
}

.chip-avatar {
  width: 22px;
  height: 22px;
  border-radius: var(--radius-full);
  background: var(--primary);
  color: var(--on-primary, #fff);
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chip-info {
  display: flex;
  align-items: baseline;
  gap: 5px;
}

.chip-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-strong);
}

.chip-appearances {
  font-size: 10px;
  color: var(--primary);
  font-weight: 700;
}

.chip-unassigned {
  font-size: 10px;
  color: var(--muted);
}

.location-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
  border: 1px solid var(--border);
  font-size: 11px;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
  flex-shrink: 0;
  transition: all var(--motion-fast);
}

.location-chip:hover {
  border-color: var(--primary);
  background: var(--surface);
}

.chip-loc-icon {
  color: var(--muted);
}

.pool-empty-hint {
  font-size: 12px;
  color: var(--muted);
}
</style>
