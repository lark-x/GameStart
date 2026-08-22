<script setup lang="ts">
import { computed } from "vue";
import {
  BookOpen,
  ChevronRight,
  Clock3,
  GitFork,
  Layers3,
  MapPin,
  Pencil,
  ShieldAlert,
  Sparkles,
  User,
  X,
} from "@lucide/vue";
import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Card from "../../../components/ui/Card.vue";
import type { V2WorkspaceSnapshot } from "../../adapters";

export interface StorySkillNode {
  readonly id: string;
  readonly tier: 1 | 2 | 3 | 4;
  readonly kind: "world" | "location" | "character" | "fact" | "rule" | "timeline" | "scene" | "state";
  readonly title: string;
  readonly subtitle?: string;
  readonly description?: string;
  readonly roleImpact?: string;
  readonly consumers?: readonly string[];
  readonly rawData?: unknown;
}

const props = defineProps<{
  node: StorySkillNode | null;
  snapshot: V2WorkspaceSnapshot | null;
}>();

const emit = defineEmits<{
  close: [];
  edit: [node: StorySkillNode];
}>();

const kindMeta = computed<{ label: string; icon: typeof BookOpen; tone: "info" | "success" | "warning" | "danger" | "neutral" }>(() => {
  if (!props.node) return { label: "未知", icon: BookOpen, tone: "neutral" };
  const map: Record<string, { label: string; icon: typeof BookOpen; tone: "info" | "success" | "warning" | "danger" | "neutral" }> = {
    world: { label: "世界观设定", icon: BookOpen, tone: "info" },
    location: { label: "舞台地点", icon: MapPin, tone: "info" },
    character: { label: "正典角色", icon: User, tone: "success" },
    fact: { label: "世界事实", icon: BookOpen, tone: "neutral" },
    rule: { label: "世界规则", icon: ShieldAlert, tone: "warning" },
    timeline: { label: "时间线事件", icon: Clock3, tone: "neutral" },
    scene: { label: "剧情场景", icon: GitFork, tone: "info" },
    state: { label: "逻辑变量", icon: Layers3, tone: "warning" },
  };
  return map[props.node.kind] ?? { label: "设定节点", icon: Sparkles, tone: "neutral" };
});

const downstreamImpacts = computed(() => {
  if (!props.node) return [];
  const impacts: { label: string; target: string; tone: "success" | "info" | "warning" | "neutral" }[] = [];

  if (props.node.kind === "world") {
    impacts.push({ label: "基线约束", target: "全部场景与对话提示词", tone: "success" });
    impacts.push({ label: "世界设定", target: "向玩家公开的背景设定", tone: "info" });
  } else if (props.node.kind === "location") {
    impacts.push({ label: "场景舞台", target: "可作为剧情场景的发生地点", tone: "info" });
    impacts.push({ label: "角色常驻", target: "关联角色的居所或行动区域", tone: "neutral" });
  } else if (props.node.kind === "character") {
    impacts.push({ label: "对话交互", target: "即时对白与伴侣专区互动", tone: "success" });
    impacts.push({ label: "剧情出场", target: "主线故事图谱登场角色", tone: "info" });
    impacts.push({ label: "记忆提取", target: "Memory Consolidation 记忆追踪", tone: "neutral" });
  } else if (props.node.kind === "fact") {
    impacts.push({ label: "AI 知识库", target: "注入故事生成与剧情分析上下文", tone: "info" });
  } else if (props.node.kind === "rule") {
    impacts.push({ label: "硬性约束", target: "剧情生成与审校门禁校验", tone: "warning" });
  } else if (props.node.kind === "scene") {
    impacts.push({ label: "玩家试玩", target: "正式发布版本中的可游玩节点", tone: "success" });
    impacts.push({ label: "分支决策", target: "产生选项与状态跳转", tone: "info" });
  } else if (props.node.kind === "state") {
    impacts.push({ label: "分支条件", target: "控制场景选项的进入门禁", tone: "warning" });
  }

  return impacts;
});
</script>

