<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: "narrow" | "standard" | "wide" | "full";
    flush?: boolean;
  }>(),
  { size: "standard", flush: false },
);
</script>

<template>
  <div class="v2-page-container" :class="[`v2-page-container-${size}`, flush ? 'v2-page-container-flush' : '']">
    <slot />
  </div>
</template>

<style scoped>
.v2-page-container {
  width: 100%;
  margin-inline: auto;
}

.v2-page-container-narrow {
  max-width: 900px;
}

.v2-page-container-standard {
  max-width: 1200px;
}

.v2-page-container-wide {
  max-width: 1480px;
}

.v2-page-container-full {
  max-width: none;
}

.v2-page-container-flush {
  padding: 0;
}

@media (min-width: 1440px) {
  .v2-page-container:not(.v2-page-container-full):not(.v2-page-container-flush) {
    padding-inline: 32px;
  }
}

@media (min-width: 1024px) and (max-width: 1439px) {
  .v2-page-container:not(.v2-page-container-full):not(.v2-page-container-flush) {
    padding-inline: 24px;
  }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .v2-page-container:not(.v2-page-container-full):not(.v2-page-container-flush) {
    padding-inline: 20px;
  }
}

@media (max-width: 767px) {
  .v2-page-container:not(.v2-page-container-full):not(.v2-page-container-flush) {
    padding-inline: 16px;
  }
}
</style>
