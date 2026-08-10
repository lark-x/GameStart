import type { HandlerContext } from "../context.ts";
import { trustedActor } from "../context.ts";
import { ApiError, jsonResponse, withHeaders } from "../helpers.ts";
import type { InteractionLogDto, InteractionLogQuery } from "../../../../packages/contracts/src/index.ts";
import { encodeInteractionLogCursor } from "../../../../packages/database/src/interaction-log.ts";

export async function handleMedia(
  ctx: HandlerContext,
  request: Request,
  url: URL,
  correlationId: string,
): Promise<Response | undefined> {
  // --- Upload Chat Image ---
  if (url.pathname === "/v1/media/chat-images") {
    if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    trustedActor(ctx, request);
    const contentType = ((request.headers.get("content-type") ?? "").split(";", 1)[0] ?? "").trim().toLowerCase();
    const length = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > 12 * 1024 * 1024) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Image must be 12MB or smaller");
    if (!contentType.startsWith("image/")) throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Upload must be a PNG, JPEG, WebP, or GIF image");
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > 12 * 1024 * 1024) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Image must be 12MB or smaller");
    try {
      return jsonResponse({ data: await ctx.media.put(bytes, contentType) }, 201);
    } catch (error) {
      if (error instanceof TypeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  // --- Local Media ---
  const localMediaPath = /^\/v1\/media\/local\/([^/]+)$/.exec(url.pathname);
  if (localMediaPath) {
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const filename = decodeURIComponent(localMediaPath[1] ?? "");
    try {
      const media = await ctx.media.get(`media://local/${filename}`);
      return new Response(media.bytes.buffer as ArrayBuffer, {
        headers: { "content-type": media.contentType, "cache-control": "public, max-age=31536000, immutable" },
      });
    } catch (error) {
      if (error instanceof TypeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      if (error instanceof Error && "code" in error && (error as { code: string }).code === "ENOENT") throw new ApiError(404, "NOT_FOUND", "Media not found");
      throw error;
    }
  }

  // --- Interaction Logs ---
  if (request.method === "GET" && url.pathname === "/v1/interaction-logs") {
    const rawLimit = url.searchParams.get("limit");
    const limit = rawLimit === null ? 100 : Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new ApiError(400, "BAD_REQUEST", "limit must be between 1 and 200");
    const enums: Record<string, readonly string[]> = { level: ["DEBUG", "INFO", "WARN", "ERROR"], source: ["API", "AI", "WORKER", "SYSTEM", "DATABASE", "PROVIDER"], category: ["HTTP", "CHAT", "LLM", "DISPATCH", "QUEUE", "EVENT_OUTPUT", "IMAGE", "WORKER_LIFECYCLE", "SYSTEM", "DATABASE", "AUTH", "PROVIDER"] };
    for (const key of ["level", "source", "category"] as const) { const value = url.searchParams.get(key); if (value !== null && !enums[key]!.includes(value)) throw new ApiError(400, "BAD_REQUEST", `${key} is invalid`); }
    const q: InteractionLogQuery = { limit };
    for (const key of ["cursor", "level", "source", "category", "action", "outcome", "requestId", "correlationId", "worldId", "actorId", "conversationId", "entityType", "entityId", "query", "createdAfter", "createdBefore"] as const) {
      const value = url.searchParams.get(key); if (value !== null && value.length > 0) (q as Record<string, unknown>)[key] = value;
    }
    try {
      return withHeaders(jsonResponse({ data: await ctx.logging.query(q) }), { "x-correlation-id": correlationId, "x-request-id": request.headers.get("x-request-id") ?? "" });
    } catch (error) {
      throw new ApiError(400, "BAD_REQUEST", error instanceof Error ? error.message : "Invalid log query");
    }
  }

  // --- Interaction Log SSE Stream ---
  const logStream = request.method === "GET" && url.pathname === "/v1/interaction-logs/stream";
  if (logStream) {
    const cursor = url.searchParams.get("cursor") ?? request.headers.get("last-event-id") ?? undefined;
    const history = await ctx.logging.query({ limit: 200, ...(cursor === undefined ? {} : { cursor }) });
    const encoder = new TextEncoder();
    let cleanupStream: (() => void) | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        let closed = false;
        const seen = new Set(history.items.map((item) => item.id));
        const writeLog = (item: InteractionLogDto): void => {
          if (closed || seen.has(item.id)) return;
          seen.add(item.id);
          const eventId = encodeInteractionLogCursor(item.createdAt, item.id);
          controller.enqueue(encoder.encode(`event: log\nid: ${eventId}\ndata: ${JSON.stringify(item)}\n\n`));
        };
        for (const item of history.items) { seen.delete(item.id); writeLog(item); }
        const unsubscribe = ctx.logging.subscribe(writeLog);
        const poll = setInterval(() => {
          void ctx.logging.query({ limit: 200 }).then((page) => { for (const item of page.items) writeLog(item); }).catch(() => undefined);
        }, 1_000);
        const keepalive = setInterval(() => { if (!closed) controller.enqueue(encoder.encode(": keepalive\n\n")); }, 15_000);
        const cleanup = (): void => { if (closed) return; closed = true; unsubscribe(); clearInterval(poll); clearInterval(keepalive); request.signal.removeEventListener("abort", cleanup); };
        cleanupStream = cleanup;
        request.signal.addEventListener("abort", cleanup, { once: true });
      },
      cancel: () => { cleanupStream?.(); },
    });
    return withHeaders(new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", "connection": "keep-alive" } }), { "x-correlation-id": correlationId });
  }

  return undefined;
}
