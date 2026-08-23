<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import {
  AlignLeft,
  FileCode,
  FileText,
  MessageSquare,
  MoveDown,
  MoveUp,
  Save,
  Sparkles,
  Trash2,
  User,
  Zap,
} from "@lucide/vue";
import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import { useSceneDocumentStore } from "../stores/useSceneDocumentStore.ts";
import { useNarrativeReferenceStore } from "../stores/useNarrativeReferenceStore.ts";
import type { V2CharacterSummary } from "../../adapters/types.ts";
import type { V2SceneBlockKind } from "@living-network/contracts/v2";

const props = defineProps<{
  storyWorldId: string;
  sceneId: string;
  characters: readonly V2CharacterSummary[];
}>();

const emit = defineEmits<{
  saved: [];
}>();

const docStore = useSceneDocumentStore();
const refStore = useNarrativeReferenceStore();

// Textarea refs for focus management
const textareaRefs = ref<Map<string, HTMLTextAreaElement>>(new Map());

function setTextareaRef(blockId: string, el: unknown) {
  if (el && typeof el === "object") {
    const target = (el as { $el?: HTMLElement }).$el
      ? (el as { $el: HTMLElement }).$el.querySelector("textarea") || (el as { $el: HTMLElement }).$el
      : (el as HTMLElement);
    if (target instanceof HTMLTextAreaElement) {
      textareaRefs.value.set(blockId, target);
      return;
    }
  }
  textareaRefs.value.delete(blockId);
}

watch(
  () => props.sceneId,
  (newSceneId) => {
    if (newSceneId) {
      docStore.fetchDocument(props.storyWorldId, newSceneId);
      refStore.fetchSceneReferences(props.storyWorldId, newSceneId);
    }
  },
  { immediate: true },
);

function handleAddBlock(kind: V2SceneBlockKind, afterOrdinal?: number) {
  const newBlock = docStore.addBlock(afterOrdinal, kind);
  nextTick(() => {
    const el = textareaRefs.value.get(newBlock.blockId);
    if (el) el.focus();
  });
}

function handleBlockKeydown(e: KeyboardEvent, blockId: string, ordinal: number) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const currentBlock = docStore.blocks.find((b) => b.blockId === blockId);
    const nextKind: V2SceneBlockKind = currentBlock?.kind === "dialogue" ? "dialogue" : "dialogue";
    const nextSpeaker = currentBlock?.kind === "dialogue" ? currentBlock.speakerCharacterId : undefined;
    const newBlock = docStore.addBlock(ordinal, nextKind, "", nextSpeaker);
    nextTick(() => {
      const el = textareaRefs.value.get(newBlock.blockId);
      if (el) el.focus();
    });
  } else if (e.key === "Backspace") {
    const currentBlock = docStore.blocks.find((b) => b.blockId === blockId);
    if (currentBlock && (!currentBlock.text || currentBlock.text === "") && docStore.blocks.length > 1) {
      e.preventDefault();
      const prevIdx = Math.max(0, ordinal - 1);
      const prevBlock = docStore.blocks[prevIdx];
      docStore.removeBlock(blockId);
      nextTick(() => {
        if (prevBlock) {
          const el = textareaRefs.value.get(prevBlock.blockId);
          if (el) el.focus();
        }
      });
    }
  }
}

async function handleSave() {
  await docStore.saveDocument(props.storyWorldId);
  emit("saved");
}
</script>

