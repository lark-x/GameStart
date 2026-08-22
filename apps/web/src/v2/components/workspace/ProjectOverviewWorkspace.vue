<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter, RouterLink } from "vue-router";
import {
  BookOpen,
  FileCheck2,
  GitFork,
  Image as ImageIcon,
  Layers3,
  Plus,
  Sparkles,
  Users,
} from "@lucide/vue";

import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Card from "../../../components/ui/Card.vue";
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
    <Card v-if="!snapshot" class="project-start">
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
    </Card>

    <template v-else>
      <Card class="project-current">
        <div class="project-current-main">
          <div class="project-current-badge-row">
            <Badge tone="success">当前故事</Badge>
            <span class="project-revision-tag">v{{ snapshot.world.revision }} 状态</span>
          </div>
          <h3>{{ snapshot.world.name }}</h3>
          <p>{{ snapshot.world.premise || "还没有填写世界观前提。" }}</p>
        </div>

        <div v-if="store.storyWorlds.length > 1" class="project-switcher">
          <Field for-id="v2-project-story-switch" label="切换故事世界">
            <Select id="v2-project-story-switch" v-model="selectedStoryWorldId" :disabled="loading">
              <option v-for="world in store.storyWorlds" :key="world.storyWorldId" :value="world.storyWorldId">
                {{ world.name }} · v{{ world.revision }}
              </option>
            </Select>
          </Field>
        </div>
      </Card>

      <!-- 核心指标卡片 -->
      <section class="project-metrics" aria-label="故事数据概览">
        <Card class="project-metric" hoverable @click="goTo('/v2/workspace/world')">
          <div class="project-metric-icon-wrap">
            <BookOpen :size="18" aria-hidden="true" />
          </div>
          <span>世界设定</span>
          <strong>{{ snapshot.world.characters.length + snapshot.world.locations.length + snapshot.world.facts.length + snapshot.world.rules.length + snapshot.world.timelineEvents.length }} 项</strong>
        </Card>

        <Card class="project-metric" hoverable @click="goTo('/v2/workspace/characters')">
          <div class="project-metric-icon-wrap">
            <Users :size="18" aria-hidden="true" />
          </div>
          <span>角色中心</span>
          <strong>{{ snapshot.world.characters.length }} 位</strong>
        </Card>

        <Card class="project-metric" hoverable @click="goTo('/v2/workspace/story')">
          <div class="project-metric-icon-wrap">
            <GitFork :size="18" aria-hidden="true" />
          </div>
          <span>故事结构</span>
          <strong>{{ snapshot.sceneGraph.scenes.length }} 场景</strong>
        </Card>

        <Card class="project-metric" hoverable @click="goTo('/v2/workspace/state')">
          <div class="project-metric-icon-wrap">
            <Layers3 :size="18" aria-hidden="true" />
          </div>
          <span>状态变量</span>
          <strong>{{ snapshot.typedState.variables.length }} 个</strong>
        </Card>

        <Card class="project-metric" hoverable @click="goTo('/v2/workspace/formal-assets')">
          <div class="project-metric-icon-wrap">
            <ImageIcon :size="18" aria-hidden="true" />
          </div>
          <span>正式素材</span>
          <strong>{{ snapshot.assets.library.length }} 个</strong>
        </Card>

        <Card class="project-metric" hoverable @click="goTo('/v2/workspace/release')">
          <div class="project-metric-icon-wrap">
            <FileCheck2 :size="18" aria-hidden="true" />
          </div>
          <span>发布就绪</span>
          <strong>{{ snapshot.release.valid ? "就绪" : "需修复" }}</strong>
        </Card>
      </section>

      <!-- 创作流水线导向 -->
      <section class="project-pipeline-section" aria-label="创作流水线">
        <div class="project-section-heading">
          <Sparkles :size="16" class="project-heading-icon" aria-hidden="true" />
          <h4>故事创作全流程指引</h4>
        </div>

        <div class="project-pipeline-grid">
          <!-- 阶段 1 -->
          <Card class="project-step-card" hoverable @click="goTo('/v2/workspace/world')">
            <div class="project-step-head">
              <span class="project-step-num">01</span>
              <h5>世界设定与角色</h5>
            </div>
            <p>构建宏大世界观前提、定义地理地点、事实法则与出场人物的人格设定。</p>
            <div class="project-step-links">
              <RouterLink to="/v2/workspace/world" class="project-step-link" @click.stop>世界设定</RouterLink>
              <RouterLink to="/v2/workspace/characters" class="project-step-link" @click.stop>角色中心</RouterLink>
            </div>
          </Card>

          <!-- 阶段 2 -->
          <Card class="project-step-card" hoverable @click="goTo('/v2/workspace/story')">
            <div class="project-step-head">
              <span class="project-step-num">02</span>
              <h5>剧情分支与AI扩写</h5>
            </div>
            <p>梳理场景跳转图谱（Graph）、设置选项分支与利用大模型智能推演扩写。</p>
            <div class="project-step-links">
              <RouterLink to="/v2/workspace/story" class="project-step-link" @click.stop>故事结构图</RouterLink>
              <RouterLink to="/v2/workspace/ai-scene-request" class="project-step-link" @click.stop>AI 扩写</RouterLink>
            </div>
          </Card>

          <!-- 阶段 3 -->
          <Card class="project-step-card" hoverable @click="goTo('/v2/workspace/formal-assets')">
            <div class="project-step-head">
              <span class="project-step-num">03</span>
              <h5>立绘生成与素材库</h5>
            </div>
            <p>调用 ComfyUI 图片模型为角色与关键场景生成高精度立绘及插画背景。</p>
            <div class="project-step-links">
              <RouterLink to="/v2/workspace/comfy-request" class="project-step-link" @click.stop>图片生成</RouterLink>
              <RouterLink to="/v2/workspace/formal-assets" class="project-step-link" @click.stop>正式素材</RouterLink>
            </div>
          </Card>

          <!-- 阶段 4 -->
          <Card class="project-step-card" hoverable @click="goTo('/v2/workspace/release')">
            <div class="project-step-head">
              <span class="project-step-num">04</span>
              <h5>发布校验与游玩测试</h5>
            </div>
            <p>一键执行前置一致性静态校验，导出离线运行包并启动全沉浸式即时游玩体验。</p>
            <div class="project-step-links">
              <RouterLink to="/v2/workspace/release" class="project-step-link" @click.stop>发布检查</RouterLink>
              <RouterLink to="/v2/workspace/player" class="project-step-link" @click.stop>运行预览</RouterLink>
            </div>
          </Card>
        </div>
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

