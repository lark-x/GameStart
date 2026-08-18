import { randomUUID } from "node:crypto";

import { SecretCipher } from "@living-network/ai";
import {
  createV2ChatProvider,
  ProviderError,
  type ChatCompletionRequest,
  type ChatCompletionResult,
  type ChatContent,
  type ChatDelta,
  type ChatProvider,
} from "@living-network/ai/v2";
import {
  createV2ModelCallLog,
} from "@living-network/database/v2";
import {
  normalizeV2ModelLogMessages,
  normalizeV2ModelLogResponse,
  redactV2ModelLogText,
  V2ModelCapability,
  type V2ModelLogMessage,
  type V2StoredModelProfile,
} from "@living-network/contracts/v2";
import type { V2PlatformRepository } from "@living-network/ports/v2";

export interface V2DynamicModelFallback {
  readonly protocol: "openai-compatible" | "anthropic";
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly model?: string;
  readonly timeoutMs: number;
}

export interface V2DynamicModelProviderOptions {
  readonly repository: V2PlatformRepository;
  readonly secretCipher?: SecretCipher;
  readonly capability: V2ModelCapability;
  readonly fallback: V2DynamicModelFallback;
  readonly now?: () => Date;
}

interface ResolvedModel {
  readonly profile?: V2StoredModelProfile;
  readonly protocol: "openai-compatible" | "anthropic";
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly maxTokens: number;
  readonly temperature: number;
}

function logContent(content: ChatContent): string {
  if (typeof content === "string") return content;
  return content.map((part) => part.type === "text"
    ? part.text
    : `[image:${part.mediaType};${part.dataBase64.length} base64 characters]`).join("\n");
}

function logMessages(request: ChatCompletionRequest): { readonly messages: readonly V2ModelLogMessage[]; readonly truncated: boolean } {
  return normalizeV2ModelLogMessages(request.messages.map((message) => ({ role: message.role, content: logContent(message.content) })));
}

function providerError(error: unknown): {
  readonly code: string;
  readonly status?: number;
  readonly retryable?: boolean;
  readonly message: string;
} {
  const value = error as { readonly code?: unknown; readonly status?: unknown; readonly retryable?: unknown };
  return {
    code: typeof value.code === "string" ? value.code : "MODEL_ERROR",
    ...(typeof value.status === "number" ? { status: value.status } : {}),
    ...(typeof value.retryable === "boolean" ? { retryable: value.retryable } : {}),
    message: redactV2ModelLogText(error instanceof Error ? error.message : String(error)),
  };
}

function traceFor(request: ChatCompletionRequest, fallbackCapability: V2ModelCapability): NonNullable<ChatCompletionRequest["trace"]> {
  const capability = request.trace?.capability ?? fallbackCapability;
  return request.trace === undefined
    ? { correlationId: `v2:model-call:${randomUUID()}`, capability }
    : { ...request.trace, capability };
}

function requestWithDefaults(request: ChatCompletionRequest, model: ResolvedModel, trace: NonNullable<ChatCompletionRequest["trace"]>): ChatCompletionRequest {
  return {
    ...request,
    model: request.model ?? model.model,
    temperature: request.temperature ?? model.temperature,
    maxTokens: request.maxTokens ?? model.maxTokens,
    trace,
  };
}

export class V2DynamicModelProvider implements ChatProvider {
  private readonly repository: V2PlatformRepository;
  private readonly secretCipher: SecretCipher | undefined;
  private readonly capability: V2ModelCapability;
  private readonly fallback: V2DynamicModelFallback;
  private readonly now: () => Date;

  public constructor(options: V2DynamicModelProviderOptions) {
    this.repository = options.repository;
    this.secretCipher = options.secretCipher;
    this.capability = options.capability;
    this.fallback = options.fallback;
    this.now = options.now ?? (() => new Date());
  }

