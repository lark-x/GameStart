<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  X,
  ExternalLink,
  ShieldCheck,
  History,
  RefreshCw,
  Search as SearchIcon,
  Loader2,
  FileText,
  User,
  MapPin,
  BookOpen,
} from "@lucide/vue";
import { useNarrativeDiagnosticsStore } from "../../../story/stores/useNarrativeDiagnosticsStore.ts";
import { useNarrativeSearchStore } from "../../stores/useNarrativeSearchStore.ts";
import { useNarrativeSessionStore, type BottomPanelTab } from "../../stores/useNarrativeSessionStore.ts";
import type { V2NarrativeDiagnostic, V2NarrativeSearchResultItem } from "@living-network/contracts/v2";

const props = defineProps<{
  storyWorldId: string;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  openScene: [sceneId: string, blockId?: string];
}>();

const diagStore = useNarrativeDiagnosticsStore();
const searchStore = useNarrativeSearchStore();
const sessionStore = useNarrativeSessionStore();

const activeTab = computed<BottomPanelTab | "preflight" | "audits">({
  get: () => sessionStore.bottomPanelTab,
  set: (t) => {
    if (t === "problems" || t === "search" || t === "jobs" || t === "candidates") {
      sessionStore.setBottomPanelTab(t);
    }
  },
});

const localTab = ref<string>(sessionStore.bottomPanelTab);
watch(() => sessionStore.bottomPanelTab, (newTab) => {
  localTab.value = newTab;
});

const severityFilter = ref<"all" | "error" | "warning" | "info">("all");
const isExpandedHeight = ref(false);
const searchInput = ref("");
let searchTimer: ReturnType<typeof setTimeout> | null = null;

const filteredIssues = computed(() => {
  if (severityFilter.value === "all") return diagStore.issues;
  return diagStore.issues.filter((i) => i.severity === severityFilter.value);
});

function handleJumpToEntity(diag: V2NarrativeDiagnostic) {
  if (diag.entityType === "scene") {
    emit("openScene", diag.entityId);
  } else if (diag.entityType === "block") {
    const sceneId = diag.targetId || diag.entityId;
    sessionStore.setActiveBlockId(diag.entityId);
    emit("openScene", sceneId, diag.entityId);
  }
}

function handleSearchInput(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  searchInput.value = val;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    void searchStore.search(props.storyWorldId, val);
  }, 200);
}

function handleSelectSearchResult(item: V2NarrativeSearchResultItem) {
  if (item.kind === "scene") {
    emit("openScene", item.id);
  } else if (item.kind === "scene_block") {
    const sceneId = item.sceneId || item.parentPath || item.id;
    sessionStore.setActiveBlockId(item.id);
    emit("openScene", sceneId, item.id);
  } else if (item.sceneId) {
    emit("openScene", item.sceneId);
  }
}
</script>

