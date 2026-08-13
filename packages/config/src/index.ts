import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type AppEnvironment = "development" | "test" | "production";

export interface FeatureFlags {
  autonomousEventsEnabled: boolean;
  proactiveMessagesEnabled: boolean;
  momentGenerationEnabled: boolean;
  imageGenerationEnabled: boolean;
  memoryWriteEnabled: boolean;
  memoryRetrievalEnabled: boolean;
  manualReviewBeforePublish: boolean;
}

export interface AppConfig {
  environment: AppEnvironment;
  api: {
    host: string;
    port: number;
    corsOrigins: readonly string[];
  };
  database: {
    url: string;
  };
  redis: {
    url: string;
  };
  comfyui: {
    baseUrl: string;
    timeoutMs: number;
  };
  llm: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  };
  media: {
    root: string;
  };
  flags: FeatureFlags;
}

export interface SafeConfigSummary {
  environment: AppEnvironment;
  api: AppConfig["api"];
  database: { configured: boolean };
  redis: { url: string };
  comfyui: AppConfig["comfyui"];
  llm: { baseUrl?: string; model?: string; hasApiKey: boolean };
  media: AppConfig["media"];
  flags: FeatureFlags;
}

export type EnvironmentInput = Readonly<Record<string, string | undefined>>;

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

export class ConfigError extends Error {
  public readonly field: string;

  public constructor(field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = "ConfigError";
    this.field = field;
  }
}

function requiredString(
  env: EnvironmentInput,
  field: string,
  options: { defaultValue?: string } = {},
): string {
  const value = env[field] ?? options.defaultValue;
  if (value === undefined || value.trim().length === 0) {
    throw new ConfigError(field, "must be a non-empty string");
  }
  return value.trim();
}

function optionalString(env: EnvironmentInput, field: string): string | undefined {
  const value = env[field];
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  return value.trim();
}

function parseEnvironment(env: EnvironmentInput): AppEnvironment {
  const value = env.NODE_ENV ?? "development";
  if (value !== "development" && value !== "test" && value !== "production") {
    throw new ConfigError("NODE_ENV", "must be development, test, or production");
  }
  return value;
}

function parsePort(env: EnvironmentInput): number {
  const raw = env.API_PORT ?? "3001";
  if (!/^\d+$/.test(raw)) {
    throw new ConfigError("API_PORT", "must be an integer between 1 and 65535");
  }
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError("API_PORT", "must be an integer between 1 and 65535");
  }
  return port;
}

function parseCorsOrigins(env: EnvironmentInput): readonly string[] {
  const raw = env.API_CORS_ORIGINS ?? "http://127.0.0.1:4173,http://localhost:4173";
  const origins = raw.split(",").map((value) => value.trim()).filter(Boolean);
  if (origins.length === 0) {
    throw new ConfigError("API_CORS_ORIGINS", "must contain at least one origin");
  }
  const seen = new Set<string>();
  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new ConfigError("API_CORS_ORIGINS", `invalid origin: ${origin}`);
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.pathname !== "/" || url.search || url.hash) {
      throw new ConfigError("API_CORS_ORIGINS", `must be an HTTP origin: ${origin}`);
    }
    const normalized = url.origin;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
  }
  return [...seen];
}

function parsePositiveInteger(
  env: EnvironmentInput,
  field: string,
  defaultValue: number,
): number {
  const raw = env[field] ?? String(defaultValue);
  if (!/^\d+$/.test(raw)) {
    throw new ConfigError(field, "must be a positive integer");
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ConfigError(field, "must be a positive integer");
  }
  return value;
}

function parseUrl(
  env: EnvironmentInput,
  field: string,
  protocols: readonly string[],
  options: { defaultValue?: string; required?: boolean } = {},
): string | undefined {
  const raw = options.required === false
    ? optionalString(env, field) ?? options.defaultValue
    : options.defaultValue === undefined
      ? requiredString(env, field)
      : requiredString(env, field, { defaultValue: options.defaultValue });
  if (raw === undefined) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(field, "must be a valid URL");
  }
  if (!protocols.includes(url.protocol)) {
    throw new ConfigError(field, `must use ${protocols.join(" or ")}`);
  }
  return raw;
}

