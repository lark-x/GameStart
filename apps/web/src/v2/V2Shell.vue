<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type Component } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import {
  BookOpen,
  Check,
  ChevronDown,
  FileCheck2,
  Image as ImageIcon,
  Menu,
  MessageSquare,
  Plus,
  Settings2,
  Sparkles,
  X,
} from "@lucide/vue";

import Button from "../components/ui/Button.vue";
import { useV2WorkspaceStore } from "./stores/workspace";

interface PrimaryNavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: Component;
  readonly matchPrefixes: readonly string[];
}

const primaryNavItems: readonly PrimaryNavItem[] = [
  {
    to: "/v2/chat",
    label: "对话",
    icon: MessageSquare,
    matchPrefixes: ["/v2/chat", "/v2/start"],
  },
  {
    to: "/v2/workspace/project",
    label: "故事",
    icon: BookOpen,
    matchPrefixes: [
      "/v2/workspace/project",
      "/v2/workspace/world",
      "/v2/workspace/characters",
      "/v2/workspace/state",
      "/v2/workspace/story",
    ],
  },
  {
    to: "/v2/workspace/ai-scene-request",
    label: "创作",
    icon: Sparkles,
    matchPrefixes: [
      "/v2/workspace/ai-scene-request",
      "/v2/workspace/ai-scene-jobs",
      "/v2/workspace/ai-scene-review",
    ],
  },
  {
    to: "/v2/workspace/formal-assets",
    label: "素材",
    icon: ImageIcon,
    matchPrefixes: [
      "/v2/workspace/formal-assets",
      "/v2/workspace/comfy-request",
      "/v2/workspace/comfy-jobs",
      "/v2/workspace/comfy-review",
    ],
  },
  {
    to: "/v2/workspace/release",
    label: "发布",
    icon: FileCheck2,
    matchPrefixes: [
      "/v2/workspace/release",
      "/v2/workspace/player",
      "/v2/workspace/export",
    ],
  },
  {
    to: "/v2/settings",
    label: "设置",
    icon: Settings2,
    matchPrefixes: [
      "/v2/settings",
      "/v2/services",
      "/v2/automation",
    ],
  },
];

const route = useRoute();
const store = useV2WorkspaceStore();
const mobileOpen = ref(false);
const storyMenuOpen = ref(false);
const storySwitcherRef = ref<HTMLElement | null>(null);

const isFeatureRoute = computed(() => route.meta.layout === "feature");
const pageSize = computed(() => {
  const size = route.meta.pageSize;
  return size === "narrow" || size === "standard" || size === "wide" || size === "full" ? size : "standard";
});

const activeStoryWorld = computed(() =>
  store.storyWorlds.find((w) => w.storyWorldId === store.activeStoryWorldId) ?? store.storyWorlds[0],
);

function isItemActive(item: PrimaryNavItem): boolean {
  return item.matchPrefixes.some((prefix) => route.path === prefix || route.path.startsWith(`${prefix}/`));
}

async function selectStoryWorld(storyWorldId: string): Promise<void> {
  storyMenuOpen.value = false;
  await store.selectStoryWorld(storyWorldId);
}

function handleClickOutside(event: MouseEvent): void {
  if (storySwitcherRef.value && !storySwitcherRef.value.contains(event.target as Node)) {
    storyMenuOpen.value = false;
  }
}

watch(() => route.path, () => {
  mobileOpen.value = false;
  storyMenuOpen.value = false;
});

onMounted(() => {
  void store.loadSnapshot();
  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});
</script>

<template>
  <div class="page v2-shell-page">
    <section class="v2-shell-layout" aria-label="Living Network V2 创作平台">
      <!-- 移动端汉堡菜单：在 Chat Feature 视图下不重复渲染，避免与 Chat Header 冲突 -->
      <Button
        v-if="!isFeatureRoute"
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

        <!-- 故事切换器 (Story Switcher Popover) -->
        <div v-if="store.storyWorlds.length" ref="storySwitcherRef" class="v2-story-switcher">
          <button
            type="button"
            class="v2-story-switcher-btn"
            :aria-expanded="storyMenuOpen"
            aria-haspopup="listbox"
            @click="storyMenuOpen = !storyMenuOpen"
          >
            <div class="v2-story-switcher-info">
              <span class="v2-story-switcher-label">当前故事</span>
              <strong class="v2-story-switcher-name">
                {{ activeStoryWorld?.name || "未选择故事" }}
              </strong>
            </div>
            <ChevronDown
              :size="15"
              aria-hidden="true"
              class="v2-story-switcher-chevron"
              :class="{ 'v2-story-switcher-chevron-open': storyMenuOpen }"
            />
          </button>

          <div v-if="storyMenuOpen" class="v2-story-popover" role="listbox" aria-label="切换故事">
            <div class="v2-story-popover-head">
              <span>切换故事空间</span>
            </div>
            <div class="v2-story-popover-list">
              <button
                v-for="world in store.storyWorlds"
                :key="world.storyWorldId"
                type="button"
                class="v2-story-popover-item"
                :class="{ 'v2-story-popover-item-active': world.storyWorldId === store.activeStoryWorldId }"
                role="option"
                :aria-selected="world.storyWorldId === store.activeStoryWorldId"
                @click="selectStoryWorld(world.storyWorldId)"
              >
                <span class="v2-story-popover-dot" />
                <span class="v2-story-popover-title">{{ world.name }}</span>
                <Check v-if="world.storyWorldId === store.activeStoryWorldId" :size="14" class="v2-story-popover-check" aria-hidden="true" />
              </button>
            </div>
            <div class="v2-story-popover-footer">
              <RouterLink to="/v2/start" class="v2-story-popover-action" @click="storyMenuOpen = false">
                <Plus :size="14" aria-hidden="true" />
                <span>开始新故事</span>
              </RouterLink>
            </div>
          </div>
        </div>

        <!-- 一级导航列表（仅 6 个主要入口） -->
        <nav class="v2-nav" aria-label="核心模块">
          <RouterLink
            v-for="item in primaryNavItems"
            :key="item.to"
            :to="item.to"
            class="v2-nav-link"
            :class="{ 'v2-nav-link-active': isItemActive(item) }"
          >
            <component :is="item.icon" :size="17" stroke-width="2" aria-hidden="true" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </nav>

        <div class="v2-sidebar-footer">
          <span class="v2-runtime-dot" :class="store.error ? 'v2-runtime-dot-error' : 'v2-runtime-dot-ok'" aria-hidden="true" />
          <span>V2 本地运行时</span>
        </div>
      </aside>

      <div v-if="mobileOpen" class="v2-sidebar-backdrop" aria-hidden="true" @click="mobileOpen = false" />

      <main class="v2-app-content" :class="{ 'v2-app-content-feature': isFeatureRoute }">
        <div
          class="v2-route-content"
          :class="[`v2-route-content-${pageSize}`, { 'v2-route-content-feature': isFeatureRoute }]"
        >
          <RouterView />
        </div>
      </main>
    </section>
  </div>
