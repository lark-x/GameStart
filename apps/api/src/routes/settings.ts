import { DEFAULT_APPEARANCE_OWNER_KEY } from "../../../../packages/domain/src/index.ts";
import type { HandlerContext } from "../context.ts";
import { ApiError, jsonResponse } from "../helpers.ts";
import {
  parseUpdateAppearanceSettingsRequest,
  parseSaveLlmProviderProfileRequest,
  parseUpdateComfyUiSettingsRequest,
} from "../parsers.ts";
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
    const profileId = decodeURIComponent(testPath[1] ?? "");
    return jsonResponse({ data: await settingsUc.testLlmProviderProfile(ctx, profileId, correlationId) });
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
