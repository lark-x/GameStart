import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";

import { ApiApplication } from "./app.ts";

export interface ApiServerOptions {
  readonly corsOrigins?: readonly string[];
}

export function resolveCorsOrigin(
  origin: string | undefined,
  allowedOrigins: readonly string[] = [],
): string | undefined {
  if (origin === undefined) return undefined;
  return allowedOrigins.includes(origin) ? origin : undefined;
}

function bodySizeLimit(pathname: string): number {
  if (pathname === "/v1/media/chat-images" || pathname === "/v1/media/images") return 12 * 1024 * 1024;
  if (pathname === "/v1/appearance-settings") return 24 * 1024 * 1024;
  return 1 * 1024 * 1024;
}

class PayloadTooLargeError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public constructor(limit: number) {
    super(`Request body must be ${limit / (1024 * 1024)}MiB or smaller`);
    this.name = "PayloadTooLargeError";
    this.statusCode = 413;
    this.code = "PAYLOAD_TOO_LARGE";
  }
}

function readBody(request: IncomingMessage, pathname: string): Promise<Buffer> {
  const limit = bodySizeLimit(pathname);
  const contentLength = Number(request.headers["content-length"] ?? "0");
  if (Number.isFinite(contentLength) && contentLength > limit) {
    return Promise.reject(new PayloadTooLargeError(limit));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let rejected = false;
    request.on("data", (chunk: Buffer | string) => {
      if (rejected) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.byteLength;
      if (total > limit) {
        rejected = true;
        request.pause();
        reject(new PayloadTooLargeError(limit));
        return;
      }
      chunks.push(buf);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", (err: Error) => { if (!rejected) reject(err); });
  });
}

async function toRequest(request: IncomingMessage, requestId: string, correlationId: string, pathname: string): Promise<{ request: Request; abort: () => void }> {
  const host = request.headers.host ?? "localhost";
  const url = `http://${host}${request.url ?? "/"}`;
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  headers.set("x-request-id", requestId);
  headers.set("x-correlation-id", correlationId);
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  request.once("aborted", abort);
  request.once("close", abort);
  const method = request.method ?? "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(request, pathname);
  const init: RequestInit = { method, headers, signal: controller.signal };
  if (body && body.byteLength > 0) init.body = new Uint8Array(body);
  return { request: new Request(url, init), abort };
}

async function writeResponse(response: Response, reply: ServerResponse): Promise<void> {
  reply.statusCode = response.status;
  response.headers.forEach((value, name) => reply.setHeader(name, value));
  if (response.body === null) { reply.end(); return; }
  const reader = response.body.getReader();
  const cancel = (): void => { void reader.cancel(); };
  reply.once("close", cancel);
  reply.once("aborted", cancel);
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      if (!reply.write(Buffer.from(result.value))) await new Promise<void>((resolve) => reply.once("drain", resolve));
    }
    if (!reply.writableEnded) reply.end();
  } finally {
    reply.off("close", cancel);
    reply.off("aborted", cancel);
    reader.releaseLock();
  }
}
export function createApiServer(
  application: ApiApplication,
  options: ApiServerOptions = {},
): Server {
  return createServer(async (request, reply) => {
    try {
      const requestId = request.headers["x-request-id"]?.toString().trim() || randomUUID();
      const suppliedCorrelation = request.headers["x-correlation-id"]?.toString().trim();
      const correlationId = suppliedCorrelation && suppliedCorrelation.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(suppliedCorrelation) ? suppliedCorrelation : randomUUID();
      reply.setHeader("x-request-id", requestId);
      reply.setHeader("x-correlation-id", correlationId);
      const allowedOrigin = resolveCorsOrigin(request.headers.origin, options.corsOrigins);
      if (allowedOrigin !== undefined) {
        reply.setHeader("access-control-allow-origin", allowedOrigin);
        reply.setHeader("vary", "Origin");
        reply.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
        reply.setHeader("access-control-allow-headers", "accept,content-type,x-actor-character-id,x-request-id,x-correlation-id");
      }
      if (request.method === "OPTIONS") {
        reply.statusCode = allowedOrigin === undefined ? 403 : 204;
        reply.end();
        return;
      }
      const requestStartedAt = Date.now();
      const method = request.method ?? "GET";
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      const converted = await toRequest(request, requestId, correlationId, pathname);
      try {
        const response = await application.handle(converted.request);
        await writeResponse(response, reply);
        application.recordHttpCompletion({ method, pathname, status: reply.statusCode, durationMs: Date.now() - requestStartedAt, requestId, correlationId });
      } finally { converted.abort(); }
    } catch (error: unknown) {
      if (!reply.headersSent) {
        const isBodyLimit = error instanceof PayloadTooLargeError;
        reply.statusCode = isBodyLimit ? error.statusCode : 500;
        reply.setHeader("content-type", "application/json; charset=utf-8");
        if (isBodyLimit) {
          reply.end(JSON.stringify({ error: { code: error.code, message: error.message } }));
          return;
        }
      }
      reply.end(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }));
    }
  });
}
