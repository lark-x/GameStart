import { emitObservation } from "./observability.ts";
import {
  ProviderError,
  type ChatCompletionRequest,
  type ChatCompletionResult,
  type ChatDelta,
  type ChatContent,
  type ChatMessage,
  type ChatProvider,
  type FetchImplementation,
} from "./provider.ts";

export interface AnthropicConfig {
  baseUrl: string;
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  apiVersion?: string;
  observationHook?: import("./observability.ts").ChatObservationHook;
  profileContext?: { profileId?: string; profileName?: string; protocol?: string };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed.length === 0) throw new ProviderError("CONFIGURATION", "Anthropic baseUrl is required");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ProviderError("CONFIGURATION", "Anthropic baseUrl must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ProviderError("CONFIGURATION", "Anthropic baseUrl must use http or https");
  }
  return trimmed;
}

function hasContentValue(content: ChatContent): boolean {
  if (typeof content === "string") return content.trim().length > 0;
  return content.some((part) => part.type === "text"
    ? part.text.trim().length > 0
    : part.mediaType.trim().length > 0 && part.dataBase64.trim().length > 0);
}

function validateRequest(request: ChatCompletionRequest, fallback: string | undefined): string {
  if (request.messages.length === 0) throw new ProviderError("CONFIGURATION", "At least one chat message is required");
  for (const [index, message] of request.messages.entries()) {
    if (!hasContentValue(message.content)) {
      throw new ProviderError("CONFIGURATION", `Chat message ${index} has empty content`);
    }
  }
  const model = request.model ?? fallback;
  if (!model?.trim()) throw new ProviderError("CONFIGURATION", "LLM model is required");
  if (request.maxTokens !== undefined && (!Number.isSafeInteger(request.maxTokens) || request.maxTokens < 1)) {
    throw new ProviderError("CONFIGURATION", "maxTokens must be a positive integer");
  }
  if (request.temperature !== undefined && (!Number.isFinite(request.temperature) || request.temperature < 0)) {
    throw new ProviderError("CONFIGURATION", "temperature must be a non-negative finite number");
  }
  return model;
}

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

function textFromContent(content: ChatContent): string {
  if (typeof content === "string") return content;
  return content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
}

function anthropicBlocks(content: ChatContent): AnthropicBlock[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content.map((part) => part.type === "text"
    ? { type: "text", text: part.text }
    : { type: "image", source: { type: "base64", media_type: part.mediaType, data: part.dataBase64 } });
}

function splitMessages(messages: readonly ChatMessage[]): { system?: string; messages: { role: "user" | "assistant"; content: AnthropicBlock[] }[] } {
  const systems = messages.filter((message) => message.role === "system").map((message) => textFromContent(message.content)).filter((content) => content.trim().length > 0);
  const turns: { role: "user" | "assistant"; content: AnthropicBlock[] }[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    const role = message.role;
    const blocks = anthropicBlocks(message.content);
    const previous = turns.at(-1);
    if (previous?.role === role) previous.content = [...previous.content, { type: "text", text: "\n" }, ...blocks];
    else turns.push({ role, content: blocks });
  }
  if (turns.length === 0) throw new ProviderError("CONFIGURATION", "Anthropic requests require a user or assistant message");
  return { ...(systems.length === 0 ? {} : { system: systems.join("\n\n") }), messages: turns };
}

function errorRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const consume = function* (block: string): Generator<{ event: string; data: string }> {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (data.length > 0) yield { event, data: data.join("\n") };
  };
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
      let separator: number;
      while ((separator = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator).replace(/^\r?\n\r?\n/, "");
        yield* consume(block);
      }
      if (chunk.done) break;
    }
    if (buffer.trim().length > 0) yield* consume(buffer);
  } finally {
    reader.releaseLock();
  }
}

