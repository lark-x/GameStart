import type { ApiStore } from "./context.ts";
import { ApiError } from "./helpers.ts";

export type ChatStore = ApiStore & {
  conversations: NonNullable<ApiStore["conversations"]>;
  messages: NonNullable<ApiStore["messages"]>;
};

export function requireChatStore(store: ApiStore): ChatStore {
  if (!store.conversations || !store.messages) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Chat repositories are not configured");
  }
  return store as ChatStore;
}

export type MomentStore = ApiStore & {
  moments: NonNullable<ApiStore["moments"]>;
  momentInteractions: NonNullable<ApiStore["momentInteractions"]>;
};

export function requireMomentStore(store: ApiStore): MomentStore {
  if (!store.moments || !store.momentInteractions) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Moment repositories are not configured");
  }
  return store as MomentStore;
}

export type VisualWorkflowStore = ApiStore & {
  characterVisualIdentities: NonNullable<ApiStore["characterVisualIdentities"]>;
  imageWorkflowTemplates: NonNullable<ApiStore["imageWorkflowTemplates"]>;
};

export function requireVisualWorkflowStore(store: ApiStore): VisualWorkflowStore {
  if (!store.characterVisualIdentities || !store.imageWorkflowTemplates) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Visual identity/workflow repositories are not configured");
  }
  return store as VisualWorkflowStore;
}

export type ImageJobStore = ApiStore & {
  imageJobs: NonNullable<ApiStore["imageJobs"]>;
};

export function requireImageJobStore(store: ApiStore): ImageJobStore {
  if (!store.imageJobs) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Image job repository is not configured");
  }
  return store as ImageJobStore;
}

export type ImageAssetStore = ApiStore & {
  imageJobs: NonNullable<ApiStore["imageJobs"]>;
  behaviorActions: NonNullable<ApiStore["behaviorActions"]>;
};

export function requireImageAssetStore(store: ApiStore): ImageAssetStore {
  if (!store.imageJobs || !store.behaviorActions) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Image album repositories are not configured");
  }
  return store as ImageAssetStore;
}

export type StickerStore = ApiStore & {
  stickerPacks: NonNullable<ApiStore["stickerPacks"]>;
  stickers: NonNullable<ApiStore["stickers"]>;
};

export function requireStickerStore(store: ApiStore): StickerStore {
  if (!store.stickerPacks || !store.stickers) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Sticker repositories are not configured");
  }
  return store as StickerStore;
}

export type AppearanceStore = ApiStore & {
  appearanceSettings: NonNullable<ApiStore["appearanceSettings"]>;
};

export function requireAppearanceStore(store: ApiStore): AppearanceStore {
  if (!store.appearanceSettings) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Appearance repository is not configured");
  }
  return store as AppearanceStore;
}

export type WorldLoreStore = ApiStore & {
  worldLoreEntries: NonNullable<ApiStore["worldLoreEntries"]>;
};

export function requireWorldLoreStore(store: ApiStore): WorldLoreStore {
  if (!store.worldLoreEntries) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "World lore repository is not configured");
  }
  return store as WorldLoreStore;
}

export type LlmProviderProfileStore = ApiStore & {
  llmProviderProfiles: NonNullable<ApiStore["llmProviderProfiles"]>;
};

export function requireLlmProviderProfileStore(store: ApiStore): LlmProviderProfileStore {
  if (!store.llmProviderProfiles) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "LLM provider profile repository is not configured");
  }
  return store as LlmProviderProfileStore;
}

export type ComfyUiSettingsStore = ApiStore & {
  comfyUiSettings: NonNullable<ApiStore["comfyUiSettings"]>;
};

export function requireComfyUiSettingsStore(store: ApiStore): ComfyUiSettingsStore {
  if (!store.comfyUiSettings) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "ComfyUI settings repository is not configured");
  }
  return store as ComfyUiSettingsStore;
}

export type EventCalendarStore = ApiStore & {
  worldEventDefinitions: NonNullable<ApiStore["worldEventDefinitions"]>;
  scheduledOccurrences: NonNullable<ApiStore["scheduledOccurrences"]>;
};

export function requireEventCalendarStore(store: ApiStore): EventCalendarStore {
  if (!store.worldEventDefinitions || !store.scheduledOccurrences) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Event repositories are not configured");
  }
  return store as EventCalendarStore;
}
