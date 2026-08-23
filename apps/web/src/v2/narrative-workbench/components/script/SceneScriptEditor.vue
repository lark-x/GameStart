<script setup lang="ts">
import { computed } from "vue";
import {
  Plus,
  AlertTriangle,
  RotateCcw,
  FileText,
} from "@lucide/vue";
import { useSceneDocumentStore } from "../../../story/stores/useSceneDocumentStore.ts";
import SceneBlockEditor from "./SceneBlockEditor.vue";
import type {
  V2SceneBlock,
  V2SceneBlockKind,
} from "@living-network/contracts/v2";
import type { V2CharacterSummary } from "../../../adapters/types.ts";

const props = defineProps<{
  storyWorldId: string;
  sceneId: string;
  characters: readonly V2CharacterSummary[];
  isPreview?: boolean;
}>();

const docStore = useSceneDocumentStore();

const activeBlockId = computed(() => docStore.activeBlockId);

function handleUpdateBlock(blockId: string, partial: Partial<V2SceneBlock>): void {
  docStore.updateBlock(blockId, partial);
}

function handleRemoveBlock(blockId: string): void {
  docStore.removeBlock(blockId);
}

function handleMoveUp(index: number): void {
  if (index > 0) {
    docStore.reorderBlocks(index, index - 1);
  }
}

function handleMoveDown(index: number): void {
  if (index < docStore.blocks.length - 1) {
    docStore.reorderBlocks(index, index + 1);
  }
}

function handleAddBlock(kind: V2SceneBlockKind, index?: number): void {
  docStore.addBlock(index, kind);
}

function handleActivateBlock(blockId: string): void {
  docStore.setActiveBlockId(blockId);
}

async function handleResolveKeepDraft(): Promise<void> {
  try {
    const client = docStore.getClient();
    const fresh = await client.getSceneDocument(props.storyWorldId, props.sceneId);
    docStore.resolveConflictKeepDraft(fresh);
    await docStore.saveDocument(props.storyWorldId);
  } catch (err) {
    console.error("Failed to re-save with new revision:", err);
  }
}

async function handleResolveReload(): Promise<void> {
  try {
    const client = docStore.getClient();
    const fresh = await client.getSceneDocument(props.storyWorldId, props.sceneId);
    docStore.resolveConflictReload(fresh);
  } catch (err) {
    console.error("Failed to reload fresh document:", err);
  }
}
</script>