  public async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const startedAt = this.now();
    const trace = traceFor(request, this.capability);
    const requestLog = logMessages(request);
    const model = await this.resolveModel();
    const provider = createV2ChatProvider({
      protocol: model.protocol,
      baseUrl: model.baseUrl,
      ...(model.apiKey === undefined ? {} : { apiKey: model.apiKey }),
      model: model.model,
      timeoutMs: model.timeoutMs,
    });
    const log = createV2ModelCallLog({
      capability: this.capability,
      startedAt: startedAt.toISOString(),
      ...(model.profile === undefined ? {} : { profileId: model.profile.id, profileName: model.profile.name }),
      protocol: model.protocol,
      model: model.model,
      correlationId: trace.correlationId,
      ...(trace.jobId === undefined ? {} : { jobId: trace.jobId }),
      ...(trace.storyWorldId ?? trace.worldId) === undefined ? {} : { storyWorldId: trace.storyWorldId ?? trace.worldId },
      requestMessages: requestLog.messages,
      requestTruncated: requestLog.truncated,
    });
    let logStarted = false;
    try {
      await this.repository.startModelCall({ log });
      logStarted = true;
      const result = await provider.complete(requestWithDefaults(request, model, trace));
      const endedAt = this.now();
      const response = normalizeV2ModelLogResponse(result.content);
      await this.repository.completeModelCall({
        id: log.id,
        completedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - startedAt.getTime(),
        providerResponseId: result.id,
        model: result.model,
        ...(result.usage?.promptTokens === undefined ? {} : { promptTokens: result.usage.promptTokens }),
        ...(result.usage?.completionTokens === undefined ? {} : { completionTokens: result.usage.completionTokens }),
        ...(result.usage?.totalTokens === undefined ? {} : { totalTokens: result.usage.totalTokens }),
        ...(result.finishReason === undefined ? {} : { finishReason: result.finishReason }),
        responseText: response.value,
        responseTruncated: response.truncated,
      });
      return result;
    } catch (error) {
      if (logStarted) await this.failLog(log.id, startedAt, providerError(error));
      throw error;
    }
  }

  public async *stream(request: ChatCompletionRequest): AsyncGenerator<ChatDelta> {
    const startedAt = this.now();
    const trace = traceFor(request, this.capability);
    const requestLog = logMessages(request);
    const model = await this.resolveModel();
    const provider = createV2ChatProvider({
      protocol: model.protocol,
      baseUrl: model.baseUrl,
      ...(model.apiKey === undefined ? {} : { apiKey: model.apiKey }),
      model: model.model,
      timeoutMs: model.timeoutMs,
    });
    const log = createV2ModelCallLog({
      capability: this.capability,
      startedAt: startedAt.toISOString(),
      ...(model.profile === undefined ? {} : { profileId: model.profile.id, profileName: model.profile.name }),
      protocol: model.protocol,
      model: model.model,
      correlationId: trace.correlationId,
      ...(trace.jobId === undefined ? {} : { jobId: trace.jobId }),
      ...(trace.storyWorldId ?? trace.worldId) === undefined ? {} : { storyWorldId: trace.storyWorldId ?? trace.worldId },
      requestMessages: requestLog.messages,
      requestTruncated: requestLog.truncated,
    });
    let logStarted = false;
    let settled = false;
    try {
      await this.repository.startModelCall({ log });
      logStarted = true;
      let content = "";
      let responseId: string | undefined;
      let responseModel: string | undefined;
      let finishReason: string | undefined;
      for await (const delta of provider.stream(requestWithDefaults(request, model, trace))) {
        if (delta.content !== undefined) content += delta.content;
        if (delta.id !== undefined) responseId = delta.id;
        if (delta.model !== undefined) responseModel = delta.model;
        if (delta.finishReason !== undefined) finishReason = delta.finishReason;
        yield delta;
      }
      const endedAt = this.now();
      const response = normalizeV2ModelLogResponse(content);
      await this.repository.completeModelCall({
        id: log.id,
        completedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - startedAt.getTime(),
        ...(responseId === undefined ? {} : { providerResponseId: responseId }),
        ...(responseModel === undefined ? {} : { model: responseModel }),
        ...(finishReason === undefined ? {} : { finishReason }),
        responseText: response.value,
        responseTruncated: response.truncated,
      });
      settled = true;
    } catch (error) {
      if (logStarted) {
        await this.failLog(log.id, startedAt, providerError(error));
        settled = true;
      }
      throw error;
    } finally {
      if (logStarted && !settled) {
        await this.failLog(log.id, startedAt, {
          code: "INTERRUPTED",
          retryable: false,
          message: "Model stream was interrupted before completion",
        });
      }
    }
  }

  private async resolveModel(): Promise<ResolvedModel> {
    const binding = await this.repository.getModelBinding(this.capability);
    if (binding?.profileId !== undefined) {
      const profile = await this.repository.getModelProfile(binding.profileId);
      if (profile === undefined) {
        throw new ProviderError("CONFIGURATION", `Bound model profile was not found: ${binding.profileId}`);
      }
      let apiKey: string | undefined;
      if (profile.encryptedApiKey !== undefined || profile.encryptionIv !== undefined) {
        if (profile.encryptedApiKey === undefined || profile.encryptionIv === undefined || this.secretCipher === undefined) {
          throw new ProviderError("CONFIGURATION", "INTEGRATION_SECRET_KEY is required to decrypt the bound model API key");
        }
        try {
          apiKey = this.secretCipher.decrypt({ ciphertext: profile.encryptedApiKey, iv: profile.encryptionIv });
        } catch {
          throw new ProviderError("CONFIGURATION", "The bound model API key cannot be decrypted");
        }
      }
      return {
        profile,
        protocol: profile.protocol,
        baseUrl: profile.baseUrl,
        ...(apiKey === undefined ? {} : { apiKey }),
        model: profile.model,
        timeoutMs: profile.timeoutMs,
        maxTokens: profile.maxTokens,
        temperature: profile.temperature,
      };
    }
    if (this.fallback.baseUrl === undefined || this.fallback.model === undefined) {
      throw new ProviderError("CONFIGURATION", "No scene generation model is configured");
    }
    return {
      protocol: this.fallback.protocol,
      baseUrl: this.fallback.baseUrl,
      ...(this.fallback.apiKey === undefined ? {} : { apiKey: this.fallback.apiKey }),
      model: this.fallback.model,
      timeoutMs: this.fallback.timeoutMs,
      maxTokens: 4096,
      temperature: 0.2,
    };
  }

  private async failLog(
    id: string,
    startedAt: Date,
    error: { readonly code: string; readonly status?: number; readonly retryable?: boolean; readonly message: string },
  ): Promise<void> {
    const endedAt = this.now();
    await this.repository.failModelCall({
      id,
      completedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - startedAt.getTime(),
      errorCode: error.code,
      ...(error.status === undefined ? {} : { errorStatus: error.status }),
      ...(error.retryable === undefined ? {} : { errorRetryable: error.retryable }),
      errorMessage: error.message,
    });
  }
}
