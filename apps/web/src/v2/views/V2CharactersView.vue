<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter, RouterLink } from "vue-router";
import {
  ArrowLeft,
  BookOpen,
  Brain,
  ChevronRight,
  Database,
  Flame,
  HeartHandshake,
  Image as ImageIcon,
  MessageSquare,
  Network,
  Plus,
  Settings2,
  Sparkles,
  Tag,
  User,
  Users,
  Zap,
} from "@lucide/vue";

import type {
  V2CharacterEventDefinitionDto,
  V2CharacterRelationshipDto,
  V2CharacterStateDefinitionDto,
  V2CharacterVisualVariantDto,
} from "@living-network/contracts/v2";

import type { V2CharacterSummary } from "../adapters/types.ts";

import Badge from "../../components/ui/Badge.vue";
import Button from "../../components/ui/Button.vue";
import Card from "../../components/ui/Card.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import Skeleton from "../../components/ui/Skeleton.vue";
import Tabs from "../../components/ui/Tabs.vue";
import { useV2WorkspaceStore } from "../stores/workspace";

interface StoryTab {
  readonly label: string;
  readonly to: string;
  readonly exact?: boolean;
}

const route = useRoute();
const router = useRouter();
const store = useV2WorkspaceStore();

const storyTabs: readonly StoryTab[] = [
  { label: "总览", to: "/v2/workspace/project", exact: true },
  { label: "世界设定", to: "/v2/workspace/world" },
  { label: "角色中心", to: "/v2/workspace/characters" },
  { label: "状态与逻辑", to: "/v2/workspace/state" },
  { label: "故事结构", to: "/v2/workspace/story" },
  { label: "数据流程", to: "/v2/workspace/data-flow" },
];

function isStoryTabActive(tab: StoryTab): boolean {
  if (tab.exact) return route.path === tab.to;
  return route.path === tab.to || route.path.startsWith(`${tab.to}/`);
}

const detailTabs = [
  { value: "overview", label: "概览" },
  { value: "persona", label: "人格设定" },
  { value: "relationships", label: "人际关系" },
  { value: "visual", label: "视觉立绘" },
  { value: "state", label: "状态变量" },
  { value: "events", label: "事件触发" },
  { value: "usage", label: "调用审计" },
];

const activeTab = ref("overview");
const loadingDetails = ref(false);

const characterId = computed(() =>
  typeof route.params.characterId === "string" ? route.params.characterId : undefined,
);

const characters = computed<readonly V2CharacterSummary[]>(
  () => store.snapshot?.world.characters ?? [],
);

const character = computed<V2CharacterSummary | undefined>(() =>
  characters.value.find((item) => item.characterId === characterId.value),
);

interface ContextTraceItem {
  readonly task: string;
  readonly contextHash: string;
  readonly sources: readonly { path: string; reason: string; tokens: number }[];
  readonly omittedSources: readonly { path: string; reason: string; tokens: number }[];
}

const traces = ref<readonly ContextTraceItem[]>([]);
const relationships = ref<readonly V2CharacterRelationshipDto[]>([]);
const visualVariants = ref<readonly V2CharacterVisualVariantDto[]>([]);
const stateDefinitions = ref<readonly V2CharacterStateDefinitionDto[]>([]);
const events = ref<readonly V2CharacterEventDefinitionDto[]>([]);

watch(
  [() => store.snapshot?.world.storyWorldId, characterId],
  async ([worldId, currentCharacterId]) => {
    traces.value = [];
    relationships.value = [];
    visualVariants.value = [];
    stateDefinitions.value = [];
    events.value = [];

    if (!worldId || !currentCharacterId) return;

    loadingDetails.value = true;
    try {
      const base = `/api/v2/worlds/${encodeURIComponent(worldId)}/characters/${encodeURIComponent(currentCharacterId)}`;
      const [traceRes, relRes, visualRes, stateRes, eventRes] = await Promise.all([
        fetch(`/api/v2/worlds/${encodeURIComponent(worldId)}/character-context-traces`),
        fetch(`${base}/relationships`),
        fetch(`${base}/visual-variants`),
        fetch(`${base}/state-definitions`),
        fetch(`${base}/events`),
      ]);

      if (traceRes.ok) {
        const data = (await traceRes.json()) as { traces?: readonly ContextTraceItem[] };
        traces.value = data.traces ?? [];
      }
      if (relRes.ok) {
        const data = (await relRes.json()) as { relationships?: readonly V2CharacterRelationshipDto[] };
        relationships.value = data.relationships ?? [];
      }
      if (visualRes.ok) {
        const data = (await visualRes.json()) as { variants?: readonly V2CharacterVisualVariantDto[] };
        visualVariants.value = data.variants ?? [];
      }
      if (stateRes.ok) {
        const data = (await stateRes.json()) as { definitions?: readonly V2CharacterStateDefinitionDto[] };
        stateDefinitions.value = data.definitions ?? [];
      }
      if (eventRes.ok) {
        const data = (await eventRes.json()) as { events?: readonly V2CharacterEventDefinitionDto[] };
        events.value = data.events ?? [];
      }
    } catch {
      // Gracefully degrade when API is unreachable
    } finally {
      loadingDetails.value = false;
    }
  },
  { immediate: true },
);

