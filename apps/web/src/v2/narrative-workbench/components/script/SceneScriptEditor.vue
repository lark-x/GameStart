<script setup lang="ts">
import { computed } from "vue";
import {
  Save,
  Eye,
  Edit3,
  Plus,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  FileText,
  MessageSquare,
  Compass,
  Zap,
  Terminal,
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

async function handleSave(): Promise<void> {
  if (!docStore.isDirty || docStore.saving) return;
  await docStore.saveDocument(props.storyWorldId);
}

async function handleResolveKeepDraft(): Promise<void> {
  // Fetch fresh document metadata and resolve revision without wiping blocks
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
  <div class="h-full flex flex-col max-w-4xl mx-auto w-full min-w-[320px] lg:min-w-[720px] select-none text-xs space-y-4">
    <!-- Scene Script Header & Actions Bar -->
    <div class="p-4 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm flex items-center justify-between gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <div class="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Edit3 class="h-5 w-5" />
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-bold text-stone-900 dark:text-stone-100 truncate">
              {{ docStore.document?.title || '加载场景中...' }}
            </h2>
            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-500">
              v{{ docStore.document?.revision ?? 1 }}
            </span>
          </div>
          <p class="text-[11px] text-stone-400 truncate mt-0.5 font-mono">
            {{ sceneId }}
          </p>
        </div>
      </div>

      <!-- Header Controls -->
      <div class="flex items-center gap-2 shrink-0">
        <!-- Save Status / Button -->
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
          :class="[
            docStore.isDirty
              ? 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse'
              : 'bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300'
          ]"
          :disabled="docStore.saving || !docStore.isDirty"
          @click="handleSave"
        >
          <Save class="h-3.5 w-3.5" />
          <span v-if="docStore.saving">保存中...</span>
          <span v-else-if="docStore.isDirty">保存变更</span>
          <span v-else>已保存</span>
        </button>
      </div>
    </div>

    <!-- CAS Conflict Draft Protection Banner -->
    <div
      v-if="docStore.hasConflict"
      class="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 rounded-xl space-y-3"
    >
      <div class="flex items-start gap-2.5">
        <AlertTriangle class="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div class="space-y-1 text-xs">
          <h4 class="font-bold text-amber-900 dark:text-amber-200">版本冲突警告 (CAS Conflict)</h4>
          <p class="text-amber-800 dark:text-amber-300/90 leading-relaxed">
            {{ docStore.conflictError }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3 pl-6">
        <button
          type="button"
          class="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition-colors"
          @click="handleResolveKeepDraft"
        >
          <Save class="h-3 w-3" />
          <span>保留本地草稿并强制同步 (Preserve Draft)</span>
        </button>
        <button
          type="button"
          class="px-3 py-1 bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-medium rounded-lg text-xs flex items-center gap-1.5 transition-colors"
          @click="handleResolveReload"
        >
          <RotateCcw class="h-3 w-3" />
          <span>放弃本地并拉取云端 (Reload Server)</span>
        </button>
      </div>
    </div>

    <!-- Script Surface: Preview Mode or Block Editor Mode -->
    <template v-if="isPreview">
      <!-- Plain text / Markdown preview -->
      <div class="p-6 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm space-y-4">
        <div class="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800 text-stone-500">
          <div class="flex items-center gap-1.5 font-semibold text-xs">
            <Eye class="h-3.5 w-3.5 text-amber-500" />
            <span>剧本纯文本预览 (Script Preview)</span>
          </div>
          <span class="text-[11px]">{{ docStore.blocks.length }} 个分块</span>
        </div>

        <div class="font-serif leading-relaxed text-sm text-stone-800 dark:text-stone-200 whitespace-pre-wrap select-text p-4 bg-stone-50/50 dark:bg-stone-950/30 rounded-lg">
          {{ docStore.renderedPlainText || '当前剧本内容为空' }}
        </div>
      </div>
    </template>

    <template v-else>
      <!-- Block List -->
      <div class="space-y-3 pb-8">
        <div v-if="docStore.loading" class="p-12 text-center text-stone-400 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800">
          <span>加载剧本分块中...</span>
        </div>

        <template v-else-if="docStore.blocks.length > 0">
          <SceneBlockEditor
            v-for="(block, index) in docStore.blocks"
            :key="block.blockId"
            :block="block"
            :index="index"
            :total-blocks="docStore.blocks.length"
            :is-active="activeBlockId === block.blockId"
            :characters="characters"
            @update="handleUpdateBlock"
            @remove="handleRemoveBlock"
            @move-up="handleMoveUp"
            @move-down="handleMoveDown"
            @add-below="(idx, kind) => handleAddBlock(kind, idx + 1)"
            @activate="handleActivateBlock"
          />
        </template>

        <div v-else class="p-8 text-center bg-white dark:bg-stone-900 rounded-xl border border-dashed border-stone-200 dark:border-stone-800 space-y-3">
          <p class="text-stone-400">本场景尚未编写剧本分块，选择以下类型开始创作：</p>
          <div class="flex items-center justify-center gap-2">
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-stone-700 dark:text-stone-300 hover:text-amber-600 font-medium flex items-center gap-1.5 transition-colors"
              @click="handleAddBlock('dialogue')"
            >
              <MessageSquare class="h-3.5 w-3.5 text-amber-500" />
              <span>+ 台词</span>
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-stone-700 dark:text-stone-300 hover:text-amber-600 font-medium flex items-center gap-1.5 transition-colors"
              @click="handleAddBlock('narration')"
            >
              <FileText class="h-3.5 w-3.5 text-sky-500" />
              <span>+ 旁白</span>
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-stone-700 dark:text-stone-300 hover:text-amber-600 font-medium flex items-center gap-1.5 transition-colors"
              @click="handleAddBlock('action')"
            >
              <Zap class="h-3.5 w-3.5 text-emerald-500" />
              <span>+ 动作</span>
            </button>
          </div>
        </div>

        <!-- Bottom Add Block Buttons -->
        <div v-if="docStore.blocks.length > 0" class="p-3 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm flex items-center justify-between">
          <span class="text-stone-400 font-medium">追加新分块：</span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-amber-50 dark:hover:bg-amber-950 text-stone-700 dark:text-stone-300 hover:text-amber-600 font-medium flex items-center gap-1 transition-colors"
              @click="handleAddBlock('dialogue')"
            >
              <MessageSquare class="h-3 w-3 text-amber-500" />
              <span>+ 台词</span>
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-amber-50 dark:hover:bg-amber-950 text-stone-700 dark:text-stone-300 hover:text-amber-600 font-medium flex items-center gap-1 transition-colors"
              @click="handleAddBlock('narration')"
            >
              <FileText class="h-3 w-3 text-sky-500" />
              <span>+ 旁白</span>
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-amber-50 dark:hover:bg-amber-950 text-stone-700 dark:text-stone-300 hover:text-amber-600 font-medium flex items-center gap-1 transition-colors"
              @click="handleAddBlock('action')"
            >
              <Zap class="h-3 w-3 text-emerald-500" />
              <span>+ 动作</span>
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-amber-50 dark:hover:bg-amber-950 text-stone-700 dark:text-stone-300 hover:text-amber-600 font-medium flex items-center gap-1 transition-colors"
              @click="handleAddBlock('stage_direction')"
            >
              <Compass class="h-3 w-3 text-purple-500" />
              <span>+ 舞台指示</span>
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-amber-50 dark:hover:bg-amber-950 text-stone-700 dark:text-stone-300 hover:text-amber-600 font-medium flex items-center gap-1 transition-colors"
              @click="handleAddBlock('command')"
            >
              <Terminal class="h-3 w-3 text-stone-500" />
              <span>+ 指令</span>
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
