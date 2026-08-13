<script setup lang="ts">
import { onMounted } from 'vue'
import { initTheme } from './lib/theme'
import { initV2Locale } from './v2/locale'
import ThemeDecorations from './components/ui/ThemeDecorations.vue'

onMounted(() => {
  initTheme()
  initV2Locale()
})
</script>

<template>
  <div class="app-shell">
    <main class="app-main">
      <div class="ambient ambient-one" />
      <div class="ambient ambient-two" />
      <ThemeDecorations />
      <RouterView />
    </main>
  </div>
</template>