const relevantTraces = computed(() =>
  traces.value.filter((trace) =>
    trace.sources.some((source) => source.path.includes("character") || source.path.includes(characterId.value ?? "")),
  ),
);

function getCharacterName(targetId: string): string {
  const found = characters.value.find((c) => c.characterId === targetId);
  return found?.name ?? targetId.slice(0, 8);
}

function relationshipBadge(type: string): { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" } {
  switch (type) {
    case "friend":
      return { label: "朋友", tone: "info" };
    case "family":
      return { label: "家人", tone: "success" };
    case "romantic":
      return { label: "挚爱", tone: "danger" };
    case "enemy":
      return { label: "宿敌", tone: "danger" };
    case "mentor":
      return { label: "导师", tone: "info" };
    case "student":
      return { label: "门徒", tone: "info" };
    case "colleague":
      return { label: "同僚", tone: "neutral" };
    case "rival":
      return { label: "宿敌/宿愿", tone: "warning" };
    default:
      return { label: type || "关系", tone: "neutral" };
  }
}

function startChatWithCharacter(): void {
  void router.push("/v2/chat");
}

function generateImageForCharacter(): void {
  void router.push("/v2/workspace/comfy-request");
}

function editCharacterInCanon(): void {
  void router.push({ path: "/v2/workspace/world", query: { tab: "characters" } });
}
</script>

