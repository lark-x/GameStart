<script setup lang="ts">
import { computed, onMounted, ref, watch, type Component } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import {
  Activity,
  Boxes,
  FileCheck2,
  GitFork,
  Image as ImageIcon,
  LayoutDashboard,
  Menu,
  PlayCircle,
  Radio,
  ScrollText,
  Settings2,
  Sparkles,
  X,
} from "@lucide/vue";

import Button from "../components/ui/Button.vue";
import { useV2WorkspaceStore } from "./stores/workspace";

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: Component;
}

interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

const groups: readonly NavGroup[] = [
  {
    label: "创作工作区",
    items: [
      { to: "/v2/workspace/canon", label: "故事总览", icon: LayoutDashboard },
      { to: "/v2/workspace/graph", label: "故事结构", icon: GitFork },
      { to: "/v2/workspace/review", label: "候选审核", icon: Sparkles },
      { to: "/v2/workspace/assets", label: "素材工作台", icon: ImageIcon },
    ],
  },
  {
    label: "发布与运行",
    items: [
      { to: "/v2/workspace/release", label: "发布检查", icon: FileCheck2 },
      { to: "/v2/workspace/player", label: "运行预览", icon: PlayCircle },
    ],
  },
  {
    label: "平台配置",
    items: [
      { to: "/v2/settings/models", label: "模型与能力", icon: Settings2 },
      { to: "/v2/settings/image", label: "图片服务", icon: ImageIcon },
      { to: "/v2/settings/appearance", label: "外观主题", icon: Boxes },
    ],
  },
  {
    label: "诊断与自动化",
    items: [
      { to: "/v2/diagnostics/model-logs", label: "模型调用日志", icon: ScrollText },
      { to: "/v2/automation", label: "触发器", icon: Radio },
      { to: "/v2/workspace/operations", label: "运行状态", icon: Activity },
    ],
  },
];

const route = useRoute();
const store = useV2WorkspaceStore();
const mobileOpen = ref(false);
const currentTitle = computed(() => {
  const item = groups.flatMap((group) => group.items).find((candidate) => route.path === candidate.to);
  return item?.label ?? (typeof route.meta.title === "string" ? route.meta.title : "创作平台");
});

watch(() => route.path, () => {
  mobileOpen.value = false;
});

onMounted(() => {
  void store.loadSnapshot();
});
</script>

<template>
  <div class="page v2-shell-page">
    <section class="v2-app-shell" aria-label="Living Network V2 创作平台">
    <Button
      variant="secondary"
      size="icon"
      class="v2-mobile-menu"
      aria-label="打开平台导航"
      @click="mobileOpen = true"
    >
      <Menu :size="20" aria-hidden="true" />
    </Button>

    <aside class="v2-sidebar" :class="{ 'v2-sidebar-open': mobileOpen }" aria-label="平台导航">
      <div class="v2-sidebar-head">
        <RouterLink to="/v2/workspace/canon" class="v2-brand" aria-label="返回故事总览">
          <span class="v2-brand-mark"><Sparkles :size="18" aria-hidden="true" /></span>
          <span>
            <strong>Living Network</strong>
            <small>创作平台 V2</small>
          </span>
        </RouterLink>
        <Button variant="ghost" size="icon" class="v2-mobile-close" aria-label="关闭平台导航" @click="mobileOpen = false">
          <X :size="18" aria-hidden="true" />
        </Button>
      </div>

      <nav class="v2-nav" aria-label="平台模块">
        <section v-for="group in groups" :key="group.label" class="v2-nav-group">
          <h2>{{ group.label }}</h2>
          <RouterLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            class="v2-nav-link"
            active-class="v2-nav-link-active"
          >
            <component :is="item.icon" :size="17" stroke-width="1.9" aria-hidden="true" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </section>
      </nav>

      <div class="v2-sidebar-footer">
        <span class="v2-runtime-dot" aria-hidden="true" />
        <span>V2 本地运行时</span>
      </div>
    </aside>

    <div v-if="mobileOpen" class="v2-sidebar-backdrop" aria-hidden="true" @click="mobileOpen = false" />

    <div class="v2-app-content">
      <header class="v2-topbar">
        <div>
          <p class="v2-topbar-kicker">Living Network / V2</p>
          <h1>{{ currentTitle }}</h1>
        </div>
        <Button variant="secondary" size="md" :loading="store.loading" @click="store.loadSnapshot">
          <Activity :size="16" aria-hidden="true" />
          刷新状态
        </Button>
      </header>
      <div class="v2-route-content">
        <RouterView />
      </div>
    </div>
    </section>
  </div>
