<script setup lang="ts">
import { RouterLink, useRoute } from "vue-router";
import Badge from "../../../components/ui/Badge.vue";

export interface ModuleTab {
  readonly label: string;
  readonly to: string;
  readonly exact?: boolean;
  readonly badge?: string | number;
}

defineProps<{
  tabs: readonly ModuleTab[];
  ariaLabel?: string;
}>();

const route = useRoute();

function isActive(tab: ModuleTab): boolean {
  if (tab.exact) {
    return route.path === tab.to;
  }
  return route.path === tab.to || route.path.startsWith(`${tab.to}/`);
}
</script>

<template>
  <nav class="v2-module-tabs" :aria-label="ariaLabel || '模块二级导航'">
    <div class="v2-module-tabs-list" role="tablist">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="v2-module-tab-item"
        :class="{ 'v2-module-tab-active': isActive(tab) }"
        role="tab"
        :aria-selected="isActive(tab)"
      >
        <span class="v2-module-tab-label">{{ tab.label }}</span>
        <Badge v-if="tab.badge !== undefined" tone="neutral" class="v2-module-tab-badge">
          {{ tab.badge }}
        </Badge>
      </RouterLink>
    </div>
  </nav>
</template>

<style scoped>
.v2-module-tabs {
  display: flex;
  align-items: center;
  margin-bottom: var(--space-4);
  border-bottom: 1px solid var(--border);
}

.v2-module-tabs-list {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  overflow-x: auto;
  scrollbar-width: none;
}

.v2-module-tabs-list::-webkit-scrollbar {
  display: none;
}

.v2-module-tab-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 2px solid transparent;
  color: var(--muted);
  font-size: var(--text-sm);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  transition: color var(--motion-fast), border-color var(--motion-fast);
  margin-bottom: -1px;
}

.v2-module-tab-item:hover {
  color: var(--text-strong);
}

.v2-module-tab-active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

.v2-module-tab-badge {
  font-size: 11px;
  padding-inline: 6px;
}
</style>
