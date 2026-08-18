<script setup lang="ts">
import { computed, onMounted, ref, watch, type Component } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import {
  Activity,
  Boxes,
  BookOpenText,
  Download,
  FileCheck2,
  GitFork,
  Image as ImageIcon,
  LayoutDashboard,
  ListChecks,
  Menu,
  ChevronDown,
  PlayCircle,
  Send,
  ScrollText,
  Settings2,
  Sparkles,
  X,
} from "@lucide/vue";

import Button from "../components/ui/Button.vue";
import { useV2WorkspaceStore } from "./stores/workspace";
import Select from "../components/ui/Select.vue";

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: Component;
}

interface NavGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NavItem[];
}

const groups: readonly NavGroup[] = [
  {
    id: "story",
    label: "故事",
    items: [
      { to: "/v2/start", label: "开始新故事", icon: Sparkles },
      { to: "/v2/workspace/project", label: "项目首页", icon: LayoutDashboard },
      { to: "/v2/workspace/stories", label: "故事切换", icon: BookOpenText },
      { to: "/v2/workspace/world", label: "世界设定", icon: Boxes },
      { to: "/v2/workspace/state", label: "状态与逻辑", icon: Activity },
      { to: "/v2/workspace/story", label: "故事结构", icon: GitFork },
    ],
  },
  {
    id: "creation",
    label: "创作",
    items: [
      { to: "/v2/workspace/formal-assets", label: "正式素材库", icon: ImageIcon },
      { to: "/v2/workspace/ai-scene-request", label: "创建请求", icon: Send },
      { to: "/v2/workspace/ai-scene-jobs", label: "任务状态", icon: Activity },
      { to: "/v2/workspace/ai-scene-review", label: "场景候选审核", icon: ListChecks },
      { to: "/v2/workspace/comfy-request", label: "创建请求", icon: Send },
      { to: "/v2/workspace/comfy-jobs", label: "任务状态", icon: Activity },
      { to: "/v2/workspace/comfy-review", label: "素材候选审核", icon: ListChecks },
    ],
  },
  {
    id: "publish",
    label: "发布",
    items: [
      { to: "/v2/workspace/release", label: "发布检查", icon: FileCheck2 },
      { to: "/v2/workspace/player", label: "运行预览", icon: PlayCircle },
      { to: "/v2/workspace/export", label: "导出", icon: Download },
    ],
  },
  {
    id: "system",
    label: "系统",
    items: [
      { to: "/v2/services/models", label: "模型", icon: Settings2 },
      { to: "/v2/services/comfyui", label: "ComfyUI 服务", icon: ImageIcon },
      { to: "/v2/services/logs", label: "调用日志", icon: ScrollText },
      { to: "/v2/services/runtime", label: "运行状态", icon: Activity },
      { to: "/v2/settings", label: "平台配置", icon: Settings2 },
      { to: "/v2/settings/appearance", label: "外观", icon: Sparkles },
      { to: "/v2/automation", label: "触发器", icon: Activity },
    ],
  },
];

const route = useRoute();
const store = useV2WorkspaceStore();
const mobileOpen = ref(false);
const isFeatureRoute = computed(() => route.meta.layout === "feature");
const pageSize = computed(() => {
  const size = route.meta.pageSize;
  return size === "narrow" || size === "standard" || size === "wide" || size === "full" ? size : "standard";
});
const collapsedGroups = ref<readonly string[]>(readCollapsedGroups());

function readCollapsedGroups(): readonly string[] {
  try {
    const raw = localStorage.getItem("v2:sidebar:collapsed");
    return raw === null ? [] : (JSON.parse(raw) as unknown as string[]);
  } catch {
    return [];
  }
}

function persistCollapsedGroups(): void {
  try {
    localStorage.setItem("v2:sidebar:collapsed", JSON.stringify(collapsedGroups.value));
  } catch {
    // localStorage unavailable; collapsing still works for this session.
  }
}

function isGroupCollapsed(group: NavGroup): boolean {
  const activeInGroup = group.items.some((item) => route.path === item.to || route.path.startsWith(`${item.to}/`));
  return !activeInGroup && collapsedGroups.value.includes(group.id);
}

function toggleGroup(group: NavGroup): void {
  collapsedGroups.value = collapsedGroups.value.includes(group.id)
    ? collapsedGroups.value.filter((id) => id !== group.id)
    : [...collapsedGroups.value, group.id];
  persistCollapsedGroups();
}

watch(() => route.path, () => {
  mobileOpen.value = false;
});

onMounted(() => {
  void store.loadSnapshot();
});
</script>

