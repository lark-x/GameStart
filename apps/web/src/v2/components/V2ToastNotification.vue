<script setup lang="ts">
import { useNotificationStore } from "../../v2/stores/notification";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "@lucide/vue";

const store = useNotificationStore();
</script>

<template>
  <Teleport to="body">
    <div class="toast-container" aria-live="polite" aria-atomic="true">
      <TransitionGroup name="toast-anim">
        <div
          v-for="item in store.notifications"
          :key="item.id"
          class="toast-item"
          :class="`toast-${item.type}`"
          role="alert"
        >
          <div class="toast-icon">
            <CheckCircle2 v-if="item.type === 'success'" :size="18" />
            <AlertCircle v-else-if="item.type === 'error'" :size="18" />
            <AlertTriangle v-else-if="item.type === 'warning'" :size="18" />
            <Info v-else :size="18" />
          </div>

          <div class="toast-body">
            <h5 v-if="item.title" class="toast-title">{{ item.title }}</h5>
            <p class="toast-msg">{{ item.message }}</p>
          </div>

          <button
            type="button"
            class="toast-close"
            aria-label="关闭通知"
            @click="store.removeNotification(item.id)"
          >
            <X :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 380px;
  pointer-events: none;
}

.toast-item {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  background: var(--surface, #ffffff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
  color: var(--text, #1e293b);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-success {
  border-left: 4px solid #10b981;
}
.toast-success .toast-icon {
  color: #10b981;
}

.toast-error {
  border-left: 4px solid #ef4444;
}
.toast-error .toast-icon {
  color: #ef4444;
}

.toast-warning {
  border-left: 4px solid #f59e0b;
}
.toast-warning .toast-icon {
  color: #f59e0b;
}

.toast-info {
  border-left: 4px solid #3b82f6;
}
.toast-info .toast-icon {
  color: #3b82f6;
}

.toast-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.toast-body {
  flex: 1;
  min-width: 0;
}

.toast-title {
  margin: 0 0 2px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-strong, #0f172a);
}

.toast-msg {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text, #334155);
  word-break: break-word;
}

.toast-close {
  flex-shrink: 0;
  background: transparent;
  border: none;
  color: var(--muted, #94a3b8);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  display: grid;
  place-items: center;
  transition: color 0.15s ease;
}

.toast-close:hover {
  color: var(--text-strong, #0f172a);
}

/* Animations */
.toast-anim-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}
.toast-anim-leave-to {
  opacity: 0;
  transform: translateX(100%) scale(0.9);
}
</style>