<template>
  <div class="v2-characters-page" aria-label="角色中心">
    <!-- 顶部统一故事导航 Tab (遵循模块边界直接渲染) -->
    <nav class="v2-module-tabs" aria-label="故事模块导航">
      <div class="v2-module-tabs-list" role="tablist">
        <RouterLink
          v-for="tab in storyTabs"
          :key="tab.to"
          :to="tab.to"
          class="v2-module-tab-item"
          :class="{ 'v2-module-tab-active': isStoryTabActive(tab) }"
          role="tab"
          :aria-selected="isStoryTabActive(tab)"
        >
          <span class="v2-module-tab-label">{{ tab.label }}</span>
        </RouterLink>
      </div>
    </nav>

    <!-- 模式 A：角色卡片列表总览 (Grid Mode) -->
    <template v-if="!characterId">
      <header class="v2-characters-header">
        <div class="v2-characters-header-copy">
          <div class="v2-section-eyebrow">
            <Users :size="14" aria-hidden="true" />
            <span>Story Characters Hub</span>
          </div>
          <h1>角色中心</h1>
          <p>管理故事世界中所有角色的人格设定、人际关系网、视觉立绘与运行时状态。</p>
        </div>
        <div class="v2-characters-header-actions">
          <Button variant="secondary" size="md" @click="editCharacterInCanon">
            <Plus :size="16" aria-hidden="true" />
            <span>新建角色设定</span>
          </Button>
        </div>
      </header>

      <!-- 角色骨架加载态 -->
      <div v-if="store.loading && characters.length === 0" class="v2-character-grid">
        <Card v-for="i in 3" :key="i" class="v2-character-card-skeleton">
          <div class="v2-skeleton-header">
            <Skeleton width="48px" height="48px" rounded="md" />
            <div class="v2-skeleton-title">
              <Skeleton width="120px" height="18px" />
              <Skeleton width="80px" height="12px" />
            </div>
          </div>
          <Skeleton width="100%" height="40px" rounded="sm" />
          <div class="v2-skeleton-footer">
            <Skeleton width="60px" height="24px" rounded="full" />
            <Skeleton width="60px" height="24px" rounded="full" />
          </div>
        </Card>
      </div>

      <!-- 空数据状态 -->
      <EmptyState
        v-else-if="characters.length === 0"
        title="当前故事世界暂无角色"
        description="角色是推动剧情发展、承载多轮对话与事件连锁的核心载体。您可以前往世界设定进行快速创建。"
      >
        <template #icon>
          <User :size="24" aria-hidden="true" />
        </template>
        <template #action>
          <Button variant="primary" size="md" @click="editCharacterInCanon">
            <Plus :size="16" aria-hidden="true" />
            <span>创建第一个角色</span>
          </Button>
        </template>
      </EmptyState>

      <!-- 角色卡片瀑布网格 -->
      <div v-else class="v2-character-grid">
        <Card
          v-for="item in characters"
          :key="item.characterId"
          hoverable
          class="v2-character-card"
          @click="router.push(`/v2/workspace/characters/${item.characterId}`)"
        >
          <div class="v2-card-head">
            <div class="v2-card-avatar" aria-hidden="true">
              {{ item.name.slice(0, 1) }}
            </div>
            <div class="v2-card-meta">
              <h2 class="v2-card-name">{{ item.name }}</h2>
              <span class="v2-card-identity">
                {{ item.profile?.identity || "核心角色" }}
              </span>
            </div>
            <ChevronRight :size="18" class="v2-card-chevron" aria-hidden="true" />
          </div>

          <p class="v2-card-summary">
            {{ item.summary || item.personaText || "暂未填写详细人物简介..." }}
          </p>

          <!-- 角色标签与特质徽章 -->
          <div class="v2-card-tags">
            <Badge
              v-for="trait in (item.profile?.persona.traits ?? []).slice(0, 3)"
              :key="trait"
              tone="info"
            >
              {{ trait }}
            </Badge>
            <Badge
              v-for="tag in (item.profile?.tags ?? []).slice(0, 2)"
              :key="tag"
              tone="neutral"
            >
              #{{ tag }}
            </Badge>
          </div>

          <div class="v2-card-footer" @click.stop>
            <Button
              variant="ghost"
              size="sm"
              aria-label="与该角色对话"
              @click="startChatWithCharacter"
            >
              <MessageSquare :size="14" aria-hidden="true" />
              <span>对话</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="生成角色立绘"
              @click="generateImageForCharacter"
            >
              <ImageIcon :size="14" aria-hidden="true" />
              <span>立绘</span>
            </Button>
            <RouterLink
              :to="`/v2/workspace/characters/${item.characterId}`"
              class="v2-card-more-link"
            >
              <span>详情档案</span>
              <ChevronRight :size="13" aria-hidden="true" />
            </RouterLink>
          </div>
        </Card>
      </div>
    </template>

    <!-- 模式 B：角色详细档案面板 (Detail Mode) -->
    <template v-else>
      <!-- 返回与面包屑导航 -->
      <nav class="v2-detail-breadcrumb" aria-label="返回角色列表">
        <RouterLink to="/v2/workspace/characters" class="v2-breadcrumb-back">
          <ArrowLeft :size="15" aria-hidden="true" />
          <span>返回全部角色</span>
        </RouterLink>
        <span class="v2-breadcrumb-separator">/</span>
        <span class="v2-breadcrumb-current">{{ character?.name ?? "角色详情" }}</span>
      </nav>

      <!-- 角色不存在处理 -->
      <div v-if="!character && !store.loading" class="v2-character-not-found">
        <EmptyState
          title="未找到该角色"
          description="该角色可能已被删除或尚未在此世界设定中同步。"
        >
          <template #action>
            <Button variant="secondary" size="md" @click="router.push('/v2/workspace/characters')">
              返回角色列表
            </Button>
          </template>
        </EmptyState>
      </div>

      <div v-else class="v2-character-detail-layout">
        <!-- 角色英雄头部 (Hero Header) -->
        <Card class="v2-character-hero">
          <div class="v2-hero-main">
            <div class="v2-hero-portrait" aria-hidden="true">
              {{ character?.name?.slice(0, 1) ?? "?" }}
            </div>
            <div class="v2-hero-info">
              <div class="v2-hero-title-row">
                <h1 class="v2-hero-name">{{ character?.name }}</h1>
                <Badge tone="info" class="v2-hero-identity-badge">
                  {{ character?.profile?.identity || "登场角色" }}
                </Badge>
              </div>

              <!-- 别名列表 -->
              <div
                v-if="character?.profile?.aliases?.length"
                class="v2-hero-aliases"
              >
                <Tag :size="12" class="v2-hero-alias-icon" aria-hidden="true" />
                <span>别名：{{ character.profile.aliases.join(" / ") }}</span>
              </div>

              <!-- 角色摘要引述框 -->
              <p class="v2-hero-summary">
                {{ character?.summary || "暂无简介，可在世界设定中完善该角色的核心背景与背景故事。" }}
              </p>
            </div>
          </div>

          <!-- 英雄头部快捷操作 -->
          <div class="v2-hero-actions">
            <Button variant="primary" size="md" @click="startChatWithCharacter">
              <MessageSquare :size="16" aria-hidden="true" />
              <span>开启对话</span>
            </Button>
            <Button variant="secondary" size="md" @click="generateImageForCharacter">
              <ImageIcon :size="16" aria-hidden="true" />
              <span>生成立绘</span>
            </Button>
            <Button variant="secondary" size="md" @click="editCharacterInCanon">
              <Settings2 :size="16" aria-hidden="true" />
              <span>编辑设定</span>
            </Button>
          </div>
        </Card>

        <!-- 详细内容分栏 Tab -->
        <div class="v2-detail-tabs-wrapper">
          <Tabs v-model="activeTab" :tabs="detailTabs" />
        </div>

        <!-- 详细内容面板区 -->
        <div class="v2-detail-content-panel">
          <!-- 1. 概览 (Overview) -->
          <div v-if="activeTab === 'overview'" class="v2-tab-pane v2-grid-two">
            <Card class="v2-info-card">
              <div class="v2-card-section-title">
                <Brain :size="16" aria-hidden="true" />
                <h3>核心档案</h3>
              </div>
              <dl class="v2-spec-list">
                <div class="v2-spec-row">
                  <dt>身份阶级</dt>
                  <dd>{{ character?.profile?.identity || "未定义" }}</dd>
                </div>
                <div class="v2-spec-row">
                  <dt>说话风格</dt>
                  <dd>{{ character?.profile?.persona?.speechStyle || character?.personaText || "自然对话" }}</dd>
                </div>
                <div class="v2-spec-row">
                  <dt>性格特质</dt>
                  <dd class="v2-tag-wrap">
                    <Badge
                      v-for="t in character?.profile?.persona?.traits ?? []"
                      :key="t"
                      tone="info"
                    >
                      {{ t }}
                    </Badge>
                    <span v-if="!character?.profile?.persona?.traits?.length" class="v2-empty-text">暂无</span>
                  </dd>
                </div>
              </dl>
            </Card>

            <Card class="v2-info-card">
              <div class="v2-card-section-title">
                <BookOpen :size="16" aria-hidden="true" />
                <h3>背景与故事线</h3>
              </div>
              <div class="v2-narrative-box">
                <p v-if="character?.profile?.persona?.backgroundStory">
                  {{ character.profile.persona.backgroundStory }}
                </p>
                <p v-else-if="character?.summary">
                  {{ character.summary }}
                </p>
                <span v-else class="v2-empty-text">暂无背景故事设定。可在世界设定中为角色补充传记背景。</span>
              </div>
            </Card>
          </div>

          <!-- 2. 人格设定 (Persona) -->
          <div v-else-if="activeTab === 'persona'" class="v2-tab-pane v2-stack-panel">
            <Card>
              <div class="v2-card-section-title">
                <Sparkles :size="16" aria-hidden="true" />
                <h3>行为模式与价值观</h3>
              </div>
              <div class="v2-persona-grid">
                <div class="v2-persona-col">
                  <h4>价值观 (Values)</h4>
                  <ul v-if="character?.profile?.persona?.values?.length" class="v2-bullet-list">
                    <li v-for="val in character.profile.persona.values" :key="val">
                      <Badge tone="success">{{ val }}</Badge>
                    </li>
                  </ul>
                  <p v-else class="v2-empty-text">暂未指定核心价值观</p>
                </div>

                <div class="v2-persona-col">
                  <h4>行为禁忌 (Taboos)</h4>
                  <ul v-if="character?.profile?.persona?.taboos?.length" class="v2-bullet-list">
                    <li v-for="taboo in character.profile.persona.taboos" :key="taboo">
                      <Badge tone="danger">{{ taboo }}</Badge>
                    </li>
                  </ul>
                  <p v-else class="v2-empty-text">暂无严格行为禁忌</p>
                </div>

                <div class="v2-persona-col v2-col-full">
                  <h4>行为习惯与习惯用语 (Behavior Patterns)</h4>
                  <ul v-if="character?.profile?.persona?.behaviorPatterns?.length" class="v2-bullet-list">
                    <li v-for="pat in character.profile.persona.behaviorPatterns" :key="pat">
                      {{ pat }}
                    </li>
                  </ul>
                  <p v-else class="v2-empty-text">暂无行为模式记录</p>
                </div>

                <div v-if="character?.profile?.persona?.advancedPrompt" class="v2-persona-col v2-col-full">
                  <h4>高级 Prompt 指令</h4>
                  <pre class="v2-code-block">{{ character.profile.persona.advancedPrompt }}</pre>
                </div>
              </div>
            </Card>
          </div>

          <!-- 3. 人际关系 (Relationships) -->
          <div v-else-if="activeTab === 'relationships'" class="v2-tab-pane">
            <div v-if="loadingDetails" class="v2-grid-two">
              <Skeleton v-for="i in 2" :key="i" height="100px" rounded="lg" />
            </div>
            <EmptyState
              v-else-if="relationships.length === 0"
              title="暂无正式人际关系"
              description="在故事中，角色的立场、好感度与社会纽带可以通过世界设定或剧情推演进行建立与升级。"
            >
              <template #icon>
                <HeartHandshake :size="24" aria-hidden="true" />
              </template>
            </EmptyState>
            <div v-else class="v2-relations-grid">
              <Card
                v-for="rel in relationships"
                :key="rel.relationshipId"
                class="v2-relation-card"
              >
                <div class="v2-relation-header">
                  <div class="v2-relation-pair">
                    <strong class="v2-rel-actor">{{ getCharacterName(rel.fromCharacterId) }}</strong>
                    <span class="v2-rel-arrow">──▶</span>
                    <strong class="v2-rel-target">{{ getCharacterName(rel.toCharacterId) }}</strong>
                  </div>
                  <Badge :tone="relationshipBadge(rel.type).tone">
                    {{ rel.customLabel || relationshipBadge(rel.type).label }}
                  </Badge>
                </div>

                <p v-if="rel.description" class="v2-relation-desc">
                  {{ rel.description }}
                </p>

                <div class="v2-relation-strength">
                  <div class="v2-strength-label">
                    <span>关系强度</span>
                    <strong>{{ rel.strength }}</strong>
                  </div>
                  <div class="v2-strength-bar" role="progressbar" :aria-valuenow="rel.strength" aria-valuemin="0" aria-valuemax="100">
                    <div class="v2-strength-fill" :style="{ width: `${Math.min(100, Math.max(0, rel.strength))}%` }" />
                  </div>
                </div>
              </Card>
            </div>
          </div>

          <!-- 4. 视觉立绘 (Visual Variants) -->
          <div v-else-if="activeTab === 'visual'" class="v2-tab-pane">
            <div v-if="loadingDetails" class="v2-grid-two">
              <Skeleton v-for="i in 2" :key="i" height="140px" rounded="lg" />
            </div>
            <EmptyState
              v-else-if="visualVariants.length === 0"
              title="暂无视觉立绘变体"
              description="可通过 ComfyUI 生图工作流为角色生成全身立绘、表情差分与不同服装造型。"
            >
              <template #icon>
                <ImageIcon :size="24" aria-hidden="true" />
              </template>
              <template #action>
                <Button variant="primary" size="md" @click="generateImageForCharacter">
                  <ImageIcon :size="16" aria-hidden="true" />
                  <span>立即生成立绘</span>
                </Button>
              </template>
            </EmptyState>
            <div v-else class="v2-visual-grid">
              <Card
                v-for="variant in visualVariants"
                :key="variant.visualVariantId"
                class="v2-variant-card"
              >
                <div class="v2-variant-head">
                  <h3>{{ variant.name }}</h3>
                  <Badge v-if="variant.isDefault" tone="success">默认立绘</Badge>
                </div>
                <div v-if="variant.triggerWords.length" class="v2-variant-section">
                  <span class="v2-field-label">触发词 (Trigger Words)</span>
                  <div class="v2-chip-wrap">
                    <code v-for="word in variant.triggerWords" :key="word" class="v2-code-chip">{{ word }}</code>
                  </div>
                </div>
                <div v-if="variant.loras.length" class="v2-variant-section">
                  <span class="v2-field-label">绑定 LoRA 模型</span>
                  <ul class="v2-lora-list">
                    <li v-for="lora in variant.loras" :key="lora.name">
                      {{ lora.name }} <small>(权重: {{ lora.weight }})</small>
                    </li>
                  </ul>
                </div>
              </Card>
            </div>
          </div>

          <!-- 5. 状态变量 (State Definitions) -->
          <div v-else-if="activeTab === 'state'" class="v2-tab-pane">
            <div v-if="loadingDetails" class="v2-grid-two">
              <Skeleton v-for="i in 3" :key="i" height="80px" rounded="lg" />
            </div>
            <EmptyState
              v-else-if="stateDefinitions.length === 0"
              title="暂无角色状态定义"
              description="角色可在剧情中维护专属运行时变量（如：好感度、理智值、体力、持有物等）。"
            >
              <template #icon>
                <Database :size="24" aria-hidden="true" />
              </template>
            </EmptyState>
            <div v-else class="v2-state-grid">
              <Card
                v-for="state in stateDefinitions"
                :key="state.stateDefinitionId"
                class="v2-state-card"
              >
                <div class="v2-state-head">
                  <code class="v2-state-key">{{ state.key }}</code>
                  <Badge tone="info">{{ state.valueType }}</Badge>
                </div>
                <div class="v2-state-body">
                  <span>默认初始值:</span>
                  <strong>{{ String(state.defaultValue) }}</strong>
                </div>
              </Card>
            </div>
          </div>

          <!-- 6. 事件触发 (Events) -->
          <div v-else-if="activeTab === 'events'" class="v2-tab-pane">
            <div v-if="loadingDetails" class="v2-grid-two">
              <Skeleton v-for="i in 2" :key="i" height="100px" rounded="lg" />
            </div>
            <EmptyState
              v-else-if="events.length === 0"
              title="暂无关联事件定义"
              description="该角色尚未绑定特定的触发式剧情事件或条件分支。"
            >
              <template #icon>
                <Zap :size="24" aria-hidden="true" />
              </template>
            </EmptyState>
            <div v-else class="v2-events-grid">
              <Card
                v-for="ev in events"
                :key="ev.eventDefinitionId"
                class="v2-event-card"
              >
                <div class="v2-event-head">
                  <h3>{{ ev.name }}</h3>
                  <Badge tone="neutral">{{ ev.participantCharacterIds.length }} 位参与角色</Badge>
                </div>
                <p v-if="ev.description" class="v2-event-desc">
                  {{ ev.description }}
                </p>
              </Card>
            </div>
          </div>

          <!-- 7. 调用审计 (Context Trace) -->
          <div v-else-if="activeTab === 'usage'" class="v2-tab-pane">
            <div v-if="loadingDetails" class="v2-stack-panel">
              <Skeleton v-for="i in 3" :key="i" height="90px" rounded="lg" />
            </div>
            <EmptyState
              v-else-if="relevantTraces.length === 0"
              title="暂无模型调用审计记录"
              description="角色设定在对话生成、场景扩写与素材创作等大模型推理时，会自动被注入 Context 并留下审计 Trace。"
            >
              <template #icon>
                <Network :size="24" aria-hidden="true" />
              </template>
            </EmptyState>
            <div v-else class="v2-traces-stack">
              <Card
                v-for="trace in relevantTraces"
                :key="trace.contextHash"
                class="v2-trace-card"
              >
                <div class="v2-trace-head">
                  <div class="v2-trace-task">
                    <Flame :size="15" class="v2-trace-flame" aria-hidden="true" />
                    <strong>{{ trace.task }}</strong>
                  </div>
                  <code class="v2-trace-hash">hash: {{ trace.contextHash.slice(0, 10) }}</code>
                </div>
                <ul class="v2-source-list">
                  <li v-for="src in trace.sources" :key="src.path" class="v2-source-item">
                    <span class="v2-source-path">{{ src.path }}</span>
                    <span class="v2-source-reason">({{ src.reason }})</span>
                    <Badge tone="neutral" class="v2-source-tokens">{{ src.tokens }} tokens</Badge>
                  </li>
                </ul>
                <div v-if="trace.omittedSources.length" class="v2-trace-omitted">
                  已根据上下文窗口自动精简 {{ trace.omittedSources.length }} 项非核心背景
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.v2-characters-page {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}

