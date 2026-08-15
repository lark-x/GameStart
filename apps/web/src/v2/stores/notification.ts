import { defineStore } from "pinia";
import { ref } from "vue";

export interface ToastItem {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title?: string;
  message: string;
  duration?: number;
}

export const useNotificationStore = defineStore("v2-notification", () => {
  const notifications = ref<ToastItem[]>([]);

  function show(type: ToastItem["type"], message: string, title?: string, duration = 4000) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const toast: ToastItem = { id, type, message, ...(title ? { title } : {}), ...(duration !== undefined ? { duration } : {}) };
    notifications.value.push(toast);

    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }
  }

  function success(message: string, title = "操作成功") {
    show("success", message, title);
  }

  function error(message: string, title = "操作失败") {
    show("error", message, title, 6000);
  }

  function warning(message: string, title = "提示警告") {
    show("warning", message, title);
  }

  function info(message: string, title = "系统通知") {
    show("info", message, title);
  }

  function removeNotification(id: string) {
    notifications.value = notifications.value.filter(n => n.id !== id);
  }

  return {
    notifications,
    show,
    success,
    error,
    warning,
    info,
    removeNotification,
  };
});
