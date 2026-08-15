<script setup lang="ts">
import { Radio, Sparkles } from "@lucide/vue";

import EmptyState from "../../components/ui/EmptyState.vue";
import PageHeader from "../../components/layout/PageHeader.vue";
</script>

<template>
  <div class="v2-automation">
    <PageHeader
      eyebrow="诊断与自动化"
      title="触发器"
      description="触发器是独立的自动化模块，后续可以在这里编排定时任务、事件触发和人工重试。"
    />
    <section class="v2-automation-card">
      <EmptyState
        title="触发器引擎尚未启用"
        description="当前版本先建立模块边界，不会在没有明确业务规则前引入后台触发逻辑。"
      >
        <template #icon>
          <Radio :size="26" aria-hidden="true" />
        </template>
        <template #action>
          <div class="v2-automation-hint">
            <Sparkles :size="17" aria-hidden="true" />
            <span>未来可复用模型能力绑定、任务队列和调用日志。</span>
          </div>
        </template>
      </EmptyState>
    </section>
  </div>
</template>

<style scoped>
.v2-automation {
  display: grid;
  gap: var(--space-5);
}

.v2-automation-card {
  min-height: 360px;
  display: grid;
  place-items: center;
  padding: var(--space-6);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.v2-automation-hint {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
  color: var(--muted);
  font-size: var(--text-sm);
}
</style>
