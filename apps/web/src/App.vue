<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from './stores/app'
import { initTheme } from './lib/theme'
import AppSidebar from './components/layout/AppSidebar.vue'
import ThemeDecorations from './components/ui/ThemeDecorations.vue'

const store = useAppStore()
const route = useRoute()
const isV2Shell = computed(() => route.meta.v2Shell === true || route.path.startsWith('/v2'))

async function loadV1WorldState() {
  if (isV2Shell.value) return
  await store.loadWorlds()
  if (store.currentWorldId) await store.loadCharacters()
}

onMounted(async () => {
  initTheme(store.api)
  await loadV1WorldState()
})

watch(() => store.currentWorldId, async (newId) => {
  if (newId && !isV2Shell.value) await store.loadCharacters()
})
</script>

<template>
  <div class="app-shell">
    <AppSidebar v-if="!isV2Shell" />
    <main class="app-main">
      <div class="ambient ambient-one" />
      <div class="ambient ambient-two" />
      <ThemeDecorations />
      <RouterView />
    </main>
  </div>
</template>
