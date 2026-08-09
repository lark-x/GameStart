<script setup lang="ts">
import { useTheme } from "../../lib/theme";

const { currentTheme, setTheme, THEMES } = useTheme();
</script>

<template>
  <div class="theme-switcher" role="radiogroup" aria-label="界面皮肤">
    <button
      v-for="theme in THEMES"
      :key="theme.id"
      type="button"
      role="radio"
      class="theme-dot"
      :class="{ 'theme-dot-active': currentTheme === theme.id }"
      :style="{ '--dot-color': theme.dot }"
      :aria-checked="currentTheme === theme.id"
      :aria-label="`切换到${theme.label}皮肤`"
      :title="theme.label"
      @click="setTheme(theme.id)"
    />
  </div>
</template>
