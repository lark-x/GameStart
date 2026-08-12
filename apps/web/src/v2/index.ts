import type { RouteRecordRaw } from "vue-router";

export const v2Routes: readonly RouteRecordRaw[] = [
  {
    path: "/v2",
    name: "v2",
    component: () => import("./V2Shell.vue"),
    meta: { v2Shell: true },
  },
];
