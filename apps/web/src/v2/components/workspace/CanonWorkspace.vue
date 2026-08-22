<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  BookOpen,
  Calendar,
  Clock3,
  GitFork,
  Globe,
  LayoutGrid,
  MapPin,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  User,
} from "@lucide/vue";
import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Card from "../../../components/ui/Card.vue";
import Drawer from "../../../components/ui/Drawer.vue";
import Field from "../../../components/ui/Field.vue";
import Input from "../../../components/ui/Input.vue";
import Textarea from "../../../components/ui/Textarea.vue";
import type { V2WorkspaceSnapshot } from "../../adapters";
import { useV2WorkspaceStore } from "../../stores/workspace";
import WorkspaceModuleIntro from "./WorkspaceModuleIntro.vue";
import StoryActFlowTree from "./StoryActFlowTree.vue";
import StoryNodeDrawer, { type CanonEntityKind } from "./StoryNodeDrawer.vue";

const route = useRoute();
const router = useRouter();
const store = useV2WorkspaceStore();

const props = defineProps<{
  snapshot: V2WorkspaceSnapshot | null;
  loading: boolean;
  draftWorldName: string;
  draftPremise: string;
  conflict: string | null;
  hasDraftChanges: boolean;
}>();

const emit = defineEmits<{
  "update:draftWorldName": [value: string];
  "update:draftPremise": [value: string];
  previewCanonDraft: [];
  resetCanonDraft: [];
}>();

// 🌟 视图切换模式：默认为 RPG 故事技能树视图
const viewMode = ref<"tree" | "list">("tree");

type CanonCategory = "characters" | "locations" | "rules_facts" | "timeline" | "all";
const validTabs = new Set<CanonCategory>(["characters", "locations", "rules_facts", "timeline", "all"]);
const activeTab = ref<CanonCategory>(validTabs.has(route.query.tab as CanonCategory) ? (route.query.tab as CanonCategory) : "characters");
const searchQuery = ref("");

watch(() => route.query.tab, (tab) => {
  if (typeof tab === "string" && validTabs.has(tab as CanonCategory)) {
    activeTab.value = tab as CanonCategory;
  }
});

watch(activeTab, (tab) => {
  void router.replace({ query: { ...route.query, tab } });
});

// Modals / Drawers
const nodeDrawerOpen = ref(false);
const nodeDrawerKind = ref<CanonEntityKind>("character");
const editingNode = ref<StorySkillNode | null>(null);
const worldDrawerOpen = ref(false);

function locationNameById(id: string | undefined): string {
  if (!id || !props.snapshot) return "";
  const loc = props.snapshot.world.locations.find((l) => l.locationId === id);
  return loc?.name ?? "";
}

function openAdd(kind: CanonEntityKind) {
  editingNode.value = null;
  nodeDrawerKind.value = kind;
  nodeDrawerOpen.value = true;
}

function openEditCharacter(char: { readonly characterId: string; readonly name: string; readonly role: string; readonly summary?: string; readonly personaText?: string; readonly homeLocationId?: string }) {
  editingNode.value = {
    id: char.characterId,
    tier: 2,
    kind: "character",
    title: char.name,
    subtitle: char.role,
    description: char.personaText || char.summary || "由用户设定的正典角色。",
    roleImpact: "主线故事推进者与对话交互伙伴",
    rawData: char,
  };
  nodeDrawerKind.value = "character";
  nodeDrawerOpen.value = true;
}

function openEditLocation(loc: { readonly locationId: string; readonly name: string; readonly summary?: string }) {
  editingNode.value = {
    id: loc.locationId,
    tier: 1,
    kind: "location",
    title: loc.name,
    description: loc.summary ?? "",
    roleImpact: "主线核心舞台与角色常驻居所",
    rawData: loc,
  };
  nodeDrawerKind.value = "location";
  nodeDrawerOpen.value = true;
}

function openEditRule(rule: { readonly ruleId: string; readonly text: string; readonly severity: "soft" | "hard" }) {
  editingNode.value = {
    id: rule.ruleId,
    tier: 1,
    kind: "rule",
    title: rule.text,
    description: rule.text,
    roleImpact: rule.severity === "hard" ? "AI 扩写与审校时必须严格遵循的硬性铁律" : "风格指导规则",
    rawData: rule,
  };
  nodeDrawerKind.value = "rule";
  nodeDrawerOpen.value = true;
}

