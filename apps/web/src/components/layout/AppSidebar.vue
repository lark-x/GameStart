<script setup lang="ts">
import { ref } from "vue";
import {
  CalendarDays,
  Camera,
  Heart,
  LayoutGrid,
  MessageCircle,
  MoreHorizontal,
  Settings,
  Sparkles,
  X,
} from "@lucide/vue";
import { RouterLink } from "vue-router";
import Button from "../ui/Button.vue";
import ThemeSwitcher from "../ui/ThemeSwitcher.vue";

const mobileOpen = ref(false);
const navigation = [
  { to: "/chat", label: "聊天", icon: MessageCircle },
  { to: "/feed", label: "朋友圈", icon: LayoutGrid },
  { to: "/relationships", label: "关系", icon: Heart },
  { to: "/calendar", label: "日程", icon: CalendarDays },
  { to: "/assets", label: "素材", icon: Camera },
  { to: "/settings", label: "视觉工作台", icon: Sparkles },
];
const secondary = [{ to: "/admin", label: "内容管理", icon: Settings }];
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
  <aside
    class="app-nav"
    :class="{ 'app-nav-open': mobileOpen }"
    aria-label="主导航"
  >
    <div class="mobile-nav-head">
      <span>Living Network</span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="关闭导航"
        @click="mobileOpen = false"
        ><X :size="18"
      /></Button>
    </div>
    <RouterLink
      to="/chat"
      class="brand-mark"
      aria-label="Living Network"
      @click="mobileOpen = false"
      ><Sparkles :size="20"
    /></RouterLink>
    <nav class="nav-list">
      <RouterLink
        v-for="item in navigation"
        :key="item.to"
        :to="item.to"
        class="nav-item"
        @click="mobileOpen = false"
      >
        <component :is="item.icon" :size="19" stroke-width="1.8" /><span
          class="nav-label"
          >{{ item.label }}</span
        >
      </RouterLink>
    </nav>
    <nav class="nav-list nav-secondary">
      <RouterLink
        v-for="item in secondary"
        :key="item.to"
        :to="item.to"
        class="nav-item"
        @click="mobileOpen = false"
      >
        <component :is="item.icon" :size="19" stroke-width="1.8" /><span
          class="nav-label"
          >{{ item.label }}</span
        >
      </RouterLink>
    </nav>
    <ThemeSwitcher />
  </aside>
</template>
