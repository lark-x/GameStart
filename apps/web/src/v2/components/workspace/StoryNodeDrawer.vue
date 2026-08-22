<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  MapPin,
  Save,
  ShieldAlert,
  Sparkles,
  User,
} from "@lucide/vue";
import Button from "../../../components/ui/Button.vue";
import Drawer from "../../../components/ui/Drawer.vue";
import Field from "../../../components/ui/Field.vue";
import Input from "../../../components/ui/Input.vue";
import Select from "../../../components/ui/Select.vue";
import Textarea from "../../../components/ui/Textarea.vue";
import type { V2WorkspaceSnapshot } from "../../adapters";
import { useV2WorkspaceStore } from "../../stores/workspace";
import type { StorySkillNode } from "./StoryInspectionCard.vue";

export type CanonEntityKind = "world" | "location" | "character" | "fact" | "rule" | "timeline" | "scene" | "state";
export type StoryEditingNode = StorySkillNode;

const props = defineProps<{
  open: boolean;
  initialKind?: CanonEntityKind;
  editingNode?: StorySkillNode | null;
  snapshot: V2WorkspaceSnapshot | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  saved: [];
}>();

const store = useV2WorkspaceStore();

const kind = ref<CanonEntityKind>(props.initialKind ?? "character");
const name = ref("");
const summary = ref("");
const text = ref("");
const persona = ref("");
const localDate = ref("");
const visibility = ref<"creator_only" | "player_visible">("player_visible");
const severity = ref<"guideline" | "required">("guideline");
const homeLocationId = ref("");
const stateKey = ref("");
const stateDefaultValue = ref("false");
const sceneBody = ref("");
const sceneArcId = ref("");

// 🎯 叙事影响作用选择
const storyRole = ref("");
const saving = ref(false);
const error = ref<string | null>(null);

const locations = computed(() => props.snapshot?.world.locations ?? []);
const arcs = computed(() => props.snapshot?.sceneGraph.arcs ?? []);

const storyRolePresets = computed(() => {
  const map: Record<CanonEntityKind, readonly { label: string; impact: string }[]> = {
    world: [
      { label: "主线故事世界", impact: "承载所有正典角色与生活物语的主世界观基石" },
    ],
    location: [
      { label: "主线核心舞台", impact: "大部分剧情场景与事件的核心发生地" },
      { label: "角色常驻居所", impact: "特定角色的生活环境与日常伴侣互动地点" },
      { label: "未知探险区域", impact: "用于支线剧情或触发特殊探索事件" },
    ],
    character: [
      { label: "主线故事主角", impact: "承担剧情推进与重要决策的核心人物" },
      { label: "关键伙伴/伴侣", impact: "支持即时对白、伴侣动态与好感度羁绊" },
      { label: "世界观引导 NPC", impact: "提供主线线索与特定场景对话" },
    ],
    fact: [
      { label: "世界观常识设定", impact: "注入所有 AI 对话与场景生成上下文" },
      { label: "关键剧情伏笔", impact: "仅创作者可见，用于剧情分析器推演" },
    ],
    rule: [
      { label: "行为硬性禁忌", impact: "生成与审校时必须遵循的铁律" },
      { label: "风格叙事指导", impact: "引导剧情生成保持设定的语言调性" },
    ],
    timeline: [
      { label: "史诗历史背景", impact: "世界观建立前置事件，丰富世界深度" },
      { label: "当前剧幕主线事件", impact: "故事推进过程中的里程碑时刻" },
    ],
    scene: [
      { label: "主线必经节点", impact: "玩家必经的核心剧情场景" },
      { label: "分支探索剧情", impact: "玩家通过特定选项开启的隐藏路线" },
    ],
    state: [
      { label: "关键剧情开关", impact: "控制后续场景选项的进入门禁" },
      { label: "角色好感度计数", impact: "随对话与决策动态增减" },
    ],
  };
  return map[kind.value] ?? [];
});

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    error.value = null;
    if (props.editingNode) {
      kind.value = props.editingNode.kind;
      name.value = props.editingNode.title;
      summary.value = props.editingNode.description ?? "";
      storyRole.value = props.editingNode.roleImpact ?? "";
      // Specific mappings
      const raw = props.editingNode.rawData as Record<string, unknown> | undefined;
      if (raw) {
        if (typeof raw.personaText === "string") persona.value = raw.personaText;
        if (typeof raw.homeLocationId === "string") homeLocationId.value = raw.homeLocationId;
        if (typeof raw.text === "string") text.value = raw.text;
        if (typeof raw.localDate === "string") localDate.value = raw.localDate;
        if (typeof raw.body === "string") sceneBody.value = raw.body;
        if (typeof raw.arcId === "string") sceneArcId.value = raw.arcId;
        if (typeof raw.key === "string") stateKey.value = raw.key;
      }
    } else {
      kind.value = props.initialKind ?? "character";
      name.value = "";
      summary.value = "";
      text.value = "";
      persona.value = "";
      localDate.value = "";
      stateKey.value = "";
      stateDefaultValue.value = "false";
      sceneBody.value = "";
      sceneArcId.value = arcs.value[0]?.arcId ?? "";
      homeLocationId.value = locations.value[0]?.locationId ?? "";
      storyRole.value = storyRolePresets.value[0]?.label ?? "";
    }
  }
});