function openEditFact(fact: { readonly factId: string; readonly text: string; readonly visibility: "creator" | "player" }) {
  editingNode.value = {
    id: fact.factId,
    tier: 1,
    kind: "fact",
    title: fact.text,
    description: fact.text,
    roleImpact: "注入全局提示词常识库，提供世界观背景上下文",
    rawData: fact,
  };
  nodeDrawerKind.value = "fact";
  nodeDrawerOpen.value = true;
}

function openEditTimeline(event: { readonly timelineEventId: string; readonly title: string; readonly localDate: string; readonly summary?: string }) {
  editingNode.value = {
    id: event.timelineEventId,
    tier: 1,
    kind: "timeline",
    title: event.title,
    description: event.summary ?? "",
    roleImpact: "世界历史背景与主线事件里程碑",
    rawData: event,
  };
  nodeDrawerKind.value = "timeline";
  nodeDrawerOpen.value = true;
}

// Filtered Lists
const filteredCharacters = computed(() => {
  if (!props.snapshot) return [];
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return props.snapshot.world.characters;
  return props.snapshot.world.characters.filter((c) => c.name.toLowerCase().includes(q) || c.role.toLowerCase().includes(q) || (c.personaText ?? "").toLowerCase().includes(q));
});

const filteredLocations = computed(() => {
  if (!props.snapshot) return [];
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return props.snapshot.world.locations;
  return props.snapshot.world.locations.filter((l) => l.name.toLowerCase().includes(q) || (l.summary ?? "").toLowerCase().includes(q));
});

const filteredRules = computed(() => {
  if (!props.snapshot) return [];
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return props.snapshot.world.rules;
  return props.snapshot.world.rules.filter((r) => r.text.toLowerCase().includes(q));
});

const filteredFacts = computed(() => {
  if (!props.snapshot) return [];
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return props.snapshot.world.facts;
  return props.snapshot.world.facts.filter((f) => f.text.toLowerCase().includes(q));
});

const filteredTimeline = computed(() => {
  if (!props.snapshot) return [];
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return props.snapshot.world.timelineEvents;
  return props.snapshot.world.timelineEvents.filter((t) => t.title.toLowerCase().includes(q) || (t.summary ?? "").toLowerCase().includes(q));
});
</script>

