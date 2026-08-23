<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  Sparkles,
  CheckCircle,
  XCircle,
  Clock,
  Check,
  X,
  RefreshCw,
} from "@lucide/vue";
import { useNarrativeCandidateStore } from "../../stores/useNarrativeCandidateStore.ts";
import { useSceneDocumentStore } from "../../../story/stores/useSceneDocumentStore.ts";
import { useNarrativeOutlineStore } from "../../../story/stores/useNarrativeOutlineStore.ts";
import CandidateDiff from "./CandidateDiff.vue";

const props = defineProps<{
  storyWorldId: string;
}>();

const emit = defineEmits<{
  merged: [sceneId: string];
}>();

const candidateStore = useNarrativeCandidateStore();
const docStore = useSceneDocumentStore();
const outlineStore = useNarrativeOutlineStore();

const rejectReasonModalOpen = ref(false);
const rejectReason = ref("");

onMounted(() => {
  candidateStore.fetchCandidates(props.storyWorldId);
});

watch(
  () => props.storyWorldId,
  (newId) => {
    if (newId) {
      candidateStore.fetchCandidates(newId);
    }
  },
);

const selectedCandidate = computed(() => candidateStore.selectedCandidate);

async function handleApprove() {
  if (!selectedCandidate.value) return;
  const cand = selectedCandidate.value;
  const success = await candidateStore.reviewCandidate(props.storyWorldId, cand.candidateId, "approve");
  if (success) {
    await outlineStore.fetchOutline(props.storyWorldId, true);
    if (cand.payload.scene.sceneId) {
      await docStore.fetchDocument(props.storyWorldId, cand.payload.scene.sceneId);
      emit("merged", cand.payload.scene.sceneId);
    }
  }
}

function openRejectModal() {
  rejectReason.value = "";
  rejectReasonModalOpen.value = true;
}

async function handleReject() {
  if (!selectedCandidate.value) return;
  const success = await candidateStore.reviewCandidate(
    props.storyWorldId,
    selectedCandidate.value.candidateId,
    "reject",
    rejectReason.value.trim() || undefined,
  );
  if (success) {
    rejectReasonModalOpen.value = false;
  }
}
</script>

