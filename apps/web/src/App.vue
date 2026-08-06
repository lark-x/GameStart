<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useAppStore } from './stores/app'

const store = useAppStore()

onMounted(async () => {
  await store.loadWorlds()
  if (store.currentWorldId) await store.loadCharacters()
})

watch(() => store.currentWorldId, async (newId) => {
  if (newId) await store.loadCharacters()
})

const navigation = [
  { to: '/chat', icon: '▢', label: '聊天' },
  { to: '/feed', icon: '◎', label: '朋友圈' },
  { to: '/relationships', icon: '⌘', label: '奇遇' },
  { to: '/calendar', icon: '□', label: '日程' },
  { to: '/assets', icon: '▱', label: '相册' },
  { to: '/settings', icon: '♧', label: '酒馆' },
]
</script>

<template>
  <div class="app-shell">
    <aside class="app-nav" aria-label="主导航">
      <RouterLink to="/chat" class="brand-mark" aria-label="Living Network">LN</RouterLink>
      <nav class="nav-list">
        <RouterLink v-for="item in navigation" :key="item.to" :to="item.to" class="nav-item">
          <span class="nav-icon">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
      <RouterLink to="/admin" class="nav-item nav-bottom">
        <span class="nav-icon">⚙</span><span>设置</span>
      </RouterLink>
    </aside>

    <main class="app-main">
      <div class="ambient ambient-one"></div>
      <div class="ambient ambient-two"></div>
      <RouterView />
    </main>
  </div>
</template>
