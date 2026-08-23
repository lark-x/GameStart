<script setup lang="ts">
import { computed } from "vue";
import type { V2SceneCandidateDto, V2SceneDocument } from "@living-network/contracts/v2";
import {
  FileText,
  GitFork,
  CheckCircle2,
  Users,
  MapPin,
  BookOpen,
} from "@lucide/vue";

const props = defineProps<{
  candidate: V2SceneCandidateDto;
  baseDocument?: V2SceneDocument | null | undefined;
}>();

const scenePayload = computed(() => props.candidate.payload.scene);
const candidateBlocks = computed(() => {
  return scenePayload.value.document?.blocks ?? [];
});
const baseBlocks = computed(() => {
  return props.baseDocument?.blocks ?? [];
});

const candidateReferences = computed(() => {
  return props.candidate.payload.references;
});

const outgoingChoices = computed(() => {
  return props.candidate.payload.choices ?? [];
});
</script>

<template>
  <div class="space-y-6 text-xs">
    <!-- Header Diff Overview -->
    <div class="p-4 rounded-xl bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 space-y-3">
      <div class="flex items-center justify-between">
        <h4 class="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
          <FileText class="h-4 w-4 text-amber-500" />
          <span>场景变更摘要 (Scene Summary)</span>
        </h4>
        <span class="px-2 py-0.5 rounded-full font-mono text-[10px] bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
          Scene ID: {{ scenePayload.sceneId }}
        </span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-stone-200/60 dark:border-stone-800">
        <div>
          <span class="text-stone-400 block mb-1 font-semibold">基线版本 (Current Canon)</span>
          <div class="p-2.5 rounded-lg bg-white dark:bg-stone-950 border border-stone-200/60 dark:border-stone-800">
            <span class="font-medium text-stone-800 dark:text-stone-200">
              {{ baseDocument?.title || '(新场景 / 尚无基线)' }}
            </span>
            <div class="text-[11px] text-stone-400 mt-1">
              分块数: {{ baseBlocks.length }} 块
            </div>
          </div>
        </div>

        <div>
          <span class="text-stone-400 block mb-1 font-semibold">候选变更 (Candidate Delta)</span>
          <div class="p-2.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60">
            <span class="font-bold text-emerald-900 dark:text-emerald-200">
              {{ scenePayload.title }}
            </span>
            <div class="text-[11px] text-emerald-700 dark:text-emerald-300 mt-1">
              分块数: {{ candidateBlocks.length }} 块 | 选项数: {{ outgoingChoices.length }} 个
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- References Comparison -->
    <div class="p-4 rounded-xl bg-stone-50/60 dark:bg-stone-900/40 border border-stone-200/80 dark:border-stone-800 space-y-3">
      <h4 class="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
        <span>引用实体变更 (References)</span>
      </h4>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <!-- Main Location -->
        <div class="p-2.5 rounded-lg bg-white dark:bg-stone-950 border border-stone-200/60 dark:border-stone-800 space-y-1">
          <div class="flex items-center gap-1.5 text-stone-500 font-semibold">
            <MapPin class="h-3.5 w-3.5 text-amber-500" />
            <span>主场景地点</span>
          </div>
          <span class="font-mono text-stone-800 dark:text-stone-200 block truncate">
            {{ scenePayload.locationId || '(未指定)' }}
          </span>
        </div>

        <!-- Participants -->
        <div class="p-2.5 rounded-lg bg-white dark:bg-stone-950 border border-stone-200/60 dark:border-stone-800 space-y-1">
          <div class="flex items-center gap-1.5 text-stone-500 font-semibold">
            <Users class="h-3.5 w-3.5 text-sky-500" />
            <span>出场角色 ({{ scenePayload.participantCharacterIds?.length || 0 }})</span>
          </div>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="charId in scenePayload.participantCharacterIds || []"
              :key="charId"
              class="px-1.5 py-0.2 rounded font-mono text-[10px] bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300"
            >
              {{ charId }}
            </span>
          </div>
        </div>

        <!-- Lore Items / Extra References -->
        <div class="p-2.5 rounded-lg bg-white dark:bg-stone-950 border border-stone-200/60 dark:border-stone-800 space-y-1">
          <div class="flex items-center gap-1.5 text-stone-500 font-semibold">
            <BookOpen class="h-3.5 w-3.5 text-purple-500" />
            <span>设定与关联 ({{ candidateReferences?.length || 0 }})</span>
          </div>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="refItem in candidateReferences || []"
              :key="refItem.targetId + refItem.targetType"
              class="px-1.5 py-0.2 rounded font-mono text-[10px] bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300"
            >
              [{{ refItem.targetType }}] {{ refItem.targetId }}
            </span>
            <span v-if="!candidateReferences || candidateReferences.length === 0" class="text-stone-400">
              (无额外设定引用)
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Blocks Comparison -->
    <div class="space-y-3">
      <h4 class="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
        <span>剧本分块对比 (Blocks Preview)</span>
        <span class="text-stone-400 font-mono">({{ candidateBlocks.length }} 块)</span>
      </h4>

      <div class="space-y-2">
        <div
          v-for="(block, idx) in candidateBlocks"
          :key="block.blockId || idx"
          class="p-3 rounded-xl border flex items-start gap-3 bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800"
        >
          <span class="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold shrink-0 uppercase"
            :class="[
              block.kind === 'dialogue' ? 'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300' :
              block.kind === 'narration' ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300' :
              block.kind === 'action' ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300' :
              'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
            ]"
          >
            {{ block.kind }}
          </span>

          <div class="flex-1 min-w-0">
            <div v-if="block.speakerCharacterId" class="font-bold text-stone-800 dark:text-stone-200 mb-1 flex items-center gap-1.5">
              <Users class="h-3 w-3 text-sky-500" />
              <span>{{ block.speakerCharacterId }}</span>
            </div>
            <p class="whitespace-pre-wrap text-stone-800 dark:text-stone-200 leading-relaxed font-sans">
              {{ block.text || '(无正文)' }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Candidate Choices -->
    <div v-if="outgoingChoices.length > 0" class="space-y-3 pt-4 border-t border-stone-200 dark:border-stone-800">
      <h4 class="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
        <GitFork class="h-4 w-4 text-amber-500" />
        <span>产出分支选项 (Proposed Choices)</span>
        <span class="text-stone-400 font-mono">({{ outgoingChoices.length }})</span>
      </h4>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          v-for="(choice, idx) in outgoingChoices"
          :key="idx"
          class="p-3 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-1.5"
        >
          <div class="flex items-center justify-between font-bold text-stone-800 dark:text-stone-200">
            <span>{{ choice.label }}</span>
            <span v-if="choice.targetSceneId" class="font-mono text-[10px] text-stone-400">→ {{ choice.targetSceneId }}</span>
          </div>
          <p v-if="choice.consequenceSummary" class="text-[11px] text-emerald-600 dark:text-emerald-400">
            {{ choice.consequenceSummary }}
          </p>
        </div>
      </div>
    </div>

    <!-- Validation Notes -->
    <div v-if="candidate.payload.validationNotes && candidate.payload.validationNotes.length > 0" class="space-y-2 pt-4 border-t border-stone-200 dark:border-stone-800">
      <h4 class="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
        <CheckCircle2 class="h-4 w-4 text-emerald-500" />
        <span>自检与生成说明 (Validation Notes)</span>
      </h4>
      <ul class="space-y-1 pl-4 list-disc text-stone-600 dark:text-stone-400">
        <li v-for="(note, idx) in candidate.payload.validationNotes" :key="idx">
          {{ note }}
        </li>
      </ul>
    </div>
  </div>
</template>
