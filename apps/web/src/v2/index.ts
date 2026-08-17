import type { RouteRecordRaw } from "vue-router";

export const v2Routes: readonly RouteRecordRaw[] = [
  {
    path: "/v2",
    name: "v2",
    component: () => import("./V2Shell.vue"),
    meta: { v2Shell: true },
    children: [
      { path: "", redirect: "/v2/workspace/project" },
      { path: "start", name: "v2-start", component: () => import("./views/V2StartView.vue"), meta: { title: "即时故事" } },
      { path: "chat/:conversationId", name: "v2-chat", component: () => import("./views/V2ChatView.vue"), meta: { title: "故事对话" } },
      { path: "workspace/review", redirect: "/v2/workspace/ai-scene-review" },
      {
        path: "workspace/:area",
        name: "v2-workspace-area",
        component: () => import("./views/V2WorkspaceAreaView.vue"),
        meta: { title: "创作工作区" },
      },
      { path: "settings/models", redirect: "/v2/services/models" },
      { path: "settings/image", redirect: "/v2/services/comfyui" },
      { path: "diagnostics/model-logs", redirect: "/v2/services/logs" },
      {
        path: "settings",
        name: "v2-settings",
        component: () => import("./views/V2SettingsHomeView.vue"),
        meta: { title: "平台配置" },
      },
      {
        path: "services/models",
        name: "v2-services-models",
        component: () => import("./views/V2ModelSettingsView.vue"),
        meta: { title: "模型服务" },
      },
      {
        path: "services/comfyui",
        name: "v2-services-comfyui",
        component: () => import("./views/V2ImageSettingsView.vue"),
        meta: { title: "ComfyUI 服务" },
      },
      {
        path: "settings/appearance",
        name: "v2-settings-appearance",
        component: () => import("./views/V2AppearanceSettingsView.vue"),
        meta: { title: "外观主题" },
      },
      {
        path: "services/logs",
        name: "v2-services-logs",
        component: () => import("./views/V2ModelLogsView.vue"),
        meta: { title: "调用日志" },
      },
      {
        path: "services/runtime",
        name: "v2-services-runtime",
        component: () => import("./views/V2RuntimeStatusView.vue"),
        meta: { title: "运行状态" },
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