.project-current-badge-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.project-revision-tag {
  font-size: var(--text-xs);
  color: var(--muted);
  font-weight: 600;
}

.project-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
  gap: var(--space-3);
}

.project-metric {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-4);
}

.project-metric-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--primary-soft);
  color: var(--primary);
  display: grid;
  place-items: center;
}

.project-metric span {
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: 700;
}

.project-metric strong {
  overflow-wrap: anywhere;
  color: var(--text-strong);
  font-size: var(--text-lg);
}

/* 创作全流程向导 */
.project-pipeline-section {
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-2);
}

.project-section-heading {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--primary);
}

.project-section-heading h4 {
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--text-strong);
  margin: 0;
}

.project-pipeline-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-4);
}

.project-step-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
}

.project-step-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.project-step-num {
  font-size: var(--text-xs);
  font-weight: 800;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 2px 6px;
  border-radius: var(--radius-xs);
}

.project-step-head h5 {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--text-strong);
}

.project-step-card p {
  font-size: var(--text-xs);
  color: var(--muted);
  line-height: 1.5;
  margin: 0;
  flex: 1;
}

.project-step-links {
  display: flex;
  gap: var(--space-3);
  padding-top: var(--space-2);
  border-top: 1px dashed var(--border);
}

.project-step-link {
  font-size: var(--text-xs);
  color: var(--primary);
  font-weight: 600;
  text-decoration: none;
}

.project-step-link:hover {
  text-decoration: underline;
}

@media (max-width: 860px) {
  .project-start,
  .project-current {
    grid-template-columns: 1fr;
  }
}
</style>
