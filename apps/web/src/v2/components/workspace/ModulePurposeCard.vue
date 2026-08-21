<script setup lang="ts">
import { Info } from "@lucide/vue";

import Badge from "../../../components/ui/Badge.vue";

defineProps<{
  title: string;
  description: string;
  usages?: readonly { readonly label: string; readonly status: "direct" | "partial" | "indirect" | "unused" }[];
}>();

const statusLabels: Record<string, string> = {
  direct: "直接使用",
  partial: "部分使用",
  indirect: "间接使用",
  unused: "当前未使用",
};

const statusTones: Record<string, "success" | "info" | "neutral" | "warning"> = {
  direct: "success",
  partial: "info",
  indirect: "neutral",
  unused: "warning",
};
</script>

<template>
  <aside class="purpose-card" aria-label="模块用途说明">
    <div class="purpose-header">
      <Info :size="16" aria-hidden="true" />
      <strong>{{ title }}</strong>
    </div>
    <p>{{ description }}</p>
    <dl v-if="usages?.length">
      <dt>当前用途</dt>
      <dd>
        <span v-for="usage in usages" :key="usage.label" class="purpose-usage">
          {{ usage.label }}
          <Badge :tone="statusTones[usage.status] ?? 'neutral'">{{ statusLabels[usage.status] ?? usage.status }}</Badge>
        </span>
      </dd>
    </dl>
    <slot />
  </aside>
</template>

<style scoped>
.purpose-card {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-left: 3px solid var(--primary);
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
}

.purpose-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--primary);
}

.purpose-header strong {
  color: var(--text-strong);
  font-size: var(--text-sm);
}

.purpose-card > p {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-sm);
  line-height: 1.6;
}

.purpose-card dl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
}

.purpose-card dt {
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: 700;
}

.purpose-card dd {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
}

.purpose-usage {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--text);
}
</style>