<template>
  <div class="h-full flex flex-row overflow-hidden bg-stone-50/50 dark:bg-stone-950/20 text-xs">
    <!-- Left List: Candidate Queue -->
    <div class="w-80 border-r border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex flex-col shrink-0">
      <!-- Queue Header -->
      <div class="p-3 border-b border-stone-200 dark:border-stone-800 space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5 font-bold text-stone-900 dark:text-stone-100">
            <Sparkles class="h-4 w-4 text-amber-500" />
            <span>AI 候选与审核 (Review)</span>
          </div>
          <button
            type="button"
            class="p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded transition-colors"
            title="刷新候选列表"
            @click="candidateStore.fetchCandidates(storyWorldId)"
          >
            <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': candidateStore.loading }" />
          </button>
        </div>

        <!-- Filter tabs -->
        <div class="flex items-center p-0.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-[11px]">
          <button
            type="button"
            class="flex-1 py-1 rounded-md font-medium text-center transition-all"
            :class="[
              candidateStore.statusFilter === 'pending'
                ? 'bg-white dark:bg-stone-900 text-amber-600 dark:text-amber-400 shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            ]"
            @click="candidateStore.setStatusFilter('pending')"
          >
            待审 ({{ candidateStore.pendingCandidates.length }})
          </button>
          <button
            type="button"
            class="flex-1 py-1 rounded-md font-medium text-center transition-all"
            :class="[
              candidateStore.statusFilter === 'approved'
                ? 'bg-white dark:bg-stone-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            ]"
            @click="candidateStore.setStatusFilter('approved')"
          >
            已合并
          </button>
          <button
            type="button"
            class="flex-1 py-1 rounded-md font-medium text-center transition-all"
            :class="[
              candidateStore.statusFilter === 'all'
                ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-sm'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            ]"
            @click="candidateStore.setStatusFilter('all')"
          >
            全部
          </button>
        </div>
      </div>

      <!-- Candidate Item Cards -->
      <div class="flex-1 overflow-y-auto p-2 space-y-1.5">
        <template v-if="candidateStore.filteredCandidates.length > 0">
          <button
            v-for="cand in candidateStore.filteredCandidates"
            :key="cand.candidateId"
            type="button"
            class="w-full p-3 rounded-xl text-left border transition-all space-y-1.5"
            :class="[
              candidateStore.selectedCandidateId === cand.candidateId
                ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 shadow-sm'
                : 'border-stone-200/70 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-stone-300'
            ]"
            @click="candidateStore.selectCandidate(cand.candidateId)"
          >
            <div class="flex items-center justify-between">
              <span class="font-bold text-stone-900 dark:text-stone-100 truncate">
                {{ cand.payload.scene.title || cand.candidateId }}
              </span>
              <span
                class="px-1.5 py-0.5 rounded text-[10px] font-bold"
                :class="[
                  cand.status === 'pending' ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300' :
                  cand.status === 'approved' ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' :
                  'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                ]"
              >
                {{ cand.status === 'pending' ? '待审核' : cand.status === 'approved' ? '已合并' : '已驳回' }}
              </span>
            </div>

            <div class="flex items-center justify-between text-[10px] text-stone-400 font-mono">
              <span>源: {{ cand.provenance.source }}</span>
              <span>基线 Rev: {{ cand.baseCanonRevision }}</span>
            </div>
          </button>
        </template>
        <div v-else class="p-8 text-center text-stone-400">
          暂无匹配的候选场景
        </div>
      </div>
    </div>

    <!-- Right Area: Candidate Detail & Diff Worksurface -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <template v-if="selectedCandidate">
        <!-- Worksurface Header -->
        <div class="p-4 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between shadow-sm">
          <div class="space-y-0.5">
            <div class="flex items-center gap-2">
              <h3 class="font-bold text-stone-900 dark:text-stone-100 text-sm">
                候选场景：{{ selectedCandidate.payload.scene.title }}
              </h3>
              <span class="px-2 py-0.5 rounded-full font-mono text-[10px] bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                ID: {{ selectedCandidate.candidateId }}
              </span>
            </div>
            <p class="text-[11px] text-stone-400">
              由 {{ selectedCandidate.provenance.source }} 于 {{ selectedCandidate.createdAt }} 生成
            </p>
          </div>

          <!-- Actions Bar -->
          <div class="flex items-center gap-2">
            <template v-if="selectedCandidate.status === 'pending'">
              <button
                type="button"
                class="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 font-semibold flex items-center gap-1 transition-all"
                :disabled="candidateStore.applying"
                @click="openRejectModal"
              >
                <X class="h-3.5 w-3.5" />
                <span>驳回 (Reject)</span>
              </button>
              <button
                type="button"
                class="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                :disabled="candidateStore.applying"
                @click="handleApprove"
              >
                <Check class="h-3.5 w-3.5" />
                <span>{{ candidateStore.applying ? '合并中...' : '一键合并入正典 (Accept)' }}</span>
              </button>
            </template>
            <div v-else-if="selectedCandidate.status === 'approved'" class="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold px-3 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900">
              <CheckCircle class="h-4 w-4" />
              <span>已合并入正典</span>
            </div>
            <div v-else class="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-semibold px-3 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900">
              <XCircle class="h-4 w-4" />
              <span>已驳回</span>
            </div>
          </div>
        </div>

        <!-- Diff content scroll area -->
        <div class="flex-1 overflow-y-auto p-6">
          <div class="max-w-4xl mx-auto">
            <CandidateDiff
              :candidate="selectedCandidate"
              :base-document="docStore.document?.sceneId === selectedCandidate.payload.scene.sceneId ? docStore.document : null"
            />
          </div>
        </div>
      </template>

      <!-- Empty State -->
      <div v-else class="flex-1 flex flex-col items-center justify-center p-12 text-stone-400 space-y-3">
        <Clock class="h-10 w-10 text-stone-300 dark:text-stone-700" />
        <p class="text-sm">在左侧列表中选择一个候选场景进行对比与审核</p>
      </div>
    </div>

    <!-- Reject Reason Modal -->
    <div
      v-if="rejectReasonModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <div class="w-full max-w-md bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xl p-5 space-y-4">
        <h3 class="font-bold text-stone-900 dark:text-stone-100 text-sm">驳回候选场景</h3>

        <div>
          <label class="font-medium text-stone-600 dark:text-stone-400 block mb-1">驳回原因 (可选)</label>
          <textarea
            v-model="rejectReason"
            rows="3"
            placeholder="说明剧情不合逻辑或不符合设定的原因..."
            class="w-full p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 outline-none text-stone-900 dark:text-stone-100 text-xs"
          />
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
          <button
            type="button"
            class="px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300"
            @click="rejectReasonModalOpen = false"
          >
            取消
          </button>
          <button
            type="button"
            class="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold"
            @click="handleReject"
          >
            确认驳回
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