<template>
  <div class="canon-workspace-root">
    <div v-if="!snapshot && loading" class="canon-loading">正在加载故事世界快照...</div>

    <!-- 空库引导 -->
    <WorkspaceModuleIntro
      v-else-if="!snapshot"
      title="世界设定"
      description="这里用于定义故事中的基础事实和对象。这些内容属于一个具体故事，因此需要先创建故事。"
      :examples="['角色', '地点', '世界事实', '世界规则', '时间线']"
      :consumers="['Chat 对话上下文', '场景生成 Context（部分）', '剧情分析']"
    />

    <template v-else>
      <!-- 🌟 顶部故事世界概览 Hero Banner -->
      <Card class="world-hero-banner">
        <div class="hero-top-row">
          <div class="hero-title-group">
            <div class="hero-icon-box">
              <Globe :size="22" aria-hidden="true" />
            </div>
            <div class="hero-texts">
              <div class="hero-name-row">
                <h2>{{ snapshot.world.name }}</h2>
                <Badge tone="info">v{{ snapshot.world.revision }} 正典基线</Badge>
              </div>
              <p class="hero-premise">{{ snapshot.world.premise || "统一主线故事世界，包含所有正典角色与生活物语。" }}</p>
            </div>
          </div>

          <div class="hero-right-actions">
            <!-- 🌲 视图模式双切换器 -->
            <div class="view-mode-toggle-group">
              <button
                type="button"
                class="view-toggle-pill"
                :class="{ active: viewMode === 'tree' }"
                @click="viewMode = 'tree'"
              >
                <GitFork :size="14" aria-hidden="true" />
                <span>🌲 篇章剧情树</span>
              </button>
              <button
                type="button"
                class="view-toggle-pill"
                :class="{ active: viewMode === 'list' }"
                @click="viewMode = 'list'"
              >
                <LayoutGrid :size="14" aria-hidden="true" />
                <span>📋 实体资产列表</span>
              </button>
            </div>

            <Button variant="secondary" size="md" @click="worldDrawerOpen = true">
              <Settings :size="15" aria-hidden="true" />
              编辑设定
            </Button>
          </div>
        </div>

        <!-- 统计指标芯片 -->
        <div class="hero-stats-row">
          <div class="hero-stat-chip" :class="{ active: viewMode === 'list' && activeTab === 'characters' }" @click="viewMode = 'list'; activeTab = 'characters'">
            <User :size="14" />
            <span>{{ snapshot.world.characters.length }} 位角色</span>
          </div>
          <div class="hero-stat-chip" :class="{ active: viewMode === 'list' && activeTab === 'locations' }" @click="viewMode = 'list'; activeTab = 'locations'">
            <MapPin :size="14" />
            <span>{{ snapshot.world.locations.length }} 处地点</span>
          </div>
          <div class="hero-stat-chip" :class="{ active: viewMode === 'list' && activeTab === 'rules_facts' }" @click="viewMode = 'list'; activeTab = 'rules_facts'">
            <ShieldAlert :size="14" />
            <span>{{ snapshot.world.rules.length + snapshot.world.facts.length }} 条规则与事实</span>
          </div>
          <div class="hero-stat-chip" :class="{ active: viewMode === 'list' && activeTab === 'timeline' }" @click="viewMode = 'list'; activeTab = 'timeline'">
            <Clock3 :size="14" />
            <span>{{ snapshot.world.timelineEvents.length }} 项历史事件</span>
          </div>
        </div>
      </Card>

      <!-- 🌟 视图 A: 篇章剧幕与分支剧情树 (Act Flow Swimlanes) -->
      <StoryActFlowTree
        v-if="viewMode === 'tree'"
        :snapshot="snapshot"
        :loading="loading"
        @refreshed="store.loadSnapshot()"
      />

      <!-- 🌟 视图 B: 经典卡片列表视图 (分类检索与沉浸卡片) -->
      <template v-else>
        <!-- 导航与操作栏 -->
        <div class="canon-toolbar">
          <div class="canon-tab-pills">
            <button
              type="button"
              class="tab-pill"
              :class="{ active: activeTab === 'characters' }"
              @click="activeTab = 'characters'"
            >
              <User :size="15" />
              <span>正典角色 ({{ snapshot.world.characters.length }})</span>
            </button>
            <button
              type="button"
              class="tab-pill"
              :class="{ active: activeTab === 'locations' }"
              @click="activeTab = 'locations'"
            >
              <MapPin :size="15" />
              <span>舞台地点 ({{ snapshot.world.locations.length }})</span>
            </button>
            <button
              type="button"
              class="tab-pill"
              :class="{ active: activeTab === 'rules_facts' }"
              @click="activeTab = 'rules_facts'"
            >
              <ShieldAlert :size="15" />
              <span>规则与事实 ({{ snapshot.world.rules.length + snapshot.world.facts.length }})</span>
            </button>
            <button
              type="button"
              class="tab-pill"
              :class="{ active: activeTab === 'timeline' }"
              @click="activeTab = 'timeline'"
            >
              <Clock3 :size="15" />
              <span>时间线 ({{ snapshot.world.timelineEvents.length }})</span>
            </button>
            <button
              type="button"
              class="tab-pill"
              :class="{ active: activeTab === 'all' }"
              @click="activeTab = 'all'"
            >
              <Sparkles :size="15" />
              <span>全部正典</span>
            </button>
          </div>

          <div class="toolbar-right">
            <div class="search-input-wrap">
              <Search :size="15" class="search-icon" aria-hidden="true" />
              <Input
                v-model="searchQuery"
                placeholder="搜索角色、地点、规则..."
                size="sm"
                class="canon-search-input"
              />
            </div>

            <!-- 根据当前 Tab 提供精准的新增主按钮 -->
            <Button
              v-if="activeTab === 'characters'"
              variant="primary"
              size="md"
              @click="openAdd('character')"
            >
              <Plus :size="16" aria-hidden="true" />
              新增正典角色
            </Button>
            <Button
              v-else-if="activeTab === 'locations'"
              variant="primary"
              size="md"
              @click="openAdd('location')"
            >
              <Plus :size="16" aria-hidden="true" />
              新增舞台地点
            </Button>
            <Button
              v-else-if="activeTab === 'rules_facts'"
              variant="primary"
              size="md"
              @click="openAdd('rule')"
            >
              <Plus :size="16" aria-hidden="true" />
              新增规则 / 事实
            </Button>
            <Button
              v-else-if="activeTab === 'timeline'"
              variant="primary"
              size="md"
              @click="openAdd('timeline')"
            >
              <Plus :size="16" aria-hidden="true" />
              新增时间线事件
            </Button>
            <Button
              v-else
              variant="primary"
              size="md"
              @click="openAdd('character')"
            >
              <Plus :size="16" aria-hidden="true" />
              新增正典数据
            </Button>
          </div>
        </div>

        <!-- 内容卡片网格 -->
        <div class="entities-container">
          <!-- 1. 角色网格 -->
          <section v-if="activeTab === 'characters' || activeTab === 'all'" class="entity-section">
            <div v-if="activeTab === 'all'" class="section-heading">
              <User :size="16" class="section-heading-icon" />
              <h3>正典角色 ({{ filteredCharacters.length }})</h3>
            </div>

            <div v-if="filteredCharacters.length > 0" class="entity-cards-grid">
              <article
                v-for="char in filteredCharacters"
                :key="char.characterId"
                class="clean-entity-card character-card"
              >
                <div class="card-head">
                  <div class="card-avatar">
                    <User :size="18" />
                  </div>
                  <div class="card-title-block">
                    <h4 class="card-name">
                      <button
                        type="button"
                        class="char-link-btn"
                        @click="router.push(`/v2/workspace/characters/${encodeURIComponent(char.characterId)}`)"
                      >
                        {{ char.name }}
                      </button>
                    </h4>
                    <span class="card-sub">{{ char.role || "正典角色" }}</span>
                  </div>
                  <div class="card-head-actions">
                    <Badge tone="success">角色</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="编辑角色"
                      @click="openEditCharacter(char)"
                    >
                      <Pencil :size="14" />
                    </Button>
                  </div>
                </div>

                <p class="card-body-text">
                  {{ char.personaText || char.summary || "由用户人设创建的正典 AI 角色。" }}
                </p>

                <div class="card-foot">
                  <span class="foot-location">
                    <MapPin :size="12" />
                    {{ locationNameById(char.homeLocationId) ? `常驻：${locationNameById(char.homeLocationId)}` : "未绑定常驻地点" }}
                  </span>
                  <span class="foot-impact">🎯 对话与剧情角色</span>
                </div>
              </article>
            </div>

            <div v-else class="empty-state-card">
              <User :size="32" class="empty-icon" />
              <h4>暂无匹配的角色</h4>
              <p>创建正典角色后，可在伴侣专区发起沉浸对白，并在主线故事中出场。</p>
              <Button variant="primary" size="md" @click="openAdd('character')">
                <Plus :size="15" /> 新增正典角色
              </Button>
            </div>
          </section>

          <!-- 2. 地点网格 -->
          <section v-if="activeTab === 'locations' || activeTab === 'all'" class="entity-section">
            <div v-if="activeTab === 'all'" class="section-heading">
              <MapPin :size="16" class="section-heading-icon" />
              <h3>舞台地点 ({{ filteredLocations.length }})</h3>
            </div>

            <div v-if="filteredLocations.length > 0" class="entity-cards-grid">
              <article
                v-for="loc in filteredLocations"
                :key="loc.locationId"
                class="clean-entity-card location-card"
              >
                <div class="card-head">
                  <div class="card-avatar location-avatar">
                    <MapPin :size="18" />
                  </div>
                  <div class="card-title-block">
                    <h4 class="card-name">{{ loc.name }}</h4>
                    <span class="card-sub">地理舞台</span>
                  </div>
                  <div class="card-head-actions">
                    <Badge tone="info">地点</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="编辑地点"
                      @click="openEditLocation(loc)"
                    >
                      <Pencil :size="14" />
                    </Button>
                  </div>
                </div>

                <p class="card-body-text">
                  {{ loc.summary || "用于承载主线剧情场景与角色生活场景的核心地理位置。" }}
                </p>

                <div class="card-foot">
                  <span class="foot-impact">🎯 场景发生地与角色居所</span>
                </div>
              </article>
            </div>

            <div v-else-if="activeTab === 'locations'" class="empty-state-card">
              <MapPin :size="32" class="empty-icon" />
              <h4>暂无舞台地点</h4>
              <p>添加地理地点后，角色可以绑定常驻居所，主线场景也可在此地展开。</p>
              <Button variant="primary" size="md" @click="openAdd('location')">
                <Plus :size="15" /> 新增舞台地点
              </Button>
            </div>
          </section>

          <!-- 3. 规则与事实网格 -->
          <section v-if="activeTab === 'rules_facts' || activeTab === 'all'" class="entity-section">
            <div v-if="activeTab === 'all'" class="section-heading">
              <ShieldAlert :size="16" class="section-heading-icon" />
              <h3>规则与事实 ({{ filteredRules.length + filteredFacts.length }})</h3>
            </div>

            <div v-if="filteredRules.length + filteredFacts.length > 0" class="entity-cards-grid">
              <!-- 规则卡片 -->
              <article
                v-for="rule in filteredRules"
                :key="rule.ruleId"
                class="clean-entity-card rule-card"
              >
                <div class="card-head">
                  <div class="card-avatar rule-avatar">
                    <ShieldAlert :size="18" />
                  </div>
                  <div class="card-title-block">
                    <h4 class="card-name">世界规则</h4>
                    <span class="card-sub">{{ rule.severity === "hard" ? "硬性必须遵守" : "软性风格指导" }}</span>
                  </div>
                  <div class="card-head-actions">
                    <Badge :tone="rule.severity === 'hard' ? 'warning' : 'neutral'">
                      {{ rule.severity === "hard" ? "硬约束" : "软指导" }}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="编辑规则"
                      @click="openEditRule(rule)"
                    >
                      <Pencil :size="14" />
                    </Button>
                  </div>
                </div>

                <p class="card-body-text">{{ rule.text }}</p>

                <div class="card-foot">
                  <span class="foot-impact">🎯 AI 扩写与审校硬性门禁</span>
                </div>
              </article>

              <!-- 事实卡片 -->
              <article
                v-for="fact in filteredFacts"
                :key="fact.factId"
                class="clean-entity-card fact-card"
              >
                <div class="card-head">
                  <div class="card-avatar fact-avatar">
                    <BookOpen :size="18" />
                  </div>
                  <div class="card-title-block">
                    <h4 class="card-name">世界常识事实</h4>
                    <span class="card-sub">{{ fact.visibility === "player" ? "玩家公开可见" : "创作者隐藏" }}</span>
                  </div>
                  <div class="card-head-actions">
                    <Badge tone="info">{{ fact.visibility === "player" ? "公开事实" : "暗线事实" }}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="编辑事实"
                      @click="openEditFact(fact)"
                    >
                      <Pencil :size="14" />
                    </Button>
                  </div>
                </div>

                <p class="card-body-text">{{ fact.text }}</p>

                <div class="card-foot">
                  <span class="foot-impact">🎯 全局提示词与对话常识库</span>
                </div>
              </article>
            </div>

            <div v-else-if="activeTab === 'rules_facts'" class="empty-state-card">
              <ShieldAlert :size="32" class="empty-icon" />
              <h4>暂无规则与事实</h4>
              <p>设定公理事实与行为规则，能够保障大模型在剧情扩写与角色对话时不违背世界观。</p>
              <Button variant="primary" size="md" @click="openAdd('rule')">
                <Plus :size="15" /> 新增规则 / 事实
              </Button>
            </div>
          </section>

          <!-- 4. 时间线网格 -->
          <section v-if="activeTab === 'timeline' || activeTab === 'all'" class="entity-section">
            <div v-if="activeTab === 'all'" class="section-heading">
              <Clock3 :size="16" class="section-heading-icon" />
              <h3>时间线历史 ({{ filteredTimeline.length }})</h3>
            </div>

            <div v-if="filteredTimeline.length > 0" class="entity-cards-grid">
              <article
                v-for="ev in filteredTimeline"
                :key="ev.timelineEventId"
                class="clean-entity-card timeline-card"
              >
                <div class="card-head">
                  <div class="card-avatar timeline-avatar">
                    <Calendar :size="18" />
                  </div>
                  <div class="card-title-block">
                    <h4 class="card-name">{{ ev.title }}</h4>
                    <span class="card-sub">{{ ev.localDate }}</span>
                  </div>
                  <div class="card-head-actions">
                    <Badge tone="neutral">时间线</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="编辑时间线事件"
                      @click="openEditTimeline(ev)"
                    >
                      <Pencil :size="14" />
                    </Button>
                  </div>
                </div>

                <p class="card-body-text">
                  {{ ev.summary || "记录在世界观历史中发生的重要标志性事件。" }}
                </p>

                <div class="card-foot">
                  <span class="foot-impact">🎯 主线历史前置与背景</span>
                </div>
              </article>
            </div>

            <div v-else-if="activeTab === 'timeline'" class="empty-state-card">
              <Clock3 :size="32" class="empty-icon" />
              <h4>暂无时间线事件</h4>
              <p>记录历史大事件与剧幕节点，梳理宏观编年史。</p>
              <Button variant="primary" size="md" @click="openAdd('timeline')">
                <Plus :size="15" /> 新增时间线事件
              </Button>
            </div>
          </section>
        </div>
      </template>
    </template>

    <!-- 🌟 影响驱动型数据创建 / 编辑抽屉 -->
    <StoryNodeDrawer
      v-model:open="nodeDrawerOpen"
      :initial-kind="nodeDrawerKind"
      :editing-node="editingNode"
      :snapshot="snapshot"
      @saved="store.loadSnapshot()"
    />

    <!-- 🌟 世界观设定修订抽屉 -->
    <Drawer
      :open="worldDrawerOpen"
      title="编辑故事世界设定"
      description="修改故事世界空间名称与世界观背景前提"
      @close="worldDrawerOpen = false"
      @update:open="worldDrawerOpen = $event"
    >
      <form class="world-edit-form" @submit.prevent="emit('previewCanonDraft'); worldDrawerOpen = false">
        <Field label="故事空间名称" hint="例如：主线故事世界 或 枫丹廷的生活物语">
          <Input
            id="v2-world-name"
            aria-label="故事空间名称"
            :model-value="draftWorldName"
            :disabled="loading"
            placeholder="故事空间名称"
            @update:model-value="emit('update:draftWorldName', $event)"
          />
        </Field>

        <Field label="世界观背景前提 / Premise" hint="注入所有下游场景与提示词的最高世界观设定">
          <Textarea
            id="v2-world-premise"
            aria-label="故事前提"
            :model-value="draftPremise"
            :disabled="loading"
            :rows="5"
            placeholder="描述整个故事世界的背景、时代特征与基本社会构成..."
            @update:model-value="emit('update:draftPremise', $event)"
          />
        </Field>

        <div class="world-form-actions">
          <Button variant="primary" size="md" type="submit" :disabled="!hasDraftChanges || loading">
            保存修改
          </Button>
          <Button v-if="hasDraftChanges" variant="secondary" size="md" :disabled="loading" @click="emit('resetCanonDraft')">
            重置草稿
          </Button>
          <Button variant="ghost" size="md" type="button" @click="worldDrawerOpen = false">
            取消
          </Button>
        </div>
      </form>
    </Drawer>
  </div>
