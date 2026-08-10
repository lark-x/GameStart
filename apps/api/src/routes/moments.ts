import type { HandlerContext } from "../context.ts";
import { trustedActor } from "../context.ts";
import { ApiError, jsonResponse } from "../helpers.ts";
import { parseCreateMomentInteractionRequest } from "../parsers.ts";
import { listMoments, listMomentInteractions, createMomentInteraction } from "../use-cases/moments.ts";

async function parseBody(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
}

export async function handleMoments(
  ctx: HandlerContext,
  request: Request,
  url: URL,
  correlationId: string,
): Promise<Response | undefined> {
  if (request.method === "GET" && url.pathname === "/v1/moments") {
    const storyWorldId = url.searchParams.get("storyWorldId");
    const readerCharacterId = url.searchParams.get("readerCharacterId");
    if (!storyWorldId || !readerCharacterId) {
      throw new ApiError(400, "BAD_REQUEST", "storyWorldId and readerCharacterId are required");
    }
    trustedActor(ctx, request, readerCharacterId);
    const rawLimit = url.searchParams.get("limit");
    const limit = rawLimit === null ? 20 : Number(rawLimit);
    return jsonResponse({ data: await listMoments(ctx.store, storyWorldId, readerCharacterId, limit) });
  }

  const momentInteractionsPath = /^\/v1\/moments\/([^/]+)\/interactions$/.exec(url.pathname);
  if (momentInteractionsPath) {
    const momentId = decodeURIComponent(momentInteractionsPath[1] ?? "");
    if (request.method === "GET") {
      const readerCharacterId = url.searchParams.get("readerCharacterId");
      if (!readerCharacterId) throw new ApiError(400, "BAD_REQUEST", "readerCharacterId is required");
      trustedActor(ctx, request, readerCharacterId);
      return jsonResponse({ data: await listMomentInteractions(ctx.store, momentId, readerCharacterId) });
    }
    if (request.method === "POST") {
      const input = parseCreateMomentInteractionRequest(await parseBody(request));
      trustedActor(ctx, request, input.actorCharacterId);
      return jsonResponse({ data: await createMomentInteraction(ctx.store, momentId, input) });
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  return undefined;
}
