<script setup lang="ts">
import { onMounted } from 'vue'
import { initTheme } from './lib/theme'
import ThemeDecorations from './components/ui/ThemeDecorations.vue'

onMounted(() => {
  initTheme()
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
