<script setup lang="ts">
import { ref, watch } from "vue";
import {
  CalendarDays,
  Camera,
  Heart,
  LayoutGrid,
  MessageCircle,
  MoreHorizontal,
  LibraryBig,
  SlidersHorizontal,
  Sparkles,
  Workflow,
  ScrollText,
  X,
} from "@lucide/vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { useAppStore } from "../../stores/app";
import Button from "../ui/Button.vue";
import ThemeSwitcher from "../ui/ThemeSwitcher.vue";

const mobileOpen = ref(false);
const store = useAppStore();
const route = useRoute();
const router = useRouter();

const worldNavigation = [
  { to: "/chat", label: "聊天", icon: MessageCircle },
  { to: "/feed", label: "朋友圈", icon: LayoutGrid },
  { to: "/relationships", label: "关系", icon: Heart },
  { to: "/calendar", label: "日程", icon: CalendarDays },
  { to: "/assets", label: "相册", icon: Camera },
];

const creatorNavigation = [
  { to: "/creator/dispatch", label: "事件调度台", icon: Workflow },
  { to: "/creator/content", label: "内容管理", icon: LibraryBig },
  { to: "/creator/visual", label: "视觉工作台", icon: Sparkles },
  { to: "/creator/integrations", label: "集成设置", icon: SlidersHorizontal },
  { to: "/creator/logs", label: "交互日志", icon: ScrollText },
];

function switchMode(mode: "world" | "creator") {
  store.appMode = mode;
  mobileOpen.value = false;
  void router.push(mode === "creator" ? "/creator/dispatch" : "/feed");
}

watch(
  () => route.path,
  (path) => {
    store.appMode = path.startsWith("/creator") ? "creator" : "world";
  },
  { immediate: true },
);
</script>

<template>
  <Button
    variant="secondary"
    size="icon"
    class="mobile-nav-trigger"
    aria-label="打开导航"
    @click="mobileOpen = true"
  >
    <MoreHorizontal :size="20" />
  </Button>

  <aside class="app-nav" :class="{ 'app-nav-open': mobileOpen }" aria-label="主导航">
    <div class="mobile-nav-head">
      <span>Living Network</span>
      <Button variant="ghost" size="icon" aria-label="关闭导航" @click="mobileOpen = false">
        <X :size="18" />
      </Button>
    </div>

    <RouterLink
      :to="store.appMode === 'creator' ? '/creator/dispatch' : '/feed'"
      class="brand-mark"
      aria-label="Living Network"
    >
      <Sparkles :size="20" />
    </RouterLink>

    <div class="mode-switch" role="group" aria-label="应用模式">
      <Button
        :variant="store.appMode === 'world' ? 'secondary' : 'ghost'"
        size="sm"
        @click="switchMode('world')"
      >
        进入世界
      </Button>
      <Button
        :variant="store.appMode === 'creator' ? 'secondary' : 'ghost'"
        size="sm"
        @click="switchMode('creator')"
      >
        创作中心
      </Button>
    </div>

    <nav class="nav-list">
      <RouterLink
        v-for="item in (store.appMode === 'world' ? worldNavigation : creatorNavigation)"
        :key="item.to"
        :to="item.to"
        class="nav-item"
        @click="mobileOpen = false"
      >
        <component :is="item.icon" :size="19" stroke-width="1.8" />
        <span class="nav-label">{{ item.label }}</span>
      </RouterLink>
    </nav>

    <ThemeSwitcher />
  </aside>
</template>

<style scoped>
.mode-switch {
  display: grid;
  gap: 4px;
  width: 100%;
  margin-bottom: 16px;
  padding: 4px;
  border-radius: var(--radius-md);
  background: var(--surface-muted);
}

.mode-switch :deep(.ui-button) {
  width: 100%;
  padding-inline: 4px;
  font-size: var(--text-xs);
}

@media (max-width: 767px) {
  .mode-switch {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