</template>

<style scoped>
.v2-shell-page {
  min-height: 100%;
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0;
  z-index: 3;
}

.v2-shell-layout {
  display: flex;
  align-items: stretch;
  min-height: 100dvh;
}

.v2-sidebar {
  display: flex;
  flex-direction: column;
  flex: 0 0 232px;
  width: 232px;
  min-width: 0;
  padding: var(--space-4) var(--space-3);
  border-right: 1px solid var(--border);
  background: var(--surface-soft);
  position: sticky;
  top: 0;
  height: 100dvh;
  overflow-y: auto;
}

.v2-sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: 0 var(--space-2) var(--space-3);
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
  border-radius: var(--radius-md);
  background: var(--primary);
  color: var(--on-primary);
  box-shadow: var(--shadow-sm);
}

.v2-story-switcher {
  position: relative;
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border);
}

.v2-story-switcher-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-strong);
  cursor: pointer;
  text-align: left;
  box-shadow: var(--shadow-sm);
  transition: border-color var(--motion-fast), background var(--motion-fast), transform var(--motion-fast);
}

.v2-story-switcher-btn:hover {
  border-color: var(--primary);
  background: var(--surface-glass);
}

.v2-story-switcher-info {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.v2-story-switcher-label {
  font-size: 11px;
  color: var(--muted);
  font-weight: 600;
}

.v2-story-switcher-name {
  font-size: var(--text-sm);
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v2-story-switcher-chevron {
  color: var(--muted);
  transition: transform var(--motion-fast);
  flex-shrink: 0;
}

.v2-story-switcher-chevron-open {
  transform: rotate(180deg);
}

.v2-story-popover {
  position: absolute;
  top: calc(100% - 4px);
  left: 0;
  right: 0;
  z-index: 50;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: var(--space-2);
  display: grid;
  gap: var(--space-2);
  animation: popoverFade 0.16s ease-out;
}

@keyframes popoverFade {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.v2-story-popover-head {
  padding: var(--space-1) var(--space-2);
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.v2-story-popover-list {
  display: grid;
  gap: 2px;
  max-height: 180px;
  overflow-y: auto;
}

.v2-story-popover-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-size: var(--text-sm);
  cursor: pointer;
  text-align: left;
  transition: background var(--motion-fast);
}

.v2-story-popover-item:hover {
  background: var(--surface-soft);
  color: var(--text-strong);
}

.v2-story-popover-item-active {
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 600;
}

.v2-story-popover-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: currentColor;
  opacity: 0.7;
}

.v2-story-popover-title {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v2-story-popover-check {
  color: var(--primary);
  flex-shrink: 0;
}

.v2-story-popover-footer {
  padding-top: var(--space-2);
  border-top: 1px solid var(--border);
}

.v2-story-popover-action {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 600;
  text-decoration: none;
  transition: background var(--motion-fast);
}

.v2-story-popover-action:hover {
  background: var(--primary-soft);
}

.v2-nav {
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow: auto;
  min-height: 0;
}

.v2-nav-link {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 40px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-md);
  color: var(--muted);
  font-size: var(--text-sm);
  font-weight: 600;
  text-decoration: none;
  transition: background var(--motion-fast), color var(--motion-fast), transform var(--motion-fast);
}

.v2-nav-link:hover {
  background: var(--surface);
  color: var(--text-strong);
}

.v2-nav-link-active {
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 700;
}

.v2-sidebar-footer {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: auto;
  padding: var(--space-3) var(--space-2) 0;
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: 500;
  border-top: 1px solid var(--border);
}

.v2-runtime-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.v2-runtime-dot-ok {
  background: var(--success);
  box-shadow: 0 0 6px var(--success);
}

.v2-runtime-dot-error {
  background: var(--danger);
  box-shadow: 0 0 6px var(--danger);
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
  padding: var(--space-6) clamp(16px, 4vw, 48px) var(--space-8);
  margin-inline: auto;
}

.v2-route-content-narrow {
  max-width: 900px;
}

.v2-route-content-standard {
  max-width: 1200px;
}

.v2-route-content-wide {
  max-width: 1480px;
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
  max-width: none;
  width: 100%;
  height: 100%;
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
    border-radius: 0;
    transform: translateX(-105%);
    transition: transform var(--motion-base);
    box-shadow: var(--shadow-lg);
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
