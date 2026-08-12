import type { HandlerContext } from "../context.ts";
import { ApiError, jsonResponse, withHeaders } from "../helpers.ts";
import { listFeedEvents, createMomentInteraction, likeMoment, unlikeMoment } from "../use-cases/social-feed.ts";
import type { SocialFeedEvent } from "@living-network/domain";

async function parseBody(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
}

export async function handleSocialFeed(
  ctx: HandlerContext,
  request: Request,
  url: URL,
  _correlationId: string,
): Promise<Response | undefined> {
  if (request.method === "GET" && url.pathname === "/v1/social-feed/events") {
    const storyWorldId = url.searchParams.get("storyWorldId");
    if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId is required");
    const cursor = url.searchParams.get("cursor") ? Number(url.searchParams.get("cursor")) : undefined;
    const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined;
    return jsonResponse({ data: await listFeedEvents(ctx.store, storyWorldId, cursor, limit) });
  }

  // SSE feed stream: GET /v1/worlds/:id/feed/stream?cursor=...
  const feedStreamMatch = /^\/v1\/worlds\/([^/]+)\/feed\/stream$/.exec(url.pathname);
  if (feedStreamMatch && request.method === "GET") {
    const storyWorldId = decodeURIComponent(feedStreamMatch[1] ?? "");
    const initialCursor = url.searchParams.get("cursor") ? Number(url.searchParams.get("cursor")) : undefined;
    const encoder = new TextEncoder();
    let cleanupStream: (() => void) | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        let closed = false;
        let lastCursor = initialCursor ?? 0;
        const seen = new Set<string>();

        const writeEvent = (event: SocialFeedEvent): void => {
          if (closed || seen.has(event.id)) return;
          seen.add(event.id);
          if (event.cursorValue > lastCursor) lastCursor = event.cursorValue;
          controller.enqueue(
            encoder.encode(`event: feed\ndata: ${JSON.stringify(event)}\n\n`),
          );
        };

        // Send initial history
        void listFeedEvents(ctx.store, storyWorldId, initialCursor, 200).then((events) => {
          for (const event of events) writeEvent(event);
        }).catch(() => undefined);

        // Poll for new events every 2 seconds
        const poll = setInterval(() => {
          void listFeedEvents(ctx.store, storyWorldId, lastCursor, 200).then((events) => {
            for (const event of events) writeEvent(event);
          }).catch(() => undefined);
        }, 2_000);

        // Keepalive every 15 seconds
        const keepalive = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(": keepalive\n\n"));
        }, 15_000);

        const cleanup = (): void => {
          if (closed) return;
          closed = true;
          clearInterval(poll);
          clearInterval(keepalive);
          request.signal.removeEventListener("abort", cleanup);
        };
        cleanupStream = cleanup;
        request.signal.addEventListener("abort", cleanup, { once: true });
      },
      cancel: () => { cleanupStream?.(); },
    });

    return withHeaders(
      new Response(stream, {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          "connection": "keep-alive",
        },
      }),
      { "x-correlation-id": _correlationId },
    );
  }

  const momentPath = /^\/v1\/moments\/([^/]+)\/(like|interactions)$/.exec(url.pathname);
  if (momentPath) {
    const momentId = decodeURIComponent(momentPath[1] ?? "");

    // PUT /v1/moments/:id/like — idempotent like
    if (request.method === "PUT" && momentPath[2] === "like") {
      const body = await parseBody(request) as Record<string, unknown>;
      const actorCharacterId = body.actorCharacterId as string;
      const idempotencyKey = body.idempotencyKey as string;
      if (!actorCharacterId || !idempotencyKey) {
        throw new ApiError(400, "BAD_REQUEST", "actorCharacterId and idempotencyKey are required");
      }
      const result = await likeMoment(ctx.store, momentId, actorCharacterId, idempotencyKey);
      return jsonResponse({ data: result }, result.inserted ? 201 : 200);
    }

    // DELETE /v1/moments/:id/like — idempotent unlike
    if (request.method === "DELETE" && momentPath[2] === "like") {
      const actorCharacterId = url.searchParams.get("actorCharacterId");
      if (!actorCharacterId) throw new ApiError(400, "BAD_REQUEST", "actorCharacterId query parameter is required");
      const deleted = await unlikeMoment(ctx.store, momentId, actorCharacterId);
      return jsonResponse({ deleted });
    }

    // POST /v1/moments/:id/interactions — legacy compatibility
    if (request.method === "POST" && momentPath[2] === "interactions") {
      const body = await parseBody(request) as Record<string, unknown>;
      const actorCharacterId = body.actorCharacterId as string;
      const kind = body.kind as string;
      const idempotencyKey = body.idempotencyKey as string;
      if (!actorCharacterId || !kind || !idempotencyKey) {
        throw new ApiError(400, "BAD_REQUEST", "actorCharacterId, kind, and idempotencyKey are required");
      }
      if (kind !== "LIKE" && kind !== "COMMENT") {
        throw new ApiError(400, "BAD_REQUEST", "kind must be LIKE or COMMENT");
      }
      return jsonResponse({ data: await createMomentInteraction(ctx.store, momentId, {
        actorCharacterId,
        kind,
        idempotencyKey,
        ...(body.text !== undefined ? { text: body.text as string } : {}),
      }) });
    }
  }

  return undefined;
}
