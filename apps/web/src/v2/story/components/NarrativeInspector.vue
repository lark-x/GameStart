<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Check,
  ChevronRight,
  Fingerprint,
  GitBranch,
  Info,
  MapPin,
  Plus,
  Settings,
  Sparkles,
  Star,
  Trash2,
  User,
  Users,
  Wand2,
} from "@lucide/vue";
import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Field from "../../../components/ui/Field.vue";
import Input from "../../../components/ui/Input.vue";
import { useSceneDocumentStore } from "../stores/useSceneDocumentStore.ts";
import { useNarrativeReferenceStore } from "../stores/useNarrativeReferenceStore.ts";
import { useNarrativeOutlineStore } from "../stores/useNarrativeOutlineStore.ts";
import type { V2CharacterSummary, V2LocationSummary } from "../../adapters/types.ts";
import type { V2NarrativeGenerationContextResponse } from "@living-network/contracts/v2";
import { V2NarrativeClient } from "../client.ts";

const props = defineProps<{
  storyWorldId: string;
  characters: readonly V2CharacterSummary[];
  locations: readonly V2LocationSummary[];
}>();

const docStore = useSceneDocumentStore();
const refStore = useNarrativeReferenceStore();
const outlineStore = useNarrativeOutlineStore();

const activeTab = ref<"meta" | "refs" | "copilot">("meta");

// AI Context Preview State
const loadingContext = ref(false);
const contextPreview = ref<V2NarrativeGenerationContextResponse | null>(null);
const userPromptInput = ref("");

async function loadContextPreview() {
  if (!docStore.document) return;
  loadingContext.value = true;
  try {
    const client = new V2NarrativeClient();
    contextPreview.value = await client.previewContext(props.storyWorldId, {
      storyWorldId: props.storyWorldId as any,
      task: "continue_scene",
      targetSceneId: docStore.document.sceneId,
      ...(docStore.document.questId ? { targetQuestId: docStore.document.questId } : {}),
      ...(userPromptInput.value.trim() ? { prompt: userPromptInput.value.trim() } : {}),
    });
  } catch (err) {
    console.error("Failed to preview context:", err);
  } finally {
    loadingContext.value = false;
  }
}

watch(
  () => docStore.document?.sceneId,
  () => {
    contextPreview.value = null;
  },
);

function isParticipant(characterId: string): boolean {
  return refStore.participantCharacterIds.includes(characterId);
}

function handleToggleParticipant(characterId: string) {
  if (!docStore.document) return;
  refStore.toggleParticipant(props.storyWorldId, docStore.document.sceneId, characterId);
}

function handleLocationChange(e: any) {
  if (!docStore.document) return;
  const locId = e.target.value || null;
  refStore.setMainLocation(props.storyWorldId, docStore.document.sceneId, locId);
}
</script>