<template>
  <main class="scene-script-editor">
    <!-- Top Toolbar -->
    <header class="editor-header">
      <div class="header-left">
        <div class="scene-title-badge">
          <FileText :size="16" class="title-icon" />
          <h2 class="scene-title">{{ docStore.document?.title || "未命名场景" }}</h2>
          <Badge v-if="docStore.document?.isEntry" tone="warning" size="xs">入局场景</Badge>
        </div>
      </div>

      <div class="header-right">
        <!-- Document Mode Switcher -->
        <div class="mode-toggle-group">
          <button
            class="mode-btn"
            :class="{ active: docStore.documentMode === 'blocks' }"
            title="结构化分块剧本模式"
            @click="docStore.setDocumentMode('blocks')"
          >
            <AlignLeft :size="14" />
            <span>剧本分块</span>
          </button>
          <button
            class="mode-btn"
            :class="{ active: docStore.documentMode === 'legacy_body' }"
            title="传统纯文本模式"
            @click="docStore.setDocumentMode('legacy_body')"
          >
            <FileCode :size="14" />
            <span>纯文本</span>
          </button>
        </div>

        <div class="save-status-group">
          <span v-if="docStore.isDirty" class="dirty-indicator">● 未保存变更</span>
          <span v-else-if="docStore.lastSavedAt" class="saved-indicator">已保存</span>
          <Button
            size="sm"
            tone="accent"
            :loading="docStore.saving"
            :disabled="!docStore.isDirty && !docStore.saving"
            @click="handleSave"
          >
            <Save :size="14" />
            <span>保存剧本</span>
          </Button>
        </div>
      </div>
    </header>

    <!-- Editor Body -->
    <div class="editor-scroll-container">
      <div v-if="docStore.loading" class="editor-loading">
        <Sparkles :size="20" class="spin" />
        <span>加载场景剧本中...</span>
      </div>

      <!-- Plain Text Mode -->
      <div v-else-if="docStore.documentMode === 'legacy_body'" class="plain-text-editor-wrap">
        <div class="mode-notice">
          <span>当前处于传统纯文本模式（兼容旧版剧本文档），保存将自动同步到纯文本正文。</span>
        </div>
        <textarea
          class="plain-body-textarea"
          :value="docStore.plainBody"
          placeholder="在此直接输入场景正文剧情..."
          @input="(e) => docStore.setPlainBody((e.target as HTMLTextAreaElement).value)"
        ></textarea>
      </div>

      <!-- Blocks Mode -->
      <div v-else class="blocks-editor-wrap">
        <div v-if="docStore.blocks.length === 0" class="blocks-empty-state">
          <MessageSquare :size="32" class="empty-icon" />
          <p>场景内暂无剧情剧本内容</p>
          <div class="quick-add-group">
            <Button size="sm" tone="accent" @click="handleAddBlock('dialogue')">
              <MessageSquare :size="14" />
              <span>添加台词对白</span>
            </Button>
            <Button size="sm" variant="secondary" @click="handleAddBlock('narration')">
              <AlignLeft :size="14" />
              <span>添加旁白叙述</span>
            </Button>
          </div>
        </div>

        <!-- Block List -->
        <div v-else class="block-list">
          <div
            v-for="(block, idx) in docStore.blocks"
            :key="block.blockId"
            class="script-block-item"
            :class="[
              `block-${block.kind}`,
              { active: docStore.activeBlockId === block.blockId },
            ]"
            @click="docStore.setActiveBlockId(block.blockId)"
          >
            <!-- Block Left Gutter & Kind Indicator -->
            <div class="block-gutter">
              <span class="block-ordinal">{{ idx + 1 }}</span>
              <div class="block-reorder-btns">
                <button
                  class="reorder-btn"
                  :disabled="idx === 0"
                  title="上移"
                  @click.stop="docStore.reorderBlocks(idx, idx - 1)"
                >
                  <MoveUp :size="11" />
                </button>
                <button
                  class="reorder-btn"
                  :disabled="idx === docStore.blocks.length - 1"
                  title="下移"
                  @click.stop="docStore.reorderBlocks(idx, idx + 1)"
                >
                  <MoveDown :size="11" />
                </button>
              </div>
            </div>

            <!-- Block Main Content -->
            <div class="block-main">
              <!-- Block Header -->
              <div class="block-header">
                <!-- Kind Switcher -->
                <select
                  class="block-kind-select"
                  :value="block.kind"
                  @change="(e) => docStore.updateBlock(block.blockId, { kind: (e.target as HTMLSelectElement).value as V2SceneBlockKind })"
                >
                  <option value="dialogue">💬 对白 (Dialogue)</option>
                  <option value="narration">📖 旁白 (Narration)</option>
                  <option value="stage_direction">🎭 舞台指示 (Direction)</option>
                  <option value="action">⚡ 角色动作 (Action)</option>
                  <option value="command">⚙️ 指令 (Command)</option>
                </select>

                <!-- Speaker Selector for Dialogue -->
                <div v-if="block.kind === 'dialogue'" class="speaker-selector-wrap">
                  <User :size="13" class="speaker-icon" />
                  <select
                    class="speaker-select"
                    :value="block.speakerCharacterId ?? ''"
                    @change="(e) => docStore.updateBlock(block.blockId, { speakerCharacterId: (e.target as HTMLSelectElement).value || undefined })"
                  >
                    <option value="">(旁白 / 未指定说话人)</option>
                    <option
                      v-for="char in props.characters"
                      :key="char.characterId"
                      :value="char.characterId"
                    >
                      {{ char.name }}
                    </option>
                  </select>
                </div>

                <!-- Block Actions -->
                <div class="block-actions">
                  <button
                    class="block-action-btn delete-btn"
                    title="删除此分块"
                    @click.stop="docStore.removeBlock(block.blockId)"
                  >
                    <Trash2 :size="12" />
                  </button>
                </div>
              </div>

              <!-- Block Text Input -->
              <div class="block-input-wrap">
                <textarea
                  :ref="(el) => setTextareaRef(block.blockId, el)"
                  class="block-textarea"
                  :placeholder="
                    block.kind === 'dialogue'
                      ? '输入台词对白... (按 Enter 添加下一句)'
                      : block.kind === 'stage_direction'
                      ? '输入舞台指示或演出情境，例如：（微笑着转身注视旅行者）'
                      : block.kind === 'action'
                      ? '输入关键动作或演出特效，例如：【拔出佩剑，雷光环绕】'
                      : '输入旁白描写...'
                  "
                  :value="block.text"
                  rows="2"
                  @input="(e) => docStore.updateBlock(block.blockId, { text: (e.target as HTMLTextAreaElement).value })"
                  @keydown="(e) => handleBlockKeydown(e, block.blockId, idx)"
                ></textarea>
              </div>
            </div>
          </div>

          <!-- Bottom Add Block Buttons -->
          <div class="bottom-add-bar">
            <button class="add-btn" @click="handleAddBlock('dialogue')">
              <MessageSquare :size="13" />
              <span>+ 对白</span>
            </button>
            <button class="add-btn" @click="handleAddBlock('narration')">
              <AlignLeft :size="13" />
              <span>+ 旁白</span>
            </button>
            <button class="add-btn" @click="handleAddBlock('stage_direction')">
              <Zap :size="13" />
              <span>+ 演出指示</span>
            </button>
            <button class="add-btn" @click="handleAddBlock('action')">
              <Sparkles :size="13" />
              <span>+ 动作</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.scene-script-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-canvas, #121216);
  overflow: hidden;
}