<template>
  <div class="page v2-shell-page">
    <section class="v2-shell-layout" aria-label="Living Network V2 创作平台">
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
        <RouterLink to="/v2/workspace/project" class="v2-brand" aria-label="返回项目首页">
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
        <section v-for="group in groups" :key="group.id" class="v2-nav-group">
          <button
            type="button"
            class="v2-nav-group-toggle"
            :aria-expanded="!isGroupCollapsed(group)"
            @click="toggleGroup(group)"
          >
            <span>{{ group.label }}</span>
            <ChevronDown :size="14" aria-hidden="true" :class="{ 'v2-nav-group-chevron-collapsed': isGroupCollapsed(group) }" />
          </button>
          <RouterLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            v-show="!isGroupCollapsed(group)"
            class="v2-nav-link"
            active-class="v2-nav-link-active"
          >
            <component :is="item.icon" :size="17" stroke-width="1.9" aria-hidden="true" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </section>
      </nav>

      <div v-if="store.storyWorlds.length" class="v2-sidebar-story">
        <label for="v2-story-world">故事空间</label>
        <div class="v2-sidebar-story-row">
          <Select
            id="v2-story-world"
            :model-value="store.activeStoryWorldId || ''"
            :disabled="store.loading"
            @update:model-value="store.selectStoryWorld"
          >
            <option v-for="world in store.storyWorlds" :key="world.storyWorldId" :value="world.storyWorldId">
              {{ world.name }}
            </option>
          </Select>
          <Button variant="ghost" size="icon" :loading="store.loading" aria-label="刷新状态" @click="store.loadSnapshot">
            <RefreshCw :size="15" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div class="v2-sidebar-footer">
        <span class="v2-runtime-dot v2-runtime-dot-neutral" aria-hidden="true" />
        <span>V2 本地运行时</span>
      </div>
    </aside>

    <div v-if="mobileOpen" class="v2-sidebar-backdrop" aria-hidden="true" @click="mobileOpen = false" />

    <div class="v2-app-content" :class="{ 'v2-app-content-feature': isFeatureRoute }">
      <div
        class="v2-route-content"
        :class="[`v2-route-content-${pageSize}`, { 'v2-route-content-feature': isFeatureRoute }]"
      >
        <RouterView />
      </div>
    </div>
    </section>
  </div>
</template>

<style scoped>
.v2-shell-page {
  min-height: 100%;
  width: 100%;
  /* 全出血分栏：无页边距、无最大宽度，侧栏贴左缘、内容区填满剩余宽度（类似 DeepSeek 布局） */
  max-width: none;
  margin: 0;
  padding: 0;
  /* 抬升壳层到全屏主题装饰层（.theme-decorations，z-index: 2）之上，
     避免固定粒子/光斑在滚动时覆盖侧栏与内容，造成样式污染 */
  z-index: 3;
}

/* 左右分栏（非卡片）：左栏 sticky 固定，右栏随页面滚动，无整体卡片边框/圆角 */
.v2-shell-layout {
  display: flex;
  align-items: stretch;
  min-height: 100dvh;
}

.v2-sidebar {
  display: flex;
  flex-direction: column;
  flex: 0 0 244px;
  width: 244px;
  min-width: 0;
  padding: var(--space-4) var(--space-3);
  border-right: 1px solid var(--border);
  background: var(--surface-soft);
  position: sticky;
  top: 0;
  /* 高度 = 视口高度；sticky 移动范围 = 容器高度 − 自身高度 = 整页滚动距离，
     侧栏在整段滚动中保持固定 */
  height: 100dvh;
  overflow-y: auto;
}

.v2-sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: 0 var(--space-2) var(--space-4);
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
  gap: var(--space-3);
  overflow: auto;
  min-height: 0;
}

.v2-nav-group {
  display: grid;
  gap: 3px;
}

.v2-nav-group-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 32px;
  padding: 0 var(--space-3);
  border: 0;
  background: transparent;
  color: var(--faint);
  font-size: var(--text-xs);
  font-weight: 800;
  letter-spacing: 0.08em;
  cursor: pointer;
  text-align: left;
}

.v2-nav-group-toggle:hover {
  color: var(--muted);
}

.v2-nav-group-toggle svg {
  transition: transform var(--motion-fast);
}

.v2-nav-group-chevron-collapsed {
  transform: rotate(-90deg);
}

.v2-sidebar-story {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}

.v2-sidebar-story label {
  padding: 0 var(--space-3);
  color: var(--faint);
  font-size: var(--text-xs);
  font-weight: 800;
  letter-spacing: 0.08em;
}

.v2-sidebar-story-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-2);
}

.v2-sidebar-story-row .ui-select {
  flex: 1 1 auto;
  min-width: 0;
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
  padding: var(--space-4) var(--space-3) 0;
  color: var(--muted);
  font-size: var(--text-xs);
}

.v2-runtime-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full);
  background: var(--faint);
}

.v2-app-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.v2-app-content-feature {
  height: 100dvh;
}

.v2-route-content {
  width: 100%;
  min-width: 0;
  padding: var(--space-6);
  margin-inline: auto;
}

.v2-route-content-narrow {
  max-width: 960px;
}

.v2-route-content-standard {
  max-width: 1200px;
}

.v2-route-content-wide {
  max-width: 1560px;
}

.v2-route-content-full {
  max-width: none;
}

.v2-route-content-feature {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.v2-mobile-menu,
.v2-mobile-close {
  display: none;
}

@media (max-width: 960px) {
  .v2-shell-layout {
    display: block;
  }

  .v2-sidebar {
    position: fixed;
    z-index: 30;
    inset: 0 auto 0 0;
    width: min(286px, 84vw);
    /* 抽屉模式贴屏幕左缘，直角即可（分栏布局无卡片圆角） */
    border-radius: 0;
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

}

@media (max-width: 540px) {
  .v2-route-content {
    padding-right: var(--space-4);
    padding-left: var(--space-4);
  }
}
</style>
