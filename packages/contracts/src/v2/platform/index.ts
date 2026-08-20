import type { V2PageRequest, V2Page } from "../shared/primitives.ts";

export const V2ModelCapability = {
  CHAT: "chat",
  SCENE_GENERATION: "scene_generation",
  MEMORY: "memory",
  STORY_ANALYSIS: "story_analysis",
} as const;

export type V2ModelCapability = (typeof V2ModelCapability)[keyof typeof V2ModelCapability];
export const V2RuntimeCapability = {
  SCENE_GENERATION: "scene_generation",
  ASSET_GENERATION: "asset_generation",
} as const;
export type V2RuntimeCapability = (typeof V2RuntimeCapability)[keyof typeof V2RuntimeCapability];
export type V2ModelInputModality = "text" | "image";
export type V2ModelProtocol = "openai-compatible" | "anthropic";
export type V2ModelCallStatus = "running" | "success" | "error" | "interrupted";
export type V2ExternalCapabilityConfiguration = "complete" | "incomplete";
export type V2ExternalCapabilityBinding = "bound" | "unbound" | "not-applicable";
export type V2ExternalCapabilityConnection = "untested" | "checking" | "ok" | "failed";
export type V2ExternalServiceKind = "model" | "comfyui";

export interface V2ModelProfileDto {
  readonly id: string;
  readonly name: string;
  readonly protocol: V2ModelProtocol;
  readonly baseUrl: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly maxTokens: number;
  readonly contextWindow?: number | undefined;
  readonly inputModalities?: readonly string[] | undefined;
  readonly temperature: number;
  readonly hasApiKey: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface V2SaveModelProfileRequest {
  readonly id?: string | undefined;
  readonly name: string;
  readonly protocol: V2ModelProtocol;
  readonly baseUrl: string;
  readonly model: string;
  readonly timeoutMs?: number | undefined;
  readonly maxTokens?: number | undefined;
  readonly contextWindow?: number | undefined;
  readonly inputModalities?: readonly string[] | undefined;
  readonly temperature?: number | undefined;
  readonly apiKey?: string | undefined;
  readonly sourceProfileId?: string | undefined;
}

export interface V2DiscoverModelsRequest {
  readonly protocol: V2ModelProtocol;
  readonly baseUrl: string;
  readonly apiKey?: string | undefined;
  readonly profileId?: string | undefined;
}

export interface V2DiscoverModelsResponse {
  readonly models: readonly string[];
}

export interface V2StoredModelProfile {
  readonly id: string;
  readonly name: string;
  readonly protocol: V2ModelProtocol;
  readonly baseUrl: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly maxTokens: number;
  readonly contextWindow?: number;
  readonly inputModalities?: readonly string[];
  readonly temperature: number;
  readonly encryptedApiKey?: string;
  readonly encryptionIv?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface V2ModelBindingDto {
  readonly capability: V2ModelCapability;
  readonly profileId?: string;
  readonly profileName?: string;
  readonly updatedAt?: string;
}

export interface V2SetModelBindingRequest {
  readonly profileId?: string | null;
}

export interface V2CapabilityToggleRequest {
  readonly enabled: boolean;
}

export interface V2CapabilitySettingDto {
  readonly capability: V2RuntimeCapability;
  readonly enabled: boolean;
  readonly updatedAt: string;
}

export interface V2ImageServiceSettingsDto {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly defaultWorkflowVersion?: string;
}

export interface V2SaveImageServiceSettingsRequest {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly defaultWorkflowVersion?: string;
}

export interface V2ExternalConnectionCheckDto {
  readonly service: V2ExternalServiceKind;
  readonly connection: V2ExternalCapabilityConnection;
  readonly checkedAt: string;
  readonly durationMs?: number;
  readonly errorMessage?: string;
}

export interface V2AppearanceSettingsDto {
  readonly themeId: string;
  readonly updatedAt?: string;
}

export interface V2SaveAppearanceSettingsRequest {
  readonly themeId: string;
}

export interface V2ModelLogMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export const V2ModelLogLimits = {
  MAX_TEXT_LENGTH: 256 * 1024,
} as const;

export function redactV2ModelLogText(value: string): string {
  return value
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/(api[-_ ]?key|token|secret|password)\s*[:=]\s*[^,\s}]+/gi, "$1=[REDACTED]");
}