.editor-header {
  padding: 12px 16px;
  background: var(--bg-surface, #1e1e24);
  border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.scene-title-badge {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  color: var(--accent-primary, #6366f1);
}

.scene-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary, #f9fafb);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mode-toggle-group {
  display: flex;
  background: rgba(255, 255, 255, 0.05);
  padding: 2px;
  border-radius: 6px;
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 12px;
  border: none;
  background: none;
  color: var(--text-muted, #9ca3af);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mode-btn.active {
  background: var(--accent-primary, #6366f1);
  color: #ffffff;
  font-weight: 500;
}

.save-status-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dirty-indicator {
  font-size: 12px;
  color: #f59e0b;
  font-weight: 500;
}

.saved-indicator {
  font-size: 12px;
  color: var(--text-muted, #9ca3af);
}

.editor-scroll-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.editor-loading {
  padding: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted, #9ca3af);
  font-size: 14px;
}

.plain-text-editor-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
}

.mode-notice {
  font-size: 12px;
  color: var(--text-muted, #9ca3af);
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
}

.plain-body-textarea {
  flex: 1;
  min-height: 400px;
  background: var(--bg-surface, #1e1e24);
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  color: var(--text-primary, #f9fafb);
  padding: 16px;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
}

.plain-body-textarea:focus {
  border-color: var(--accent-primary, #6366f1);
}

.blocks-editor-wrap {
  max-width: 840px;
  margin: 0 auto;
}

.blocks-empty-state {
  padding: 64px 20px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-muted, #9ca3af);
}

.quick-add-group {
  display: flex;
  gap: 12px;
}

.block-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.script-block-item {
  display: flex;
  background: var(--bg-surface, #1e1e24);
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.script-block-item:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.script-block-item.active {
  border-color: var(--accent-primary, #6366f1);
  box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.2);
}

.block-gutter {
  width: 36px;
  background: rgba(0, 0, 0, 0.15);
  border-right: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.05));
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  gap: 4px;
  user-select: none;
}

.block-ordinal {
  font-size: 11px;
  color: var(--text-muted, #9ca3af);
  font-weight: 500;
}

.block-reorder-btns {
  display: flex;
  flex-direction: column;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.script-block-item:hover .block-reorder-btns {
  opacity: 1;
}

.reorder-btn {
  background: none;
  border: none;
  padding: 2px;
  color: var(--text-muted, #9ca3af);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.reorder-btn:hover:not(:disabled) {
  color: var(--text-primary, #ffffff);
}

.reorder-btn:disabled {
  opacity: 0.2;
  cursor: not-allowed;
}

.block-main {
  flex: 1;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.block-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.block-kind-select {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.1));
  border-radius: 4px;
  color: var(--text-secondary, #e5e7eb);
  font-size: 11px;
  padding: 2px 6px;
  outline: none;
}

.speaker-selector-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(99, 102, 241, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid rgba(99, 102, 241, 0.2);
}

.speaker-icon {
  color: #818cf8;
}

.speaker-select {
  background: none;
  border: none;
  color: #a5b4fc;
  font-size: 12px;
  font-weight: 500;
  outline: none;
  cursor: pointer;
}

.speaker-select option {
  background: #1e1e24;
  color: #f3f4f6;
}

.block-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

.block-action-btn {
  background: none;
  border: none;
  padding: 4px;
  border-radius: 4px;
  color: var(--text-muted, #9ca3af);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.block-action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary, #ffffff);
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.block-input-wrap {
  width: 100%;
}

.block-textarea {
  width: 100%;
  background: transparent;
  border: none;
  color: var(--text-primary, #f9fafb);
  font-size: 14px;
  line-height: 1.5;
  outline: none;
  resize: vertical;
  font-family: inherit;
}

.block-dialogue .block-textarea {
  color: #f9fafb;
}

.block-stage_direction .block-textarea {
  color: #a78bfa;
  font-style: italic;
}

.block-action .block-textarea {
  color: #fbbf24;
  font-weight: 500;
}

.block-command .block-textarea {
  color: #34d399;
  font-family: monospace;
}

.bottom-add-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 0 32px;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px dashed var(--border-subtle, rgba(255, 255, 255, 0.15));
  border-radius: 6px;
  color: var(--text-secondary, #d1d5db);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-btn:hover {
  background: rgba(99, 102, 241, 0.1);
  border-color: var(--accent-primary, #6366f1);
  color: #818cf8;
}

.spin {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