<template>
  <div
    v-if="open"
    class="border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex flex-col shadow-2xl transition-all duration-200"
    :class="[isExpandedHeight ? 'h-96' : 'h-64']"
  >
    <!-- Panel Header Bar -->
    <div class="px-4 py-2 border-b border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-950/60 flex items-center justify-between select-none">
      <!-- Tabs -->
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          :class="[
            localTab === 'problems'
              ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-sm'
              : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
          ]"
          @click="activeTab = 'problems'"
        >
          <AlertCircle class="h-3.5 w-3.5" :class="diagStore.errorCount > 0 ? 'text-red-500' : 'text-amber-500'" />
          <span>问题诊断</span>
          <span
            v-if="diagStore.issues.length > 0"
            class="px-1.5 py-0.2 rounded-full font-mono text-[10px]"
            :class="[
              diagStore.errorCount > 0
                ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
            ]"
          >
            {{ diagStore.issues.length }}
          </span>
        </button>

        <button
          type="button"
          class="px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          :class="[
            localTab === 'search'
              ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-sm'
              : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
          ]"
          @click="activeTab = 'search'"
        >
          <SearchIcon class="h-3.5 w-3.5 text-amber-500" />
          <span>全局检索</span>
          <kbd class="hidden sm:inline-block px-1 py-0.2 text-[9px] font-mono bg-stone-100 dark:bg-stone-800 text-stone-400 rounded">⌘K</kbd>
        </button>

        <button
          type="button"
          class="px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          :class="[
            localTab === 'preflight'
              ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-sm'
              : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
          ]"
          @click="localTab = 'preflight'"
        >
          <ShieldCheck class="h-3.5 w-3.5 text-emerald-500" />
          <span>发布预检</span>
        </button>

        <button
          type="button"
          class="px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          :class="[
            localTab === 'audits'
              ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-sm'
              : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
          ]"
          @click="localTab = 'audits'"
        >
          <History class="h-3.5 w-3.5 text-sky-500" />
          <span>审计记录</span>
        </button>
      </div>

      <!-- Controls -->
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded transition-colors"
          title="刷新诊断"
          @click="diagStore.fetchDiagnostics(storyWorldId)"
        >
          <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': diagStore.loading }" />
        </button>

        <button
          type="button"
          class="p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded transition-colors"
          :title="isExpandedHeight ? '缩小面板' : '展开面板'"
          @click="isExpandedHeight = !isExpandedHeight"
        >
          <ChevronDown v-if="isExpandedHeight" class="h-3.5 w-3.5" />
          <ChevronUp v-else class="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          class="p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded transition-colors"
          title="关闭面板"
          @click="emit('close')"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <!-- Panel Content Body -->
    <div class="flex-1 overflow-y-auto p-3 text-xs">
      <!-- 1. Problems Tab -->
      <template v-if="localTab === 'problems'">
        <div class="space-y-3">
          <!-- Severity Filter Pills -->
          <div class="flex items-center gap-2 pb-2 border-b border-stone-100 dark:border-stone-800">
            <button
              type="button"
              class="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
              :class="[
                severityFilter === 'all'
                  ? 'bg-stone-200 dark:bg-stone-700 text-stone-900 dark:text-stone-100 font-bold'
                  : 'text-stone-400 hover:text-stone-600'
              ]"
              @click="severityFilter = 'all'"
            >
              全部 ({{ diagStore.issues.length }})
            </button>
            <button
              type="button"
              class="px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition-colors"
              :class="[
                severityFilter === 'error'
                  ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 font-bold'
                  : 'text-stone-400 hover:text-red-500'
              ]"
              @click="severityFilter = 'error'"
            >
              <AlertCircle class="h-3 w-3 text-red-500" />
              <span>错误 ({{ diagStore.errorCount }})</span>
            </button>
            <button
              type="button"
              class="px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition-colors"
              :class="[
                severityFilter === 'warning'
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold'
                  : 'text-stone-400 hover:text-amber-500'
              ]"
              @click="severityFilter = 'warning'"
            >
              <AlertTriangle class="h-3 w-3 text-amber-500" />
              <span>警告 ({{ diagStore.warningCount }})</span>
            </button>
          </div>

          <!-- Problem List -->
          <div v-if="filteredIssues.length > 0" class="space-y-1.5">
            <div
              v-for="(issue, idx) in filteredIssues"
              :key="idx"
              class="p-2.5 rounded-xl border flex items-center justify-between gap-3 bg-stone-50/50 dark:bg-stone-950/40"
              :class="[
                issue.severity === 'error'
                  ? 'border-red-200/60 dark:border-red-900/40 hover:border-red-400'
                  : 'border-amber-200/60 dark:border-amber-900/40 hover:border-amber-400'
              ]"
            >
              <div class="flex items-start gap-2.5 min-w-0">
                <div class="mt-0.5 shrink-0">
                  <AlertCircle v-if="issue.severity === 'error'" class="h-4 w-4 text-red-500" />
                  <AlertTriangle v-else-if="issue.severity === 'warning'" class="h-4 w-4 text-amber-500" />
                  <Info v-else class="h-4 w-4 text-sky-500" />
                </div>

                <div class="min-w-0 space-y-0.5">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-stone-900 dark:text-stone-100">
                      {{ issue.message }}
                    </span>
                    <span class="px-1.5 py-0.2 rounded font-mono text-[9px] bg-stone-200 dark:bg-stone-800 text-stone-500">
                      [{{ issue.entityType }}] {{ issue.entityId }}
                    </span>
                  </div>
                  <p class="font-mono text-[10px] text-stone-400">
                    {{ issue.code }}
                  </p>
                </div>
              </div>

              <!-- Quick Jump Button -->
              <button
                v-if="issue.entityType === 'scene' || issue.entityType === 'block'"
                type="button"
                class="px-2 py-1 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:border-amber-500 text-stone-700 dark:text-stone-300 flex items-center gap-1 shrink-0 transition-colors"
                title="在编辑器中定位"
                @click="handleJumpToEntity(issue)"
              >
                <ExternalLink class="h-3 w-3 text-amber-500" />
                <span>定位</span>
              </button>
            </div>
          </div>

          <div v-else class="p-8 text-center text-stone-400 flex flex-col items-center gap-2">
            <CheckCircle2 class="h-6 w-6 text-emerald-500" />
            <span>太棒了！当前没有任何未解决的剧情格式或引用错误</span>
          </div>
        </div>
      </template>

      <!-- 2. Search Tab (⌘K) -->
      <template v-else-if="localTab === 'search'">
        <div class="space-y-3">
          <div class="relative flex items-center">
            <Loader2 v-if="searchStore.loading" class="absolute left-3 h-4 w-4 text-amber-500 animate-spin" />
            <SearchIcon v-else class="absolute left-3 h-4 w-4 text-stone-400 pointer-events-none" />
            <input
              :value="searchInput"
              type="text"
              placeholder="全局搜索场景、对白文本、角色、地点与设定..."
              class="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 placeholder-stone-400 outline-none focus:border-amber-500 transition-colors"
              autoFocus
              @input="handleSearchInput"
            />
          </div>

          <div v-if="searchStore.results.length > 0" class="space-y-1.5">
            <button
              v-for="item in searchStore.results"
              :key="item.id + item.kind"
              type="button"
              class="w-full p-2 rounded-xl text-left border border-stone-200/60 dark:border-stone-800 hover:border-amber-500 bg-stone-50/40 dark:bg-stone-950/30 flex items-center justify-between gap-3 transition-colors"
              @click="handleSelectSearchResult(item)"
            >
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="p-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-500 shrink-0">
                  <FileText v-if="item.kind === 'scene' || item.kind === 'scene_block'" class="h-3.5 w-3.5 text-amber-500" />
                  <User v-else-if="item.kind === 'character'" class="h-3.5 w-3.5 text-sky-500" />
                  <MapPin v-else-if="item.kind === 'location'" class="h-3.5 w-3.5 text-emerald-500" />
                  <BookOpen v-else class="h-3.5 w-3.5 text-purple-500" />
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5">
                    <span class="font-semibold text-stone-900 dark:text-stone-100 truncate">{{ item.title }}</span>
                    <span class="text-[9px] font-mono text-stone-400 px-1 py-0.2 bg-stone-200/60 dark:bg-stone-800 rounded">
                      {{ item.kind }}
                    </span>
                  </div>
                  <p v-if="item.snippet" class="text-[11px] text-stone-400 truncate mt-0.5">
                    {{ item.snippet }}
                  </p>
                </div>
              </div>

              <div class="text-stone-400 flex items-center gap-1 text-[11px] shrink-0 font-mono">
                <ExternalLink class="h-3.5 w-3.5 text-amber-500" />
                <span>跳转</span>
              </div>
            </button>
          </div>
          <div v-else-if="searchInput && !searchStore.loading" class="p-8 text-center text-stone-400">
            未找到与 "{{ searchInput }}" 匹配的正典记录
          </div>
          <div v-else class="p-8 text-center text-stone-400">
            输入关键词以检索全篇剧本、角色与世界观正典
          </div>
        </div>
      </template>

      <!-- 3. Release Preflight Tab -->
      <template v-else-if="localTab === 'preflight'">
        <div class="space-y-4 max-w-2xl">
          <div class="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <ShieldCheck class="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <div>
                <h4 class="font-bold text-emerald-900 dark:text-emerald-100">正典图一致性检查</h4>
                <p class="text-[11px] text-emerald-700 dark:text-emerald-300">
                  {{ diagStore.errorCount === 0 ? '所有剧情节点均满足发布前置要求' : `存在 ${diagStore.errorCount} 项必须解决的发布阻碍` }}
                </p>
              </div>
            </div>
            <span
              class="px-2 py-1 rounded-lg font-bold text-xs"
              :class="[
                diagStore.errorCount === 0
                  ? 'bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100'
                  : 'bg-red-200 dark:bg-red-900 text-red-900 dark:text-red-100'
              ]"
            >
              {{ diagStore.errorCount === 0 ? 'READY FOR RELEASE' : 'BLOCKED' }}
            </span>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between p-2 rounded-lg bg-stone-50 dark:bg-stone-950/40 border border-stone-200/60 dark:border-stone-800">
              <span class="text-stone-600 dark:text-stone-300">起始场景 (Entry Scene) 完整性</span>
              <CheckCircle2 class="h-4 w-4 text-emerald-500" />
            </div>
            <div class="flex items-center justify-between p-2 rounded-lg bg-stone-50 dark:bg-stone-950/40 border border-stone-200/60 dark:border-stone-800">
              <span class="text-stone-600 dark:text-stone-300">角色发言说话人 (Speaker) 绑定一致性</span>
              <CheckCircle2 class="h-4 w-4 text-emerald-500" />
            </div>
            <div class="flex items-center justify-between p-2 rounded-lg bg-stone-50 dark:bg-stone-950/40 border border-stone-200/60 dark:border-stone-800">
              <span class="text-stone-600 dark:text-stone-300">分支选项与后继节点 (Choice Targets) 连通性</span>
              <CheckCircle2 class="h-4 w-4 text-emerald-500" />
            </div>
          </div>
        </div>
      </template>

      <!-- 4. Audits Tab -->
      <template v-else>
        <div class="space-y-2">
          <p class="text-stone-400 italic">暂无最近的原子回写或审核审计记录</p>
        </div>
      </template>
    </div>
  </div>
</template>