</template>

<style scoped>
.canon-workspace-root {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: 100%;
}

.canon-loading {
  padding: var(--space-8);
  text-align: center;
  color: var(--muted);
  font-size: 14px;
}

/* 🌟 顶部 Hero Banner */
.world-hero-banner {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.hero-top-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.hero-title-group {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  min-width: 0;
  flex: 1;
}

.hero-icon-box {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--primary-soft);
  color: var(--primary);
  flex-shrink: 0;
}

.hero-texts {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.hero-name-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.hero-name-row h2 {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-lg);
  font-weight: 800;
}

.hero-premise {
  margin: 0;
  color: var(--text);
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.9;
}

.hero-right-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

/* 🌲 视图模式双切换器 */
.view-mode-toggle-group {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px;
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  border: 1px solid var(--border);
}

.view-toggle-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--motion-fast);
  white-space: nowrap;
}

.view-toggle-pill:hover {
  color: var(--text-strong);
}

.view-toggle-pill.active {
  background: var(--surface);
  color: var(--primary);
  box-shadow: var(--shadow-sm);
}

.hero-stats-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
}

.hero-stat-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  background: var(--surface-soft);
  border: 1px solid var(--border);
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--motion-fast);
}

.hero-stat-chip:hover {
  border-color: var(--primary);
  color: var(--text);
}

