<script setup lang="ts">
import { RouterView } from "vue-router";
import SettingsNavigation from "./SettingsNavigation.vue";
</script>

<template>
  <div class="v2-settings-layout">
    <SettingsNavigation />
    <div class="v2-settings-content">
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.v2-settings-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: var(--space-6);
  align-items: start;
  min-height: 0;
}

.v2-settings-content {
  display: grid;
  gap: var(--space-5);
  min-width: 0;
}

@media (max-width: 960px) {
  .v2-settings-layout {
    grid-template-columns: 1fr;
    gap: var(--space-3);
  }
}
</style>
