<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  select: [emoji: string];
  close: [];
}>();

type CategoryId = "smileys" | "gestures" | "hearts" | "nature";

const categories: readonly { readonly id: CategoryId; readonly label: string; readonly emojis: readonly string[] }[] = [
  { id: "smileys", label: "表情", emojis: ["😊", "😂", "🥰", "😍", "😭", "😅", "🤔", "😴", "🤯", "😱", "😤", "🙃", "😉", "🤗", "😋", "😎"] },
  { id: "gestures", label: "手势", emojis: ["👍", "👎", "👏", "🙏", "💪", "🤝", "👌", "✌️", "🤞", "👋", "🫶", "🫡"] },
  { id: "hearts", label: "爱心", emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💔", "💕", "💞", "💖", "💘"] },
  { id: "nature", label: "自然", emojis: ["🌸", "🌹", "🌙", "⭐", "☀️", "🌈", "🔥", "💧", "🍀", "🎉", "🎁", "✨"] },
];

const activeCategory = ref<CategoryId>("smileys");
const current = computed(() => categories.find((category) => category.id === activeCategory.value) ?? categories[0]!);

function select(emoji: string): void {
  emit("select", emoji);
}

function onKeyDown(event: KeyboardEvent): void {
  if (props.open && event.key === "Escape") {
    emit("close");
  }
}

onMounted(() => {
  document.addEventListener("keydown", onKeyDown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", onKeyDown);
});
</script>

<template>
  <div v-if="props.open" class="chat-emoji-popover-wrapper">
    <div class="chat-emoji-backdrop" aria-hidden="true" @click="emit('close')" />
    <div class="chat-emoji-picker" role="dialog" aria-label="选择表情">
      <div class="chat-emoji-tabs" role="tablist">
        <button
          v-for="category in categories"
          :key="category.id"
          type="button"
          role="tab"
          class="chat-emoji-tab"
          :class="{ active: activeCategory === category.id }"
          :aria-selected="activeCategory === category.id"
          :aria-label="category.label"
          @click="activeCategory = category.id"
        >
          {{ category.emojis[0] }}
        </button>
      </div>
      <div class="chat-emoji-grid">
        <button
          v-for="emoji in current.emojis"
          :key="emoji"
          type="button"
          class="chat-emoji-item"
          @click="select(emoji)"
        >
          {{ emoji }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-emoji-popover-wrapper {
  position: absolute;
  bottom: calc(100% + var(--space-2));
  left: 0;
  z-index: 35;
}

.chat-emoji-backdrop {
  position: fixed;
  inset: 0;
  z-index: 34;
  background: transparent;
}

.chat-emoji-picker {
  position: relative;
  z-index: 35;
  width: 310px;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(12px);
  animation: popoverFade 0.16s ease-out;
}

@keyframes popoverFade {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.chat-emoji-tabs {
  display: flex;
  gap: var(--space-1);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border);
}

.chat-emoji-tab {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: var(--text-lg);
  cursor: pointer;
  transition: background var(--motion-fast);
}

.chat-emoji-tab:hover {
  background: var(--surface-soft);
}

.chat-emoji-tab.active {
  background: var(--primary-soft);
  border-color: var(--primary);
}

.chat-emoji-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 3px;
  padding-top: var(--space-2);
}

.chat-emoji-item {
  display: grid;
  place-items: center;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  transition: transform var(--motion-fast), background var(--motion-fast);
}

.chat-emoji-item:hover {
  background: var(--surface-soft);
  transform: scale(1.18);
}

@media (max-width: 640px) {
  .chat-emoji-popover-wrapper {
    position: fixed;
    inset: auto 0 0 0;
    width: 100%;
    z-index: 50;
  }

  .chat-emoji-backdrop {
    background: rgb(0 0 0 / 28%);
  }

  .chat-emoji-picker {
    width: 100%;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    border-bottom: none;
  }
}
</style>
