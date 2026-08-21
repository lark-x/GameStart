<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { ArrowRight, BookOpen, FileCheck2, GitFork, Image as ImageIcon, Layers3, Plus } from "@lucide/vue";

import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Field from "../../../components/ui/Field.vue";
import Input from "../../../components/ui/Input.vue";
import Select from "../../../components/ui/Select.vue";
import Textarea from "../../../components/ui/Textarea.vue";
import type { V2WorkspaceSnapshot } from "../../adapters";
import { useV2WorkspaceStore } from "../../stores/workspace";

defineProps<{ snapshot: V2WorkspaceSnapshot | null; loading: boolean }>();

const router = useRouter();
const store = useV2WorkspaceStore();
const newStoryName = ref("");
const newStoryPremise = ref("");
const createError = ref<string | null>(null);

const selectedStoryWorldId = computed({
  get: () => store.activeStoryWorldId ?? "",
  set: (value: string) => {
    if (value) void store.selectStoryWorld(value);
  },
});

async function submitCreateStory(): Promise<void> {
  const name = newStoryName.value.trim();
  if (!name) {
    createError.value = "请填写故事名称。";
    return;
  }
  createError.value = null;
  const input: { name: string; summary?: string } = { name };
  const premise = newStoryPremise.value.trim();
  if (premise) input.summary = premise;
  try {
    await store.createStoryWorld(input);
    newStoryName.value = "";
    newStoryPremise.value = "";
    await router.push("/v2/workspace/world");
  } catch {
    createError.value = store.error ?? "创建故事失败。";
  }
}

function goTo(path: string): void {
  void router.push(path);
}
</script>

<template>
  <div class="project-overview">
    <section v-if="!snapshot" class="project-start">
      <div class="project-start-copy">
        <Badge tone="info">项目首页</Badge>
        <h3>创建第一个故事</h3>
        <p>先创建故事空间。角色、地点、剧情、状态变量和 AI 生成内容都会归属于这个故事。</p>
      </div>

      <form class="project-create-form" @submit.prevent="submitCreateStory">
        <Field for-id="v2-project-new-story-name" label="故事名称" required>
          <Input id="v2-project-new-story-name" v-model="newStoryName" :disabled="loading || store.creatingStory" placeholder="例如：雾港回声" />
        </Field>
        <Field for-id="v2-project-new-story-premise" label="故事前提 / 世界观背景">
          <Textarea
            id="v2-project-new-story-premise"
            v-model="newStoryPremise"
            :disabled="loading || store.creatingStory"
            :rows="4"
            placeholder="这个世界发生了什么？玩家最先需要知道什么？"
          />
        </Field>
        <p v-if="createError" class="project-error" role="alert">{{ createError }}</p>
        <Button variant="primary" size="md" type="submit" :loading="store.creatingStory">
          <Plus :size="16" aria-hidden="true" />
          新建故事
        </Button>
      </form>
    </section>

    <template v-else>
      <section class="project-current">
        <div class="project-current-main">
          <Badge tone="success">当前故事</Badge>
          <h3>{{ snapshot.world.name }}</h3>
          <p>{{ snapshot.world.premise || "还没有填写世界观前提。" }}</p>
        </div>

        <div v-if="store.storyWorlds.length > 1" class="project-switcher">
          <Field for-id="v2-project-story-switch" label="切换故事">
            <Select id="v2-project-story-switch" v-model="selectedStoryWorldId" :disabled="loading">
              <option v-for="world in store.storyWorlds" :key="world.storyWorldId" :value="world.storyWorldId">
                {{ world.name }} · v{{ world.revision }}
              </option>
            </Select>
          </Field>
        </div>
      </section>

      <section class="project-metrics" aria-label="故事数据概览">
        <article class="project-metric">
          <BookOpen :size="18" aria-hidden="true" />
          <span>世界设定</span>
          <strong>{{ snapshot.world.characters.length + snapshot.world.locations.length + snapshot.world.facts.length + snapshot.world.rules.length + snapshot.world.timelineEvents.length }} 项</strong>
        </article>
        <article class="project-metric">
          <GitFork :size="18" aria-hidden="true" />
          <span>故事结构</span>
          <strong>{{ snapshot.sceneGraph.scenes.length }} 场景</strong>
        </article>
        <article class="project-metric">
          <Layers3 :size="18" aria-hidden="true" />
          <span>状态变量</span>
          <strong>{{ snapshot.typedState.variables.length }} 个</strong>
        </article>
        <article class="project-metric">
          <ImageIcon :size="18" aria-hidden="true" />
          <span>正式素材</span>
          <strong>{{ snapshot.assets.library.length }} 个</strong>
        </article>
        <article class="project-metric">
          <FileCheck2 :size="18" aria-hidden="true" />
          <span>发布检查</span>
          <strong>{{ snapshot.release.valid ? "可发布" : "需修复" }}</strong>
        </article>
      </section>

      <section class="project-next">
        <Button variant="secondary" size="md" @click="goTo('/v2/workspace/data-flow')">
          理解数据流
          <ArrowRight :size="16" aria-hidden="true" />
        </Button>
        <Button variant="secondary" size="md" @click="goTo('/v2/workspace/world')">
          世界设定
          <ArrowRight :size="16" aria-hidden="true" />
        </Button>
        <Button variant="secondary" size="md" @click="goTo('/v2/workspace/characters')">
          角色中心
          <ArrowRight :size="16" aria-hidden="true" />
        </Button>
        <Button variant="secondary" size="md" @click="goTo('/v2/workspace/state')">
          状态与逻辑
          <ArrowRight :size="16" aria-hidden="true" />
        </Button>
        <Button variant="secondary" size="md" @click="goTo('/v2/workspace/story')">
          故事结构
          <ArrowRight :size="16" aria-hidden="true" />
        </Button>
        <Button variant="primary" size="md" @click="goTo('/v2/workspace/release')">
          发布与运行
          <ArrowRight :size="16" aria-hidden="true" />
        </Button>
      </section>
    </template>
  </div>
</template>

<style scoped>
.project-overview {
  display: grid;
  gap: var(--space-4);
}

.project-start,
.project-current {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 420px);
  gap: var(--space-5);
  align-items: start;
  padding: var(--space-5);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-soft);
}

.project-start-copy,
.project-current-main {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}

.project-start h3,
.project-current h3 {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-2xl);
  line-height: 1.15;
}

.project-start p,
.project-current p {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-md);
  line-height: 1.6;
}

.project-create-form {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}

.project-error {
  margin: 0;
  color: var(--danger);
  font-size: var(--text-sm);
}

.project-switcher {
  min-width: 0;
}

.project-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr));
  gap: var(--space-3);
}

.project-metric {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.project-metric svg {
  color: var(--primary);
}

.project-metric span {
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: 800;
  text-transform: uppercase;
}

.project-metric strong {
  overflow-wrap: anywhere;
  color: var(--text-strong);
  font-size: var(--text-lg);
}

.project-next {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

@media (max-width: 860px) {
  .project-start,
  .project-current {
    grid-template-columns: 1fr;
  }
}
</style>
