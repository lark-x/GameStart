import { createRouter, createWebHistory } from "vue-router";
import { v2Routes } from "../v2/index.ts";

const routes = [
  { path: "/", redirect: "/v2" },
  { path: "/feed", redirect: "/v2" },
  { path: "/chat", redirect: "/v2" },
  { path: "/relationships", redirect: "/v2" },
  { path: "/calendar", redirect: "/v2" },
  { path: "/assets", redirect: "/v2" },
  { path: "/creator", redirect: "/v2" },
  { path: "/creator/:pathMatch(.*)*", redirect: "/v2" },
  { path: "/admin", redirect: "/v2" },
  { path: "/settings", redirect: "/v2" },
  ...v2Routes,
  { path: "/:pathMatch(.*)*", redirect: "/v2" },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
