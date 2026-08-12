import { ref, type Ref } from "vue";
import type { ApiStickerPack } from "../types";
import { errorMessage } from "../types";

// Use a minimal interface that matches the store.api shape without exposing the full type.
// The store.api methods are compatible because they return Promise<ApiResponse<T>> which has .data.
export function useChatMedia(
  currentWorldId: Ref<string | undefined>,
  currentConversationId: Ref<string | undefined>,
  currentCharacterId: Ref<string | undefined>,
  imageRecipientId: Ref<string | undefined>,
  imageStatus: Ref<string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api: any,
  pollImageJob: (id: string) => void,
) {
  const stickerPacks = ref<ApiStickerPack[]>([]) as Ref<ApiStickerPack[]>;
  const activeStickerPackId = ref("");
  const stickerStatus = ref("");
  const imagePrompt = ref("");
  const imageWorkflowVersion = ref("");
  const isRequestingImage = ref(false);

  async function loadStickerPacks() {
    if (!currentWorldId.value) { stickerPacks.value = []; activeStickerPackId.value = ""; return; }
    try {
      const result = await api.getStickerPacks(currentWorldId.value);
      const packs = (result.data ?? []) as ApiStickerPack[];
      await Promise.all(packs.map(async (pack: ApiStickerPack) => {
        const stickers = await api.getStickers(pack.id);
        pack._stickers = stickers.data ?? [];
      }));
      stickerPacks.value = packs;
      if (!packs.some((pack: ApiStickerPack) => pack.id === activeStickerPackId.value)) activeStickerPackId.value = packs[0]?.id ?? "";
      stickerStatus.value = "";
    } catch (error: unknown) {
      stickerPacks.value = []; activeStickerPackId.value = ""; stickerStatus.value = errorMessage(error);
    }
  }

  async function requestConversationImage(closeComposerPanel: () => void) {
    const prompt = imagePrompt.value.trim();
    if (!prompt || !currentConversationId.value || !currentCharacterId.value || !imageRecipientId.value) {
      imageStatus.value = "请选择私聊会话，并填写配图描述。"; return;
    }
    isRequestingImage.value = true;
    imageStatus.value = "正在创建图片请求…";
    try {
      const idempotencyKey = crypto.randomUUID();
      const result = await api.requestConversationImage(currentConversationId.value, {
        actorCharacterId: currentCharacterId.value, recipientCharacterId: imageRecipientId.value,
        prompt, workflowVersion: imageWorkflowVersion.value.trim() || "comfy-anima@v1",
        createdAt: new Date().toISOString(), idempotencyKey,
      });
      const job = result.data ?? null;
      imagePrompt.value = "";
      closeComposerPanel();
      imageStatus.value = "已请求对方生成图片，完成后会出现在聊天里。";
      if (job) void pollImageJob(job.id);
    } catch (error: unknown) { imageStatus.value = errorMessage(error); }
    finally { isRequestingImage.value = false; }
  }

  async function loadImageDefaults() {
    try {
      const result = await api.getComfyUiSettings();
      imageWorkflowVersion.value = result.data.defaultWorkflowVersion ?? "comfy-anima@v1";
    } catch { imageWorkflowVersion.value = "comfy-anima@v1"; }
  }

  return {
    stickerPacks, activeStickerPackId, stickerStatus,
    imagePrompt, imageWorkflowVersion, isRequestingImage,
    loadStickerPacks, requestConversationImage, loadImageDefaults,
  };
}
