import { createRouter, createWebHistory } from "vue-router";

const routes = [
  { path: "/", redirect: "/feed" },
  { path: "/feed", name: "feed", component: () => import("../views/FeedView.vue") },
  { path: "/chat", name: "chat", component: () => import("../views/ChatView.vue") },
  { path: "/relationships", name: "relationships", component: () => import("../views/RelationshipsView.vue") },
  { path: "/calendar", name: "calendar", component: () => import("../views/CalendarView.vue") },
  { path: "/assets", name: "assets", component: () => import("../views/AssetsView.vue") },
  { path: "/settings", name: "settings", component: () => import("../views/SettingsView.vue") },
  { path: "/admin", name: "admin", component: () => import("../views/AdminView.vue") },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