<template>
  <div class="h-full flex flex-col max-w-3xl mx-auto w-full select-none text-sm space-y-4 pb-12">
    <!-- Scene Title Banner on Document Surface -->
    <div class="pt-2 pb-1 border-b border-stone-200/80 dark:border-stone-800 flex items-baseline justify-between">
      <h1 class="text-xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
        {{ docStore.document?.title || "剧本编写" }}
      </h1>
      <span class="text-xs text-stone-400 font-mono">
        {{ docStore.blocks.length }} 个剧本分块
      </span>
    </div>

    <!-- Conflict Resolution Alert Bar -->
    <div
      v-if="docStore.hasConflict"
      class="p-3 bg-red-50 dark:bg-red-950/40 rounded-xl border border-red-200 dark:border-red-900/60 flex items-center justify-between gap-4 text-xs"
    >
      <div class="flex items-center gap-2 text-red-800 dark:text-red-300 min-w-0">
        <AlertTriangle class="h-4 w-4 shrink-0 text-red-600" />
        <span>正典版本已由其他写操作更新，检测到版本冲突。</span>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <button
          type="button"
          class="px-2.5 py-1 rounded bg-white dark:bg-stone-900 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 font-semibold hover:bg-red-100/50"
          @click="handleResolveReload"
        >
          <RotateCcw class="h-3 w-3 inline mr-1" />
          重新加载
        </button>
        <button
          type="button"
          class="px-2.5 py-1 rounded bg-red-600 text-white font-semibold hover:bg-red-700"
          @click="handleResolveKeepDraft"
        >
          强制覆盖
        </button>
      </div>
    </div>

    <!-- Preview Mode Document Flow -->
    <div v-if="isPreview" class="p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4 shadow-xs">
      <div class="text-xs font-mono text-stone-400 uppercase tracking-wider pb-2 border-b border-stone-100 dark:border-stone-800">
        剧本纯文本预览模式
      </div>

      <div v-for="block in docStore.blocks" :key="block.blockId" class="space-y-1">
        <div v-if="block.kind === 'dialogue'" class="flex items-baseline gap-2">
          <span class="font-bold text-stone-900 dark:text-stone-100 text-sm">
            {{ characters.find((c) => c.characterId === block.speakerCharacterId)?.name || block.speakerCharacterId || '角色' }}：
          </span>
          <span class="text-stone-800 dark:text-stone-200 text-base leading-relaxed font-sans">
            {{ block.text || '...' }}
          </span>
        </div>

        <div v-else-if="block.kind === 'narration'" class="py-1 text-stone-600 dark:text-stone-400 italic text-[15px] leading-relaxed">
          {{ block.text || '...' }}
        </div>

        <div v-else-if="block.kind === 'action'" class="py-0.5 text-stone-700 dark:text-stone-300 font-medium text-sm">
          [{{ block.text || '执行动作' }}]
        </div>

        <div v-else class="text-xs text-stone-500 font-mono">
          ({{ block.kind }}: {{ block.text }})
        </div>
      </div>
    </div>

    <!-- Interactive Blocks Editor List -->
    <div v-else class="space-y-3">
      <SceneBlockEditor
        v-for="(block, idx) in docStore.blocks"
        :key="block.blockId"
        :block="block"
        :index="idx"
        :total-blocks="docStore.blocks.length"
        :is-active="activeBlockId === block.blockId"
        :characters="characters"
        @update="handleUpdateBlock"
        @remove="handleRemoveBlock"
        @move-up="handleMoveUp"
        @move-down="handleMoveDown"
        @add-below="(index, kind) => handleAddBlock(kind, index)"
        @activate="handleActivateBlock"
      />

      <!-- Empty State -->
      <div
        v-if="docStore.blocks.length === 0"
        class="p-12 text-center bg-white dark:bg-stone-900 rounded-2xl border border-dashed border-stone-200 dark:border-stone-800 text-stone-400 space-y-3"
      >
        <FileText class="h-8 w-8 mx-auto text-stone-300 dark:text-stone-700" />
        <p class="text-sm">当前场景暂无剧本分块，点击下方按钮开始编写</p>
      </div>

      <!-- Add New Block Bottom Bar -->
      <div class="pt-4 flex items-center justify-center gap-2">
        <button
          type="button"
          class="px-3.5 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:border-amber-500 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 font-medium flex items-center gap-1.5 shadow-2xs hover:bg-stone-50 dark:hover:bg-stone-800 transition-all text-xs"
          @click="handleAddBlock('dialogue')"
        >
          <Plus class="h-3.5 w-3.5 text-amber-500" />
          <span>添加台词</span>
        </button>

        <button
          type="button"
          class="px-3.5 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:border-amber-500 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 font-medium flex items-center gap-1.5 shadow-2xs hover:bg-stone-50 dark:hover:bg-stone-800 transition-all text-xs"
          @click="handleAddBlock('narration')"
        >
          <Plus class="h-3.5 w-3.5 text-amber-500" />
          <span>添加旁白</span>
        </button>

        <button
          type="button"
          class="px-3.5 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:border-amber-500 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 font-medium flex items-center gap-1.5 shadow-2xs hover:bg-stone-50 dark:hover:bg-stone-800 transition-all text-xs"
          @click="handleAddBlock('action')"
        >
          <Plus class="h-3.5 w-3.5 text-amber-500" />
          <span>添加动作</span>
        </button>
      </div>
    </div>
  </div>
</template>