</template>

<style scoped>
.v2-shell-page {
  min-height: 100%;
  max-width: min(1640px, calc(100vw - 48px));
  width: 100%;
  margin: 0 auto;
}

.v2-app-shell {
  display: grid;
  grid-template-columns: 244px minmax(0, 1fr);
  min-height: calc(100vh - 2 * var(--page-pad-y));
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: var(--surface-glass);
  box-shadow: var(--shadow-md);
}

.v2-sidebar {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: var(--space-5) var(--space-3);
  border-right: 1px solid var(--border);
  background: var(--surface-soft);
  position: sticky;
  top: var(--page-pad-y);
  height: calc(100vh - 2 * var(--page-pad-y));
  overflow-y: auto;
}

.v2-sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: 0 var(--space-2) var(--space-5);
}

.v2-brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  color: var(--text-strong);
  text-decoration: none;
}

.v2-brand > span:last-child {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.v2-brand strong {
  overflow: hidden;
  font-size: var(--text-md);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v2-brand small {
  color: var(--muted);
  font-size: var(--text-xs);
}

.v2-brand-mark {
  display: grid;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 11px;
  background: var(--primary);
  color: var(--on-primary);
}

.v2-nav {
  display: grid;
  gap: var(--space-5);
  overflow: auto;
  min-height: 0;
}

.v2-nav-group {
  display: grid;
  gap: 4px;
}

.v2-nav-group h2 {
  margin: 0 0 var(--space-1);
  padding: 0 var(--space-3);
  color: var(--faint);
  font-size: var(--text-xs);
  font-weight: 800;
  letter-spacing: 0.08em;
}

.v2-nav-link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 40px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-md);
  color: var(--muted);
  font-size: var(--text-sm);
  font-weight: 700;
  text-decoration: none;
  transition: background var(--motion-fast), color var(--motion-fast);
}

.v2-nav-link:hover,
.v2-nav-link-active {
  background: var(--primary-soft);
  color: var(--primary);
}

.v2-sidebar-footer {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: auto;
  padding: var(--space-5) var(--space-3) 0;
  color: var(--muted);
  font-size: var(--text-xs);
}

.v2-runtime-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full);
  background: var(--success);
  box-shadow: 0 0 0 4px var(--success-soft);
}

.v2-app-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.v2-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-6) var(--space-6) var(--space-5);
  border-bottom: 1px solid var(--border);
}

.v2-topbar-kicker {
  margin: 0 0 var(--space-1);
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 800;
  letter-spacing: 0.08em;
}

.v2-topbar h1 {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-xl);
}

.v2-route-content {
  min-width: 0;
  padding: var(--space-6);
}

.v2-mobile-menu,
.v2-mobile-close {
  display: none;
}

@media (max-width: 960px) {
  .v2-app-shell {
    display: block;
    overflow: visible;
  }

  .v2-sidebar {
    position: fixed;
    z-index: 30;
    inset: 0 auto 0 0;
    width: min(286px, 84vw);
    transform: translateX(-105%);
    transition: transform var(--motion-base);
    box-shadow: var(--shadow-md);
  }

  .v2-sidebar-open {
    transform: translateX(0);
  }

  .v2-sidebar-backdrop {
    position: fixed;
    z-index: 20;
    inset: 0;
    background: rgb(0 0 0 / 28%);
  }

  .v2-mobile-menu,
  .v2-mobile-close {
    display: inline-grid;
  }

  .v2-mobile-menu {
    position: fixed;
    z-index: 10;
    top: var(--space-4);
    left: var(--space-4);
  }

  .v2-topbar {
    padding-top: calc(var(--space-6) + 44px);
  }
}

@media (max-width: 540px) {
  .v2-route-content,
  .v2-topbar {
    padding-right: var(--space-4);
    padding-left: var(--space-4);
  }

  .v2-topbar {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
