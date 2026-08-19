<script setup lang="ts">
import { ScrollText } from "@lucide/vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import PageSection from "../components/layout/PageSection.vue";
</script>

<template>
  <div class="v2-prompt-settings">
    <PageSection
      title="Prompt"
      description="提示词模板版本与运行时配置。"
    />
    <section class="v2-prompt-settings-body">
      <EmptyState
        title="Prompt 设置即将推出"
        description="后续版本将在这里展示 Chat、Fact Extraction、Story Analyzer 等提示词模板版本。"
      >
        <template #icon>
          <ScrollText :size="26" aria-hidden="true" />
        </template>
      </EmptyState>
    </section>
  </div>
</template>

<style scoped>
.v2-prompt-settings {
  display: grid;
  gap: var(--space-5);
}

.v2-prompt-settings-body {
  min-height: 300px;
}
</style>
