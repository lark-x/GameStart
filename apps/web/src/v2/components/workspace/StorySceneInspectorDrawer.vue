<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  GitBranch,
  Plus,
  Save,
  Star,
  User,
  X,
} from "@lucide/vue";
import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Drawer from "../../../components/ui/Drawer.vue";
import Field from "../../../components/ui/Field.vue";
import Input from "../../../components/ui/Input.vue";
import Select from "../../../components/ui/Select.vue";
import Textarea from "../../../components/ui/Textarea.vue";
import { useV2WorkspaceStore } from "../../stores/workspace.ts";
import type {
  V2ChoiceSummary,
  V2SceneSummary,
  V2WorkspaceSnapshot,
} from "../../adapters/types.ts";

const props = defineProps<{
  open: boolean;
  scene: V2SceneSummary | null;
  snapshot: V2WorkspaceSnapshot | null;
  initialArcId?: string | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  close: [];
  saved: [];
}>();

const store = useV2WorkspaceStore();

const isEditing = computed(() => props.scene !== null);

const title = ref("");
const body = ref("");
const arcId = ref("");
const isEntry = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);

// New choice branch creator within the drawer
const showNewChoiceForm = ref(false);
const newChoiceLabel = ref("");
const newChoiceTargetSceneId = ref("");
const creatingChoice = ref(false);

watch(
  () => props.scene,
  (s) => {
    if (s) {
      title.value = s.title;
      body.value = s.body || "";
      arcId.value = s.arcId || "";
      isEntry.value = s.isEntry;
    } else {
      title.value = "";
      body.value = "";
      arcId.value = props.initialArcId || "";
      isEntry.value = false;
    }
    showNewChoiceForm.value = false;
    newChoiceLabel.value = "";
    newChoiceTargetSceneId.value = "";
    error.value = null;
  },
  { immediate: true },
);

// Choices originating from this scene
const outboundChoices = computed<readonly V2ChoiceSummary[]>(() => {
  if (!props.scene || !props.snapshot) return [];
  return props.snapshot.sceneGraph.choices.filter(
    (c) => c.sourceSceneId === props.scene?.sceneId,
  );
});

// Other scenes that can be chosen as target
const candidateTargetScenes = computed(() => {
  if (!props.snapshot) return [];
  return props.snapshot.sceneGraph.scenes.filter(
    (s) => s.sceneId !== props.scene?.sceneId,
  );
});

// Detect mentioned characters in body
const mentionedCharacters = computed(() => {
  if (!props.snapshot) return [];
  const text = (title.value + " " + body.value).toLowerCase();
  return props.snapshot.world.characters.filter((c) =>
    text.includes(c.name.toLowerCase()),
  );
});

function insertCharacterMention(name: string) {
  if (!body.value.includes(name)) {
    body.value = body.value ? body.value + "。" + name + "在此处登场。" : name + "在此处登场。";
  }
}

function targetSceneName(targetId: string | undefined): string {
  if (!targetId) return "不指定（开放分支）";
  const found = props.snapshot?.sceneGraph.scenes.find((s) => s.sceneId === targetId);
  return found ? found.title : targetId;
}

async function handleSaveScene() {
  if (!title.value.trim()) {
    error.value = "请输入场景标题";
    return;
  }
  saving.value = true;
  error.value = null;
  try {
    if (isEditing.value && props.scene) {
      await store.updateGraphEntity({
        kind: "scene",
        id: props.scene.sceneId,
        input: {
          title: title.value.trim(),
          body: body.value.trim(),
          arcId: arcId.value || undefined,
          isEntry: isEntry.value,
        },
      });
    } else {
      await store.createGraphEntity({
        kind: "scene",
        input: {
          title: title.value.trim(),
          body: body.value.trim(),
          arcId: arcId.value || undefined,
          isEntry: isEntry.value,
        },
      });
    }
    if (store.error) throw new Error(store.error);
    emit("update:open", false);
    emit("saved");
  } catch (err) {
    error.value = err instanceof Error ? err.message : "保存场景失败";
  } finally {
    saving.value = false;
  }
}

