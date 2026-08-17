<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { Sparkles } from "@lucide/vue";
import type { V2IdempotencyKey } from "@living-network/contracts/v2";

import Button from "../../components/ui/Button.vue";
import Input from "../../components/ui/Input.vue";
import Textarea from "../../components/ui/Textarea.vue";
import PageHeader from "../../components/layout/PageHeader.vue";
import { createV2ChatClient } from "../chat/client.ts";

const router = useRouter();
const environment = import.meta.env as Record<string, string | undefined>;
const baseUrl = environment.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3002" : window.location.origin);
const client = createV2ChatClient({ baseUrl });

const persona = ref("");
const displayName = ref("");
const loading = ref(false);
const errorMessage = ref("");

async function startStory(): Promise<void> {
  const personaText = persona.value.trim();
  if (!personaText) {
    errorMessage.value = "请先描述你想遇到的角色。";
    return;
  }
  loading.value = true;
  errorMessage.value = "";
  try {
    const result = await client.createInstantStory({
      persona: personaText,
      ...(displayName.value.trim() ? { displayName: displayName.value.trim() } : {}),
      idempotencyKey: `instant:${Date.now()}:${crypto.randomUUID()}` as V2IdempotencyKey,
    });
    await router.push(`/v2/chat/${encodeURIComponent(result.conversation.conversationId)}`);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "创建故事失败";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="v2-start-page">
    <PageHeader
      eyebrow="即时故事"
      title="创建新的故事"
      description="只需要描述你想遇到的角色，马上就能开始聊天。世界会随着故事自然生长。"
    />
    <section class="v2-start-card">
      <div class="v2-start-icon"><Sparkles :size="24" aria-hidden="true" /></div>
      <h2>描述你想遇到的角色</h2>
      <p class="v2-start-hint">可以写性格、说话方式、与你的关系，以及任何你希望 AI 记住的细节。</p>
      <form class="v2-start-form" @submit.prevent="startStory">
        <label for="v2-persona">角色人设</label>
        <Textarea
          id="v2-persona"
          v-model="persona"
          placeholder="花火是一个……\n性格……\n说话方式……\n与我的关系……"
          :rows="8"
          :disabled="loading"
        />
        <label for="v2-display-name">角色名称（可选）</label>
        <Input id="v2-display-name" v-model="displayName" placeholder="例如：花火" :disabled="loading" />
        <p v-if="errorMessage" class="v2-start-error">{{ errorMessage }}</p>
        <Button variant="primary" size="lg" type="submit" :loading="loading" :disabled="!persona.trim()">
          开始故事
        </Button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.v2-start-page {
  display: grid;
  gap: var(--space-5);
}

.v2-start-card {
  max-width: 640px;
  width: 100%;
  margin: 0 auto;
  padding: var(--space-6);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  display: grid;
  gap: var(--space-4);
}

.v2-start-icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  color: var(--primary);
}

.v2-start-card h2 {
  margin: 0;
  font-size: var(--text-lg);
  color: var(--text);
}

.v2-start-hint {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-sm);
}

.v2-start-form {
  display: grid;
  gap: var(--space-3);
}

.v2-start-form label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text);
}

.v2-start-error {
  margin: 0;
  color: var(--danger);
  font-size: var(--text-sm);
}
</style>
