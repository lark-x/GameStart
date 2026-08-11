import { ref, computed, type Ref } from "vue";
import { useAppStore } from "../stores/app";
import { errorMessage } from "../types";
import type { AutoReplyResult } from "../lib/auto-reply";
import { normalizeAutoReply } from "../lib/auto-reply";
import {
  COMPOSER_IMAGE_LIMIT,
  buildComposerMessageDrafts,
  createComposerImageAttachment,
  validateComposerImage,
  type ComposerImageAttachment,
} from "../lib/chat-composer";
import type { ApiStickerPack } from "../types";

type StickerOption = NonNullable<ApiStickerPack["_stickers"]>[number];

export function useChatComposer(
  currentConversationId: Ref<string>,
  loadMessages: () => Promise<void>,
  applyAutoReply: (result: AutoReplyResult | null, fallbackSourceId: string) => void,
) {
  const store = useAppStore();
  const messageInput = ref("");
  const selectedImages = ref<ComposerImageAttachment<File>[]>([]);
  const composerStatus = ref("");
  const isSendingMessage = ref(false);
  const enterSends = ref(localStorage.getItem("living-network.chat.enter-sends") !== "false");

  const canSend = computed(() => messageInput.value.trim().length > 0 || selectedImages.value.length > 0);

  function setEnterSends(value: boolean): void {
    enterSends.value = value;
    localStorage.setItem("living-network.chat.enter-sends", String(value));
  }

  function updateSelectedImage(id: string, patch: Partial<ComposerImageAttachment<File>>): void {
    selectedImages.value = selectedImages.value.map((img) => img.id === id ? { ...img, ...patch } : img);
  }

  function addImageFiles(files: readonly File[]): void {
    const remaining = COMPOSER_IMAGE_LIMIT - selectedImages.value.length;
    if (remaining <= 0) {
      composerStatus.value = `一次最多发送 ${COMPOSER_IMAGE_LIMIT} 张图片`;
      return;
    }
    const accepted: ComposerImageAttachment<File>[] = [];
    const rejected: string[] = [];
    for (const file of files.slice(0, remaining)) {
      const error = validateComposerImage(file);
      if (error) { rejected.push(`${file.name}: ${error}`); continue; }
      accepted.push(createComposerImageAttachment(file, URL.createObjectURL(file), crypto.randomUUID()));
    }
    if (files.length > remaining) rejected.push(`已达到 ${COMPOSER_IMAGE_LIMIT} 张上限`);
    selectedImages.value = [...selectedImages.value, ...accepted];
    composerStatus.value = rejected[0] ?? (accepted.length ? `${selectedImages.value.length} 张图片待发送` : "");
  }

  function clearSelectedImages(): void {
    for (const img of selectedImages.value) URL.revokeObjectURL(img.previewUrl);
    selectedImages.value = [];
    composerStatus.value = "";
  }

  function removeSelectedImage(id: string): void {
    const img = selectedImages.value.find((item) => item.id === id);
    if (img) URL.revokeObjectURL(img.previewUrl);
    selectedImages.value = selectedImages.value.filter((item) => item.id !== id);
    composerStatus.value = selectedImages.value.length ? `${selectedImages.value.length} 张图片待发送` : "";
  }

  async function sendSticker(sticker: StickerOption): Promise<void> {
    if (!currentConversationId.value || !store.currentCharacterId || isSendingMessage.value) return;
    const id = crypto.randomUUID();
    isSendingMessage.value = true;
    composerStatus.value = "正在发送表情…";
    try {
      const result = await store.api.sendMessage(currentConversationId.value, {
        id,
        authorCharacterId: store.currentCharacterId,
        kind: "STICKER",
        stickerId: sticker.id,
        createdAt: new Date().toISOString(),
        idempotencyKey: id,
      });
      composerStatus.value = "";
      await loadMessages();
      applyAutoReply(normalizeAutoReply(result.data?.autoReply), id);
    } catch (e: unknown) {
      composerStatus.value = errorMessage(e);
    } finally {
      isSendingMessage.value = false;
    }
  }

  async function sendMessage(resizeComposer?: () => void): Promise<void> {
    const value = messageInput.value.trim();
    if (!canSend.value || !currentConversationId.value || !store.currentCharacterId || isSendingMessage.value) return;
    const batchId = crypto.randomUUID();
    const imageFiles = [...selectedImages.value];
    isSendingMessage.value = true;
    composerStatus.value = imageFiles.length ? "正在上传图片…" : "正在发送…";
    try {
      const mediaRefs: string[] = [];
      for (const image of imageFiles) {
        updateSelectedImage(image.id, { status: "uploading" });
        const uploaded = await store.api.uploadChatImage(image.file);
        mediaRefs.push(uploaded.data.mediaRef);
        updateSelectedImage(image.id, { status: "sent" });
      }
      const drafts = buildComposerMessageDrafts({ batchId, text: value, mediaRefs });
      let autoReplyResult: AutoReplyResult | null = null;
      for (const [index, draft] of drafts.entries()) {
        const result = await store.api.sendMessage(currentConversationId.value, {
          id: draft.id,
          authorCharacterId: store.currentCharacterId,
          kind: draft.kind,
          ...(draft.text === undefined ? {} : { text: draft.text }),
          ...(draft.mediaRef === undefined ? {} : { mediaRef: draft.mediaRef }),
          ...(draft.suppressAutoReply ? { suppressAutoReply: true } : {}),
          createdAt: new Date(Date.now() + index).toISOString(),
          idempotencyKey: draft.idempotencyKey,
        });
        if (!draft.suppressAutoReply) autoReplyResult = normalizeAutoReply(result.data?.autoReply);
      }
      messageInput.value = "";
      clearSelectedImages();
      resizeComposer?.();
      await loadMessages();
      applyAutoReply(autoReplyResult, batchId);
    } catch (e: unknown) {
      const message = errorMessage(e);
      composerStatus.value = message;
      for (const image of imageFiles) {
        if (selectedImages.value.some((item) => item.id === image.id && item.status === "uploading")) {
          updateSelectedImage(image.id, { status: "failed", error: message });
        }
      }
    } finally {
      isSendingMessage.value = false;
    }
  }

  function cleanup(): void {
    clearSelectedImages();
    composerStatus.value = "";
    messageInput.value = "";
  }

  return {
    messageInput,
    selectedImages,
    composerStatus,
    isSendingMessage,
    enterSends,
    canSend,
    setEnterSends,
    addImageFiles,
    clearSelectedImages,
    removeSelectedImage,
    updateSelectedImage,
    sendSticker,
    sendMessage,
    cleanup,
  };
}
