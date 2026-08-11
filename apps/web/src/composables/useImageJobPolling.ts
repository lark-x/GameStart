import { ref, type Ref } from "vue";
import type { ApiImageJob } from "../types";
import { useAppStore } from "../stores/app";
import { errorMessage } from "../types";

export function useImageJobPolling(
  currentConversationId: Ref<string>,
  loadMessages: () => Promise<void>,
) {
  const store = useAppStore();
  const imageJob = ref<ApiImageJob | null>(null);
  const imageStatus = ref("");
  let cancelled = false;

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function pollImageJob(jobId: string): Promise<void> {
    const conversationId = currentConversationId.value;
    polling = true;
    cancelled = false;
    for (let attempt = 0; attempt < 120 && !cancelled; attempt += 1) {
      try {
        const result = await store.api.getImageJob(jobId);
        if (cancelled || currentConversationId.value !== conversationId) break;
        imageJob.value = result.data ?? null;
        if (imageJob.value?.status === "SUCCEEDED") {
          imageStatus.value = "图片已生成";
          await loadMessages();
          polling = false;
          return;
        }
        if (imageJob.value?.status === "FAILED" || imageJob.value?.status === "CANCELLED") {
          imageStatus.value = imageJob.value.failureReason || "Image generation stopped";
          polling = false;
          return;
        }
        imageStatus.value = imageJob.value?.status === "SUBMITTED" ? "正在生成图片…" : "图片请求已排队";
      } catch (error: unknown) {
        imageStatus.value = errorMessage(error);
        polling = false;
        return;
      }
      await wait(2_000);
    }
    if (!cancelled) imageStatus.value = "图片仍在排队，请稍后刷新查看。";
    polling = false;
  }

  function cancelPolling(): void {
    cancelled = true;
    polling = false;
  }

  function cleanup(): void {
    cancelPolling();
    imageJob.value = null;
    imageStatus.value = "";
  }

  return {
    imageJob,
    imageStatus,
    pollImageJob,
    cancelPolling,
    cleanup,
  };
}