/* 顶部故事导航 Tab */
.v2-module-tabs {
  display: flex;
  align-items: center;
  margin-bottom: var(--space-5);
  border-bottom: 1px solid var(--border);
}

.v2-module-tabs-list {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  overflow-x: auto;
  scrollbar-width: none;
}

.v2-module-tabs-list::-webkit-scrollbar {
  display: none;
}

.v2-module-tab-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 2px solid transparent;
  color: var(--muted);
  font-size: var(--text-sm);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  transition: color var(--motion-fast), border-color var(--motion-fast);
  margin-bottom: -1px;
}

.v2-module-tab-item:hover {
  color: var(--text-strong);
}

.v2-module-tab-active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

/* 顶部标题区 */
.v2-characters-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-5);
  margin-bottom: var(--space-6);
  flex-wrap: wrap;
}

.v2-section-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: var(--space-1);
}

.v2-characters-header-copy h1 {
  font-size: var(--text-2xl);
  color: var(--text-strong);
  margin-bottom: var(--space-1);
}

.v2-characters-header-copy p {
  color: var(--muted);
  font-size: var(--text-sm);
  max-width: 600px;
}

.v2-characters-header-actions {
  display: flex;
  gap: var(--space-3);
}

/* 角色卡片网格 */
.v2-character-grid {
  display: grid;
  gap: var(--space-5);
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}

