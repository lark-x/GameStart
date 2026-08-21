<script setup lang="ts">
import { useRouter } from "vue-router";

import Button from "../../../components/ui/Button.vue";

withDefaults(defineProps<{
  title: string;
  description: string;
  examples?: readonly string[];
  consumers?: readonly string[];
  prerequisites?: readonly string[];
  notes?: readonly string[];
}>(), {
  examples: () => [],
  consumers: () => [],
  prerequisites: () => [],
  notes: () => [],
});

const router = useRouter();
</script>

<template>
  <section class="module-intro" aria-labelledby="module-intro-title">
    <h3 id="module-intro-title">{{ title }}</h3>
    <p class="module-intro-description">{{ description }}</p>

    <div v-if="examples.length" class="module-intro-section">
      <h4>常见例子</h4>
      <ul>
        <li v-for="item in examples" :key="item">{{ item }}</li>
      </ul>
    </div>

    <div v-if="consumers.length" class="module-intro-section">
      <h4>被谁使用</h4>
      <ul>
        <li v-for="item in consumers" :key="item">{{ item }}</li>
      </ul>
    </div>

    <div v-if="prerequisites.length" class="module-intro-section">
      <h4>前置条件</h4>
      <ul>
        <li v-for="item in prerequisites" :key="item">{{ item }}</li>
      </ul>
    </div>

    <div v-if="notes.length" class="module-intro-section module-intro-notes">
      <h4>注意事项</h4>
      <ul>
        <li v-for="item in notes" :key="item">{{ item }}</li>
      </ul>
    </div>

    <Button variant="primary" size="md" @click="router.push('/v2/workspace/project')">
      先创建故事
    </Button>
  </section>
</template>

<style scoped>
.module-intro {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
}

.module-intro h3 {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-xl);
}

.module-intro-description {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-md);
  line-height: 1.6;
}

.module-intro-section h4 {
  margin: 0 0 var(--space-1);
  color: var(--text-strong);
  font-size: var(--text-sm);
  font-weight: 700;
}

.module-intro-section ul {
  margin: 0;
  padding-left: var(--space-4);
  color: var(--text);
  font-size: var(--text-sm);
  line-height: 1.8;
}

.module-intro-notes ul {
  color: var(--warning);
}

.module-intro .ui-button {
  justify-self: start;
}
</style>