<template>
  <Card v-if="node" class="story-inspection-card">
    <div class="inspection-header">
      <div class="inspection-title-wrap">
        <div class="inspection-icon-badge">
          <component :is="kindMeta.icon" :size="16" aria-hidden="true" />
        </div>
        <div class="inspection-title-texts">
          <p class="inspection-kicker">TIER {{ node.tier }} 节点检视</p>
          <h4>{{ node.title }}</h4>
        </div>
      </div>
      <Button variant="ghost" size="icon" aria-label="关闭检视面板" @click="emit('close')">
        <X :size="16" aria-hidden="true" />
      </Button>
    </div>

    <div class="inspection-body">
      <div class="inspection-badge-row">
        <Badge :tone="kindMeta.tone">{{ kindMeta.label }}</Badge>
        <span v-if="node.subtitle" class="inspection-sub-tag">{{ node.subtitle }}</span>
      </div>

      <div class="inspection-section">
        <span class="section-label">设定描述</span>
        <p class="section-content">{{ node.description || "暂无详细描述" }}</p>
      </div>

      <div class="inspection-section">
        <span class="section-label">🎯 在故事流程中的作用</span>
        <div class="role-impact-box">
          <strong>{{ node.roleImpact || "未明确定义故事用途" }}</strong>
          <p class="role-impact-hint">此节点作为故事基石的一部分，参与后续剧情推理、对话交互与分支判定。</p>
        </div>
      </div>

      <div class="inspection-section">
        <span class="section-label">🔗 叙事影响与消费位置</span>
        <div class="impact-list">
          <div v-for="(item, idx) in downstreamImpacts" :key="idx" class="impact-item">
            <Badge :tone="item.tone" size="sm">{{ item.label }}</Badge>
            <span class="impact-target">{{ item.target }}</span>
            <ChevronRight :size="13" class="impact-chevron" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>

    <div class="inspection-footer">
      <Button variant="primary" size="md" class="edit-node-btn" @click="emit('edit', node)">
        <Pencil :size="14" aria-hidden="true" />
        编辑此设定
      </Button>
    </div>
  </Card>
</template>

<style scoped>
.story-inspection-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  min-width: 0;
}

.inspection-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
}

.inspection-title-wrap {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.inspection-icon-badge {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: var(--primary-soft);
  color: var(--primary);
  flex-shrink: 0;
}

.inspection-title-texts {
  min-width: 0;
}

.inspection-kicker {
  margin: 0 0 2px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.inspection-title-texts h4 {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-md);
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspection-body {
  display: grid;
  gap: var(--space-3);
  overflow-y: auto;
  max-height: calc(100vh - 360px);
  padding-right: 2px;
}

.inspection-badge-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.inspection-sub-tag {
  color: var(--muted);
  font-size: 12px;
}

.inspection-section {
  display: grid;
  gap: 4px;
}

.section-label {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.section-content {
  margin: 0;
  color: var(--text);
  font-size: 13px;
  line-height: 1.5;
  background: var(--surface-soft);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.role-impact-box {
  display: grid;
  gap: 3px;
  padding: var(--space-2) var(--space-3);
  background: var(--primary-soft);
  border: 1px solid var(--primary);
  border-radius: var(--radius-md);
}

.role-impact-box strong {
  color: var(--primary);
  font-size: 13px;
  font-weight: 800;
}

.role-impact-hint {
  margin: 0;
  color: var(--text);
  font-size: 11px;
  line-height: 1.4;
  opacity: 0.85;
}

.impact-list {
  display: grid;
  gap: 4px;
}

.impact-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
  border: 1px solid var(--border);
  font-size: 12px;
}

.impact-target {
  flex: 1;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.impact-chevron {
  color: var(--muted);
  flex-shrink: 0;
}

.inspection-footer {
  padding-top: var(--space-2);
  border-top: 1px solid var(--border);
}

.edit-node-btn {
  width: 100%;
}
</style>
