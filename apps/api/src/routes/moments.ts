import {
  createMomentInteraction as createMomentInteractionDomain,
  isMomentVisibleTo,
} from "../../../../packages/domain/src/index.ts";
import type { HandlerContext } from "../context.ts";
import { trustedActor } from "../context.ts";
import { ApiError, jsonResponse } from "../helpers.ts";
import { toMomentDto, toMomentInteractionDto } from "../mappers.ts";
import { parseCreateMomentInteractionRequest } from "../parsers.ts";
import { requireMomentStore } from "../store-helpers.ts";

async function parseBody(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
}

export async function handleMoments(
  ctx: HandlerContext,
  request: Request,
  url: URL,
  correlationId: string,
): Promise<Response | undefined> {
  const store = ctx.store;

  if (request.method === "GET" && url.pathname === "/v1/moments") {
    const storyWorldId = url.searchParams.get("storyWorldId");
    const readerCharacterId = url.searchParams.get("readerCharacterId");
    if (!storyWorldId || !readerCharacterId) {
      throw new ApiError(400, "BAD_REQUEST", "storyWorldId and readerCharacterId are required");
    }
    trustedActor(ctx, request, readerCharacterId);
    const rawLimit = url.searchParams.get("limit");
    const limit = rawLimit === null ? 20 : Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new ApiError(400, "BAD_REQUEST", "limit must be a positive integer");
    }
    const momentStore = requireMomentStore(store);
    if (!(await store.storyWorlds.getById(storyWorldId))) throw new ApiError(404, "NOT_FOUND", "Story world not found");
    if (!(await store.characters.getById(readerCharacterId))) throw new ApiError(404, "NOT_FOUND", "Reader character not found");
    try {
      return jsonResponse({ data: (await momentStore.moments.listFeed(storyWorldId, readerCharacterId, limit)).map(toMomentDto) });
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  const momentInteractionsPath = /^\/v1\/moments\/([^/]+)\/interactions$/.exec(url.pathname);
  if (momentInteractionsPath) {
    const momentId = decodeURIComponent(momentInteractionsPath[1] ?? "");
    const momentStore = requireMomentStore(store);
    if (request.method === "GET") {
      const readerCharacterId = url.searchParams.get("readerCharacterId");
      if (!readerCharacterId) throw new ApiError(400, "BAD_REQUEST", "readerCharacterId is required");
      trustedActor(ctx, request, readerCharacterId);
      const moment = await momentStore.moments.getById(momentId);
      if (!moment) throw new ApiError(404, "NOT_FOUND", "Moment not found");
      if (!(await store.characters.getById(readerCharacterId))) throw new ApiError(404, "NOT_FOUND", "Reader character not found");
      if (!isMomentVisibleTo(moment, readerCharacterId)) throw new ApiError(403, "FORBIDDEN", "Character cannot view this moment");
      return jsonResponse({ data: (await momentStore.momentInteractions.listByMoment(momentId)).map(toMomentInteractionDto) });
    }
    if (request.method === "POST") {
      const input = parseCreateMomentInteractionRequest(await parseBody(request));
      trustedActor(ctx, request, input.actorCharacterId);
      const moment = await momentStore.moments.getById(momentId);
      if (!moment) throw new ApiError(404, "NOT_FOUND", "Moment not found");
      const actor = await store.characters.getById(input.actorCharacterId);
      if (!actor) throw new ApiError(404, "NOT_FOUND", "Actor character not found");
      if (!isMomentVisibleTo(moment, actor.id)) throw new ApiError(403, "FORBIDDEN", "Character cannot interact with this moment");
      try {
        const interaction = createMomentInteractionDomain({
          id: input.id, moment, actor, kind: input.kind, createdAt: input.createdAt, idempotencyKey: input.idempotencyKey,
          ...(input.text === undefined ? {} : { text: input.text }),
        });
        const result = await momentStore.momentInteractions.save(interaction);
        return jsonResponse({ data: { interaction: toMomentInteractionDto(result.interaction), inserted: result.inserted } });
      } catch (error) {
        if (error instanceof TypeError && error.message.includes("idempotency")) throw new ApiError(409, "CONFLICT", error.message);
        if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
        throw error;
      }
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  return undefined;
}
