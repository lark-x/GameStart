<script setup lang="ts">
import { Sparkles } from "@lucide/vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import PageSection from "../components/layout/PageSection.vue";
</script>

<template>
  <div class="v2-memory-settings">
    <PageSection
      title="Memory"
      description="长期记忆引擎与数据状态。"
    />
    <section class="v2-memory-settings-body">
      <EmptyState
        title="Memory 设置即将推出"
        description="V2.3 Memory 评估完成后，这里将展示当前引擎、Fact Extractor 和记忆数据状态。"
      >
        <template #icon>
          <Sparkles :size="26" aria-hidden="true" />
        </template>
      </EmptyState>
    </section>
  </div>
</template>

<style scoped>
.v2-memory-settings {
  display: grid;
  gap: var(--space-5);
}

.v2-memory-settings-body {
  min-height: 300px;
}
</style>
