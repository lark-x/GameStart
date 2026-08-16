<script setup lang="ts">
import { computed } from "vue";
import { Activity, FileSearch, Send } from "@lucide/vue";

import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Textarea from "../../../components/ui/Textarea.vue";
import type { V2WorkspaceSnapshot } from "../../adapters";

const props = defineProps<{ area: string; snapshot: V2WorkspaceSnapshot | null }>();
const service = computed(() => props.area.startsWith("comfy-") ? "ComfyUI" : "模型");
const section = computed(() => props.area.endsWith("-jobs") ? "jobs" : props.area.endsWith("-review") ? "review" : "request");
const job = computed(() => service.value === "ComfyUI" ? props.snapshot?.assets.job : props.snapshot?.generation.job);
const candidateStatus = computed(() => service.value === "ComfyUI" ? props.snapshot?.assets.candidate?.status : props.snapshot?.candidate?.status);
const payloadPreview = computed(() => service.value === "ComfyUI"
  ? "尚未准备 ComfyUI workflow payload。阶段 4–5 接通 prepare 后，这里将只读展示最终 workflow 与解析后的 inputs。"
  : "尚未准备模型 messages。阶段 4–5 接通 prepare 后，这里将只读展示最终 system/user messages。"
);
</script>

<template>
  <section class="generation-module">
    <header>
      <div>
        <p>{{ service }} 隔离模块</p>
        <h2 v-if="section === 'request'">创建请求</h2>
        <h2 v-else-if="section === 'jobs'">任务状态</h2>
        <h2 v-else>候选审核</h2>
      </div>
      <Badge tone="warning">尚未接通</Badge>
    </header>

    <div v-if="section === 'request'" class="module-body">
      <label for="v2-final-request">最终提交内容（只读）</label>
      <Textarea id="v2-final-request" :model-value="payloadPreview" :rows="8" disabled />
      <Button variant="primary" size="md" disabled><Send :size="16" /> 提交请求</Button>
      <p>只有服务器能够生成并返回与实际发送完全一致的内容后，提交操作才会开放。</p>
    </div>

    <div v-else-if="section === 'jobs'" class="module-body">
      <Activity :size="24" aria-hidden="true" />
      <strong>{{ job ? `任务 ${job.jobId}` : "暂无真实任务" }}</strong>
      <span>{{ job ? `当前状态：${job.status}` : "此页面不会创建或展示模拟任务。" }}</span>
    </div>

    <div v-else class="module-body">
      <FileSearch :size="24" aria-hidden="true" />
      <strong>{{ candidateStatus ? `候选状态：${candidateStatus}` : "暂无真实候选" }}</strong>
      <span>候选仍保留在对应生成模块中；完整审核交互将在生成提交链路接通后开放。</span>
    </div>
  </section>
</template>

<style scoped>
.generation-module { display: grid; gap: var(--space-4); padding: var(--space-5); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); }
.generation-module header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
.generation-module header p { margin: 0 0 var(--space-1); color: var(--primary); font-size: var(--text-xs); font-weight: 800; }
.generation-module h2 { margin: 0; color: var(--text-strong); font-size: var(--text-xl); }
.module-body { display: grid; justify-items: start; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-soft); }
.module-body label, .module-body strong { color: var(--text-strong); font-size: var(--text-sm); }
.module-body p, .module-body span { margin: 0; color: var(--muted); font-size: var(--text-sm); }
.module-body :deep(textarea) { width: 100%; }
</style>