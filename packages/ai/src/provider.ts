export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionRequest {
  messages: readonly ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json_object";
  trace?: import("./observability.ts").ChatTraceContext;
}

export interface ChatUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ChatCompletionResult {
  id: string;
  model: string;
  content: string;
  finishReason?: string;
  usage?: ChatUsage;
}

export interface ChatDelta {
  id?: string;
  model?: string;
  content?: string;
  finishReason?: string;
}

export interface ChatProvider {
  complete(request: ChatCompletionRequest): Promise<ChatCompletionResult>;
  stream(request: ChatCompletionRequest): AsyncIterable<ChatDelta>;
}

export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  observationHook?: import("./observability.ts").ChatObservationHook;
  profileContext?: { profileId?: string; profileName?: string; protocol?: string };
}

export type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ProviderErrorCode =
  | "CONFIGURATION"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "STREAM_ERROR";

export class ProviderError extends Error {
  public readonly code: ProviderErrorCode;
  public readonly retryable: boolean;
  public readonly status?: number;

  public constructor(
    code: ProviderErrorCode,
    message: string,
    options: { retryable?: boolean; status?: number } = {},
  ) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    if (options.status !== undefined) this.status = options.status;
  }
}

function assertRequest(request: ChatCompletionRequest, model: string | undefined): string {
  if (request.messages.length === 0) {
    throw new ProviderError("CONFIGURATION", "At least one chat message is required");
  }
  for (const [index, message] of request.messages.entries()) {
    if (message.content.trim().length === 0) {
      throw new ProviderError("CONFIGURATION", `Chat message ${index} has empty content`);
    }
  }
  const selectedModel = request.model ?? model;
  if (selectedModel === undefined || selectedModel.trim().length === 0) {
    throw new ProviderError("CONFIGURATION", "LLM model is required");
  }
  if (request.temperature !== undefined &&
      (!Number.isFinite(request.temperature) || request.temperature < 0)) {
    throw new ProviderError("CONFIGURATION", "temperature must be a non-negative finite number");
  }
  if (request.maxTokens !== undefined &&
      (!Number.isSafeInteger(request.maxTokens) || request.maxTokens < 1)) {
    throw new ProviderError("CONFIGURATION", "maxTokens must be a positive integer");
  }
  return selectedModel;
}

function parseBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed.length === 0) {
    throw new ProviderError("CONFIGURATION", "LLM baseUrl is required");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ProviderError("CONFIGURATION", "LLM baseUrl must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ProviderError("CONFIGURATION", "LLM baseUrl must use http or https");
  }
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseCompletionResponse(value: unknown): ChatCompletionResult {
  if (!isRecord(value)) {
    throw new ProviderError("INVALID_RESPONSE", "LLM response must be an object");
  }
  const choices = value.choices;
  if (!Array.isArray(choices) || choices.length === 0 || !isRecord(choices[0])) {
    throw new ProviderError("INVALID_RESPONSE", "LLM response has no choices");
  }
  const choice = choices[0];
  const message = choice.message;
  if (!isRecord(message) || typeof message.content !== "string") {
    throw new ProviderError("INVALID_RESPONSE", "LLM response choice has no text content");
  }
  if (typeof value.id !== "string" || typeof value.model !== "string") {
    throw new ProviderError("INVALID_RESPONSE", "LLM response is missing id or model");
  }
  const result: ChatCompletionResult = {
    id: value.id,
    model: value.model,
    content: message.content,
  };
  if (typeof choice.finish_reason === "string") result.finishReason = choice.finish_reason;
  if (isRecord(value.usage)) {
    const usage: ChatUsage = {};
    const promptTokens = numberOrUndefined(value.usage.prompt_tokens);
    const completionTokens = numberOrUndefined(value.usage.completion_tokens);
    const totalTokens = numberOrUndefined(value.usage.total_tokens);
    if (promptTokens !== undefined) usage.promptTokens = promptTokens;
    if (completionTokens !== undefined) usage.completionTokens = completionTokens;
    if (totalTokens !== undefined) usage.totalTokens = totalTokens;
    result.usage = usage;
  }
  return result;
}

function parseStreamPayload(value: unknown): ChatDelta {
  if (!isRecord(value) || !Array.isArray(value.choices) || !isRecord(value.choices[0])) {
    throw new ProviderError("STREAM_ERROR", "LLM stream event has an invalid shape");
  }
  const choice = value.choices[0];
  const result: ChatDelta = {};
  if (typeof value.id === "string") result.id = value.id;
  if (typeof value.model === "string") result.model = value.model;
  if (isRecord(choice.delta) && typeof choice.delta.content === "string") {
    result.content = choice.delta.content;
  }
  if (typeof choice.finish_reason === "string") result.finishReason = choice.finish_reason;
  return result;
}

async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
      if (chunk.done) break;
      let separator = buffer.indexOf("\n\n");
      while (separator >= 0) {
        const event = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data.length > 0) yield data;
        separator = buffer.indexOf("\n\n");
      }
    }
    const finalEvent = buffer.trim();
    if (finalEvent.length > 0) {
      const data = finalEvent
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data.length > 0) yield data;
    }
  } finally {
    reader.releaseLock();
  }
}

import { emitObservation } from "./observability.ts";

