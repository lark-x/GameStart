import { isAbsolute, resolve } from "node:path";

export type V2LlmProtocol = "openai-compatible" | "anthropic";
export type V2EnvironmentInput = Readonly<Record<string, string | undefined>>;

export interface V2RuntimeConfig {
  readonly api: { readonly host: string; readonly port: number };
  readonly sqlitePath: string;
  readonly mediaRoot: string;
  readonly redisUrl: string;
  readonly queuePrefix: string;
  readonly dispatchTickMs: number;
  readonly integrationSecretKey?: string;
  readonly scene: {
    readonly enabled: boolean;
    readonly protocol: V2LlmProtocol;
    readonly baseUrl?: string;
    readonly apiKey?: string;
    readonly model?: string;
    readonly timeoutMs: number;
    readonly concurrency: number;
  };
  readonly asset: {
    readonly enabled: boolean;
    readonly baseUrl?: string;
    readonly timeoutMs: number;
    readonly concurrency: number;
  };
  readonly memory: {
    readonly primaryEngineId: string;
    readonly shadowEngineIds: readonly string[];
  };
}

export class V2ConfigError extends Error {
  public readonly field: string;

  public constructor(field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = "V2ConfigError";
    this.field = field;
  }
}

function stringValue(env: V2EnvironmentInput, field: string, fallback?: string): string | undefined {
  const value = env[field] ?? fallback;
  return value === undefined || value.trim().length === 0 ? undefined : value.trim();
}

function requiredString(env: V2EnvironmentInput, field: string, fallback?: string): string {
  const value = stringValue(env, field, fallback);
  if (value === undefined) throw new V2ConfigError(field, "must be a non-empty string");
  return value;
}

function booleanValue(env: V2EnvironmentInput, field: string, fallback: boolean): boolean {
  const raw = env[field];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (["1", "true", "yes", "on"].includes(raw.trim().toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(raw.trim().toLowerCase())) return false;
  throw new V2ConfigError(field, "must be a boolean");
}

function positiveInteger(env: V2EnvironmentInput, field: string, fallback: number): number {
  const raw = env[field] ?? String(fallback);
  if (!/^\d+$/.test(raw)) throw new V2ConfigError(field, "must be a positive integer");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new V2ConfigError(field, "must be a positive integer");
  return value;
}

function urlValue(
  env: V2EnvironmentInput,
  field: string,
  protocols: readonly string[],
  fallback?: string,
): string | undefined {
  const value = stringValue(env, field, fallback);
  if (value === undefined) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new V2ConfigError(field, "must be a valid URL");
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new V2ConfigError(field, "must use a supported URL protocol");
  }
  return value.replace(/\/+$/, "");
}

function pathValue(env: V2EnvironmentInput, field: string, fallback: string): string {
  const value = requiredString(env, field, fallback);
  if (value === ":memory:") return value;
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

export function loadV2RuntimeConfig(env: V2EnvironmentInput = process.env): V2RuntimeConfig {
  const sceneEnabled = booleanValue(env, "V2_SCENE_GENERATION_ENABLED", false);
  const assetEnabled = booleanValue(env, "V2_ASSET_GENERATION_ENABLED", false);
  const protocol = stringValue(env, "V2_LLM_PROTOCOL", "openai-compatible");
  if (protocol !== "openai-compatible" && protocol !== "anthropic") {
    throw new V2ConfigError("V2_LLM_PROTOCOL", "must be openai-compatible or anthropic");
  }
  const sceneBaseUrl = urlValue(env, "LLM_BASE_URL", ["http:", "https:"]);
  const sceneApiKey = stringValue(env, "LLM_API_KEY");
  const sceneModel = stringValue(env, "LLM_MODEL");
  if (sceneEnabled && (sceneBaseUrl !== undefined || sceneModel !== undefined)) {
    if (sceneBaseUrl === undefined) throw new V2ConfigError("LLM_BASE_URL", "must be provided together with LLM_MODEL");
    if (sceneModel === undefined) throw new V2ConfigError("LLM_MODEL", "must be provided together with LLM_BASE_URL");
    if (protocol === "anthropic" && sceneApiKey === undefined) throw new V2ConfigError("LLM_API_KEY", "is required for Anthropic environment fallback");
  }
  const assetBaseUrl = urlValue(env, "COMFYUI_BASE_URL", ["http:", "https:"]);
  const integrationSecretKey = stringValue(env, "INTEGRATION_SECRET_KEY");
  const memoryEngineRuntimeEnabled = booleanValue(env, "V2_MEMORY_ENGINE_RUNTIME_ENABLED", true);
  const primaryEngineId = memoryEngineRuntimeEnabled
    ? stringValue(env, "V2_MEMORY_PRIMARY_ENGINE", "builtin_structured")!
    : "builtin_structured";
  const shadowEngineIds = memoryEngineRuntimeEnabled
    ? (stringValue(env, "V2_MEMORY_SHADOW_ENGINES", "") ?? "").split(",").map((id) => id.trim()).filter(Boolean)
    : [];
  return Object.freeze({
    api: Object.freeze({
      host: requiredString(env, "V2_API_HOST", env.API_HOST ?? "127.0.0.1"),
      port: positiveInteger(env, "V2_API_PORT", Number(env.API_PORT ?? 3002)),
    }),
    sqlitePath: pathValue(env, "V2_SQLITE_PATH", ".data/living-network-v2.sqlite"),
    mediaRoot: pathValue(env, "V2_MEDIA_ROOT", "./data/media"),
    redisUrl: urlValue(env, "REDIS_URL", ["redis:", "rediss:"], "redis://127.0.0.1:6379")!,
    queuePrefix: requiredString(env, "V2_QUEUE_PREFIX", "living-network-v2"),
    dispatchTickMs: positiveInteger(env, "V2_DISPATCH_TICK_MS", 1000),
    ...(integrationSecretKey === undefined ? {} : { integrationSecretKey }),
    scene: Object.freeze({
      enabled: sceneEnabled,
      protocol,
      ...(sceneBaseUrl === undefined ? {} : { baseUrl: sceneBaseUrl }),
      ...(sceneApiKey === undefined ? {} : { apiKey: sceneApiKey }),
      ...(sceneModel === undefined ? {} : { model: sceneModel }),
      timeoutMs: positiveInteger(env, "LLM_TIMEOUT_MS", 30_000),
      concurrency: positiveInteger(env, "V2_SCENE_CONCURRENCY", 1),
    }),
    asset: Object.freeze({
      enabled: assetEnabled,
      ...(assetBaseUrl === undefined ? {} : { baseUrl: assetBaseUrl }),
      timeoutMs: positiveInteger(env, "COMFYUI_TIMEOUT_MS", 30_000),
      concurrency: positiveInteger(env, "V2_ASSET_CONCURRENCY", 1),
    }),
    memory: Object.freeze({
      primaryEngineId,
      shadowEngineIds: Object.freeze(shadowEngineIds),
    }),
  });
}
