import { randomUUID } from "node:crypto";

import { SecretCipher } from "@living-network/ai";
import { createV2ChatProvider } from "@living-network/ai/v2";
import {
  normalizeV2ModelLogMessages,
  normalizeV2ModelLogResponse,
  redactV2ModelLogText,
} from "@living-network/contracts/v2";
import type {
  V2AppearanceSettingsDto,
  V2DiscoverModelsRequest,
  V2DiscoverModelsResponse,
  V2ExternalConnectionCheckDto,
  V2ImageServiceSettingsDto,
  V2ModelCallLogDto,
  V2ModelCallLogQuery,
  V2ModelCapability,
  V2ModelLogMessage,
  V2ModelProfileDto,
  V2ModelProtocol,
  V2PlatformCapabilities,
  V2SaveAppearanceSettingsRequest,
  V2SaveImageServiceSettingsRequest,
  V2SaveModelProfileRequest,
  V2SetModelBindingRequest,
  V2StoredModelProfile,
} from "@living-network/contracts/v2";
import { createV2ModelCallLog } from "@living-network/database/v2";
import type { V2PlatformRepository } from "@living-network/ports/v2";
import type { FastifyPluginAsync, FastifyReply } from "fastify";

const THEMES = new Set(["dawn", "dusk", "blossom", "forest", "ocean", "midnight"]);

export interface V2PlatformPluginDependencies {
  readonly repository: V2PlatformRepository;
  readonly secretCipher?: SecretCipher;
  readonly sceneGenerationEnabled: boolean;
  readonly assetGenerationEnabled: boolean;
  readonly environmentSceneConfigured: boolean;
  readonly environmentAssetConfigured: boolean;
  readonly now?: () => Date;
}

function connectionStatusFromLog(log: V2ModelCallLogDto | undefined): Pick<V2PlatformCapabilities["sceneGeneration"], "connection" | "lastCheckedAt" | "errorMessage"> {
  if (log === undefined) return { connection: "untested" };
  const lastCheckedAt = log.completedAt ?? log.startedAt;
  if (log.status === "running") return { connection: "checking", lastCheckedAt };
  if (log.status === "success") return { connection: "ok", lastCheckedAt };
  return {
    connection: "failed",
    lastCheckedAt,
    ...(log.errorMessage === undefined ? {} : { errorMessage: log.errorMessage }),
  };
}