export class AnthropicProvider implements ChatProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultModel: string | undefined;
  private readonly timeoutMs: number;
  private readonly apiVersion: string;
  private readonly fetchImpl: FetchImplementation;
  private readonly observationHook: AnthropicConfig["observationHook"];
  private readonly profileContext: AnthropicConfig["profileContext"];

  public constructor(config: AnthropicConfig, fetchImpl: FetchImplementation = globalThis.fetch) {
    this.baseUrl = parseUrl(config.baseUrl);
    if (!config.apiKey.trim()) throw new ProviderError("CONFIGURATION", "Anthropic API key is required");
    this.apiKey = config.apiKey.trim();
    this.defaultModel = config.model?.trim() || undefined;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) {
      throw new ProviderError("CONFIGURATION", "timeoutMs must be a positive integer");
    }
    this.apiVersion = config.apiVersion ?? "2023-06-01";
    this.fetchImpl = fetchImpl;
    this.observationHook = config.observationHook;
    this.profileContext = config.profileContext;
  }

  public async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const model = validateRequest(request, this.defaultModel);
    const started = Date.now();
    const context = { ...(request.trace ? { trace: request.trace } : {}), ...this.profileContext, model, requestMessages: request.messages };
    await emitObservation(this.observationHook, { name: "request_started", ...context });
    try {
      const response = await this.request(request, model, false);
      let payload: unknown;
      try {
        const text = await readBodyWithTimeout(response, this.timeoutMs);
        payload = JSON.parse(text);
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        throw new ProviderError("INVALID_RESPONSE", "Anthropic response body is not valid JSON");
      }
      if (!record(payload) || typeof payload.id !== "string" || typeof payload.model !== "string" || !Array.isArray(payload.content)) throw new ProviderError("INVALID_RESPONSE", "Anthropic response has an invalid shape");
      const content = payload.content.filter(record).filter((part) => part.type === "text" && typeof part.text === "string").map((part) => part.text as string).join("");
      if (!content) throw new ProviderError("INVALID_RESPONSE", "Anthropic response has no text content");
      const result: ChatCompletionResult = { id: payload.id, model: payload.model, content };
      if (typeof payload.stop_reason === "string") result.finishReason = payload.stop_reason;
      if (record(payload.usage)) {
        const promptTokens = numberValue(payload.usage.input_tokens); const completionTokens = numberValue(payload.usage.output_tokens);
        result.usage = { ...(promptTokens === undefined ? {} : { promptTokens }), ...(completionTokens === undefined ? {} : { completionTokens }), ...(promptTokens === undefined || completionTokens === undefined ? {} : { totalTokens: promptTokens + completionTokens }) };
      }
      await emitObservation(this.observationHook, { name: "completed", ...context, model: result.model, durationMs: Date.now() - started, preview: result.content, outcome: "success" });
      return result;
    } catch (error) {
      const normalized = error instanceof ProviderError ? error : new ProviderError("NETWORK_ERROR", "Anthropic request failed", { retryable: true });
      await emitObservation(this.observationHook, { name: "error", ...context, durationMs: Date.now() - started, error: { code: normalized.code, ...(normalized.status === undefined ? {} : { status: normalized.status }), retryable: normalized.retryable, message: normalized.message } });
      throw error instanceof ProviderError ? error : normalized;
    }
  }

  public async *stream(request: ChatCompletionRequest): AsyncGenerator<ChatDelta> {
    const model = validateRequest(request, this.defaultModel);
    const started = Date.now(); let firstToken = false; let terminal = false; let responsePreview = "";
    const context = { ...(request.trace ? { trace: request.trace } : {}), ...this.profileContext, model, requestMessages: request.messages };
    await emitObservation(this.observationHook, { name: "request_started", ...context });
    const streamController = new AbortController();
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const resetIdle = (): void => {
      if (idleTimer !== undefined) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => streamController.abort(), this.timeoutMs);
    };
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await this.request(request, model, true);
      if (!response.body) throw new ProviderError("STREAM_ERROR", "Anthropic response has no stream body");
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      resetIdle();
      const readEvent = async (): Promise<{ done: boolean; event?: { event: string; data: string } }> => {
        const result = await reader!.read();
        if (result.done) {
          if (buffer.trim().length > 0) {
            let ev = "message"; const data: string[] = [];
            for (const line of buffer.split(/\r?\n/)) {
              if (line.startsWith("event:")) ev = line.slice(6).trim();
              if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
            }
            buffer = "";
            if (data.length > 0) return { done: false, event: { event: ev, data: data.join("\n") } };
          }
          return { done: true };
        }
        buffer += decoder.decode(result.value, { stream: true });
        const sep = buffer.search(/\r?\n\r?\n/);
        if (sep < 0) return { done: false };
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, "");
        let ev = "message"; const data: string[] = [];
        for (const line of block.split(/\r?\n/)) {
          if (line.startsWith("event:")) ev = line.slice(6).trim();
          if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
        }
        return data.length > 0 ? { done: false, event: { event: ev, data: data.join("\n") } } : { done: false };
      };
      while (true) {
        let chunk;
        try { chunk = await readEvent(); } catch (e) {
          if (streamController.signal.aborted) throw new ProviderError("TIMEOUT", "Anthropic stream idle timeout", { retryable: true });
          throw e;
        }
        if (chunk.done) break;
        if (chunk.event === undefined) continue;
        resetIdle();
        const event = chunk.event;
        if (event.event === "ping") continue;
        let payload: unknown;
        try { payload = JSON.parse(event.data); } catch { throw new ProviderError("STREAM_ERROR", "Anthropic stream event is not valid JSON"); }
        if (!record(payload)) throw new ProviderError("STREAM_ERROR", "Anthropic stream event has an invalid shape");
        if (event.event === "error" || payload.type === "error") {
          const detail = record(payload.error) && typeof payload.error.message === "string" ? payload.error.message : "Anthropic stream failed";
          throw new ProviderError("HTTP_ERROR", detail, { retryable: true });
        }
        if (payload.type === "content_block_delta" && record(payload.delta) && payload.delta.type === "text_delta" && typeof payload.delta.text === "string") {
          responsePreview = `${responsePreview}${payload.delta.text}`.slice(0, 500);
          if (!firstToken) { firstToken = true; await emitObservation(this.observationHook, { name: "first_token", ...context, durationMs: Date.now() - started, preview: payload.delta.text }); }
          yield { content: payload.delta.text };
        }
        if (payload.type === "message_delta" && record(payload.delta) && typeof payload.delta.stop_reason === "string") yield { finishReason: payload.delta.stop_reason };
      }
      terminal = true;
      await emitObservation(this.observationHook, { name: "completed", ...context, durationMs: Date.now() - started, preview: responsePreview, outcome: "success" });
    } catch (error) {
      const normalized = error instanceof ProviderError ? error : new ProviderError("STREAM_ERROR", "Anthropic stream failed", { retryable: true });
      terminal = true;
      await emitObservation(this.observationHook, { name: "error", ...context, durationMs: Date.now() - started, error: { code: normalized.code, ...(normalized.status === undefined ? {} : { status: normalized.status }), retryable: normalized.retryable, message: normalized.message } });
      throw error instanceof ProviderError ? error : normalized;
    } finally {
      if (idleTimer !== undefined) clearTimeout(idleTimer);
      if (reader) { try { reader.releaseLock(); } catch { /* already released */ } }
      if (!terminal) await emitObservation(this.observationHook, { name: "completed", ...context, durationMs: Date.now() - started, outcome: "cancelled" });
    }
  }
  private async request(request: ChatCompletionRequest, model: string, stream: boolean): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const input = splitMessages(request.messages);
    const payload: Record<string, unknown> = {
      model,
      max_tokens: request.maxTokens ?? 800,
      messages: input.messages,
      stream,
      ...(input.system === undefined ? {} : { system: input.system }),
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    };
    try {
      const endpoint = this.baseUrl.endsWith("/v1") ? `${this.baseUrl}/messages` : `${this.baseUrl}/v1/messages`;
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: stream ? "text/event-stream" : "application/json", "x-api-key": this.apiKey, "anthropic-version": this.apiVersion },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (response.ok) return response;
      let detail = "Anthropic provider returned an error";
      try { const text = await response.text(); if (text.trim()) detail = text.slice(0, 2048); } catch { /* bounded fallback */ }
      throw new ProviderError("HTTP_ERROR", detail, { status: response.status, retryable: errorRetryable(response.status) });
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (controller.signal.aborted) throw new ProviderError("TIMEOUT", "Anthropic request timed out", { retryable: true });
      throw new ProviderError("NETWORK_ERROR", "Anthropic request failed", { retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }
}
import { readBodyWithTimeout } from "./read-timeout.ts";
