import type { JsonObject } from "@living-network/domain";
import type { ComfyUiProgressEvent, ComfyUiResult, ComfyUiSubmitRequest, ComfyUiSubmitResult, ComfyUiWebSocket, ComfyUiWebSocketFactory, ComfyUiClient, ComfyUiProgressClient } from "./comfyui-types.ts";

export type ComfyUiFetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ComfyUiErrorCode =
  | "CONFIGURATION"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "NOT_READY";

export class ComfyUiError extends Error {
  public readonly code: ComfyUiErrorCode;
  public readonly retryable: boolean;
  public readonly status?: number;

  public constructor(
    code: ComfyUiErrorCode,
    message: string,
    options: { retryable?: boolean; status?: number } = {},
  ) {
    super(message);
    this.name = "ComfyUiError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    if (options.status !== undefined) this.status = options.status;
  }
}

export interface ComfyUiHttpConfig {
  baseUrl: string;
  timeoutMs?: number;
  clientId?: string;
  webSocketFactory?: ComfyUiWebSocketFactory;
}

function parseComfyUiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed.length === 0) throw new ComfyUiError("CONFIGURATION", "ComfyUI baseUrl is required");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ComfyUiError("CONFIGURATION", "ComfyUI baseUrl must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ComfyUiError("CONFIGURATION", "ComfyUI baseUrl must use http or https");
  }
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseComfyUiProgressEvent(
  value: unknown,
  externalJobId: string,
): ComfyUiProgressEvent | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  const data = isRecord(value.data) ? value.data : {};
  const promptId = data.prompt_id;
  if (promptId !== undefined && promptId !== externalJobId) return undefined;
  if (value.type === "progress") {
    if (typeof data.value !== "number" || typeof data.max !== "number") return undefined;
    return {
      externalJobId,
      kind: "progress",
      ...(typeof data.node === "string" ? { nodeId: data.node } : {}),
      value: data.value,
      max: data.max,
    };
  }
  if (value.type === "executing") {
    if (data.node === null) return { externalJobId, kind: "completed" };
    return {
      externalJobId,
      kind: "executing",
      ...(typeof data.node === "string" ? { nodeId: data.node } : {}),
    };
  }
  if (value.type === "execution_success") return { externalJobId, kind: "completed" };
  if (value.type === "execution_error") {
    return {
      externalJobId,
      kind: "error",
      message: typeof data.exception_message === "string" ? data.exception_message.slice(0, 2048) : "ComfyUI execution failed",
    };
  }
  return undefined;
}

function defaultWebSocketFactory(url: string): ComfyUiWebSocket {
  const constructor = (globalThis as unknown as { WebSocket?: new (url: string) => ComfyUiWebSocket }).WebSocket;
  if (constructor === undefined) {
    throw new ComfyUiError("CONFIGURATION", "WebSocket is not available in this runtime");
  }
  return new constructor(url);
}

function firstHistoryImage(value: unknown, externalJobId: string): {
  filename: string;
  subfolder: string;
  type: string;
} {
  if (!isRecord(value)) throw new ComfyUiError("INVALID_RESPONSE", "ComfyUI history must be an object");
  const history = value[externalJobId];
  if (!isRecord(history)) throw new ComfyUiError("NOT_READY", "ComfyUI job has no history yet", { retryable: true });
  const outputs = history.outputs;
  if (!isRecord(outputs)) throw new ComfyUiError("NOT_READY", "ComfyUI job has no outputs yet", { retryable: true });
  for (const output of Object.values(outputs)) {
    if (!isRecord(output) || !Array.isArray(output.images)) continue;
    for (const image of output.images) {
      if (!isRecord(image) || typeof image.filename !== "string") continue;
      return {
        filename: image.filename,
        subfolder: typeof image.subfolder === "string" ? image.subfolder : "",
        type: typeof image.type === "string" ? image.type : "output",
      };
    }
  }
  throw new ComfyUiError("NOT_READY", "ComfyUI job has no image output yet", { retryable: true });
}