export async function getV2PlatformCapabilities(dependencies: Pick<V2PlatformPluginDependencies, "repository" | "secretCipher" | "sceneGenerationEnabled" | "assetGenerationEnabled" | "environmentSceneConfigured" | "environmentAssetConfigured">): Promise<V2PlatformCapabilities> {
  const sceneBinding = await dependencies.repository.getModelBinding("scene_generation");
  const sceneProfile = sceneBinding?.profileId === undefined ? undefined : await dependencies.repository.getModelProfile(sceneBinding.profileId);
  const imageSettings = await dependencies.repository.getImageServiceSettings();
  const imageConnection = await dependencies.repository.getExternalConnectionCheck("comfyui");
  const latestModelConnection = await dependencies.repository.queryModelCallLogs({
    capability: "model_connection_test",
    ...(sceneProfile === undefined ? {} : { profileId: sceneProfile.id }),
    limit: 1,
  });
  const profileHasEncryptedSecret = sceneProfile?.encryptedApiKey !== undefined && sceneProfile.encryptionIv !== undefined;
  const profileNeedsSecret = sceneProfile !== undefined && (sceneProfile.protocol === "anthropic" || profileHasEncryptedSecret);
  let profileSecretAvailable = !profileNeedsSecret;
  if (sceneProfile !== undefined && profileNeedsSecret && profileHasEncryptedSecret && dependencies.secretCipher !== undefined) {
    try {
      dependencies.secretCipher.decrypt({ ciphertext: sceneProfile.encryptedApiKey!, iv: sceneProfile.encryptionIv! });
      profileSecretAvailable = true;
    } catch {
      profileSecretAvailable = false;
    }
  }
  const profileConfigured = sceneProfile !== undefined && profileSecretAvailable;
  const sceneCandidateConfigured = sceneBinding !== undefined ? profileConfigured : dependencies.environmentSceneConfigured;
  const sceneConfigured = dependencies.sceneGenerationEnabled && sceneCandidateConfigured;
  const assetCandidateConfigured = imageSettings.baseUrl.length > 0 || dependencies.environmentAssetConfigured;
  const assetConfigured = dependencies.assetGenerationEnabled && assetCandidateConfigured;
  const sceneSource = sceneBinding !== undefined && profileConfigured
    ? "profile"
    : sceneBinding === undefined && dependencies.environmentSceneConfigured ? "environment" : "none";
  const assetSource = imageSettings.baseUrl.length > 0
    ? "settings"
    : dependencies.environmentAssetConfigured ? "environment" : "none";
  const sceneConnection = connectionStatusFromLog(latestModelConnection.items[0]);
  return {
    sceneGeneration: {
      enabled: dependencies.sceneGenerationEnabled,
      configuration: sceneCandidateConfigured ? "complete" : "incomplete",
      binding: sceneBinding === undefined ? "unbound" : "bound",
      ...sceneConnection,
      configured: sceneConfigured,
      source: dependencies.sceneGenerationEnabled ? sceneSource : "none",
      ...(dependencies.sceneGenerationEnabled
        ? sceneConfigured ? {} : profileNeedsSecret && !profileSecretAvailable ? { reason: "secret_unavailable" as const } : { reason: "profile_missing" as const }
        : { reason: "disabled_by_environment" as const }),
    },
    assetGeneration: {
      enabled: dependencies.assetGenerationEnabled,
      configuration: assetCandidateConfigured ? "complete" : "incomplete",
      binding: "not-applicable",
      connection: imageConnection?.connection ?? "untested",
      ...(imageConnection?.checkedAt === undefined ? {} : { lastCheckedAt: imageConnection.checkedAt }),
      ...(imageConnection?.errorMessage === undefined ? {} : { errorMessage: imageConnection.errorMessage }),
      configured: assetConfigured,
      source: dependencies.assetGenerationEnabled ? assetSource : "none",
      ...(dependencies.assetGenerationEnabled ? assetConfigured ? {} : { reason: "settings_missing" as const } : { reason: "disabled_by_environment" as const }),
    },
  };
}

interface RecordValue {
  readonly [key: string]: unknown;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`${field} must be a non-empty string`);
  return value.trim();
}

function positiveInteger(value: unknown, field: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new TypeError(`${field} must be a positive integer`);
  return value;
}

function temperature(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 2) throw new TypeError("temperature must be between 0 and 2");
  return value;
}

function protocol(value: unknown): V2ModelProtocol {
  if (value === "openai-compatible" || value === "anthropic") return value;
  throw new TypeError("protocol must be openai-compatible or anthropic");
}