export class OpenAICompatibleProvider implements ChatProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly defaultModel: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchImplementation;
  private readonly observationHook: OpenAICompatibleConfig["observationHook"];
  private readonly profileContext: OpenAICompatibleConfig["profileContext"];

  public constructor(
    config: OpenAICompatibleConfig,
    fetchImpl: FetchImplementation = globalThis.fetch,
  ) {
    this.baseUrl = parseBaseUrl(config.baseUrl);
    this.apiKey = config.apiKey?.trim() || undefined;
    this.defaultModel = config.model?.trim() || undefined;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) {
      throw new ProviderError("CONFIGURATION", "timeoutMs must be a positive integer");
    }
    this.fetchImpl = fetchImpl;
    this.observationHook = config.observationHook;
    this.profileContext = config.profileContext;
  }

  public async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const model = assertRequest(request, this.defaultModel);
    const started = Date.now();
    const context = { ...(request.trace ? { trace: request.trace } : {}), ...this.profileContext, model };
    await emitObservation(this.observationHook, { name: "request_started", ...context });
    try {
      const response = await this.request(request, model, false);
      let payload: unknown;
      try { payload = await response.json(); } catch { throw new ProviderError("INVALID_RESPONSE", "LLM response body is not valid JSON"); }
      const result = parseCompletionResponse(payload);
      await emitObservation(this.observationHook, { name: "completed", ...context, model: result.model, durationMs: Date.now() - started, preview: result.content, outcome: "success" });
      return result;
    } catch (error) {
      const normalized = error instanceof ProviderError ? error : new ProviderError("NETWORK_ERROR", "LLM request failed", { retryable: true });
      await emitObservation(this.observationHook, { name: "error", ...context, durationMs: Date.now() - started, error: { code: normalized.code, ...(normalized.status === undefined ? {} : { status: normalized.status }), retryable: normalized.retryable, message: normalized.message } });
      throw error instanceof ProviderError ? error : normalized;
    }
  }

  public async *stream(request: ChatCompletionRequest): AsyncGenerator<ChatDelta> {
    const model = assertRequest(request, this.defaultModel);
    const started = Date.now(); let firstToken = false; let terminal = false;
    const context = { ...(request.trace ? { trace: request.trace } : {}), ...this.profileContext, model };
    await emitObservation(this.observationHook, { name: "request_started", ...context });
    try {
      const response = await this.request(request, model, true);
      if (response.body === null) throw new ProviderError("STREAM_ERROR", "LLM response has no stream body");
      for await (const data of readSseData(response.body)) {
        if (data === "[DONE]") { terminal = true; await emitObservation(this.observationHook, { name: "completed", ...context, durationMs: Date.now() - started, outcome: "success" }); return; }
        let payload: unknown;
        try { payload = JSON.parse(data); } catch { throw new ProviderError("STREAM_ERROR", "LLM stream event is not valid JSON"); }
        const delta = parseStreamPayload(payload);
        if (delta.content && !firstToken) { firstToken = true; await emitObservation(this.observationHook, { name: "first_token", ...context, durationMs: Date.now() - started, preview: delta.content }); }
        yield delta;
      }
      terminal = true;
      await emitObservation(this.observationHook, { name: "completed", ...context, durationMs: Date.now() - started, outcome: "success" });
    } catch (error) {
      const normalized = error instanceof ProviderError ? error : new ProviderError("STREAM_ERROR", "LLM stream failed", { retryable: true });
      terminal = true;
      await emitObservation(this.observationHook, { name: "error", ...context, durationMs: Date.now() - started, error: { code: normalized.code, ...(normalized.status === undefined ? {} : { status: normalized.status }), retryable: normalized.retryable, message: normalized.message } });
      throw error instanceof ProviderError ? error : normalized;
    } finally {
      if (!terminal) await emitObservation(this.observationHook, { name: "completed", ...context, durationMs: Date.now() - started, outcome: "cancelled" });
    }
  }
  private async request(
    request: ChatCompletionRequest,
    model: string,
    stream: boolean,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: stream ? "text/event-stream" : "application/json",
    };
    if (this.apiKey !== undefined) headers.authorization = `Bearer ${this.apiKey}`;
    const body: Record<string, unknown> = {
      model,
      messages: request.messages,
      stream,
    };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    if (request.responseFormat !== undefined && request.responseFormat !== "text") {
      body.response_format = { type: request.responseFormat };
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ProviderError("TIMEOUT", "LLM request timed out", { retryable: true });
      }
      throw new ProviderError(
        "NETWORK_ERROR",
        error instanceof Error ? "LLM request failed" : "LLM request failed",
        { retryable: true },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      let detail = "LLM provider returned an error";
      try {
        const text = await response.text();
        if (text.trim().length > 0) detail = text.slice(0, 2048);
      } catch {
        // Keep the bounded generic message when the error body cannot be read.
      }
      throw new ProviderError("HTTP_ERROR", detail, {
        status: response.status,
        retryable: errorRetryable(response.status),
      });
    }
    return response;
  }
}

export function createProviderFromConfig(
  config: { baseUrl?: string; apiKey?: string; model?: string; timeoutMs?: number },
  fetchImpl?: FetchImplementation,
): OpenAICompatibleProvider | undefined {
  if (config.baseUrl === undefined || config.baseUrl.trim().length === 0) {
    return undefined;
  }
  return new OpenAICompatibleProvider(
    {
      baseUrl: config.baseUrl,
      ...(config.apiKey === undefined ? {} : { apiKey: config.apiKey }),
      ...(config.model === undefined ? {} : { model: config.model }),
      ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
    },
    fetchImpl,
  );
}
