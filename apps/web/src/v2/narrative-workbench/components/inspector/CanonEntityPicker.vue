<script setup lang="ts">
import { computed, ref } from "vue";
import { Search, User, MapPin, BookOpen, X, Check } from "@lucide/vue";
import type { V2CharacterSummary, V2LocationSummary } from "../../../adapters/types.ts";
import type { V2NarrativeLoreItem } from "@living-network/contracts/v2";

export type EntityType = "character" | "location" | "lore";

export interface EntityOption {
  id: string;
  type: EntityType;
  title: string;
  subtitle?: string;
  avatarUrl?: string;
}

const props = defineProps<{
  type: EntityType;
  title?: string;
  characters?: readonly V2CharacterSummary[];
  locations?: readonly V2LocationSummary[];
  loreItems?: readonly V2NarrativeLoreItem[];
  selectedIds?: readonly string[];
}>();

const emit = defineEmits<{
  select: [id: string];
  close: [];
}>();

const searchQuery = ref("");

const allOptions = computed<EntityOption[]>(() => {
  if (props.type === "character" && props.characters) {
    return props.characters.map((c) => ({
      id: c.characterId,
      type: "character" as const,
      title: c.name,
      subtitle: c.tagline || c.summary || c.characterId,
      avatarUrl: c.avatarUrl,
    }));
  }
  if (props.type === "location" && props.locations) {
    return props.locations.map((l) => ({
      id: l.locationId,
      type: "location" as const,
      title: l.name,
      subtitle: l.summary || l.locationId,
    }));
  }
  if (props.type === "lore" && props.loreItems) {
    return props.loreItems.map((item) => ({
      id: item.loreId,
      type: "lore" as const,
      title: item.title,
      subtitle: item.category ? `[${item.category}] ${item.summary || ""}` : item.summary || item.loreId,
    }));
  }
  return [];
});

const filteredOptions = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return allOptions.value;
  return allOptions.value.filter(
    (opt) =>
      opt.title.toLowerCase().includes(q) ||
      opt.id.toLowerCase().includes(q) ||
      (opt.subtitle && opt.subtitle.toLowerCase().includes(q))
  );
});

function isSelected(id: string): boolean {
  return props.selectedIds?.includes(id) ?? false;
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
    <div class="w-full max-w-md bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
      <!-- Header -->
      <div class="p-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
            <User v-if="type === 'character'" class="h-4 w-4" />
            <MapPin v-else-if="type === 'location'" class="h-4 w-4" />
            <BookOpen v-else class="h-4 w-4" />
          </div>
          <h3 class="text-sm font-bold text-stone-900 dark:text-stone-100">
            {{ title || (type === 'character' ? '选择角色' : type === 'location' ? '选择地点' : '选择世界观设定') }}
          </h3>
        </div>
        <button
          type="button"
          class="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          @click="emit('close')"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <!-- Search Box -->
      <div class="p-3 border-b border-stone-100 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-950/20">
        <div class="relative flex items-center">
          <Search class="absolute left-3 h-4 w-4 text-stone-400 pointer-events-none" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索名称、ID 或描述..."
            class="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 placeholder-stone-400 outline-none focus:border-amber-500 transition-colors"
            autoFocus
          />
        </div>
      </div>

      <!-- Entity Option List -->
      <div class="flex-1 overflow-y-auto p-2 space-y-1">
        <template v-if="filteredOptions.length > 0">
          <button
            v-for="option in filteredOptions"
            :key="option.id"
            type="button"
            class="w-full p-2.5 rounded-xl text-left flex items-center justify-between gap-3 transition-colors text-xs"
            :class="[
              isSelected(option.id)
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 font-semibold'
                : 'hover:bg-stone-100 dark:hover:bg-stone-800/80 text-stone-800 dark:text-stone-200'
            ]"
            @click="emit('select', option.id)"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div
                v-if="option.avatarUrl"
                class="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-stone-200 dark:border-stone-700 bg-stone-100"
              >
                <img :src="option.avatarUrl" :alt="option.title" class="w-full h-full object-cover" />
              </div>
              <div
                v-else
                class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 text-stone-500"
              >
                <User v-if="option.type === 'character'" class="h-4 w-4" />
                <MapPin v-else-if="option.type === 'location'" class="h-4 w-4" />
                <BookOpen v-else class="h-4 w-4" />
              </div>

              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium truncate">{{ option.title }}</span>
                  <span class="text-[10px] text-stone-400 font-mono">({{ option.id }})</span>
                </div>
                <p v-if="option.subtitle" class="text-[11px] text-stone-400 truncate mt-0.5 font-normal">
                  {{ option.subtitle }}
                </p>
              </div>
            </div>

            <div v-if="isSelected(option.id)" class="text-amber-600 dark:text-amber-400 shrink-0">
              <Check class="h-4 w-4" />
            </div>
          </button>
        </template>

        <div v-else class="p-8 text-center text-xs text-stone-400">
          未找到匹配的实体
        </div>
      </div>

      <!-- Footer -->
      <div class="p-3 border-t border-stone-100 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-950/20 flex justify-end">
        <button
          type="button"
          class="px-4 py-1.5 rounded-xl bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 text-xs font-medium transition-colors"
          @click="emit('close')"
        >
          关闭
        </button>
      </div>
    </div>
  </div>
</template>
