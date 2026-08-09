import { assertIsoTimestamp, assertNonEmptyString } from "./validation.ts";

export const LlmProviderProtocol = {
  OPENAI_COMPATIBLE: "OPENAI_COMPATIBLE",
  ANTHROPIC: "ANTHROPIC",
} as const;

export type LlmProviderProtocol =
  (typeof LlmProviderProtocol)[keyof typeof LlmProviderProtocol];

export interface LlmProviderProfile {
  id: string;
  name: string;
  protocol: LlmProviderProtocol;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxTokens: number;
  temperature: number;
  encryptedApiKey?: string;
  encryptionIv?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LlmProviderProfileInput {
  id: string;
  name: string;
  protocol: LlmProviderProtocol;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
  encryptedApiKey?: string;
  encryptionIv?: string;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ComfyUiSettings {
  id: string;
  baseUrl: string;
  timeoutMs: number;
  defaultWorkflowVersion?: string;
  autoImageIntentEnabled: boolean;
  updatedAt: string;
}

export interface ComfyUiSettingsInput {
  id: string;
  baseUrl: string;
  timeoutMs?: number;
  defaultWorkflowVersion?: string;
  autoImageIntentEnabled?: boolean;
  updatedAt: string;
}

function assertHttpUrl(value: string, field: string): void {
  assertNonEmptyString(value, field);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${field} must be a valid URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TypeError(`${field} must use http or https`);
  }
}

function assertPositiveInteger(value: number, field: string, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${field} must be an integer between 1 and ${maximum}`);
  }
}

export function assertLlmProviderProfile(value: LlmProviderProfile): void {
  assertNonEmptyString(value.id, "llmProviderProfile.id");
  assertNonEmptyString(value.name, "llmProviderProfile.name");
  if (!Object.values(LlmProviderProtocol).includes(value.protocol)) {
    throw new TypeError("llmProviderProfile.protocol is invalid");
  }
  assertHttpUrl(value.baseUrl, "llmProviderProfile.baseUrl");
  assertNonEmptyString(value.model, "llmProviderProfile.model");
  assertPositiveInteger(value.timeoutMs, "llmProviderProfile.timeoutMs", 600_000);
  assertPositiveInteger(value.maxTokens, "llmProviderProfile.maxTokens", 128_000);
  if (!Number.isFinite(value.temperature) || value.temperature < 0 || value.temperature > 2) {
    throw new RangeError("llmProviderProfile.temperature must be between 0 and 2");
  }
  if ((value.encryptedApiKey === undefined) !== (value.encryptionIv === undefined)) {
    throw new TypeError("llmProviderProfile encryptedApiKey and encryptionIv must be provided together");
  }
  if (value.encryptedApiKey !== undefined) {
    assertNonEmptyString(value.encryptedApiKey, "llmProviderProfile.encryptedApiKey");
    assertNonEmptyString(value.encryptionIv, "llmProviderProfile.encryptionIv");
  }
  assertIsoTimestamp(value.createdAt, "llmProviderProfile.createdAt");
  assertIsoTimestamp(value.updatedAt, "llmProviderProfile.updatedAt");
}

export function createLlmProviderProfile(input: LlmProviderProfileInput): LlmProviderProfile {
  const value: LlmProviderProfile = {
    id: input.id,
    name: input.name,
    protocol: input.protocol,
    baseUrl: input.baseUrl,
    model: input.model,
    timeoutMs: input.timeoutMs ?? 30_000,
    maxTokens: input.maxTokens ?? 800,
    temperature: input.temperature ?? 0.8,
    isActive: input.isActive ?? false,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
  if (input.encryptedApiKey !== undefined) value.encryptedApiKey = input.encryptedApiKey;
  if (input.encryptionIv !== undefined) value.encryptionIv = input.encryptionIv;
  assertLlmProviderProfile(value);
  return value;
}

export function assertComfyUiSettings(value: ComfyUiSettings): void {
  assertNonEmptyString(value.id, "comfyUiSettings.id");
  assertHttpUrl(value.baseUrl, "comfyUiSettings.baseUrl");
  assertPositiveInteger(value.timeoutMs, "comfyUiSettings.timeoutMs", 600_000);
  if (value.defaultWorkflowVersion !== undefined) {
    assertNonEmptyString(value.defaultWorkflowVersion, "comfyUiSettings.defaultWorkflowVersion");
  }
  assertIsoTimestamp(value.updatedAt, "comfyUiSettings.updatedAt");
}

export function createComfyUiSettings(input: ComfyUiSettingsInput): ComfyUiSettings {
  const value: ComfyUiSettings = {
    id: input.id,
    baseUrl: input.baseUrl,
    timeoutMs: input.timeoutMs ?? 30_000,
    autoImageIntentEnabled: input.autoImageIntentEnabled ?? false,
    updatedAt: input.updatedAt,
  };
  if (input.defaultWorkflowVersion !== undefined) value.defaultWorkflowVersion = input.defaultWorkflowVersion;
  assertComfyUiSettings(value);
  return value;
}
