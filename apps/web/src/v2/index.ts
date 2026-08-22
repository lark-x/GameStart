import type { RouteRecordRaw } from "vue-router";

export const v2Routes: readonly RouteRecordRaw[] = [
  {
    path: "/v2",
    name: "v2",
    component: () => import("./V2Shell.vue"),
    meta: { v2Shell: true },
    children: [
      { path: "", redirect: "/v2/workspace/project" },
      {
        path: "chat",
        name: "v2-chat",
        component: () => import("./views/V2ChatHomeView.vue"),
        meta: { title: "聊天", pageSize: "wide" },
      },
      { path: "start", name: "v2-start", component: () => import("./views/V2StartView.vue"), meta: { title: "即时故事", pageSize: "standard" } },
      {
        path: "chat/:conversationId",
        name: "v2-chat-conversation",
        component: () => import("./views/V2ChatView.vue"),
        meta: { title: "故事对话", layout: "feature", pageSize: "full" },
      },
      { path: "workspace/review", redirect: "/v2/workspace/ai-scene-review" },
      { path: "workspace/characters", name: "v2-workspace-characters", component: () => import("./views/V2CharactersView.vue"), meta: { title: "角色中心", pageSize: "wide" } },
      { path: "workspace/characters/:characterId", name: "v2-workspace-character", component: () => import("./views/V2CharactersView.vue"), meta: { title: "角色中心", pageSize: "wide" } },
      {
        path: "workspace/:area",
        name: "v2-workspace-area",
        component: () => import("./views/V2WorkspaceAreaView.vue"),
        meta: { title: "创作工作区", pageSize: "wide" },
      },

      // ── Settings: unified layout route ──────────────────────────────────
      {
        path: "settings",
        name: "v2-settings",
        component: () => import("./components/layout/V2SettingsLayout.vue"),
        meta: { title: "设置", pageSize: "wide" },
        children: [
          {
            path: "",
            name: "v2-settings-overview",
            component: () => import("./views/V2SettingsHomeView.vue"),
            meta: { title: "设置" },
          },
          {
            path: "models",
            name: "v2-settings-models",
            component: () => import("./views/V2ModelSettingsView.vue"),
            meta: { title: "模型" },
          },
          {
            path: "models/new",
            name: "v2-settings-models-new",
            component: () => import("./views/V2ModelProfileDetailView.vue"),
            meta: { title: "新建模型" },
          },
          {
            path: "models/:profileId",
            name: "v2-settings-models-detail",
            component: () => import("./views/V2ModelProfileDetailView.vue"),
            meta: { title: "模型档案" },
          },
          {
            path: "memory",
            name: "v2-settings-memory",
            component: () => import("./views/V2MemorySettingsView.vue"),
            meta: { title: "Memory" },
          },
          {
            path: "prompt",
            name: "v2-settings-prompt",
            component: () => import("./views/V2PromptSettingsView.vue"),
            meta: { title: "Prompt" },
          },
          {
            path: "comfyui",
            name: "v2-settings-comfyui",
            component: () => import("./views/V2ImageSettingsView.vue"),
            meta: { title: "ComfyUI" },
          },
          {
            path: "runtime",
            name: "v2-settings-runtime",
            component: () => import("./views/V2RuntimeStatusView.vue"),
            meta: { title: "Runtime" },
          },
          {
            path: "logs",
            name: "v2-settings-logs",
            component: () => import("./views/V2ModelLogsView.vue"),
            meta: { title: "调用日志" },
          },
          {
            path: "automation",
            name: "v2-settings-automation",
            component: () => import("./views/V2AutomationView.vue"),
            meta: { title: "任务运行" },
          },
          {
            path: "appearance",
            name: "v2-settings-appearance",
            component: () => import("./views/V2AppearanceSettingsView.vue"),
            meta: { title: "外观" },
          },
        ],
      },

      // ── Legacy route redirects ─────────────────────────────────────────
      { path: "services/models", redirect: "/v2/settings/models" },
      { path: "services/comfyui", redirect: "/v2/settings/comfyui" },
      { path: "services/runtime", redirect: "/v2/settings/runtime" },
      { path: "services/logs", redirect: "/v2/settings/logs" },
      { path: "automation", redirect: "/v2/settings/automation" },
      { path: "diagnostics/model-logs", redirect: "/v2/settings/logs" },
    ],
  },
];
