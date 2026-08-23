<script setup lang="ts">
import { computed } from "vue";
import {
  MessageSquare,
  FileText,
  Compass,
  Zap,
  Terminal,
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  User,
} from "@lucide/vue";
import type {
  V2SceneBlock,
  V2SceneBlockKind,
} from "@living-network/contracts/v2";
import type { V2CharacterSummary } from "../../../adapters/types.ts";

const props = defineProps<{
  block: V2SceneBlock;
  index: number;
  totalBlocks: number;
  isActive: boolean;
  characters: readonly V2CharacterSummary[];
}>();

const emit = defineEmits<{
  update: [blockId: string, partial: Partial<V2SceneBlock>];
  remove: [blockId: string];
  moveUp: [index: number];
  moveDown: [index: number];
  addBelow: [index: number, kind: V2SceneBlockKind];
  activate: [blockId: string];
}>();

const blockKindOptions: { label: string; value: V2SceneBlockKind; icon: any }[] = [
  { label: "台词 (Dialogue)", value: "dialogue", icon: MessageSquare },
  { label: "旁白 (Narration)", value: "narration", icon: FileText },
  { label: "舞台指示 (Stage)", value: "stage_direction", icon: Compass },
  { label: "角色动作 (Action)", value: "action", icon: Zap },
  { label: "系统指令 (Command)", value: "command", icon: Terminal },
];

const currentKindIcon = computed(() => {
  switch (props.block.kind) {
    case "dialogue": return MessageSquare;
    case "narration": return FileText;
    case "stage_direction": return Compass;
    case "action": return Zap;
    case "command": return Terminal;
    default: return FileText;
  }
});

function handleKindChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  const newKind = target.value as V2SceneBlockKind;
  emit("update", props.block.blockId, { kind: newKind });
}

function handleTextChange(e: Event) {
  const target = e.target as HTMLTextAreaElement;
  emit("update", props.block.blockId, { text: target.value });
}

function handleSpeakerChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  emit("update", props.block.blockId, { speakerCharacterId: target.value || undefined });
}
</script>

<template>
  <div
    class="group relative p-3 rounded-xl border transition-all duration-150"
    :class="[
      isActive
        ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/10 shadow-sm ring-1 ring-amber-500/30'
        : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-stone-300 dark:hover:border-stone-700'
    ]"
    @click="emit('activate', block.blockId)"
  >
    <!-- Block Toolbar Header -->
    <div class="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-stone-100 dark:border-stone-800 text-xs">
      <div class="flex items-center gap-2">
        <span class="font-mono text-[10px] text-stone-400 font-semibold select-none w-5">#{{ index + 1 }}</span>

        <!-- Kind Selector -->
        <div class="relative flex items-center">
          <component :is="currentKindIcon" class="absolute left-2 h-3.5 w-3.5 text-stone-500 pointer-events-none" />
          <select
            :value="block.kind"
            class="pl-7 pr-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs text-stone-800 dark:text-stone-200 outline-none font-medium cursor-pointer"
            @change="handleKindChange"
          >
            <option v-for="opt in blockKindOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <!-- Speaker Selector (only for dialogue) -->
        <template v-if="block.kind === 'dialogue'">
          <div class="relative flex items-center">
            <User class="absolute left-2 h-3.5 w-3.5 text-stone-400 pointer-events-none" />
            <select
              :value="block.speakerCharacterId ?? ''"
              class="pl-7 pr-2 py-0.5 rounded bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs text-stone-800 dark:text-stone-200 outline-none font-medium cursor-pointer"
              @change="handleSpeakerChange"
            >
              <option value="">(旁白 / 未指定说话人)</option>
              <option v-for="char in characters" :key="char.characterId" :value="char.characterId">
                {{ char.name }} ({{ char.characterId }})
              </option>
            </select>
          </div>
        </template>
      </div>

      <!-- Quick Actions -->
      <div class="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          class="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 disabled:opacity-30 disabled:pointer-events-none"
          title="上移"
          :disabled="index === 0"
          @click.stop="emit('moveUp', index)"
        >
          <ChevronUp class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          class="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 disabled:opacity-30 disabled:pointer-events-none"
          title="下移"
          :disabled="index === totalBlocks - 1"
          @click.stop="emit('moveDown', index)"
        >
          <ChevronDown class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          class="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950 text-red-500 hover:text-red-600 transition-colors"
          title="删除分块"
          @click.stop="emit('remove', block.blockId)"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <!-- Block Content Editor -->
    <div>
      <textarea
        :value="block.text ?? ''"
        :rows="block.kind === 'dialogue' || block.kind === 'narration' ? 3 : 2"
        :placeholder="
          block.kind === 'dialogue'
            ? '输入角色台词内容...'
            : block.kind === 'narration'
            ? '输入环境描写或旁白叙述...'
            : block.kind === 'stage_direction'
            ? '输入场景灯光、音效或镜头指示...'
            : block.kind === 'action'
            ? '输入角色肢体动作或交互动作...'
            : '输入执行指令或逻辑命令...'
        "
        class="w-full p-2 bg-transparent rounded border border-transparent focus:border-amber-500 focus:bg-stone-50/50 dark:focus:bg-stone-800/40 outline-none text-xs leading-relaxed text-stone-900 dark:text-stone-100 placeholder-stone-400 resize-y transition-all"
        :class="{
          'font-sans': block.kind === 'dialogue' || block.kind === 'narration',
          'font-mono text-purple-600 dark:text-purple-400 bg-purple-50/30 dark:bg-purple-950/20 border-purple-200/50 dark:border-purple-900/40': block.kind === 'stage_direction',
          'font-medium text-emerald-700 dark:text-emerald-400': block.kind === 'action',
          'font-mono text-amber-700 dark:text-amber-400 bg-stone-100/50 dark:bg-stone-800/50': block.kind === 'command',
        }"
        @input="handleTextChange"
      />
    </div>

    <!-- Add Block Hover Inserter -->
    <div class="absolute -bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 z-10 bg-white dark:bg-stone-800 px-2 py-0.5 rounded-full border border-stone-200 dark:border-stone-700 shadow-sm text-[11px]">
      <button
        type="button"
        class="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-amber-50 dark:hover:bg-amber-950 text-stone-600 dark:text-stone-300 hover:text-amber-600"
        @click.stop="emit('addBelow', index, 'dialogue')"
      >
        <Plus class="h-3 w-3" />
        <span>+ 台词</span>
      </button>
      <button
        type="button"
        class="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-amber-50 dark:hover:bg-amber-950 text-stone-600 dark:text-stone-300 hover:text-amber-600"
        @click.stop="emit('addBelow', index, 'narration')"
      >
        <Plus class="h-3 w-3" />
        <span>+ 旁白</span>
      </button>
    </div>
  </div>
</template>
