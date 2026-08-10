import {
  createLlmProviderProfile as createLlmProviderProfileDomain,
  DEFAULT_APPEARANCE_OWNER_KEY,
} from "../../../../packages/domain/src/index.ts";
import type { HandlerContext } from "../context.ts";
import { ApiError, jsonResponse } from "../helpers.ts";
import { toLlmProviderProfileDto } from "../mappers.ts";
import {
  parseUpdateAppearanceSettingsRequest,
  parseSaveLlmProviderProfileRequest,
  parseUpdateComfyUiSettingsRequest,
} from "../parsers.ts";
import { requireLlmProviderProfileStore } from "../store-helpers.ts";
import * as settingsUc from "../use-cases/settings.ts";

async function parseBody(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
}

export async function handleSettings(
  ctx: HandlerContext,
  request: Request,
  url: URL,
  correlationId: string,
): Promise<Response | undefined> {
  // --- Appearance Settings ---
  if (url.pathname === "/v1/appearance-settings") {
    const ownerKey = url.searchParams.get("ownerKey") ?? DEFAULT_APPEARANCE_OWNER_KEY;
    if (ownerKey.trim().length === 0) throw new ApiError(400, "BAD_REQUEST", "ownerKey must be a non-empty string");
    if (request.method === "GET") return jsonResponse({ data: await settingsUc.getAppearanceSettings(ctx.store, ownerKey) });
    if (request.method === "PUT") return jsonResponse({ data: await settingsUc.saveAppearanceSettings(ctx.store, ownerKey, parseUpdateAppearanceSettingsRequest(await parseBody(request))) });
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  // --- LLM Provider Profiles ---
  const testPath = /^\/v1\/llm-provider-profiles\/([^/]+)\/test$/.exec(url.pathname);
  if (testPath) {
    if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const llmStore = requireLlmProviderProfileStore(ctx.store);
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
    if (request.method === "GET") return jsonResponse({ data: await settingsUc.listLlmProviderProfiles(ctx.store) });
    if (request.method === "PUT") return jsonResponse({ data: await settingsUc.saveLlmProviderProfile(ctx.store, parseSaveLlmProviderProfileRequest(await parseBody(request)), ctx.secretCipher) });
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  const llmProfilePath = /^\/v1\/llm-provider-profiles\/([^/]+)$/.exec(url.pathname);
  if (llmProfilePath) {
    if (request.method !== "DELETE") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    await settingsUc.deleteLlmProviderProfile(ctx.store, decodeURIComponent(llmProfilePath[1] ?? ""));
    return new Response(null, { status: 204 });
  }

  // --- ComfyUI Settings ---
  if (url.pathname === "/v1/comfyui/settings") {
    if (request.method === "GET") return jsonResponse({ data: await settingsUc.getComfyUiSettings(ctx.store) });
    if (request.method === "PUT") return jsonResponse({ data: await settingsUc.saveComfyUiSettings(ctx.store, parseUpdateComfyUiSettingsRequest(await parseBody(request))) });
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  return undefined;
}
