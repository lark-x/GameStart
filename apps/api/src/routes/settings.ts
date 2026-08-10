import {
  createAppearanceSettings,
  createDefaultAppearanceSettings,
  createLlmProviderProfile as createLlmProviderProfileDomain,
  createComfyUiSettings as createComfyUiSettingsDomain,
  ChatBackgroundKind,
  DEFAULT_APPEARANCE_OWNER_KEY,
} from "../../../../packages/domain/src/index.ts";
import type { HandlerContext } from "../context.ts";
import { ApiError, jsonResponse } from "../helpers.ts";
import {
  toAppearanceSettingsDto,
  toLlmProviderProfileDto,
  toComfyUiSettingsDto,
} from "../mappers.ts";
import {
  parseUpdateAppearanceSettingsRequest,
  parseSaveLlmProviderProfileRequest,
  parseUpdateComfyUiSettingsRequest,
} from "../parsers.ts";
import {
  requireAppearanceStore,
  requireLlmProviderProfileStore,
  requireComfyUiSettingsStore,
} from "../store-helpers.ts";

async function parseBody(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
}

export async function handleSettings(
  ctx: HandlerContext,
  request: Request,
  url: URL,
  correlationId: string,
): Promise<Response | undefined> {
  const store = ctx.store;

  // --- Appearance Settings ---
  if (url.pathname === "/v1/appearance-settings") {
    const ownerKey = url.searchParams.get("ownerKey") ?? DEFAULT_APPEARANCE_OWNER_KEY;
    if (ownerKey.trim().length === 0) throw new ApiError(400, "BAD_REQUEST", "ownerKey must be a non-empty string");
    const appStore = requireAppearanceStore(store);
    if (request.method === "GET") {
      const existing = await appStore.appearanceSettings.getByOwnerKey(ownerKey);
      const settings = existing ?? createDefaultAppearanceSettings(ownerKey, new Date().toISOString());
      return jsonResponse({ data: toAppearanceSettingsDto(settings) });
    }
    if (request.method === "PUT") {
      const input = parseUpdateAppearanceSettingsRequest(await parseBody(request));
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
        return jsonResponse({ data: toAppearanceSettingsDto(settings) });
      } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
        throw error;
      }
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  // --- LLM Provider Profiles ---
  const testPath = /^\/v1\/llm-provider-profiles\/([^/]+)\/test$/.exec(url.pathname);
  if (testPath) {
    if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const llmStore = requireLlmProviderProfileStore(store);
    const profileId = decodeURIComponent(testPath[1] ?? "");
    const profile = await llmStore.llmProviderProfiles.getById(profileId);
    if (!profile) throw new ApiError(404, "NOT_FOUND", "LLM provider profile not found");
    const started = Date.now();
    try {
      const { createProviderFromProfile } = await import("../../../../packages/ai/src/profile-provider.ts");
      const key = profile.encryptedApiKey && profile.encryptionIv && ctx.secretCipher
        ? ctx.secretCipher.decrypt({ ciphertext: profile.encryptedApiKey, iv: profile.encryptionIv })
        : undefined;
      const provider = createProviderFromProfile(profile, key);
      const result = await provider.complete({ messages: [{ role: "user", content: "Reply with exactly OK." }], model: profile.model, temperature: 0, maxTokens: 8 });
      const testResult = { success: true, ok: result.content.trim() === "OK", profileId, protocol: profile.protocol, model: result.model, latencyMs: Date.now() - started, preview: result.content.slice(0, 500), correlationId };
      void ctx.logging.append({ level: "INFO", source: "API", category: "LLM", action: "provider.test", outcome: "SUCCESS", correlationId, entityType: "llm-provider-profile", entityId: profileId, ...(testResult.preview === undefined ? {} : { message: testResult.preview }), id: "", createdAt: new Date().toISOString() }).catch(() => undefined);
      return jsonResponse({ data: testResult });
    } catch (error) {
      const e = error as { code?: string; message?: string; retryable?: boolean; status?: number };
      const testResult = { success: false, ok: false, profileId, protocol: profile.protocol, model: profile.model, latencyMs: Date.now() - started, error: { code: e.code, message: e instanceof Error ? e.message.slice(0, 200) : "Provider test failed", ...(e.retryable === undefined ? {} : { retryable: e.retryable }), ...(e.status === undefined ? {} : { status: e.status }) }, correlationId };
      void ctx.logging.append({ level: "ERROR", source: "API", category: "LLM", action: "provider.test", outcome: "FAILURE", correlationId, entityType: "llm-provider-profile", entityId: profileId, id: "", createdAt: new Date().toISOString() }).catch(() => undefined);
      return jsonResponse({ data: testResult });
    }
  }

  if (url.pathname === "/v1/llm-provider-profiles") {
    const llmStore = requireLlmProviderProfileStore(store);
    if (request.method === "GET") {
      return jsonResponse({ data: (await llmStore.llmProviderProfiles.list()).map((p) => toLlmProviderProfileDto(p)) });
    }
    if (request.method === "PUT") {
      const input = parseSaveLlmProviderProfileRequest(await parseBody(request));
      const existing = await llmStore.llmProviderProfiles.getById(input.id);
      const profiles = await llmStore.llmProviderProfiles.list();
      const isOnlyProfile = profiles.every((p) => p.id === input.id);
      let encryptedApiKey = existing?.encryptedApiKey;
      let encryptionIv = existing?.encryptionIv;
      if (input.apiKey !== undefined) {
        if (!ctx.secretCipher) throw new ApiError(503, "SERVICE_UNAVAILABLE", "API key encryption is not configured");
        const encrypted = ctx.secretCipher.encrypt(input.apiKey);
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
        return jsonResponse({ data: toLlmProviderProfileDto(profile) });
      } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
        throw error;
      }
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  const llmProfilePath = /^\/v1\/llm-provider-profiles\/([^/]+)$/.exec(url.pathname);
  if (llmProfilePath) {
    if (request.method !== "DELETE") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    await requireLlmProviderProfileStore(store).llmProviderProfiles.delete(decodeURIComponent(llmProfilePath[1] ?? ""));
    return new Response(null, { status: 204 });
  }

  // --- ComfyUI Settings ---
  if (url.pathname === "/v1/comfyui/settings") {
    const comfyStore = requireComfyUiSettingsStore(store);
    if (request.method === "GET") {
      const settings = await comfyStore.comfyUiSettings.get();
      if (settings) return jsonResponse({ data: toComfyUiSettingsDto(settings) });
      return jsonResponse({ data: toComfyUiSettingsDto(createComfyUiSettingsDomain({ id: "default", baseUrl: "http://127.0.0.1:8188", autoImageIntentEnabled: false, updatedAt: new Date().toISOString() })) });
    }
    if (request.method === "PUT") {
      const input = parseUpdateComfyUiSettingsRequest(await parseBody(request));
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
        return jsonResponse({ data: toComfyUiSettingsDto(settings) });
      } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
        throw error;
      }
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  return undefined;
}