function parseBoolean(
  env: EnvironmentInput,
  field: string,
  defaultValue: boolean,
): boolean {
  const raw = env[field];
  if (raw === undefined || raw.trim().length === 0) {
    return defaultValue;
  }
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  throw new ConfigError(field, "must be a boolean (true/false, 1/0, yes/no, or on/off)");
}

function parseMediaRoot(env: EnvironmentInput): string {
  const raw = requiredString(env, "MEDIA_ROOT", { defaultValue: "./data/media" });
  return isAbsolute(raw) ? raw : resolve(repositoryRoot, raw);
}

function freezeConfig(config: AppConfig): AppConfig {
  Object.freeze(config.api.corsOrigins);
  Object.freeze(config.api);
  Object.freeze(config.database);
  Object.freeze(config.redis);
  Object.freeze(config.comfyui);
  Object.freeze(config.llm);
  Object.freeze(config.media);
  Object.freeze(config.flags);
  return Object.freeze(config);
}

export function loadAppConfig(env: EnvironmentInput = {}): AppConfig {
  const llmBaseUrl = parseUrl(env, "LLM_BASE_URL", ["http:", "https:"], {
    required: false,
  });
  const llmApiKey = optionalString(env, "LLM_API_KEY");
  const llmModel = optionalString(env, "LLM_MODEL");
  const comfyUiBaseUrl = parseUrl(env, "COMFYUI_BASE_URL", ["http:", "https:"], {
    defaultValue: "http://127.0.0.1:8188",
  }) ?? "";
  const llm: AppConfig["llm"] = {};
  if (llmBaseUrl !== undefined) llm.baseUrl = llmBaseUrl;
  if (llmApiKey !== undefined) llm.apiKey = llmApiKey;
  if (llmModel !== undefined) llm.model = llmModel;

  const config: AppConfig = {
    environment: parseEnvironment(env),
    api: {
      host: requiredString(env, "API_HOST", { defaultValue: "127.0.0.1" }),
      port: parsePort(env),
      corsOrigins: parseCorsOrigins(env),
    },
    database: {
      url: parseUrl(env, "DATABASE_URL", ["postgres:", "postgresql:"]) ?? "",
    },
    redis: {
      url: parseUrl(env, "REDIS_URL", ["redis:", "rediss:"], {
        defaultValue: "redis://127.0.0.1:6379",
      }) ?? "",
    },
    comfyui: {
      baseUrl: comfyUiBaseUrl,
      timeoutMs: parsePositiveInteger(env, "COMFYUI_TIMEOUT_MS", 30_000),
    },
    llm,
    media: {
      root: parseMediaRoot(env),
    },
    flags: {
      autonomousEventsEnabled: parseBoolean(env, "AUTONOMOUS_EVENTS_ENABLED", false),
      proactiveMessagesEnabled: parseBoolean(env, "PROACTIVE_MESSAGES_ENABLED", false),
      momentGenerationEnabled: parseBoolean(env, "MOMENT_GENERATION_ENABLED", false),
      imageGenerationEnabled: parseBoolean(env, "IMAGE_GENERATION_ENABLED", false),
      memoryWriteEnabled: parseBoolean(env, "MEMORY_WRITE_ENABLED", false),
      memoryRetrievalEnabled: parseBoolean(env, "MEMORY_RETRIEVAL_ENABLED", false),
      manualReviewBeforePublish: parseBoolean(env, "MANUAL_REVIEW_BEFORE_PUBLISH", true),
    },
  };

  return freezeConfig(config);
}

export function getSafeConfigSummary(config: AppConfig): SafeConfigSummary {
  return {
    environment: config.environment,
    api: { ...config.api },
    database: { configured: config.database.url.length > 0 },
    redis: { url: config.redis.url },
    comfyui: { ...config.comfyui },
    llm: {
      ...(config.llm.baseUrl === undefined ? {} : { baseUrl: config.llm.baseUrl }),
      ...(config.llm.model === undefined ? {} : { model: config.llm.model }),
      hasApiKey: config.llm.apiKey !== undefined,
    },
    media: { ...config.media },
    flags: { ...config.flags },
  };
}

export * from "./v2.ts";