async function handleAddChoice() {
  if (!props.scene || !newChoiceLabel.value.trim()) return;
  creatingChoice.value = true;
  try {
    await store.createGraphEntity({
      kind: "choice",
      input: {
        sourceSceneId: props.scene.sceneId,
        targetSceneId: newChoiceTargetSceneId.value || undefined,
        label: newChoiceLabel.value.trim(),
        gates: [],
        consequences: [],
      },
    });
    newChoiceLabel.value = "";
    newChoiceTargetSceneId.value = "";
    showNewChoiceForm.value = false;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "创建分支失败";
  } finally {
    creatingChoice.value = false;
  }
}
</script>

<template>
  <Drawer
    :open="open"
    :title="isEditing ? '场景剧本与分支检视' : '新增剧幕场景'"
    :description="isEditing ? '配置场景剧情、参演角色与引申分支抉择' : '在当前故事篇章中创建新的场景节点'"
    @close="emit('update:open', false)"
    @update:open="emit('update:open', $event)"
  >
    <div class="scene-inspector-content">
      <form class="inspector-form" @submit.prevent="handleSaveScene">
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>

        <!-- 场景基本属性 -->
        <Field label="场景标题" hint="例如：歌剧院初遇、审判席上的对峙" required>
          <Input
            v-model="title"
            placeholder="场景标题"
            required
            aria-label="场景标题"
          />
        </Field>

        <div class="form-row-2">
          <Field label="篇章归属 (Arc)" hint="场景所属的剧幕阶段">
            <Select v-model="arcId" aria-label="篇章归属">
              <option value="">独立 / 序章场景</option>
              <option
                v-for="arc in snapshot?.sceneGraph.arcs"
                :key="arc.arcId"
                :value="arc.arcId"
              >
                {{ arc.title }}
              </option>
            </Select>
          </Field>

          <Field label="起始入口" hint="是否作为剧情起点">
            <div class="entry-toggle-wrap">
              <label class="entry-label">
                <input v-model="isEntry" type="checkbox" class="entry-checkbox" />
                <span class="entry-text">
                  <Star :size="14" class="entry-icon" />
                  设为故事起点场景
                </span>
              </label>
            </div>
          </Field>
        </div>

        <!-- 剧情正文与人设提示词 -->
        <Field
          label="剧本正文与提示词大纲"
          hint="描述场景中的发生情节、环境描写与角色对话指引"
        >
          <Textarea
            v-model="body"
            :rows="6"
            placeholder="描述此场景的关键事件、角色言行、戏剧冲突以及环境氛围..."
            aria-label="剧本正文"
          />
        </Field>

        <!-- 参演角色提示与快选 -->
        <div class="character-mention-section">
          <div class="mention-head">
            <User :size="13" />
            <span>参演角色阵容</span>
          </div>
          <div v-if="snapshot?.world.characters.length" class="mention-chips">
            <button
              v-for="char in snapshot.world.characters"
              :key="char.characterId"
              type="button"
              class="mention-chip"
              :class="{ active: mentionedCharacters.some((c) => c.characterId === char.characterId) }"
              @click="insertCharacterMention(char.name)"
            >
              <span class="chip-avatar-sm">{{ char.name.slice(0, 1) }}</span>
              <span>{{ char.name }}</span>
              <span
                v-if="mentionedCharacters.some((c) => c.characterId === char.characterId)"
                class="chip-check"
              >✓</span>
            </button>
          </div>
          <small class="mention-hint">点击角色名称可将其登场指令快捷追加至正文大纲。</small>
        </div>

        <!-- 场景引申出的分支抉择 -->
        <div v-if="isEditing" class="choices-manager-section">
          <div class="choices-head">
            <div class="choices-title">
              <GitBranch :size="15" />
              <h4>引申分支抉择 ({{ outboundChoices.length }})</h4>
            </div>
            <Button
              v-if="!showNewChoiceForm"
              variant="ghost"
              size="sm"
              type="button"
              @click="showNewChoiceForm = true"
            >
              <Plus :size="14" /> 添加分支选项
            </Button>
          </div>

          <!-- 分支列表 -->
          <div v-if="outboundChoices.length > 0" class="choices-list">
            <div
              v-for="choice in outboundChoices"
              :key="choice.choiceId"
              class="choice-item-card"
            >
              <div class="choice-item-main">
                <span class="choice-tag">选项</span>
                <strong class="choice-label">“{{ choice.label }}”</strong>
                <span class="choice-arrow">➔</span>
                <span class="choice-target">跳转至：{{ targetSceneName(choice.targetSceneId) }}</span>
              </div>
              <div v-if="choice.gates && choice.gates.length > 0" class="choice-gates-preview">
                <Badge tone="warning">
                  门禁: {{ choice.gates.map((g) => g.stateKey + ' ' + g.operator + ' ' + g.value).join(', ') }}
                </Badge>
              </div>
            </div>
          </div>
          <div v-else class="empty-choices-hint">
            暂无从此场景出发的分支选项。点击上方「添加分支选项」为玩家或 AI 提供决策路径。
          </div>

          <!-- 快速新增分支表单 -->
          <div v-if="showNewChoiceForm" class="new-choice-form-card">
            <div class="new-choice-head">
              <strong>新增分支抉择</strong>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                @click="showNewChoiceForm = false"
              >
                <X :size="14" />
              </Button>
            </div>
            <Field label="选项文本" hint="例如：选择相信克洛琳德的证词" required>
              <Input
                v-model="newChoiceLabel"
                placeholder="玩家在界面中点击的选项文字"
                required
              />
            </Field>
            <Field label="目标跳转场景" hint="选择该选项后推进到的下一个场景">
              <Select v-model="newChoiceTargetSceneId">
                <option value="">开放分支 / 待指定</option>
                <option
                  v-for="cand in candidateTargetScenes"
                  :key="cand.sceneId"
                  :value="cand.sceneId"
                >
                  {{ cand.title }}
                </option>
              </Select>
            </Field>
            <div class="new-choice-actions">
              <Button
                variant="primary"
                size="sm"
                type="button"
                :loading="creatingChoice"
                :disabled="!newChoiceLabel.trim()"
                @click="handleAddChoice"
              >
                确认添加分支
              </Button>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                @click="showNewChoiceForm = false"
              >
                取消
              </Button>
            </div>
          </div>
        </div>

        <!-- 抽屉底部操作栏 -->
        <div class="inspector-actions">
          <Button variant="primary" size="md" type="submit" :loading="saving">
            <Save :size="15" />
            {{ isEditing ? "保存场景修改" : "创建场景节点" }}
          </Button>
          <Button
            variant="ghost"
            size="md"
            type="button"
            @click="emit('update:open', false)"
          >
            取消
          </Button>
        </div>
      </form>
    </div>
  </Drawer>
