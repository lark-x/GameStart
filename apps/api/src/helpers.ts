import {
  ProviderError,
  type ChatDelta,
} from "@living-network/ai";

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "SERVICE_UNAVAILABLE"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "NOT_IMPLEMENTED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ApiErrorCode;

  public constructor(statusCode: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function bodyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, "BAD_REQUEST", `${field} must be a non-empty string`);
  }
  return value;
}

export function bodyNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ApiError(400, "BAD_REQUEST", `${field} must be a number`);
  }
  return value;
}

export function assertAllowedBodyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new ApiError(400, "BAD_REQUEST", "Request body contains unknown fields");
  }
}

export function optionalBodyNumber(
  value: unknown,
  field: string,
): number | undefined {
  return value === undefined ? undefined : bodyNumber(value, field);
}

export function optionalBodyBoolean(
  value: unknown,
  field: string,
): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new ApiError(400, "BAD_REQUEST", `${field} must be a boolean`);
  }
  return value;
}

export function bodyStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError(400, "BAD_REQUEST", `${field} must be a non-empty array`);
  }
  return value.map((item, index) => bodyString(item, `${field}[${index}]`));
}

export function parseOptionalNonNegativeInteger(
  value: unknown,
  field: string,
): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ApiError(400, "BAD_REQUEST", `${field} must be a non-negative integer`);
  }
  return value;
}

export function jsonResponse(body: unknown, statusCode = 200): Response {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return jsonResponse(
      { error: { code: error.code, message: error.message } },
      error.statusCode,
    );
  }
  return jsonResponse(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    500,
  );
}

export function withHeaders(
  response: Response,
  headers: Record<string, string>,
): Response {
  for (const [key, value] of Object.entries(headers))
    if (value) response.headers.set(key, value);
  return response;
}

export function sseData(value: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`);
}

export function sseError(error: unknown): Uint8Array {
  const code = error instanceof ProviderError ? error.code : "STREAM_ERROR";
  const message =
    error instanceof ProviderError ? error.message : "Chat stream failed";
  return new TextEncoder().encode(
    `event: error\ndata: ${JSON.stringify({ code, message })}\n\n`,
  );
}

export function sseDone(): Uint8Array {
  return new TextEncoder().encode("data: [DONE]\n\n");
}

export function createSseResponse(
  source: AsyncIterable<ChatDelta>,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        try {
          for await (const delta of source) controller.enqueue(sseData(delta));
        } catch (error) {
          controller.enqueue(sseError(error));
        } finally {
          controller.enqueue(sseDone());
          controller.close();
        }
      })().catch(() => undefined);
    },
  });
  return new Response(stream, {
    headers: {
      "cache-control": "no-cache",
      "content-type": "text/event-stream; charset=utf-8",
      connection: "keep-alive",
    },
  });
}
