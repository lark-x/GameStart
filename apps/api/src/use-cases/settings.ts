import {
  createAppearanceSettings,
  createDefaultAppearanceSettings,
  createLlmProviderProfile as createLlmProviderProfileDomain,
  createComfyUiSettings as createComfyUiSettingsDomain,
  ChatBackgroundKind,
  DEFAULT_APPEARANCE_OWNER_KEY,
} from "../../../../packages/domain/src/index.ts";
import type { HandlerContext, ApiStore } from "../context.ts";
import { ApiError } from "../helpers.ts";
import {
  toAppearanceSettingsDto,
  toLlmProviderProfileDto,
  toComfyUiSettingsDto,
} from "../mappers.ts";
import {
  requireAppearanceStore,
  requireLlmProviderProfileStore,
  requireComfyUiSettingsStore,
} from "../store-helpers.ts";
import type {
  UpdateAppearanceSettingsRequest,
  AppearanceSettingsDto,
  SaveLlmProviderProfileRequest,
  LlmProviderProfileDto,
  UpdateComfyUiSettingsRequest,
  ComfyUiSettingsDto,
} from "../../../../packages/contracts/src/index.ts";

export async function getAppearanceSettings(store: ApiStore, ownerKey: string): Promise<AppearanceSettingsDto> {
  const appStore = requireAppearanceStore(store);
  const existing = await appStore.appearanceSettings.getByOwnerKey(ownerKey);
  const settings = existing ?? createDefaultAppearanceSettings(ownerKey, new Date().toISOString());
  return toAppearanceSettingsDto(settings);
}

export async function saveAppearanceSettings(store: ApiStore, ownerKey: string, input: UpdateAppearanceSettingsRequest): Promise<AppearanceSettingsDto> {
  const appStore = requireAppearanceStore(store);
  try {
    const existing = await appStore.appearanceSettings.getByOwnerKey(ownerKey);
    const settings = createAppearanceSettings({
      id: existing?.id ?? `appearance-${ownerKey}`,
      ownerKey,
      themeId: input.themeId,
      chatBackground: {
        kind: input.chatBackground.kind === ChatBackgroundKind.CUSTOM ? ChatBackgroundKind.CUSTOM : ChatBackgroundKind.THEME,
        opacity: input.chatBackground.opacity,
        blur: input.chatBackground.blur,
        ...(input.chatBackground.imageRef === undefined ? {} : { imageRef: input.chatBackground.imageRef }),
      },
      updatedAt: new Date().toISOString(),
    });
    await appStore.appearanceSettings.save(settings);
    return toAppearanceSettingsDto(settings);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}

export async function listLlmProviderProfiles(store: ApiStore): Promise<LlmProviderProfileDto[]> {
  const llmStore = requireLlmProviderProfileStore(store);
  return (await llmStore.llmProviderProfiles.list()).map((p) => toLlmProviderProfileDto(p));
}

export async function saveLlmProviderProfile(store: ApiStore, input: SaveLlmProviderProfileRequest, secretCipher?: import("../../../packages/ai/src/index.ts").SecretCipher): Promise<LlmProviderProfileDto> {
  const llmStore = requireLlmProviderProfileStore(store);
  const existing = await llmStore.llmProviderProfiles.getById(input.id);
  const profiles = await llmStore.llmProviderProfiles.list();
  const isOnlyProfile = profiles.every((p) => p.id === input.id);
  let encryptedApiKey = existing?.encryptedApiKey;
  let encryptionIv = existing?.encryptionIv;
  if (input.apiKey !== undefined) {
    if (!secretCipher) throw new ApiError(503, "SERVICE_UNAVAILABLE", "API key encryption is not configured");
    const encrypted = secretCipher.encrypt(input.apiKey);
    encryptedApiKey = encrypted.ciphertext;
    encryptionIv = encrypted.iv;
  }
  try {
    const profile = createLlmProviderProfileDomain({
      id: input.id, name: input.name, protocol: input.protocol, baseUrl: input.baseUrl, model: input.model,
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
      ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
      ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      ...(encryptedApiKey === undefined ? {} : { encryptedApiKey }),
      ...(encryptionIv === undefined ? {} : { encryptionIv }),
      isActive: isOnlyProfile ? true : (input.isActive ?? existing?.isActive ?? false),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await llmStore.llmProviderProfiles.save(profile);
    return toLlmProviderProfileDto(profile);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}

export async function deleteLlmProviderProfile(store: ApiStore, id: string): Promise<void> {
  await requireLlmProviderProfileStore(store).llmProviderProfiles.delete(id);
}

export async function getComfyUiSettings(store: ApiStore): Promise<ComfyUiSettingsDto> {
  const comfyStore = requireComfyUiSettingsStore(store);
  const settings = await comfyStore.comfyUiSettings.get();
  if (settings) return toComfyUiSettingsDto(settings);
  return toComfyUiSettingsDto(createComfyUiSettingsDomain({ id: "default", baseUrl: "http://127.0.0.1:8188", autoImageIntentEnabled: false, updatedAt: new Date().toISOString() }));
}

export async function saveComfyUiSettings(store: ApiStore, input: UpdateComfyUiSettingsRequest): Promise<ComfyUiSettingsDto> {
  const comfyStore = requireComfyUiSettingsStore(store);
  try {
    const existing = await comfyStore.comfyUiSettings.get();
    const defaults = existing ?? createComfyUiSettingsDomain({ id: "default", baseUrl: "http://127.0.0.1:8188", autoImageIntentEnabled: false, updatedAt: new Date().toISOString() });
    const settings = createComfyUiSettingsDomain({
      id: "default", baseUrl: input.baseUrl ?? defaults.baseUrl,
      timeoutMs: input.timeoutMs ?? defaults.timeoutMs,
      ...(input.defaultWorkflowVersion ?? defaults.defaultWorkflowVersion ? { defaultWorkflowVersion: input.defaultWorkflowVersion ?? defaults.defaultWorkflowVersion } : {}),
      autoImageIntentEnabled: input.autoImageIntentEnabled ?? defaults.autoImageIntentEnabled,
      updatedAt: new Date().toISOString(),
    });
    await comfyStore.comfyUiSettings.save(settings);
    return toComfyUiSettingsDto(settings);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}