.v2-character-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.v2-card-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.v2-card-avatar {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--primary-soft);
  color: var(--primary);
  display: grid;
  place-items: center;
  font-size: var(--text-lg);
  font-weight: 800;
  flex-shrink: 0;
}

.v2-card-meta {
  flex: 1 1 auto;
  min-width: 0;
}

.v2-card-name {
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--text-strong);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v2-card-identity {
  font-size: var(--text-xs);
  color: var(--muted);
}

.v2-card-chevron {
  color: var(--faint);
  flex-shrink: 0;
}

.v2-card-summary {
  font-size: var(--text-sm);
  color: var(--text);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 3em;
}

.v2-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  min-height: 26px;
}

.v2-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
  margin-top: auto;
}

.v2-card-more-link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--text-xs);
  color: var(--primary);
  font-weight: 600;
  text-decoration: none;
}

.v2-card-more-link:hover {
  text-decoration: underline;
}

/* 骨架屏 */
.v2-character-card-skeleton {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
}

.v2-skeleton-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.v2-skeleton-title {
  display: grid;
  gap: var(--space-1);
  flex: 1;
}

.v2-skeleton-footer {
  display: flex;
  gap: var(--space-2);
}

/* 面包屑返回 */
.v2-detail-breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  margin-bottom: var(--space-4);
}

