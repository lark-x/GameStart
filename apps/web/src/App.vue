<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useAppStore } from './stores/app'
import { initTheme } from './lib/theme'
import AppSidebar from './components/layout/AppSidebar.vue'
import ThemeDecorations from './components/ui/ThemeDecorations.vue'

const store = useAppStore()

onMounted(async () => {
  initTheme(store.api)
  await store.loadWorlds()
  if (store.currentWorldId) await store.loadCharacters()
})

watch(() => store.currentWorldId, async (newId) => {
  if (newId) await store.loadCharacters()
})
</script>

<template>
  <div class="app-shell">
    <AppSidebar />
    <main class="app-main">
      <div class="ambient ambient-one" />
      <div class="ambient ambient-two" />
      <ThemeDecorations />
      <RouterView />
    </main>
  </div>
</template>