export class ComfyUiHttpClient implements ComfyUiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly clientId: string;
  private readonly fetchImpl: ComfyUiFetchImplementation;
  private readonly webSocketFactory: ComfyUiWebSocketFactory;

  public constructor(
    config: ComfyUiHttpConfig,
    fetchImpl: ComfyUiFetchImplementation = globalThis.fetch,
  ) {
    this.baseUrl = parseComfyUiBaseUrl(config.baseUrl);
    this.timeoutMs = config.timeoutMs ?? 30_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) {
      throw new ComfyUiError("CONFIGURATION", "ComfyUI timeoutMs must be a positive integer");
    }
    this.clientId = config.clientId?.trim() || "living-network-worker";
    this.fetchImpl = fetchImpl;
    this.webSocketFactory = config.webSocketFactory ?? defaultWebSocketFactory;
  }

  public async submit(request: ComfyUiSubmitRequest): Promise<ComfyUiSubmitResult> {
    if (request.workflow === undefined) {
      throw new ComfyUiError("CONFIGURATION", "ComfyUI workflow is required for HTTP submission");
    }
    const payload: Record<string, unknown> = {
      prompt: request.workflow,
      client_id: this.clientId,
      extra_data: {
        living_network_job_id: request.jobId,
        workflow_version: request.workflowVersion,
        prompt: request.prompt,
        ...(request.negativePrompt === undefined ? {} : { negative_prompt: request.negativePrompt }),
        ...(request.seed === undefined ? {} : { seed: request.seed }),
      },
    };
    const response = await this.request("/prompt", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
    });
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new ComfyUiError("INVALID_RESPONSE", "ComfyUI submit response is not valid JSON");
    }
    if (!isRecord(value) || typeof value.prompt_id !== "string" || value.prompt_id.trim().length === 0) {
      throw new ComfyUiError("INVALID_RESPONSE", "ComfyUI submit response has no prompt_id");
    }
    return { externalJobId: value.prompt_id };
  }

  public async getResult(externalJobId: string): Promise<ComfyUiResult> {
    if (externalJobId.trim().length === 0) {
      throw new ComfyUiError("CONFIGURATION", "ComfyUI externalJobId is required");
    }
    const response = await this.request(`/history/${encodeURIComponent(externalJobId)}`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new ComfyUiError("INVALID_RESPONSE", "ComfyUI history response is not valid JSON");
    }
    const image = firstHistoryImage(value, externalJobId);
    const query = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder,
      type: image.type,
    });
    return {
      externalJobId,
      mediaRef: `${this.baseUrl}/view?${query.toString()}`,
    };
  }

  public async *watchProgress(
    externalJobId: string,
    options: { timeoutMs?: number } = {},
  ): AsyncGenerator<ComfyUiProgressEvent> {
    if (externalJobId.trim().length === 0) {
      throw new ComfyUiError("CONFIGURATION", "ComfyUI externalJobId is required");
    }
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
      throw new ComfyUiError("CONFIGURATION", "ComfyUI progress timeoutMs must be a positive integer");
    }
    const base = new URL(this.baseUrl);
    base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    base.pathname = "/ws";
    base.search = "";
    base.searchParams.set("clientId", this.clientId);
    let socket: ComfyUiWebSocket;
    try {
      socket = this.webSocketFactory(base.toString());
    } catch (error) {
      if (error instanceof ComfyUiError) throw error;
      throw new ComfyUiError("NETWORK_ERROR", "ComfyUI WebSocket connection failed", { retryable: true });
    }

    const events: ComfyUiProgressEvent[] = [];
    let closed = false;
    let failure: ComfyUiError | undefined;
    let wake: (() => void) | undefined;
    const notify = (): void => {
      const resolve = wake;
      wake = undefined;
      resolve?.();
    };
    const timer = setTimeout(() => {
      failure = new ComfyUiError("TIMEOUT", "ComfyUI progress stream timed out", { retryable: true });
      closed = true;
      notify();
    }, timeoutMs);
    socket.onmessage = (event) => {
      try {
        const payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        const progress = parseComfyUiProgressEvent(payload, externalJobId);
        if (progress === undefined) return;
        events.push(progress);
        if (progress.kind === "completed" || progress.kind === "error") closed = true;
        notify();
      } catch {
        failure = new ComfyUiError("INVALID_RESPONSE", "ComfyUI progress event is not valid JSON");
        closed = true;
        notify();
      }
    };
    socket.onerror = () => {
      failure = new ComfyUiError("NETWORK_ERROR", "ComfyUI WebSocket stream failed", { retryable: true });
      closed = true;
      notify();
    };
    socket.onclose = () => {
      closed = true;
      notify();
    };

    try {
      while (!closed || events.length > 0) {
        if (failure) throw failure;
        const progress = events.shift();
        if (progress !== undefined) {
          yield progress;
          continue;
        }
        if (closed) break;
        await new Promise<void>((resolve) => { wake = resolve; });
      }
      if (failure) throw failure;
    } finally {
      clearTimeout(timer);
      socket.close();
    }
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ComfyUiError("TIMEOUT", "ComfyUI request timed out", { retryable: true });
      }
      throw new ComfyUiError(
        "NETWORK_ERROR",
        error instanceof Error ? "ComfyUI request failed" : "ComfyUI request failed",
        { retryable: true },
      );
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      let detail = "ComfyUI returned an error";
      try {
        const text = await response.text();
        if (text.trim().length > 0) detail = text.slice(0, 2048);
      } catch {
        // Preserve bounded generic error when the body cannot be read.
      }
      throw new ComfyUiError("HTTP_ERROR", detail, {
        status: response.status,
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      });
    }
    return response;
  }
}

export class FakeComfyUiClient implements ComfyUiClient {
  private readonly submissions = new Map<string, ComfyUiSubmitRequest>();

  public async submit(request: ComfyUiSubmitRequest): Promise<ComfyUiSubmitResult> {
    const existing = this.submissions.get(request.jobId);
    if (existing) return { externalJobId: `fake-comfy:${request.jobId}` };
    this.submissions.set(request.jobId, { ...request });
    return { externalJobId: `fake-comfy:${request.jobId}` };
  }

  public async getResult(externalJobId: string): Promise<ComfyUiResult> {
    const prefix = "fake-comfy:";
    if (!externalJobId.startsWith(prefix)) {
      throw new Error("Fake ComfyUI does not recognize externalJobId");
    }
    const jobId = externalJobId.slice(prefix.length);
    if (!this.submissions.has(jobId)) throw new Error(`Fake ComfyUI job not found: ${jobId}`);
    return {
      externalJobId,
      mediaRef: `media://fake-comfy/${jobId}.png`,
    };
  }

  public async *watchProgress(externalJobId: string): AsyncGenerator<ComfyUiProgressEvent> {
    const prefix = "fake-comfy:";
    if (!externalJobId.startsWith(prefix)) {
      throw new Error("Fake ComfyUI does not recognize externalJobId");
    }
    const jobId = externalJobId.slice(prefix.length);
    if (!this.submissions.has(jobId)) throw new Error(`Fake ComfyUI job not found: ${jobId}`);
    yield { externalJobId, kind: "executing", nodeId: "fake" };
    yield { externalJobId, kind: "completed" };
  }
}