.v2-breadcrumb-back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--primary);
  font-weight: 600;
  text-decoration: none;
}

.v2-breadcrumb-back:hover {
  text-decoration: underline;
}

.v2-breadcrumb-separator {
  color: var(--faint);
}

.v2-breadcrumb-current {
  color: var(--muted);
}

/* 角色英雄卡片 (Hero) */
.v2-character-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  padding: var(--space-6);
  background: var(--surface);
  border-radius: var(--radius-xl);
  margin-bottom: var(--space-5);
  flex-wrap: wrap;
}

.v2-hero-main {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  flex: 1 1 500px;
}

.v2-hero-portrait {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-lg);
  background: var(--primary-soft);
  color: var(--primary);
  display: grid;
  place-items: center;
  font-size: 2.2rem;
  font-weight: 800;
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
}

.v2-hero-info {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.v2-hero-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.v2-hero-name {
  font-size: var(--text-xl);
  font-weight: 800;
  color: var(--text-strong);
  margin: 0;
}

.v2-hero-identity-badge {
  font-weight: 600;
}

.v2-hero-aliases {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--muted);
}

.v2-hero-alias-icon {
  color: var(--faint);
}

.v2-hero-summary {
  font-size: var(--text-sm);
  color: var(--text);
  margin-top: var(--space-1);
  line-height: 1.5;
}