function validUrl(value: string, field: string, allowEmpty = false): string {
  const normalized = value.replace(/\/+$/, "");
  if (normalized.length === 0 && allowEmpty) return "";
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new TypeError(`${field} must be a valid URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new TypeError(`${field} must use http or https`);
  return normalized;
}

function parseProfileRequest(value: unknown): V2SaveModelProfileRequest {
  if (!isRecord(value)) throw new TypeError("request body must be an object");
  return {
    ...(typeof value.id === "string" && value.id.trim().length > 0 ? { id: value.id.trim() } : {}),
    name: requiredString(value.name, "name"),
    protocol: protocol(value.protocol),
    baseUrl: validUrl(requiredString(value.baseUrl, "baseUrl"), "baseUrl"),
    model: requiredString(value.model, "model"),
    timeoutMs: positiveInteger(value.timeoutMs, "timeoutMs", 30000),
    maxTokens: positiveInteger(value.maxTokens, "maxTokens", 4096),
    temperature: temperature(value.temperature, 0.2),
    ...(value.apiKey === undefined ? {} : { apiKey: typeof value.apiKey === "string" ? value.apiKey.trim() : requiredString(value.apiKey, "apiKey") }),
    ...(typeof value.sourceProfileId === "string" && value.sourceProfileId.trim().length > 0 ? { sourceProfileId: value.sourceProfileId.trim() } : {}),
  };
}

function parseDiscoverModelsRequest(value: unknown): V2DiscoverModelsRequest {
  if (!isRecord(value)) throw new TypeError('request body must be an object');
  return {
    protocol: protocol(value.protocol),
    baseUrl: validUrl(requiredString(value.baseUrl, 'baseUrl'), 'baseUrl'),
    ...(typeof value.apiKey === 'string' && value.apiKey.trim().length > 0 ? { apiKey: value.apiKey.trim() } : {}),
    ...(typeof value.profileId === 'string' && value.profileId.trim().length > 0 ? { profileId: value.profileId.trim() } : {}),
  };
}

function parseBindingRequest(value: unknown): V2SetModelBindingRequest {
  if (!isRecord(value)) throw new TypeError("request body must be an object");
  if (value.profileId === null || value.profileId === undefined || value.profileId === "") return { profileId: null };
  return { profileId: requiredString(value.profileId, "profileId") };
}

function capability(value: unknown): V2ModelCapability {
  if (value === "chat" || value === "scene_generation") return value;
  throw new TypeError("unsupported model capability");
}

function parseImageSettings(value: unknown): V2SaveImageServiceSettingsRequest {
  if (!isRecord(value)) throw new TypeError("request body must be an object");
  return {
    baseUrl: validUrl(typeof value.baseUrl === "string" ? value.baseUrl.trim() : "", "baseUrl", true),
    timeoutMs: positiveInteger(value.timeoutMs, "timeoutMs", 30000),
    ...(value.defaultWorkflowVersion === undefined || value.defaultWorkflowVersion === "" ? {} : { defaultWorkflowVersion: requiredString(value.defaultWorkflowVersion, "defaultWorkflowVersion") }),
  };
}

function parseAppearance(value: unknown): V2SaveAppearanceSettingsRequest {
  if (!isRecord(value)) throw new TypeError("request body must be an object");
  const themeId = requiredString(value.themeId, "themeId");
  if (!THEMES.has(themeId)) throw new TypeError("themeId is not supported");
  return { themeId };
}

function parseLogQuery(value: unknown): V2ModelCallLogQuery {
  if (!isRecord(value)) return {};
  const stringQuery = (key: string): string | undefined => typeof value[key] === "string" && value[key] !== "" ? value[key] as string : undefined;
  const numeric = stringQuery("limit");
  const limit = numeric === undefined ? undefined : Number(numeric);
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) throw new TypeError("limit must be a positive integer");
  const status = stringQuery("status");
  if (status !== undefined && !["running", "success", "error", "interrupted"].includes(status)) throw new TypeError("status is invalid");
  const result: { -readonly [K in keyof V2ModelCallLogQuery]?: V2ModelCallLogQuery[K] } = {};
  const cursor = stringQuery("cursor");
  const capabilityValue = stringQuery("capability");
  const profileId = stringQuery("profileId");
  const model = stringQuery("model");
  const correlationId = stringQuery("correlationId");
  const jobId = stringQuery("jobId");
  const storyWorldId = stringQuery("storyWorldId");
  const search = stringQuery("query");
  const createdAfter = stringQuery("createdAfter");
  const createdBefore = stringQuery("createdBefore");
  if (cursor !== undefined) result.cursor = cursor;
  if (limit !== undefined) result.limit = limit;
  if (status !== undefined) result.status = status as NonNullable<V2ModelCallLogQuery["status"]>;
  if (capabilityValue !== undefined) result.capability = capabilityValue;
  if (profileId !== undefined) result.profileId = profileId;
  if (model !== undefined) result.model = model;
  if (correlationId !== undefined) result.correlationId = correlationId;
  if (jobId !== undefined) result.jobId = jobId;
  if (storyWorldId !== undefined) result.storyWorldId = storyWorldId;
  if (search !== undefined) result.query = search;
  if (createdAfter !== undefined) result.createdAfter = createdAfter;
  if (createdBefore !== undefined) result.createdBefore = createdBefore;
  return result as V2ModelCallLogQuery;
}

function publicProfile(profile: V2StoredModelProfile): V2ModelProfileDto {
  return {
    id: profile.id,
    name: profile.name,
    protocol: profile.protocol,
    baseUrl: profile.baseUrl,
    model: profile.model,
    timeoutMs: profile.timeoutMs,
    maxTokens: profile.maxTokens,
    temperature: profile.temperature,
    hasApiKey: profile.encryptedApiKey !== undefined && profile.encryptionIv !== undefined,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function errorStatus(error: unknown): number {
  if (error instanceof TypeError) return 422;
  if (error instanceof Error && error.message.includes("not found")) return 404;
  if (error instanceof Error && (error.message.includes("constraint") || error.message.includes("UNIQUE"))) return 409;
  return 500;
}

function errorPayload(error: unknown): { readonly error: { readonly code: string; readonly message: string } } {
  const status = errorStatus(error);
  return { error: { code: status === 422 ? "VALIDATION_FAILED" : status === 404 ? "NOT_FOUND" : status === 409 ? "CONFLICT" : "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } };
}

async function withError(reply: FastifyReply, operation: () => Promise<unknown>): Promise<unknown> {
  try {
    return await operation();
  } catch (error) {
    return reply.code(errorStatus(error)).send(errorPayload(error));
  }
}

async function decryptApiKey(profile: V2StoredModelProfile, cipher: SecretCipher | undefined): Promise<string | undefined> {
  if (profile.encryptedApiKey === undefined && profile.encryptionIv === undefined) return undefined;
  if (profile.encryptedApiKey === undefined || profile.encryptionIv === undefined || cipher === undefined) throw new Error("Model API key cannot be decrypted");
  return cipher.decrypt({ ciphertext: profile.encryptedApiKey, iv: profile.encryptionIv });
}

async function testProfile(
  profile: V2StoredModelProfile,
  repository: V2PlatformRepository,
  cipher: SecretCipher | undefined,
  now: () => Date,
): Promise<Record<string, unknown>> {
  const apiKey = await decryptApiKey(profile, cipher);
  const correlationId = `v2:model-test:${randomUUID()}`;
  const startedAt = now();
  const requestMessages: readonly V2ModelLogMessage[] = [
    { role: "system", content: "You are testing a model connection. Reply with a short confirmation." },
    { role: "user", content: "Connection test. Reply with OK." },
  ];
  const request = normalizeV2ModelLogMessages(requestMessages);
  const log = createV2ModelCallLog({ capability: "model_connection_test", startedAt: startedAt.toISOString(), profileId: profile.id, profileName: profile.name, protocol: profile.protocol, model: profile.model, correlationId, requestMessages: request.messages, requestTruncated: request.truncated });
  await repository.startModelCall({ log });
  try {
    const provider = createV2ChatProvider({ protocol: profile.protocol, baseUrl: profile.baseUrl, ...(apiKey === undefined ? {} : { apiKey }), model: profile.model, timeoutMs: profile.timeoutMs });
    const result = await provider.complete({ messages: requestMessages, model: profile.model, temperature: 0, maxTokens: Math.min(profile.maxTokens, 64), trace: { correlationId } });
    const endedAt = now();
    const output = normalizeV2ModelLogResponse(result.content);
    await repository.completeModelCall({
      id: log.id,
      completedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - startedAt.getTime(),
      providerResponseId: result.id,
      model: result.model,
      ...(result.usage?.promptTokens === undefined ? {} : { promptTokens: result.usage.promptTokens }),
      ...(result.usage?.completionTokens === undefined ? {} : { completionTokens: result.usage.completionTokens }),
      ...(result.usage?.totalTokens === undefined ? {} : { totalTokens: result.usage.totalTokens }),
      ...(result.finishReason === undefined ? {} : { finishReason: result.finishReason }),
      responseText: output.value,
      responseTruncated: output.truncated,
    });
    return { success: true, ok: true, profileId: profile.id, protocol: profile.protocol, model: result.model, latencyMs: endedAt.getTime() - startedAt.getTime(), preview: output.value.slice(0, 500), correlationId };
  } catch (error) {
    const endedAt = now();
    const providerError = error as { code?: unknown; status?: unknown; retryable?: unknown; message?: unknown };
    await repository.failModelCall({
      id: log.id,
      completedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - startedAt.getTime(),
      errorCode: typeof providerError.code === "string" ? providerError.code : "MODEL_ERROR",
      ...(typeof providerError.status === "number" ? { errorStatus: providerError.status } : {}),
      ...(typeof providerError.retryable === "boolean" ? { errorRetryable: providerError.retryable } : {}),
      errorMessage: redactV2ModelLogText(error instanceof Error ? error.message : String(error)),
    });
    throw Object.assign(new Error(error instanceof Error ? error.message : String(error)), { correlationId });
  }
}

async function testImageService(
  repository: V2PlatformRepository,
  now: () => Date,
): Promise<V2ExternalConnectionCheckDto> {
  const settings = await repository.getImageServiceSettings();
  if (settings.baseUrl.trim().length === 0) throw new TypeError("ComfyUI baseUrl is required before testing connection");
  const startedAt = now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    const response = await fetch(`${settings.baseUrl.replace(/\/+$/, "")}/system_stats`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`ComfyUI returned HTTP ${response.status}`);
    const endedAt = now();
    return repository.saveExternalConnectionCheck({
      service: "comfyui",
      connection: "ok",
      checkedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - startedAt.getTime(),
    });
  } catch (error) {
    const endedAt = now();
    const message = error instanceof Error && error.name === "AbortError"
      ? "ComfyUI connection test timed out"
      : redactV2ModelLogText(error instanceof Error ? error.message : String(error));
    return repository.saveExternalConnectionCheck({
      service: "comfyui",
      connection: "failed",
      checkedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - startedAt.getTime(),
      errorMessage: message,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function createV2PlatformPlugin(dependencies: V2PlatformPluginDependencies): FastifyPluginAsync {
  const now = dependencies.now ?? (() => new Date());
  return async (app) => {
    app.get("/model-profiles", async (_request, reply) => withError(reply, async () => ({ profiles: (await dependencies.repository.listModelProfiles()).map(publicProfile) })));
    app.post("/model-profiles", async (request, reply) => withError(reply, async () => {
      const input = parseProfileRequest(request.body);
      const existing = input.id === undefined ? undefined : await dependencies.repository.getModelProfile(input.id);
      const id = input.id ?? `profile:${randomUUID()}`;
      const encrypted: { encryptedApiKey?: string; encryptionIv?: string } = {};
      if (input.apiKey !== undefined && input.apiKey.length > 0) {
          if (dependencies.secretCipher === undefined) throw new Error("INTEGRATION_SECRET_KEY is required to save an API key");
          const value = dependencies.secretCipher.encrypt(input.apiKey);
          encrypted.encryptedApiKey = value.ciphertext;
          encrypted.encryptionIv = value.iv;
      } else if (existing !== undefined) {
        if (existing.encryptedApiKey !== undefined) encrypted.encryptedApiKey = existing.encryptedApiKey;
        if (existing.encryptionIv !== undefined) encrypted.encryptionIv = existing.encryptionIv;
      } else if (input.sourceProfileId !== undefined) {
        const sourceProfile = await dependencies.repository.getModelProfile(input.sourceProfileId);
        if (sourceProfile?.encryptedApiKey !== undefined) encrypted.encryptedApiKey = sourceProfile.encryptedApiKey;
        if (sourceProfile?.encryptionIv !== undefined) encrypted.encryptionIv = sourceProfile.encryptionIv;
      }
      const saved = await dependencies.repository.saveModelProfile({ id, name: input.name, protocol: input.protocol, baseUrl: input.baseUrl, model: input.model, timeoutMs: input.timeoutMs ?? 30000, maxTokens: input.maxTokens ?? 4096, temperature: input.temperature ?? 0.2, ...encrypted, createdAt: existing?.createdAt ?? now().toISOString(), updatedAt: now().toISOString() });
      return reply.code(existing === undefined ? 201 : 200).send({ profile: publicProfile(saved) });
    }));
    app.put("/model-profiles/:profileId", async (request, reply) => withError(reply, async () => {
      const params = request.params as { profileId?: unknown };
      const id = requiredString(params.profileId, "profileId");
      const input = { ...parseProfileRequest(request.body), id };
      const existing = await dependencies.repository.getModelProfile(id);
      if (existing === undefined) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Model profile not found" } });
      const encrypted = input.apiKey === undefined || input.apiKey.length === 0
        ? { ...(existing.encryptedApiKey === undefined ? {} : { encryptedApiKey: existing.encryptedApiKey }), ...(existing.encryptionIv === undefined ? {} : { encryptionIv: existing.encryptionIv }) }
        : (() => {
          if (dependencies.secretCipher === undefined) throw new Error("INTEGRATION_SECRET_KEY is required to save an API key");
          const value = dependencies.secretCipher.encrypt(input.apiKey);
          return { encryptedApiKey: value.ciphertext, encryptionIv: value.iv };
        })();
      const saved = await dependencies.repository.saveModelProfile({ id, name: input.name, protocol: input.protocol, baseUrl: input.baseUrl, model: input.model, timeoutMs: input.timeoutMs ?? 30000, maxTokens: input.maxTokens ?? 4096, temperature: input.temperature ?? 0.2, ...encrypted, createdAt: existing.createdAt, updatedAt: now().toISOString() });
      return { profile: publicProfile(saved) };
    }));
    app.delete("/model-profiles/:profileId", async (request, reply) => withError(reply, async () => {
      const params = request.params as { profileId?: unknown };
      const id = requiredString(params.profileId, "profileId");
      await dependencies.repository.deleteModelProfile(id);
      return reply.code(204).send();
    }));
    app.post("/model-profiles/discover-models", async (request, reply) => withError(reply, async () => {
      const input = parseDiscoverModelsRequest(request.body);
      let apiKey = input.apiKey;
      if ((!apiKey || apiKey.length === 0) && input.profileId) {
        const profile = await dependencies.repository.getModelProfile(input.profileId);
        if (profile?.encryptedApiKey && profile.encryptionIv && dependencies.secretCipher) {
          try {
            apiKey = dependencies.secretCipher.decrypt({ ciphertext: profile.encryptedApiKey, iv: profile.encryptionIv });
          } catch {}
        }
      }
      const normalizedBase = input.baseUrl.replace(/\/+$/, "");
      const headers: Record<string, string> = { Accept: "application/json" };
      let url = "";
      if (input.protocol === "anthropic") {
        url = normalizedBase + "/v1/models";
        if (apiKey) {
          headers["x-api-key"] = apiKey;
          headers["anthropic-version"] = "2023-06-01";
        }
      } else {
        url = normalizedBase + "/models";
        if (apiKey) {
          headers["Authorization"] = "Bearer " + apiKey;
        }
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(url, { method: "GET", headers, signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          let errMsg = "\u4e0a\u6e38\u6a21\u578b\u670d\u52a1\u8fd4\u56de\u9519\u8bef\u72b6\u6001: HTTP " + response.status;
          try {
            const errJson = JSON.parse(errText);
            if (errJson?.error?.message) errMsg = errJson.error.message;
            else if (errJson?.message) errMsg = errJson.message;
          } catch {}
          throw new Error(redactV2ModelLogText(errMsg));
        }
        const json = await response.json().catch(() => ({}));
        let rawList: unknown[] = [];
        if (Array.isArray(json?.data)) rawList = json.data;
        else if (Array.isArray(json?.models)) rawList = json.models;
        else if (Array.isArray(json)) rawList = json;
        const models: string[] = [];
        for (const item of rawList) {
          if (typeof item === "string" && item.trim().length > 0) {
            models.push(item.trim());
          } else if (isRecord(item) && typeof item.id === "string" && item.id.trim().length > 0) {
            models.push(item.id.trim());
          } else if (isRecord(item) && typeof item.name === "string" && item.name.trim().length > 0) {
            models.push(item.name.trim());
          }
        }
        const uniqueModels = Array.from(new Set(models)).sort((a, b) => a.localeCompare(b));
        return { models: uniqueModels };
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error("\u83b7\u53d6\u6a21\u578b\u5217\u8868\u8d85\u65f6\uff0c\u8bf7\u68c0\u67e5 API \u5730\u5740\u662f\u5426\u53ef\u8bbf\u95ee");
        }
        throw err;
      }
    }));
    app.post("/model-profiles/:profileId/test", async (request, reply) => withError(reply, async () => {
      const params = request.params as { profileId?: unknown };
      const profile = await dependencies.repository.getModelProfile(requiredString(params.profileId, "profileId"));
      if (profile === undefined) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Model profile not found" } });
      return testProfile(profile, dependencies.repository, dependencies.secretCipher, now);
    }));
    app.get("/model-bindings", async (_request, reply) => withError(reply, async () => ({ bindings: await dependencies.repository.listModelBindings() })));
    app.put("/model-bindings/:capability", async (request, reply) => withError(reply, async () => {
      const params = request.params as { capability?: unknown };
      const selected = capability(params.capability);
      const input = parseBindingRequest(request.body);
      if (input.profileId === null || input.profileId === undefined) {
        await dependencies.repository.clearModelBinding(selected);
        return { binding: { capability: selected } };
      }
      return { binding: await dependencies.repository.setModelBinding({ capability: selected, profileId: input.profileId }) };
    }));
    app.get("/image-service", async (_request, reply) => withError(reply, async () => ({ settings: await dependencies.repository.getImageServiceSettings() })));
    app.put("/image-service", async (request, reply) => withError(reply, async () => ({ settings: await dependencies.repository.saveImageServiceSettings(parseImageSettings(request.body)) })));
    app.post("/image-service/test", async (_request, reply) => withError(reply, async () => ({ check: await testImageService(dependencies.repository, now) })));
    app.get("/appearance", async (_request, reply) => withError(reply, async () => ({ settings: await dependencies.repository.getAppearanceSettings() })));
    app.put("/appearance", async (request, reply) => withError(reply, async () => ({ settings: await dependencies.repository.saveAppearanceSettings(parseAppearance(request.body)) })));
    app.get("/model-call-logs", async (request, reply) => withError(reply, async () => dependencies.repository.queryModelCallLogs(parseLogQuery(request.query))));
    app.get("/model-call-logs/:logId", async (request, reply) => withError(reply, async () => {
      const params = request.params as { logId?: unknown };
      const log = await dependencies.repository.getModelCallLog(requiredString(params.logId, "logId"));
      return log === undefined ? reply.code(404).send({ error: { code: "NOT_FOUND", message: "Model call log not found" } }) : { log };
    }));
    app.delete("/model-call-logs", async (request, reply) => withError(reply, async () => {
      const query = request.query as { before?: unknown };
      const before = requiredString(query.before, "before");
      if (Number.isNaN(Date.parse(before))) throw new TypeError("before must be an ISO date");
      return { deleted: await dependencies.repository.deleteModelCallLogsBefore(new Date(before).toISOString()) };
    }));
    app.get("/capabilities", async () => {
      return getV2PlatformCapabilities(dependencies);
    });
  };
}
