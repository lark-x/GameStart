import type { RouteRecordRaw } from "vue-router";

export const v2Routes: readonly RouteRecordRaw[] = [
  {
    path: "/v2",
    name: "v2",
    component: () => import("./V2Shell.vue"),
    meta: { v2Shell: true },
    children: [
      { path: "", redirect: "/v2/workspace/canon" },
      {
        path: "workspace/:area",
        name: "v2-workspace-area",
        component: () => import("./views/V2WorkspaceAreaView.vue"),
        meta: { title: "创作工作区" },
      },
      {
        path: "settings",
        name: "v2-settings",
        component: () => import("./views/V2SettingsHomeView.vue"),
        meta: { title: "平台配置" },
      },
      {
        path: "settings/models",
        name: "v2-settings-models",
        component: () => import("./views/V2ModelSettingsView.vue"),
        meta: { title: "模型与能力" },
      },
      {
        path: "settings/image",
        name: "v2-settings-image",
        component: () => import("./views/V2ImageSettingsView.vue"),
        meta: { title: "图片服务" },
      },
      {
        path: "settings/appearance",
        name: "v2-settings-appearance",
        component: () => import("./views/V2AppearanceSettingsView.vue"),
        meta: { title: "外观主题" },
      },
      {
        path: "diagnostics/model-logs",
        name: "v2-model-logs",
        component: () => import("./views/V2ModelLogsView.vue"),
        meta: { title: "模型调用日志" },
      },
      {
        path: "automation",
        name: "v2-automation",
        component: () => import("./views/V2AutomationView.vue"),
        meta: { title: "触发器" },
      },
    ],
  },
];