.hero-stat-chip.active {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
}

/* 🌟 操作栏 */
.canon-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.canon-tab-pills {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  border: 1px solid var(--border);
  flex-wrap: wrap;
}

.tab-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all var(--motion-fast);
  white-space: nowrap;
}

.tab-pill:hover {
  color: var(--text-strong);
}

.tab-pill.active {
  background: var(--surface);
  color: var(--primary);
  box-shadow: var(--shadow-sm);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.search-input-wrap {
  position: relative;
  width: 220px;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
  pointer-events: none;
}

.canon-search-input {
  padding-left: 32px !important;
}

/* 🌟 卡片网格 */
.entities-container {
  display: grid;
  gap: var(--space-5);
}

.entity-section {
  display: grid;
  gap: var(--space-3);
}

.section-heading {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-strong);
}

.section-heading h3 {
  margin: 0;
  font-size: var(--text-md);
  font-weight: 800;
}

.section-heading-icon {
  color: var(--primary);
}

.entity-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-3);
}

.clean-entity-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  transition: all var(--motion-fast);
}

.clean-entity-card:hover {
  border-color: var(--primary);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.card-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.card-avatar {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary);
  flex-shrink: 0;
}

.location-avatar {
  background: var(--info-soft);
  color: var(--info);
}

.rule-avatar {
  background: var(--warning-soft);
  color: var(--warning);
}