.v2-hero-actions {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}

/* Tab 包装 */
.v2-detail-tabs-wrapper {
  margin-bottom: var(--space-5);
}

.v2-detail-content-panel {
  min-height: 320px;
}

.v2-tab-pane {
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.v2-grid-two {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: var(--space-5);
}

.v2-stack-panel {
  display: grid;
  gap: var(--space-5);
}

.v2-card-section-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--primary);
  margin-bottom: var(--space-4);
}

.v2-card-section-title h3 {
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--text-strong);
  margin: 0;
}

/* 属性规格清单 */
.v2-spec-list {
  display: grid;
  gap: var(--space-3);
  margin: 0;
}

.v2-spec-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border);
}

.v2-spec-row:last-child {
  border-bottom: none;
}

.v2-spec-row dt {
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  flex: 0 0 80px;
}

.v2-spec-row dd {
  font-size: var(--text-sm);
  color: var(--text);
  margin: 0;
  text-align: right;
  word-break: break-word;
}

.v2-tag-wrap {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-1);
}

.v2-narrative-box {
  background: var(--surface-soft);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  font-size: var(--text-sm);
  line-height: 1.7;
  color: var(--text);
}

.v2-empty-text {
  color: var(--faint);
  font-style: italic;
  font-size: var(--text-xs);
}