</template>

<style scoped>
.scene-inspector-content {
  display: grid;
  gap: var(--space-4);
}

.inspector-form {
  display: grid;
  gap: var(--space-4);
}

.form-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  align-items: start;
}

.entry-toggle-wrap {
  display: flex;
  align-items: center;
  height: 38px;
}

.entry-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-strong);
  cursor: pointer;
}

.entry-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
}

.entry-text {
  display: flex;
  align-items: center;
  gap: 5px;
}

.entry-icon {
  color: var(--warning, #f59e0b);
}

.character-mention-section {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  border: 1px solid var(--border);
}

.mention-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-strong);
}

.mention-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.mention-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px 3px 4px;
  border-radius: var(--radius-full);
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--text);
  cursor: pointer;
  transition: all var(--motion-fast);
}

.mention-chip:hover {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.mention-chip.active {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 600;
}

.chip-avatar-sm {
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  background: var(--primary);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chip-check {
  font-size: 11px;
  font-weight: 700;
  color: var(--primary);
}

.mention-hint {
  font-size: 11px;
  color: var(--muted);
}

.choices-manager-section {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  border: 1px solid var(--border);
}

.choices-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.choices-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--primary);
}

.choices-title h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-strong);
}

.choices-list {
  display: grid;
  gap: var(--space-2);
}

.choice-item-card {
  display: grid;
  gap: 4px;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--border);
}

.choice-item-main {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  flex-wrap: wrap;
}

.choice-tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: var(--radius-xs);
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 700;
}

.choice-label {
  color: var(--text-strong);
}

.choice-arrow {
  color: var(--muted);
}

.choice-target {
  color: var(--muted);
}

.empty-choices-hint {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.6;
}

.new-choice-form-card {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--primary);
  box-shadow: var(--shadow-sm);
}

.new-choice-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-strong);
}

.new-choice-actions {
  display: flex;
  gap: var(--space-2);
}

.inspector-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}

.form-error {
  margin: 0;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  border: 1px solid var(--danger);
  color: var(--danger);
  font-size: 12px;
}
</style>
