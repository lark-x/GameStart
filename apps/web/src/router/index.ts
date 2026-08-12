import { createRouter, createWebHistory } from "vue-router";
import { v2Routes } from "../v2/index.ts";

const routes = [
  { path: "/", redirect: "/feed" },
  { path: "/feed", name: "feed", component: () => import("../views/FeedView.vue") },
  { path: "/chat", name: "chat", component: () => import("../views/ChatView.vue") },
  { path: "/relationships", name: "relationships", component: () => import("../views/RelationshipsView.vue") },
  { path: "/calendar", name: "calendar", component: () => import("../views/CalendarView.vue") },
  { path: "/assets", name: "assets", component: () => import("../views/AssetsView.vue") },
  { path: "/creator", redirect: "/creator/dispatch" },
  { path: "/creator/dispatch", name: "creator-dispatch", component: () => import("../views/CreatorDispatchView.vue") },
  { path: "/creator/content", name: "creator-content", component: () => import("../views/ContentSettingsView.vue") },
  { path: "/creator/visual", name: "creator-visual", component: () => import("../views/CreatorVisualView.vue") },
  { path: "/creator/integrations", name: "creator-integrations", component: () => import("../views/CreatorIntegrationsView.vue") },
  { path: "/creator/logs", name: "creator-logs", component: () => import("../views/InteractionLogsView.vue") },
  { path: "/admin", redirect: "/creator/content" },
  { path: "/settings", redirect: "/creator/integrations" },
  ...v2Routes,
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