.fact-avatar {
  background: var(--surface-soft);
  color: var(--text);
}

.timeline-avatar {
  background: var(--surface-soft);
  color: var(--muted);
}

.card-title-block {
  display: grid;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.card-name {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.char-link-btn {
  border: 0;
  background: transparent;
  padding: 0;
  color: inherit;
  font: inherit;
  font-weight: inherit;
  cursor: pointer;
  text-align: left;
}

.char-link-btn:hover {
  color: var(--primary);
  text-decoration: underline;
}

.card-sub {
  color: var(--muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.card-body-text {
  margin: 0;
  color: var(--text);
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.9;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}

.card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px dashed var(--border);
  font-size: 11px;
  color: var(--muted);
}

.foot-location {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.foot-impact {
  color: var(--primary);
  font-weight: 600;
  white-space: nowrap;
}

/* 空状态 */
.empty-state-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-8) var(--space-4);
  border-radius: var(--radius-lg);
  border: 1px dashed var(--border-strong);
  background: var(--surface-soft);
  text-align: center;
}

.empty-icon {
  color: var(--muted);
}

.empty-state-card h4 {
  margin: 0;
  color: var(--text-strong);
  font-size: 14px;
  font-weight: 800;
}

.empty-state-card p {
  margin: 0 0 var(--space-2);
  color: var(--muted);
  font-size: 12px;
  max-width: 380px;
}

/* 世界编辑表单 */
.world-edit-form {
  display: grid;
  gap: var(--space-4);
}

.world-form-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

@media (max-width: 640px) {
  .hero-top-row {
    flex-direction: column;
    align-items: stretch;
  }

  .hero-right-actions {
    width: 100%;
    justify-content: space-between;
  }

  .canon-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-right {
    flex-direction: column;
    align-items: stretch;
    width: 100%;
  }

  .search-input-wrap {
    width: 100%;
  }

  .toolbar-right > button {
    width: 100%;
  }

  .entity-cards-grid {
    grid-template-columns: 1fr;
  }
}
</style>
