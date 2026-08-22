import { createRouter, createWebHistory } from "vue-router";
import { v2Routes } from "../v2/index.ts";

const routes = [
  { path: "/", redirect: "/v2" },
  { path: "/feed", redirect: "/companion" },
  { path: "/chat", redirect: "/v2/chat" },
  { path: "/relationships", redirect: "/companion" },
  { path: "/calendar", redirect: "/companion" },
  { path: "/assets", redirect: "/v2" },
  { path: "/creator", redirect: "/v2" },
  { path: "/creator/:pathMatch(.*)*", redirect: "/v2" },
  { path: "/admin", redirect: "/v2" },
  { path: "/settings", redirect: "/v2/settings" },
  {
    path: "/companion",
    name: "companion-standalone",
    component: () => import("../v2/views/V2CompanionView.vue"),
    meta: { title: "角色陪伴生活 · 邻舍", standalone: true },
  },
  ...v2Routes,
  { path: "/:pathMatch(.*)*", redirect: "/v2" },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
