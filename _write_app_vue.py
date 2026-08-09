content = '''<script setup lang="ts">
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

/* Unified SVG icon paths (Lucide-style, 24x24 viewBox) */
const navigation = [
  { to: '/chat',           label: '\u804a\u5929', icon: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z' },
  { to: '/feed',           label: '\u670b\u53cb\u5708', icon: 'M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z' },
  { to: '/relationships',  label: '\u5947\u9047', icon: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z' },
  { to: '/calendar',       label: '\u65e5\u7a0b', icon: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' },
  { to: '/assets',         label: '\u76f8\u518c', icon: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  { to: '/settings',       label: '\u9152\u9986', icon: 'M3 18h18M5 18V8a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v10M9 18v2m6-2v2' },
]

const settingsIcon = 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'

const brandIcon = 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'
</script>

<template>
  <div class="app-shell">
    <aside class="app-nav" aria-label="主导航">
      <!-- Brand -->
      <RouterLink to="/chat" class="brand-mark" aria-label="Living Network">
        <svg class="brand-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </RouterLink>

      <!-- Primary navigation -->
      <nav class="nav-list">
        <RouterLink
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          class="nav-item"
        >
          <span class="nav-icon-wrap">
            <svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path :d="item.icon" />
            </svg>
          </span>
          <span class="nav-label">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <!-- Settings (pinned to bottom) -->
      <RouterLink to="/admin" class="nav-item nav-bottom">
        <span class="nav-icon-wrap">
          <svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path :d="settingsIcon" />
          </svg>
        </span>
        <span class="nav-label">设置</span>
      </RouterLink>
    </aside>

    <main class="app-main">
      <div class="ambient ambient-one"></div>
      <div class="ambient ambient-two"></div>
      <RouterView />
    </main>
  </div>
</template>
'''
with open(r'F:\Project\GameStart\apps\web\src\App.vue', 'w', encoding='utf-8') as f:
    f.write(content.lstrip('\ufeff'))
print('OK')
