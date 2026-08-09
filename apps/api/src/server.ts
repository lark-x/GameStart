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

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function toRequest(request: IncomingMessage, requestId: string, correlationId: string): Promise<{ request: Request; abort: () => void }> {
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
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(request);
  const init: RequestInit = { method, headers, signal: controller.signal };
  if (body) init.body = body;
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
      const converted = await toRequest(request, requestId, correlationId);
      try {
        const response = await application.handle(converted.request);
        await writeResponse(response, reply);
        application.recordHttpCompletion({ method, pathname, status: reply.statusCode, durationMs: Date.now() - requestStartedAt, requestId, correlationId });
      } finally { converted.abort(); }
    } catch {
      if (!reply.headersSent) {
        reply.statusCode = 500;
        reply.setHeader("content-type", "application/json; charset=utf-8");
      }
      reply.end(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }));
    }
  });
}
