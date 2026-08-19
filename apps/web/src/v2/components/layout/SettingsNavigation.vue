<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import {
  Cpu,
  Image as ImageIcon,
  LayoutDashboard,
  Palette,
  Radio,
  ScrollText,
  Sparkles,
  Terminal,
} from "@lucide/vue";
import type { Component } from "vue";

interface SettingsNavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: Component;
  readonly experimental?: boolean;
}

interface SettingsNavGroup {
  readonly label: string;
  readonly items: readonly SettingsNavItem[];
}

const settingsNavGroups: readonly SettingsNavGroup[] = [
  {
    label: "",
    items: [
      { to: "/v2/settings", label: "概览", icon: LayoutDashboard },
    ],
  },
  {
    label: "AI",
    items: [
      { to: "/v2/settings/models", label: "模型", icon: Cpu },
      { to: "/v2/settings/memory", label: "Memory", icon: Sparkles },
      { to: "/v2/settings/prompt", label: "Prompt", icon: ScrollText },
    ],
  },
  {
    label: "生成",
    items: [
      { to: "/v2/settings/comfyui", label: "ComfyUI", icon: ImageIcon },
    ],
  },
  {
    label: "系统",
    items: [
      { to: "/v2/settings/runtime", label: "Runtime", icon: Terminal },
      { to: "/v2/settings/logs", label: "调用日志", icon: ScrollText },
      { to: "/v2/settings/automation", label: "触发器", icon: Radio, experimental: true },
    ],
  },
  {
    label: "界面",
    items: [
      { to: "/v2/settings/appearance", label: "外观", icon: Palette },
    ],
  },
];

const route = useRoute();

const flatItems = computed(() => settingsNavGroups.flatMap((g) => g.items));

const selectedValue = computed(() => {
  const sorted = [...flatItems.value].sort((a, b) => b.to.length - a.to.length);
  const match = sorted.find((item) => {
    if (item.to === "/v2/settings") return route.path === "/v2/settings";
    return route.path === item.to || route.path.startsWith(`${item.to}/`);
  });
  return match?.to ?? "/v2/settings";
});

function isItemActive(item: SettingsNavItem): boolean {
  if (item.to === "/v2/settings") return route.path === "/v2/settings";
  return route.path === item.to || route.path.startsWith(`${item.to}/`);
}
</script>

<template>
  <!-- Mobile: dropdown selector, hidden on desktop -->
  <div class="settings-nav-mobile" aria-label="设置页面选择">
    <label class="settings-nav-mobile-label" for="settings-nav-select">设置页面</label>
    <select
      id="settings-nav-select"
      class="settings-nav-mobile-select"
      :value="selectedValue"
      @change="$router.push(($event.target as HTMLSelectElement).value)"
    >
      <optgroup v-for="group in settingsNavGroups" :key="group.label || '_root'" :label="group.label || undefined">
        <option v-for="item in group.items" :key="item.to" :value="item.to">
          {{ item.label }}
        </option>
      </optgroup>
    </select>
  </div>

  <!-- Desktop: vertical sidebar nav -->
  <nav class="settings-nav" aria-label="设置导航">
    <template v-for="group in settingsNavGroups" :key="group.label">
      <p v-if="group.label" class="settings-nav-group-label">{{ group.label }}</p>
      <RouterLink
        v-for="item in group.items"
        :key="item.to"
        :to="item.to"
        class="settings-nav-link"
        :class="{ 'settings-nav-link-active': isItemActive(item) }"
        :aria-current="isItemActive(item) ? 'page' : undefined"
      >
        <component :is="item.icon" :size="16" stroke-width="2" aria-hidden="true" />
        <span>{{ item.label }}</span>
        <span v-if="item.experimental" class="settings-nav-badge">实验</span>
      </RouterLink>
    </template>
  </nav>
</template>

<style scoped>
.settings-nav-mobile {
  display: none;
}

.settings-nav {
  display: grid;
  gap: 2px;
  overflow: auto;
  min-height: 0;
}

.settings-nav-group-label {
  margin: var(--space-3) 0 var(--space-1);
  padding: 0 var(--space-3);
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.settings-nav-group-label:first-child {
  margin-top: 0;
}

.settings-nav-link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 36px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-md);
  color: var(--muted);
  font-size: var(--text-sm);
  font-weight: 600;
  text-decoration: none;
  transition: background var(--motion-fast), color var(--motion-fast);
}

.settings-nav-link:hover {
  background: var(--surface);
  color: var(--text-strong);
}

.settings-nav-link:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

.settings-nav-link-active {
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 700;
}

.settings-nav-badge {
  margin-left: auto;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  background: var(--warning-soft, var(--primary-soft));
  color: var(--warning, var(--primary));
  font-size: var(--text-xs);
  font-weight: 600;
}

@media (max-width: 960px) {
  .settings-nav {
    display: none;
  }

  .settings-nav-mobile {
    display: grid;
    gap: var(--space-1);
  }

  .settings-nav-mobile-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }

  .settings-nav-mobile-select:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

.settings-nav-mobile-select {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--text-strong);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
  }
}
</style>