watch(kind, () => {
  if (!props.editingNode) {
    storyRole.value = storyRolePresets.value[0]?.label ?? "";
  }
});

async function handleSave(): Promise<void> {
  error.value = null;
  saving.value = true;
  try {
    const isEditing = Boolean(props.editingNode);
    const id = props.editingNode?.id;

    if (kind.value === "location") {
      const input = {
        name: name.value.trim(),
        ...(summary.value.trim() ? { summary: summary.value.trim() } : {}),
      };
      if (isEditing && id) await store.updateCanonEntity({ kind: "location", id, input });
      else await store.createCanonEntity({ kind: "location", input });
    } else if (kind.value === "character") {
      const characterInput = {
        name: name.value.trim(),
        ...(isEditing
          ? { summary: summary.value.trim() || null, personaText: persona.value.trim() || null }
          : {
              ...(summary.value.trim() ? { summary: summary.value.trim() } : {}),
              ...(persona.value.trim() ? { personaText: persona.value.trim() } : {}),
            }),
        ...(homeLocationId.value ? { homeLocationId: homeLocationId.value as never } : {}),
        ...(isEditing && !homeLocationId.value ? { homeLocationId: null as never } : {}),
      };
      if (isEditing && id) await store.updateCanonEntity({ kind: "character", id, input: characterInput });
      else await store.createCanonEntity({ kind: "character", input: characterInput });
    } else if (kind.value === "fact") {
      const input = { text: text.value.trim() || name.value.trim(), visibility: visibility.value };
      if (isEditing && id) await store.updateCanonEntity({ kind: "fact", id, input });
      else await store.createCanonEntity({ kind: "fact", input });
    } else if (kind.value === "rule") {
      const input = { text: text.value.trim() || name.value.trim(), severity: severity.value };
      if (isEditing && id) await store.updateCanonEntity({ kind: "rule", id, input });
      else await store.createCanonEntity({ kind: "rule", input });
    } else if (kind.value === "timeline") {
      const input = {
        localDate: localDate.value || new Date().toISOString().slice(0, 10),
        title: name.value.trim(),
        ...(summary.value.trim() ? { summary: summary.value.trim() } : {}),
      };
      if (isEditing && id) await store.updateCanonEntity({ kind: "timeline", id, input });
      else await store.createCanonEntity({ kind: "timeline", input });
    }

    if (store.error) throw new Error(store.error);
    emit("update:open", false);
    emit("saved");
  } catch (err) {
    error.value = err instanceof Error ? err.message : "保存设定失败";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Drawer
    :open="open"
    :title="editingNode ? '编辑故事设定' : '影响驱动型设定录入'"
    :description="editingNode ? '修改设定并同步更新故事下游消费' : '定义新设定的同时指明其在故事流程中的作用与影响'"
    @close="emit('update:open', false)"
    @update:open="emit('update:open', $event)"
  >
    <div class="story-node-drawer-content">
      <!-- 类别切换（仅新增时可选） -->
      <div v-if="!editingNode" class="kind-picker-group">
        <span class="picker-label">设定类别</span>
        <div class="kind-pills">
          <button
            type="button"
            class="kind-pill"
            :class="{ active: kind === 'character' }"
            @click="kind = 'character'"
          >
            <User :size="14" /> 角色
          </button>
          <button
            type="button"
            class="kind-pill"
            :class="{ active: kind === 'location' }"
            @click="kind = 'location'"
          >
            <MapPin :size="14" /> 地点
          </button>
          <button
            type="button"
            class="kind-pill"
            :class="{ active: kind === 'rule' }"
            @click="kind = 'rule'"
          >
            <ShieldAlert :size="14" /> 规则
          </button>
          <button
            type="button"
            class="kind-pill"
            :class="{ active: kind === 'fact' }"
            @click="kind = 'fact'"
          >
            <BookOpen :size="14" /> 事实
          </button>
          <button
            type="button"
            class="kind-pill"
            :class="{ active: kind === 'timeline' }"
            @click="kind = 'timeline'"
          >
            <Clock3 :size="14" /> 时间线
          </button>
        </div>
      </div>

      <!-- 🎯 故事作用选择器 (叙事影响驱动) -->
      <div class="impact-picker-card">
        <div class="impact-picker-head">
          <Sparkles :size="15" class="impact-head-icon" />
          <strong>在故事流程中的定位与作用</strong>
        </div>
        <div class="impact-presets">
          <button
            v-for="(preset, idx) in storyRolePresets"
            :key="idx"
            type="button"
            class="impact-preset-btn"
            :class="{ selected: storyRole === preset.label }"
            @click="storyRole = preset.label"
          >
            <CheckCircle2 v-if="storyRole === preset.label" :size="14" class="preset-check" />
            <div class="preset-texts">
              <span class="preset-title">{{ preset.label }}</span>
              <span class="preset-impact">{{ preset.impact }}</span>
            </div>
          </button>
        </div>
      </div>

      <!-- 基础字段表单 -->
      <form class="drawer-form" @submit.prevent="handleSave">
        <!-- 角色字段 -->
        <template v-if="kind === 'character'">
          <Field label="角色名称" required>
            <Input v-model="name" placeholder="例如：芙宁娜" required />
          </Field>
          <Field label="角色简述 / 身份">
            <Input v-model="summary" placeholder="例如：前水神与枫丹最瞩目的舞台明星" />
          </Field>
          <Field label="详细人设 / Persona" hint="对白生成与角色性格的核心指引">
            <Textarea v-model="persona" :rows="3" placeholder="外表傲娇任性，其实内心细腻，喜爱歌剧与甜点..." />
          </Field>
          <Field v-if="locations.length > 0" label="常驻 / 居所地点">
            <Select v-model="homeLocationId">
              <option value="">暂不绑定地点</option>
              <option v-for="loc in locations" :key="loc.locationId" :value="loc.locationId">
                {{ loc.name }}
              </option>
            </Select>
          </Field>
        </template>

        <!-- 地点字段 -->
        <template v-else-if="kind === 'location'">
          <Field label="地点名称" required>
            <Input v-model="name" placeholder="例如：欧庇克莱歌剧院" required />
          </Field>
          <Field label="地点环境与场景描述">
            <Textarea v-model="summary" :rows="3" placeholder="宏伟的水上歌剧院，枫丹审判与演出的核心地标..." />
          </Field>
        </template>

        <!-- 规则与事实字段 -->
        <template v-else-if="kind === 'rule' || kind === 'fact'">
          <Field :label="kind === 'rule' ? '规则内容' : '事实内容'" required>
            <Textarea v-model="text" :rows="3" :placeholder="kind === 'rule' ? '例如：在枫丹审判庭上，谕示裁定枢机拥有最高裁决权。' : '例如：枫丹廷依靠律偿混能驱动发条机关。'" required />
          </Field>
          <Field v-if="kind === 'rule'" label="规则约束等级">
            <Select v-model="severity">
              <option value="guideline">软约束（风格参考）</option>
              <option value="required">硬约束（必须严格遵守）</option>
            </Select>
          </Field>
          <Field v-else label="公开可见度">
            <Select v-model="visibility">
              <option value="player_visible">玩家可见（世界观常识）</option>
              <option value="creator_only">仅创作者可见（隐藏暗线）</option>
            </Select>
          </Field>
        </template>

        <!-- 时间线字段 -->
        <template v-else-if="kind === 'timeline'">
          <Field label="事件发生日期 / 年代" required>
            <Input v-model="localDate" placeholder="例如：2026-08-22 或 枫丹历480年" required />
          </Field>
          <Field label="事件标题" required>
            <Input v-model="name" placeholder="例如：大魔术师的首场公演" required />
          </Field>
          <Field label="事件始末简述">
            <Textarea v-model="summary" :rows="3" placeholder="记录事件的核心起因与影响..." />
          </Field>
        </template>

        <p v-if="error" class="drawer-error" role="alert">{{ error }}</p>

        <div class="drawer-actions">
          <Button variant="primary" size="md" type="submit" :loading="saving">
            <Save :size="15" aria-hidden="true" />
            {{ editingNode ? "保存修改" : "确认保存设定" }}
          </Button>
          <Button variant="secondary" size="md" :disabled="saving" @click="emit('update:open', false)">
            取消
          </Button>
        </div>
      </form>
    </div>
  </Drawer>
</template>

<style scoped>
.story-node-drawer-content {
  display: grid;
  gap: var(--space-4);
}

.kind-picker-group {
  display: grid;
  gap: var(--space-1);
}

.picker-label {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.kind-pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.kind-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: var(--surface-soft);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--motion-fast);
}

.kind-pill:hover {
  border-color: var(--primary);
  background: var(--surface);
}

.kind-pill.active {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-primary);
}

.impact-picker-card {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  border: 1px solid var(--border);
}

.impact-picker-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--primary);
  font-size: 13px;
}

.impact-head-icon {
  flex-shrink: 0;
}

.impact-presets {
  display: grid;
  gap: var(--space-2);
}

.impact-preset-btn {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition: all var(--motion-fast);
}

.impact-preset-btn:hover {
  border-color: var(--primary);
}

.impact-preset-btn.selected {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.preset-check {
  color: var(--primary);
  margin-top: 2px;
  flex-shrink: 0;
}

.preset-texts {
  display: grid;
  gap: 2px;
}

.preset-title {
  color: var(--text-strong);
  font-size: 13px;
  font-weight: 700;
}

.preset-impact {
  color: var(--muted);
  font-size: 11px;
}

.drawer-form {
  display: grid;
  gap: var(--space-3);
}

.drawer-error {
  margin: 0;
  color: var(--danger);
  font-size: 12px;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  border: 1px solid var(--danger);
}

.drawer-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
</style>
