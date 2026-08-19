<script setup lang="ts">
import { onMounted } from 'vue'
import { initTheme } from './lib/theme'
import ThemeDecorations from './components/ui/ThemeDecorations.vue'
import { createV2PlatformClient } from './v2/adapters/platform'

const runtimeEnv = (import.meta as ImportMeta & { readonly env?: Record<string, string | undefined> }).env ?? {}
const platformClient = createV2PlatformClient({
  baseUrl: runtimeEnv.VITE_API_BASE || (typeof window === 'undefined' ? 'http://127.0.0.1:3003' : window.location.origin),
})

onMounted(() => {
  initTheme({
    getAppearanceSettings: async () => ({ settings: await platformClient.getAppearanceSettings() }),
    updateAppearanceSettings: async (payload: unknown) => {
      if (typeof payload !== 'object' || payload === null || typeof (payload as { themeId?: unknown }).themeId !== 'string') {
        throw new TypeError('themeId must be a string')
      }
      return platformClient.saveAppearanceSettings({ themeId: (payload as { themeId: string }).themeId })
    },
  })
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