<template>
  <aside class="narrative-inspector">
    <header class="inspector-header">
      <div class="header-tabs">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'meta' }"
          @click="activeTab = 'meta'"
        >
          <Settings :size="13" />
          <span>属性</span>
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'refs' }"
          @click="activeTab = 'refs'"
        >
          <Users :size="13" />
          <span>关系锚定</span>
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'copilot' }"
          @click="activeTab = 'copilot'"
        >
          <Sparkles :size="13" />
          <span>AI 续写感知</span>
        </button>
      </div>
    </header>

    <div v-if="!docStore.document" class="inspector-empty">
      <Info :size="24" class="empty-icon" />
      <span>在左侧选择一个场景以查看和编辑属性</span>
    </div>

    <div v-else class="inspector-content">
      <!-- Tab 1: Meta Attributes -->
      <div v-if="activeTab === 'meta'" class="tab-pane meta-pane">
        <div class="pane-section">
          <label class="section-label">场景基础信息</label>
          <div class="field-group">
            <Field label="场景标题">
              <Input
                :model-value="docStore.document.title"
                size="sm"
                @update:model-value="(val: any) => { if (docStore.document) { (docStore.document as any).title = val; docStore.isDirty = true; } }"
              />
            </Field>

            <div class="checkbox-row">
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  :checked="docStore.document.isEntry"
                  @change="(e: any) => { if (docStore.document) { (docStore.document as any).isEntry = e.target.checked; docStore.isDirty = true; } }"
                />
                <span>标记为本篇章初始入局场景 (Entry Scene)</span>
              </label>
            </div>
          </div>
        </div>

        <div class="pane-section">
          <label class="section-label">所属故事层级</label>
          <div class="hierarchy-tags">
            <div class="tag-row">
              <span class="tag-key">所属篇章(Arc):</span>
              <span class="tag-val">{{ outlineStore.activeArc?.title || "未分配篇章" }}</span>
            </div>
            <div class="tag-row">
              <span class="tag-key">所属章节(Chapter):</span>
              <span class="tag-val">{{ outlineStore.activeChapter?.title || "未分配章节" }}</span>
            </div>
            <div class="tag-row">
              <span class="tag-key">所属任务(Quest):</span>
              <span class="tag-val">{{ outlineStore.activeQuest?.title || "未分配任务" }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 2: References & Anchors -->
      <div v-if="activeTab === 'refs'" class="tab-pane refs-pane">
        <!-- Location Anchor -->
        <div class="pane-section">
          <div class="section-title-wrap">
            <MapPin :size="14" class="sec-icon loc-icon" />
            <label class="section-label">正式发生地点 (Location Anchor)</label>
          </div>
          <p class="section-desc">正典绑定的发生地点，禁止纯文本字符串启发推断。</p>
          <select
            class="inspector-select"
            :value="refStore.mainLocationId ?? ''"
            @change="handleLocationChange"
          >
            <option value="">(未指定地点)</option>
            <option
              v-for="loc in props.locations"
              :key="loc.locationId"
              :value="loc.locationId"
            >
              📍 {{ loc.name }}
            </option>
          </select>
        </div>

        <!-- Participants Anchor -->
        <div class="pane-section">
          <div class="section-title-wrap">
            <Users :size="14" class="sec-icon char-icon" />
            <label class="section-label">正式参演角色 (Participant Characters)</label>
          </div>
          <p class="section-desc">点击以添加或移除参演角色事实，保证正典一致性。</p>
          <div class="char-pill-grid">
            <button
              v-for="char in props.characters"
              :key="char.characterId"
              class="char-pill-btn"
              :class="{ selected: isParticipant(char.characterId) }"
              @click="handleToggleParticipant(char.characterId)"
            >
              <User :size="12" />
              <span>{{ char.name }}</span>
              <Check v-if="isParticipant(char.characterId)" :size="11" class="check-icon" />
            </button>
          </div>
        </div>
      </div>

      <!-- Tab 3: AI Context Copilot -->
      <div v-if="activeTab === 'copilot'" class="tab-pane copilot-pane">
        <div class="pane-section">
          <div class="section-title-wrap">
            <Sparkles :size="14" class="sec-icon ai-icon" />
            <label class="section-label">正典感知上下文预览</label>
          </div>
          <p class="section-desc">AI 续写将提取当前任务、场景、角色人设与指纹，防止幻觉。</p>

          <Field label="补充续写指令">
            <Input
              v-model="userPromptInput"
              size="sm"
              placeholder="例如：着重描写角色的微表情与心理博弈..."
            />
          </Field>

          <Button
            size="sm"
            tone="accent"
            :loading="loadingContext"
            @click="loadContextPreview"
          >
            <Wand2 :size="13" />
            <span>构建并预览上下文指纹</span>
          </Button>

          <div v-if="contextPreview" class="context-preview-box">
            <div class="fingerprint-bar">
              <Fingerprint :size="13" />
              <span class="fingerprint-hash">{{ contextPreview.contextHash.slice(0, 16) }}...</span>
              <Badge size="xs" tone="success">~{{ contextPreview.totalTokensEstimate }} Tokens</Badge>
            </div>

            <div class="sections-accordion">
              <div
                v-for="(sec, idx) in contextPreview.sections"
                :key="idx"
                class="context-sec-item"
              >
                <span class="sec-item-title">{{ sec.title }}</span>
                <p class="sec-item-content">{{ sec.content }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.narrative-inspector {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-surface, #1e1e24);
  border-left: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  overflow: hidden;
}

.inspector-header {
  border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
}

.header-tabs {
  display: flex;
  padding: 4px;
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 4px;
  font-size: 11px;
  border: none;
  background: none;
  color: var(--text-muted, #9ca3af);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  color: var(--text-primary, #ffffff);
}

.tab-btn.active {
  background: rgba(255, 255, 255, 0.08);
  color: var(--accent-primary, #818cf8);
  font-weight: 500;
}

.inspector-empty {
  padding: 32px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
  color: var(--text-muted, #9ca3af);
  font-size: 12px;
}

.empty-icon {
  color: var(--text-subtle, #6b7280);
}

.inspector-content {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
}

.tab-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pane-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary, #f3f4f6);
}

.section-desc {
  font-size: 11px;
  color: var(--text-muted, #9ca3af);
  margin: 0;
  line-height: 1.4;
}

.sec-icon {
  flex-shrink: 0;
}

.loc-icon {
  color: #38bdf8;
}

.char-icon {
  color: #818cf8;
}

.ai-icon {
  color: #c084fc;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkbox-row {
  margin-top: 4px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary, #d1d5db);
  cursor: pointer;
}

.hierarchy-tags {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: rgba(0, 0, 0, 0.2);
  padding: 8px 10px;
  border-radius: 6px;
}

.tag-row {
  display: flex;
  font-size: 11px;
  gap: 6px;
}

.tag-key {
  color: var(--text-muted, #9ca3af);
  flex-shrink: 0;
}

.tag-val {
  color: var(--text-primary, #f3f4f6);
  font-weight: 500;
}

.inspector-select {
  width: 100%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.1));
  border-radius: 6px;
  color: var(--text-primary, #f9fafb);
  padding: 6px 8px;
  font-size: 12px;
  outline: none;
}

.inspector-select option {
  background: #1e1e24;
}

.char-pill-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.char-pill-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  border-radius: 14px;
  color: var(--text-secondary, #d1d5db);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.char-pill-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.char-pill-btn.selected {
  background: rgba(99, 102, 241, 0.15);
  border-color: var(--accent-primary, #6366f1);
  color: #818cf8;
  font-weight: 500;
}

.check-icon {
  color: #818cf8;
}

.context-preview-box {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
  border-radius: 6px;
  padding: 10px;
}

.fingerprint-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted, #9ca3af);
}

.fingerprint-hash {
  font-family: monospace;
  color: #a5b4fc;
}

.sections-accordion {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
}

.context-sec-item {
  background: rgba(255, 255, 255, 0.03);
  padding: 6px 8px;
  border-radius: 4px;
}

.sec-item-title {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #e0e7ff;
  margin-bottom: 2px;
}

.sec-item-content {
  font-size: 11px;
  color: var(--text-muted, #9ca3af);
  margin: 0;
  line-height: 1.4;
  white-space: pre-wrap;
}
</style>
