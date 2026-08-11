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
  let pollGeneration = 0;
  let activeController: AbortController | undefined;
  let activeTimer: ReturnType<typeof setTimeout> | undefined;

  function wait(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  }

  async function pollImageJob(jobId: string): Promise<void> {
    // Cancel any previous polling session
    cancelPolling();
    const generation = ++pollGeneration;
    const controller = new AbortController();
    activeController = controller;
    const conversationId = currentConversationId.value;

    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (generation !== pollGeneration || controller.signal.aborted) return;
      try {
        const result = await store.api.getImageJob(jobId, controller.signal);
        if (generation !== pollGeneration || currentConversationId.value !== conversationId) return;
        imageJob.value = result.data ?? null;
        if (imageJob.value?.status === "SUCCEEDED") {
          imageStatus.value = "图片已生成";
          await loadMessages();
          return;
        }
        if (imageJob.value?.status === "FAILED" || imageJob.value?.status === "CANCELLED") {
          imageStatus.value = imageJob.value.failureReason || "Image generation stopped";
          return;
        }
        imageStatus.value = imageJob.value?.status === "SUBMITTED" ? "正在生成图片…" : "图片请求已排队";
      } catch (error: unknown) {
        if (generation !== pollGeneration) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        imageStatus.value = errorMessage(error);
        return;
      }
      try {
        await wait(2_000, controller.signal);
      } catch {
        return; // Aborted
      }
    }
    if (generation === pollGeneration) imageStatus.value = "图片仍在排队，请稍后刷新查看。";
  }

  function cancelPolling(): void {
    pollGeneration++;
    if (activeController) {
      activeController.abort();
      activeController = undefined;
    }
    if (activeTimer !== undefined) {
      clearTimeout(activeTimer);
      activeTimer = undefined;
    }
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
