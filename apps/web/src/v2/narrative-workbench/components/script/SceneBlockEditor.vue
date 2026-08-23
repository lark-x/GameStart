<script setup lang="ts">
import { computed, type Component } from "vue";
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
  V2CharacterId,
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

const blockKindOptions: { label: string; value: V2SceneBlockKind; icon: Component }[] = [
  { label: "台词", value: "dialogue", icon: MessageSquare },
  { label: "旁白", value: "narration", icon: FileText },
  { label: "舞台指示", value: "stage_direction", icon: Compass },
  { label: "动作", value: "action", icon: Zap },
  { label: "指令", value: "command", icon: Terminal },
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
  emit("update", props.block.blockId, {
    speakerCharacterId: target.value ? (target.value as V2CharacterId) : undefined,
  });
}
</script>

<template>
  <div
    class="group relative p-3.5 rounded-xl transition-all duration-150 border"
    :class="[
      isActive
        ? 'border-amber-500 bg-amber-50/20 dark:bg-amber-950/15 shadow-xs ring-1 ring-amber-500/30'
        : 'border-stone-200/70 dark:border-stone-800 bg-white dark:bg-stone-900/90 hover:border-stone-300 dark:hover:border-stone-700'
    ]"
    @click="emit('activate', block.blockId)"
  >
    <!-- Block Header Line -->
    <div class="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-stone-100 dark:border-stone-800 text-xs">
      <div class="flex items-center gap-2">
        <span class="font-mono text-xs text-stone-400 font-semibold select-none w-5">#{{ index + 1 }}</span>

        <!-- Kind Selector -->
        <div class="relative flex items-center">
          <component :is="currentKindIcon" class="absolute left-2 h-3.5 w-3.5 text-stone-500 pointer-events-none" />
          <select
            :value="block.kind"
            class="pl-7 pr-2 py-0.5 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs text-stone-800 dark:text-stone-200 outline-none font-medium cursor-pointer"
            @change="handleKindChange"
          >
            <option v-for="opt in blockKindOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <!-- Speaker Selector (when dialogue/action) -->
        <div v-if="block.kind === 'dialogue' || block.kind === 'action'" class="relative flex items-center">
          <User class="absolute left-2 h-3.5 w-3.5 text-stone-400 pointer-events-none" />
          <select
            :value="block.speakerCharacterId ?? ''"
            class="pl-7 pr-2 py-0.5 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs text-stone-800 dark:text-stone-200 outline-none font-medium cursor-pointer"
            @change="handleSpeakerChange"
          >
            <option value="">(选择说话角色)</option>
            <option v-for="char in characters" :key="char.characterId" :value="char.characterId">
              {{ char.name }}
            </option>
          </select>
        </div>
      </div>

      <!-- Action Controls -->
      <div class="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          class="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 disabled:opacity-30 rounded hover:bg-stone-100 dark:hover:bg-stone-800"
          :disabled="index === 0"
          title="向上移动"
          @click.stop="emit('moveUp', index)"
        >
          <ChevronUp class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          class="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 disabled:opacity-30 rounded hover:bg-stone-100 dark:hover:bg-stone-800"
          :disabled="index === totalBlocks - 1"
          title="向下移动"
          @click.stop="emit('moveDown', index)"
        >
          <ChevronDown class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          class="p-1 text-stone-400 hover:text-red-500 rounded hover:bg-stone-100 dark:hover:bg-stone-800"
          title="删除此分块"
          @click.stop="emit('remove', block.blockId)"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <!-- Block Text Content -->
    <div>
      <textarea
        :value="block.text ?? ''"
        rows="3"
        placeholder="在此输入分块剧本内容或旁白台词..."
        class="w-full p-2 bg-transparent text-[15px] leading-relaxed text-stone-900 dark:text-stone-100 placeholder-stone-400 outline-none resize-y font-sans border-0 focus:ring-0"
        @input="handleTextChange"
      />
    </div>

    <!-- Quick Add Hover Trigger Bar -->
    <div class="absolute -bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center gap-1 bg-white dark:bg-stone-800 px-2 py-0.5 rounded-full border border-stone-200 dark:border-stone-700 shadow-sm">
      <button
        type="button"
        class="text-[11px] font-medium text-stone-600 dark:text-stone-300 hover:text-amber-500 flex items-center gap-0.5 px-1.5 py-0.5"
        @click.stop="emit('addBelow', index, 'dialogue')"
      >
        <Plus class="h-3 w-3" /> 台词
      </button>
      <span class="text-stone-300 dark:text-stone-600">|</span>
      <button
        type="button"
        class="text-[11px] font-medium text-stone-600 dark:text-stone-300 hover:text-amber-500 flex items-center gap-0.5 px-1.5 py-0.5"
        @click.stop="emit('addBelow', index, 'narration')"
      >
        <Plus class="h-3 w-3" /> 旁白
      </button>
      <span class="text-stone-300 dark:text-stone-600">|</span>
      <button
        type="button"
        class="text-[11px] font-medium text-stone-600 dark:text-stone-300 hover:text-amber-500 flex items-center gap-0.5 px-1.5 py-0.5"
        @click.stop="emit('addBelow', index, 'action')"
      >
        <Plus class="h-3 w-3" /> 动作
      </button>
    </div>
  </div>
</template>
