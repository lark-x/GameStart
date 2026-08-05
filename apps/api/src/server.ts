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

async function toRequest(request: IncomingMessage): Promise<Request> {
  const host = request.headers.host ?? "localhost";
  const url = `http://${host}${request.url ?? "/"}`;
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) {
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
  }

  const method = request.method ?? "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(request);
  const init: RequestInit = { method, headers };
  if (body) {
    init.body = body;
  }
  return new Request(url, init);
}

async function writeResponse(response: Response, reply: ServerResponse): Promise<void> {
  reply.statusCode = response.status;
  response.headers.forEach((value, name) => reply.setHeader(name, value));
  reply.end(await response.text());
}

export function createApiServer(
  application: ApiApplication,
  options: ApiServerOptions = {},
): Server {
  return createServer(async (request, reply) => {
    try {
      const requestId = request.headers["x-request-id"]?.toString().trim() || randomUUID();
      reply.setHeader("x-request-id", requestId);
      const allowedOrigin = resolveCorsOrigin(request.headers.origin, options.corsOrigins);
      if (allowedOrigin !== undefined) {
        reply.setHeader("access-control-allow-origin", allowedOrigin);
        reply.setHeader("vary", "Origin");
        reply.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
        reply.setHeader("access-control-allow-headers", "accept,content-type");
      }
      if (request.method === "OPTIONS") {
        reply.statusCode = allowedOrigin === undefined ? 403 : 204;
        reply.end();
        return;
      }
      await writeResponse(await application.handle(await toRequest(request)), reply);
    } catch {
      if (!reply.headersSent) {
        reply.statusCode = 500;
        reply.setHeader("content-type", "application/json; charset=utf-8");
      }
      reply.end(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }));
    }
  });
}
