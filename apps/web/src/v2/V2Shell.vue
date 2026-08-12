<script setup lang="ts">
import { BookOpen, Play, Sparkles } from "@lucide/vue";

const navItems = [
  { label: "Workspace", icon: BookOpen },
  { label: "Review", icon: Sparkles },
  { label: "Player", icon: Play },
] as const;
</script>

<template>
  <section class="page v2-shell" aria-labelledby="v2-title">
    <header class="page-header">
      <div>
        <p class="page-kicker">V2</p>
        <h1 id="v2-title">Creator Game Platform</h1>
        <p class="page-description">
          Gate 0 shell for creator workspace, candidate review, release, and player runtime.
        </p>
      </div>
    </header>

    <nav class="v2-shell-nav" aria-label="V2 workspace areas">
      <div v-for="item in navItems" :key="item.label" class="v2-shell-nav-item">
        <component :is="item.icon" :size="18" aria-hidden="true" />
        <span>{{ item.label }}</span>
      </div>
    </nav>
  </section>
</template>

<style scoped>
.v2-shell {
  min-height: 100%;
}

.v2-shell-nav {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-3);
}

.v2-shell-nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 56px;
  padding: var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-primary);
}
</style>
