import {
  createAppearanceSettings,
  createDefaultAppearanceSettings,
  createLlmProviderProfile as createLlmProviderProfileDomain,
  createComfyUiSettings as createComfyUiSettingsDomain,
  ChatBackgroundKind,
} from "@living-network/domain";
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
} from "@living-network/contracts";

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
    const chatBackground: import("@living-network/contracts").ChatBackgroundSettingsDto = {
      kind: input.chatBackground.kind === ChatBackgroundKind.CUSTOM ? ChatBackgroundKind.CUSTOM : ChatBackgroundKind.THEME,
      opacity: input.chatBackground.opacity,
      blur: input.chatBackground.blur,
      ...(input.chatBackground.imageRef === undefined ? {} : { imageRef: input.chatBackground.imageRef }),
    };
    if (input.chatBackground.items !== undefined) chatBackground.items = input.chatBackground.items;
    const settings = createAppearanceSettings({
      id: existing?.id ?? `appearance-${ownerKey}`,
      ownerKey,
      themeId: input.themeId,
      chatBackground,
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

export async function saveLlmProviderProfile(store: ApiStore, input: SaveLlmProviderProfileRequest, secretCipher?: import("@living-network/ai").SecretCipher): Promise<LlmProviderProfileDto> {
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

export interface LlmProviderTestResult {
  success: boolean;
  ok: boolean;
  profileId: string;
  protocol: string;
  model: string;
  latencyMs: number;
  correlationId: string;
  preview?: string;
  error?: { code?: string; message: string; retryable?: boolean; status?: number };
}

export async function testLlmProviderProfile(
  ctx: HandlerContext,
  profileId: string,
  correlationId: string,
): Promise<LlmProviderTestResult> {
  const llmStore = requireLlmProviderProfileStore(ctx.store);
  const profile = await llmStore.llmProviderProfiles.getById(profileId);
  if (!profile) throw new ApiError(404, "NOT_FOUND", "LLM provider profile not found");
  const started = Date.now();
  try {
    const { createProviderFromProfile } = await import("@living-network/ai");
    const key = profile.encryptedApiKey && profile.encryptionIv && ctx.secretCipher
      ? ctx.secretCipher.decrypt({ ciphertext: profile.encryptedApiKey, iv: profile.encryptionIv })
      : undefined;
    const provider = createProviderFromProfile(profile, key);
    const result = await provider.complete({ messages: [{ role: "user", content: "Reply with exactly OK." }], model: profile.model, temperature: 0, maxTokens: 8 });
    const testResult: LlmProviderTestResult = { success: true, ok: result.content.trim() === "OK", profileId, protocol: profile.protocol, model: result.model, latencyMs: Date.now() - started, preview: result.content.slice(0, 500), correlationId };
    void ctx.logging.append({ level: "INFO", source: "API", category: "LLM", action: "provider.test", outcome: "SUCCESS", correlationId, entityType: "llm-provider-profile", entityId: profileId, ...(testResult.preview === undefined ? {} : { message: testResult.preview }), id: "", createdAt: new Date().toISOString() }).catch(() => undefined);
    return testResult;
  } catch (error) {
    const e = error as { code?: string; message?: string; retryable?: boolean; status?: number };
    const testResult: LlmProviderTestResult = { success: false, ok: false, profileId, protocol: profile.protocol, model: profile.model, latencyMs: Date.now() - started, error: { ...(e.code !== undefined ? { code: e.code } : {}), message: e instanceof Error ? e.message.slice(0, 200) : "Provider test failed", ...(e.retryable === undefined ? {} : { retryable: e.retryable }), ...(e.status === undefined ? {} : { status: e.status }) }, correlationId };
    void ctx.logging.append({ level: "ERROR", source: "API", category: "LLM", action: "provider.test", outcome: "FAILURE", correlationId, entityType: "llm-provider-profile", entityId: profileId, id: "", createdAt: new Date().toISOString() }).catch(() => undefined);
    return testResult;
  }
}
