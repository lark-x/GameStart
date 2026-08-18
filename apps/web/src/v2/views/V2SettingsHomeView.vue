<script setup lang="ts">
import { Activity, Cpu, Image as ImageIcon, Palette, ScrollText, Settings2, Sparkles } from "@lucide/vue";
import { RouterLink } from "vue-router";

import Badge from "../../components/ui/Badge.vue";
import PageHeader from "../../components/layout/PageHeader.vue";

interface SettingsEntry {
  readonly to: string;
  readonly label: string;
  readonly description: string;
  readonly icon: typeof Cpu;
  readonly badge?: string;
  readonly soon?: boolean;
}

interface SettingsGroup {
  readonly label: string;
  readonly entries: readonly SettingsEntry[];
}

const groups: readonly SettingsGroup[] = [
  {
    label: "AI",
    entries: [
      {
        to: "/v2/services/models",
        label: "模型",
        description: "管理模型档案、API 密钥和不同功能的模型绑定。",
        icon: Cpu,
      },
      {
        to: "/v2/services/models",
        label: "Memory",
        description: "长期记忆引擎与评估（即将推出）。",
        icon: Sparkles,
        soon: true,
      },
      {
        to: "/v2/services/models",
        label: "Prompt",
        description: "提示词模板管理（即将推出）。",
        icon: ScrollText,
        soon: true,
      },
    ],
  },
  {
    label: "生成",
    entries: [
      {
        to: "/v2/services/comfyui",
        label: "ComfyUI",
        description: "配置 ComfyUI 地址、超时和默认工作流版本。",
        icon: ImageIcon,
      },
    ],
  },
  {
    label: "系统",
    entries: [
      {
        to: "/v2/services/runtime",
        label: "运行状态",
        description: "查看服务健康、版本和外部连接状态。",
        icon: Activity,
      },
      {
        to: "/v2/services/logs",
        label: "调用日志",
        description: "查看模型调用记录与错误详情。",
        icon: ScrollText,
      },
      {
        to: "/v2/automation",
        label: "触发器",
        description: "自动化与定时任务配置。",
        icon: Settings2,
      },
    ],
  },
  {
    label: "界面",
    entries: [
      {
        to: "/v2/settings/appearance",
        label: "外观",
        description: "选择平台皮肤主题，统一工作区的视觉令牌。",
        icon: Palette,
      },
    ],
  },
];
</script>

<template>
  <div class="v2-settings-home">
    <PageHeader
      eyebrow="平台配置"
      title="把系统配置集中在这里"
      description="模型、图片服务和界面外观彼此独立，后续新增能力可以沿着同一配置边界扩展。"
    />

    <section v-for="group in groups" :key="group.label" class="v2-settings-group">
      <h2 class="v2-settings-group-title">{{ group.label }}</h2>
      <div class="v2-settings-grid">
        <component
          :is="entry.soon ? 'div' : RouterLink"
          v-for="entry in group.entries"
          :key="entry.label"
          :to="entry.to"
          class="v2-settings-card"
          :class="{ 'v2-settings-card-soon': entry.soon }"
        >
          <div class="v2-settings-card-icon"><component :is="entry.icon" :size="21" aria-hidden="true" /></div>
          <div class="v2-settings-card-copy">
            <div class="v2-settings-card-title">
              <h3>{{ entry.label }}</h3>
              <Badge v-if="entry.soon" tone="neutral">即将推出</Badge>
            </div>
            <p>{{ entry.description }}</p>
            <span v-if="!entry.soon" class="v2-settings-card-link">打开配置 <span aria-hidden="true">→</span></span>
          </div>
        </component>
      </div>
    </section>
  </div>
</template>

<style scoped>
.v2-settings-home {
  display: grid;
  gap: var(--space-6);
}

.v2-settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-4);
}

.v2-settings-group {
  display: grid;
  gap: var(--space-3);
}

.v2-settings-group-title {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.v2-settings-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 160px;
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: inherit;
  text-decoration: none;
  box-shadow: var(--shadow-sm);
  transition: border-color var(--motion-fast), transform var(--motion-fast), box-shadow var(--motion-fast);
}

.v2-settings-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.v2-settings-card-soon {
  opacity: 0.55;
  cursor: default;
}

.v2-settings-card-soon:hover {
  border-color: var(--border);
  box-shadow: var(--shadow-sm);
  transform: none;
}

.v2-settings-card-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--primary-soft);
  color: var(--primary);
}

.v2-settings-card-copy {
  display: grid;
  gap: var(--space-2);
}

.v2-settings-card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.v2-settings-card h3 {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-lg);
}

.v2-settings-card p {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-sm);
  line-height: 1.6;
}

.v2-settings-card-link {
  color: var(--primary);
  font-size: var(--text-sm);
  font-weight: 800;
}

@media (max-width: 820px) {
  .v2-settings-grid {
    grid-template-columns: 1fr;
  }
}
</style>
