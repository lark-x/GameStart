import type { V2ChatFeaturesDto } from "@living-network/contracts/v2";

export type V2ChatFeatureState = "idle" | "loading" | "ready" | "error";

/**
 * Whether the composer may send and auto-opening may run.
 * Features must be loaded (ready) and the server must report a configured model.
 */
export function isChatModelConfigured(state: V2ChatFeatureState, features: V2ChatFeaturesDto | null): boolean {
  return state === "ready" && features?.modelConfigured === true;
}

/**
 * Whether the sticker picker should issue a load request when it opens.
 * Keeps the first open from firing before the component is mounted and avoids
 * duplicate requests across repeated opens.
 */
export function shouldLoadStickerLibrary(open: boolean, loaded: boolean): boolean {
  return open && !loaded;
}

/**
 * Sticker sends never mutate the composer draft: they carry only the sticker
 * media id and do not clear pending text or image attachments.
 */
export function buildStickerSendPayload(stickerMediaId: string): {
  readonly text: string;
  readonly attachmentIds: readonly string[];
  readonly clearComposer: boolean;
} {
  return {
    text: "",
    attachmentIds: [stickerMediaId],
    clearComposer: false,
  };
}
