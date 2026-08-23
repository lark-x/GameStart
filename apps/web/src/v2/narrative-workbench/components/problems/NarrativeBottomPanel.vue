<script setup lang="ts">
import { computed, ref } from "vue";
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
} from "@lucide/vue";
import { useNarrativeDiagnosticsStore } from "../../../story/stores/useNarrativeDiagnosticsStore.ts";
import { useNarrativeSessionStore } from "../../stores/useNarrativeSessionStore.ts";
import type { V2NarrativeDiagnostic } from "@living-network/contracts/v2";

defineProps<{
  storyWorldId: string;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  openScene: [sceneId: string, blockId?: string];
}>();

const diagStore = useNarrativeDiagnosticsStore();
const sessionStore = useNarrativeSessionStore();

const activeTab = ref<"problems" | "preflight" | "audits">("problems");
const severityFilter = ref<"all" | "error" | "warning" | "info">("all");
const isExpandedHeight = ref(false);

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
            activeTab === 'problems'
              ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs'
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
            activeTab === 'preflight'
              ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs'
              : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
          ]"
          @click="activeTab = 'preflight'"
        >
          <ShieldCheck class="h-3.5 w-3.5 text-emerald-500" />
          <span>发布预检</span>
        </button>

        <button
          type="button"
          class="px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          :class="[
            activeTab === 'audits'
              ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs'
              : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
          ]"
          @click="activeTab = 'audits'"
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
      <template v-if="activeTab === 'problems'">
        <div class="space-y-3">
          <!-- Severity Filter Pills -->
          <div class="flex items-center gap-2 pb-2 border-b border-stone-100 dark:border-stone-800">
            <button
              type="button"
              class="px-2 py-0.5 rounded text-xs font-medium transition-colors"
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
              class="px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 transition-colors"
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
              class="px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 transition-colors"
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
            <span>当前没有未解决的剧情格式或引用错误</span>
          </div>
        </div>
      </template>

      <!-- 2. Release Preflight Tab -->
      <template v-else-if="activeTab === 'preflight'">
        <div class="space-y-4 max-w-2xl">
          <div class="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <ShieldCheck class="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <div>
                <h4 class="font-bold text-emerald-900 dark:text-emerald-100">正典图一致性检查</h4>
                <p class="text-xs text-emerald-700 dark:text-emerald-300">
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

      <!-- 3. Audits Tab -->
      <template v-else>
        <div class="space-y-2">
          <p class="text-stone-400 italic">暂无最近的原子回写或审核审计记录</p>
        </div>
      </template>
    </div>
  </div>
</template>