/* 人格设定网格 */
.v2-persona-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-5);
}

.v2-persona-col h4 {
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--muted);
  margin-bottom: var(--space-2);
  text-transform: uppercase;
}

.v2-col-full {
  grid-column: 1 / -1;
}

.v2-bullet-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: 0;
  margin: 0;
  list-style: none;
}

.v2-code-block {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  font-family: monospace;
  font-size: var(--text-xs);
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 240px;
  overflow-y: auto;
}

/* 人际关系卡片 */
.v2-relations-grid {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}

.v2-relation-card {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
}

.v2-relation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.v2-relation-pair {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-strong);
}

.v2-rel-arrow {
  color: var(--primary);
  font-size: 11px;
}

.v2-relation-desc {
  font-size: var(--text-xs);
  color: var(--muted);
  margin: 0;
  line-height: 1.4;
}

.v2-relation-strength {
  display: grid;
  gap: var(--space-1);
}

.v2-strength-label {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-xs);
  color: var(--muted);
}

.v2-strength-bar {
  width: 100%;
  height: 6px;
  background: var(--surface-muted);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.v2-strength-fill {
  height: 100%;
  background: var(--primary);
  border-radius: var(--radius-full);
  transition: width 0.3s ease;
}

/* 视觉立绘变体 */
.v2-visual-grid {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}

.v2-variant-card {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
}

.v2-variant-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.v2-variant-head h3 {
  font-size: var(--text-md);
  color: var(--text-strong);
  margin: 0;
}

.v2-variant-section {
  display: grid;
  gap: var(--space-1);
}

.v2-field-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
}

.v2-chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.v2-code-chip {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  font-size: 11px;
  color: var(--primary);
}

.v2-lora-list {
  padding-left: var(--space-4);
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text);
}

/* 状态变量网格 */
.v2-state-grid {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}

.v2-state-card {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4);
}

.v2-state-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.v2-state-key {
  font-weight: 700;
  color: var(--primary);
  font-size: var(--text-sm);
}

.v2-state-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--text-xs);
  color: var(--muted);
}

/* 事件网格 */
.v2-events-grid {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}

.v2-event-card {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4);
}

.v2-event-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.v2-event-head h3 {
  font-size: var(--text-md);
  color: var(--text-strong);
  margin: 0;
}

.v2-event-desc {
  font-size: var(--text-xs);
  color: var(--muted);
  margin: 0;
  line-height: 1.5;
}

/* 调用审计 Trace */
.v2-traces-stack {
  display: grid;
  gap: var(--space-3);
}

.v2-trace-card {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4);
}

.v2-trace-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.v2-trace-task {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--text-strong);
  font-size: var(--text-sm);
}

.v2-trace-flame {
  color: var(--primary);
}

.v2-trace-hash {
  font-size: 11px;
  color: var(--muted);
}

.v2-source-list {
  display: grid;
  gap: var(--space-1);
  padding: 0;
  margin: 0;
  list-style: none;
}

.v2-source-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--text);
  background: var(--surface-soft);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
}

.v2-source-path {
  font-weight: 600;
}

.v2-source-reason {
  color: var(--muted);
}

.v2-source-tokens {
  margin-left: auto;
}

.v2-trace-omitted {
  font-size: 11px;
  color: var(--faint);
  font-style: italic;
}
</style>
