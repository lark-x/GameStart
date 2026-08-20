<script setup lang="ts">
import { computed, ref } from "vue";

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
</script>

<template>
  <Teleport to="body">
    <div v-if="props.open" class="chat-emoji-backdrop" @click.self="emit('close')">
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
  </Teleport>
</template>

<style scoped>
.chat-emoji-backdrop {
  position: fixed;
  inset: 0;
  z-index: 45;
}

.chat-emoji-picker {
  position: absolute;
  bottom: 120px;
  left: 16px;
  width: min(320px, calc(100vw - 32px));
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
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
}

.chat-emoji-tab.active {
  background: var(--primary-soft);
  border-color: var(--primary);
}

.chat-emoji-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 2px;
  padding-top: var(--space-2);
}

.chat-emoji-item {
  display: grid;
  place-items: center;
  padding: var(--space-1);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: 22px;
  cursor: pointer;
}

.chat-emoji-item:hover {
  background: var(--surface-soft);
}
</style>
