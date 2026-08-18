import type {
  V2ChatDiagnosticsResponse,
  V2ChatMediaDto,
  V2ChatMessageDto,
  V2ChatMessagePageResponse,
  V2ConversationId,
  V2ConversationListResponse,
  V2CreateInstantStoryRequest,
  V2CreateInstantStoryResponse,
  V2ErrorEnvelope,
  V2MessageId,
  V2SendChatMessageRequest,
  V2SendChatMessageResponse,
  V2TriggerStoryAnalyzeResponse,
} from "@living-network/contracts/v2";

export interface V2ChatClientOptions {
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
}

export interface V2ChatStreamEvent {
  readonly type: "delta" | "message" | "done" | "error" | "finish";
  readonly content?: string;
  readonly message?: V2ChatMessageDto;
  readonly messageId?: string;
  readonly reason?: string;
  readonly code?: string;
  readonly error?: boolean;
  readonly errorMessage?: string;
}

export class V2ChatClientError extends Error {
  public readonly code: string;
  public readonly status: number;

  public constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "V2ChatClientError";
    this.code = code;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | V2ErrorEnvelope | { readonly error?: { readonly code?: unknown; readonly message?: unknown } };
  if (!response.ok) {
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : undefined;
    throw new V2ChatClientError(
      typeof error?.code === "string" ? error.code : "INTERNAL_ERROR",
      typeof error?.message === "string" ? error.message : `请求失败（HTTP ${response.status}）`,
      response.status,
    );
  }
  return payload as T;
}

function request(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

function apiBase(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/v2`;
}

async function* parseSse(body: ReadableStream<Uint8Array> | null): AsyncGenerator<V2ChatStreamEvent> {
  if (body === null) return;
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
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data.length > 0) {
          const parsed = JSON.parse(data) as V2ChatStreamEvent;
          yield parsed;
        }
        separator = buffer.indexOf("\n\n");
      }
    }
    const final = buffer.trim();
    if (final.length > 0) {
      const data = final
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data.length > 0) yield JSON.parse(data) as V2ChatStreamEvent;
    }
  } finally {
    reader.releaseLock();
  }
}

export function createV2ChatClient(options: V2ChatClientOptions): V2ChatClient {
  const fetcher = options.fetchImpl ?? fetch;
  const base = apiBase(options.baseUrl);

  return {
    async createInstantStory(input: V2CreateInstantStoryRequest): Promise<V2CreateInstantStoryResponse> {
      return readJson<V2CreateInstantStoryResponse>(await fetcher(`${base}/instant-stories`, request("POST", input)));
    },
    async listConversations(): Promise<V2ConversationListResponse["conversations"]> {
      return (await readJson<V2ConversationListResponse>(await fetcher(`${base}/chat/conversations`, request("GET")))).conversations;
    },
    async listMessages(
      conversationId: V2ConversationId,
      query?: { readonly beforeMessageId?: V2MessageId; readonly limit?: number },
    ): Promise<V2ChatMessagePageResponse> {
      const params = new URLSearchParams();
      if (query?.limit !== undefined) params.set("limit", String(query.limit));
      if (query?.beforeMessageId !== undefined) params.set("beforeMessageId", query.beforeMessageId);
      const suffix = params.size === 0 ? "" : `?${params.toString()}`;
      return readJson<V2ChatMessagePageResponse>(await fetcher(`${base}/chat/conversations/${encodeURIComponent(conversationId)}/messages${suffix}`, request("GET")));
    },
    async sendMessage(conversationId: V2ConversationId, input: V2SendChatMessageRequest): Promise<V2SendChatMessageResponse> {
      return readJson<V2SendChatMessageResponse>(await fetcher(`${base}/chat/conversations/${encodeURIComponent(conversationId)}/messages`, request("POST", input)));
    },
    async streamReply(
      conversationId: V2ConversationId,
      input: { readonly idempotencyKey: string },
      onEvent: (event: V2ChatStreamEvent) => void,
      signal?: AbortSignal,
    ): Promise<void> {
      const response = await fetcher(`${base}/chat/conversations/${encodeURIComponent(conversationId)}/replies`, {
        ...request("POST", input),
        ...(signal === undefined ? {} : { signal }),
      });
      if (!response.ok) {
        await readJson<unknown>(response);
        return;
      }
      for await (const event of parseSse(response.body)) {
        onEvent(event);
      }
    },
    async getLatestDiagnostics(conversationId: V2ConversationId): Promise<V2ChatDiagnosticsResponse> {
      return readJson<V2ChatDiagnosticsResponse>(await fetcher(`${base}/chat/conversations/${encodeURIComponent(conversationId)}/diagnostics/latest`, request("GET")));
    },
    async triggerStoryAnalyze(
      conversationId: V2ConversationId,
      input?: { readonly idempotencyKey?: string },
    ): Promise<V2TriggerStoryAnalyzeResponse> {
      const idempotencyKey = input?.idempotencyKey ?? `analyze:${Date.now()}:${crypto.randomUUID()}`;
      return readJson<V2TriggerStoryAnalyzeResponse>(
        await fetcher(`${base}/chat/conversations/${encodeURIComponent(conversationId)}/analyze`, request("POST", { idempotencyKey })),
      );
    },
    async uploadMedia(file: File): Promise<V2ChatMediaDto> {
      const form = new FormData();
      form.append("file", file, file.name);
      const response = await fetcher(`${base}/chat/media`, {
        method: "POST",
        body: form,
      });
      const payload = await readJson<{ readonly media: V2ChatMediaDto }>(response);
      return payload.media;
    },
    mediaUrl(mediaRef: string): string {
      const match = /^media:\/\/local\/v2\/chat\/([a-f0-9]{64}\.(?:png|jpg|jpeg|webp|gif))$/i.exec(mediaRef);
      return match?.[1] === undefined ? mediaRef : `${base}/chat/media/${match[1]}`;
    },
  };
}

export interface V2ChatClient {
  createInstantStory(input: V2CreateInstantStoryRequest): Promise<V2CreateInstantStoryResponse>;
  listConversations(): Promise<V2ConversationListResponse["conversations"]>;
  listMessages(
    conversationId: V2ConversationId,
    query?: { readonly beforeMessageId?: V2MessageId; readonly limit?: number },
  ): Promise<V2ChatMessagePageResponse>;
  sendMessage(conversationId: V2ConversationId, input: V2SendChatMessageRequest): Promise<V2SendChatMessageResponse>;
  streamReply(
    conversationId: V2ConversationId,
    input: { readonly idempotencyKey: string },
    onEvent: (event: V2ChatStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  getLatestDiagnostics(conversationId: V2ConversationId): Promise<V2ChatDiagnosticsResponse>;
  triggerStoryAnalyze(
    conversationId: V2ConversationId,
    input?: { readonly idempotencyKey?: string },
  ): Promise<V2TriggerStoryAnalyzeResponse>;
  uploadMedia(file: File): Promise<V2ChatMediaDto>;
  mediaUrl(mediaRef: string): string;
}
