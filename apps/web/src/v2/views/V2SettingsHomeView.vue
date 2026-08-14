<script setup lang="ts">
import { Cpu, Image as ImageIcon, Palette } from "@lucide/vue";
import { RouterLink } from "vue-router";

import Badge from "../../components/ui/Badge.vue";
import PageHeader from "../../components/layout/PageHeader.vue";

const entries = [
  {
    to: "/v2/settings/models",
    label: "模型与能力",
    description: "管理模型档案、API 密钥和不同功能的模型绑定。",
    icon: Cpu,
    badge: "核心配置",
  },
  {
    to: "/v2/settings/image",
    label: "图片服务",
    description: "配置 ComfyUI 地址、超时和默认工作流版本。",
    icon: ImageIcon,
    badge: "素材生成",
  },
  {
    to: "/v2/settings/appearance",
    label: "外观主题",
    description: "选择平台皮肤主题，统一工作区的视觉令牌。",
    icon: Palette,
    badge: "界面",
  },
] as const;
</script>

<template>
  <div class="v2-settings-home">
    <PageHeader
      eyebrow="平台配置"
      title="把系统配置集中在这里"
      description="模型、图片服务和界面外观彼此独立，后续新增能力可以沿着同一配置边界扩展。"
    />

    <div class="v2-settings-grid">
      <RouterLink v-for="entry in entries" :key="entry.to" :to="entry.to" class="v2-settings-card">
        <div class="v2-settings-card-icon"><component :is="entry.icon" :size="21" aria-hidden="true" /></div>
        <div class="v2-settings-card-copy">
          <div class="v2-settings-card-title">
            <h2>{{ entry.label }}</h2>
            <Badge tone="neutral">{{ entry.badge }}</Badge>
          </div>
          <p>{{ entry.description }}</p>
          <span class="v2-settings-card-link">打开配置 <span aria-hidden="true">→</span></span>
        </div>
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.v2-settings-home {
  display: grid;
  gap: var(--space-6);
}

.v2-settings-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}

.v2-settings-card {
  display: grid;
  gap: var(--space-4);
  min-height: 190px;
  padding: var(--space-5);
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

.v2-settings-card h2 {
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