export function normalizeV2ModelLogMessages(messages: readonly V2ModelLogMessage[]): {
  readonly messages: readonly V2ModelLogMessage[];
  readonly truncated: boolean;
} {
  const safe = messages.map((message) => ({ role: message.role, content: redactV2ModelLogText(message.content) }));
  const serialized = JSON.stringify(safe);
  if (serialized.length <= V2ModelLogLimits.MAX_TEXT_LENGTH) return { messages: safe, truncated: false };
  const budget = Math.max(128, Math.floor(V2ModelLogLimits.MAX_TEXT_LENGTH / Math.max(safe.length, 1)) - 64);
  return {
    messages: safe.map((message) => ({ ...message, content: message.content.slice(0, budget) })),
    truncated: true,
  };
}

export function normalizeV2ModelLogResponse(value: string): { readonly value: string; readonly truncated: boolean } {
  const safe = redactV2ModelLogText(value);
  return safe.length > V2ModelLogLimits.MAX_TEXT_LENGTH
    ? { value: safe.slice(0, V2ModelLogLimits.MAX_TEXT_LENGTH), truncated: true }
    : { value: safe, truncated: false };
}

export interface V2ModelCallLogDto {
  readonly id: string;
  readonly status: V2ModelCallStatus;
  readonly capability: V2ModelCapability | string;
  readonly profileId?: string;
  readonly profileName?: string;
  readonly protocol?: V2ModelProtocol;
  readonly model?: string;
  readonly correlationId?: string;
  readonly jobId?: string;
  readonly storyWorldId?: string;
  readonly providerResponseId?: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
  readonly finishReason?: string;
  readonly requestMessages?: readonly V2ModelLogMessage[];
  readonly responseText?: string;
  readonly requestTruncated: boolean;
  readonly responseTruncated: boolean;
  readonly errorCode?: string;
  readonly errorStatus?: number;
  readonly errorRetryable?: boolean;
  readonly errorMessage?: string;
}

export interface V2ModelCallLogQuery extends V2PageRequest {
  readonly status?: V2ModelCallStatus;
  readonly capability?: string;
  readonly profileId?: string;
  readonly model?: string;
  readonly correlationId?: string;
  readonly jobId?: string;
  readonly storyWorldId?: string;
  readonly query?: string;
  readonly createdAfter?: string;
  readonly createdBefore?: string;
}

export type V2ModelCallLogPage = V2Page<V2ModelCallLogDto>;

export interface V2PlatformCapabilities {
  readonly sceneGeneration: {
    readonly enabled: boolean;
    readonly configuration: V2ExternalCapabilityConfiguration;
    readonly binding: V2ExternalCapabilityBinding;
    readonly connection: V2ExternalCapabilityConnection;
    readonly lastCheckedAt?: string;
    readonly errorMessage?: string;
    readonly configured: boolean;
    readonly source: "profile" | "environment" | "none";
    readonly reason?: "disabled_by_environment" | "profile_missing" | "secret_unavailable";
  };
  readonly assetGeneration: {
    readonly enabled: boolean;
    readonly configuration: V2ExternalCapabilityConfiguration;
    readonly binding: V2ExternalCapabilityBinding;
    readonly connection: V2ExternalCapabilityConnection;
    readonly lastCheckedAt?: string;
    readonly errorMessage?: string;
    readonly configured: boolean;
    readonly source: "settings" | "environment" | "none";
    readonly reason?: "disabled_by_environment" | "settings_missing";
  };
}
