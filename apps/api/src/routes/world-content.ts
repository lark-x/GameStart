import type { HandlerContext } from "../context.ts";
import { trustedActor } from "../context.ts";
import { ApiError, jsonResponse } from "../helpers.ts";
import {
  parseCreateStoryWorldRequest,
  parseUpdateStoryWorldRequest,
  parseCreateCharacterRequest,
  parseUpdateCharacterRequest,
  parseCreateRelationshipEdgeRequest,
  parseUpdateRelationshipEdgeRequest,
  parseCreateWorldEventDefinitionRequest,
  parseUpdateWorldEventDefinitionRequest,
  parseCreateWorldLoreEntryRequest,
  parseUpdateWorldLoreEntryRequest,
} from "../parsers.ts";
import * as worlds from "../use-cases/worlds.ts";
import * as characters from "../use-cases/characters.ts";
import * as relationships from "../use-cases/relationships.ts";
import * as worldEvents from "../use-cases/world-events.ts";

async function parseBody(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
}

export async function handleWorldContent(
  ctx: HandlerContext,
  request: Request,
  url: URL,
  _correlationId: string,
): Promise<Response | undefined> {
  // --- Worlds ---
  if (url.pathname === "/v1/worlds") {
    if (request.method === "GET") return jsonResponse({ data: await worlds.listWorlds(ctx.store) });
    if (request.method === "POST") {
      trustedActor(ctx, request);
      return jsonResponse({ data: await worlds.createWorld(ctx.store, parseCreateStoryWorldRequest(await parseBody(request))) }, 201);
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  const worldIdPath = /^\/v1\/worlds\/([^/]+)$/.exec(url.pathname);
  if (worldIdPath && !url.pathname.endsWith("/calendar")) {
    if (request.method !== "PUT") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    trustedActor(ctx, request);
    return jsonResponse({ data: await worlds.updateWorld(ctx.store, decodeURIComponent(worldIdPath[1] ?? ""), parseUpdateStoryWorldRequest(await parseBody(request))) });
  }

  // --- World Lore ---
  if (url.pathname === "/v1/world-lore") {
    if (request.method === "GET") {
      const storyWorldId = url.searchParams.get("storyWorldId");
      if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId is required");
      const rawQuery = url.searchParams.get("q");
      const query = rawQuery === null ? undefined : (rawQuery.trim().length === 0 ? (() => { throw new ApiError(400, "BAD_REQUEST", "q must be a non-empty string"); })() : rawQuery);
      return jsonResponse({ data: await worlds.listWorldLoreEntries(ctx.store, storyWorldId, query) });
    }
    if (request.method === "POST") {
      trustedActor(ctx, request);
      return jsonResponse({ data: await worlds.createWorldLoreEntry(ctx.store, parseCreateWorldLoreEntryRequest(await parseBody(request))) }, 201);
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  const worldLorePath = /^\/v1\/world-lore\/([^/]+)$/.exec(url.pathname);
  if (worldLorePath) {
    const id = decodeURIComponent(worldLorePath[1] ?? "");
    if (request.method === "PUT") {
      trustedActor(ctx, request);
      return jsonResponse({ data: await worlds.updateWorldLoreEntry(ctx.store, id, parseUpdateWorldLoreEntryRequest(await parseBody(request))) });
    }
    if (request.method === "DELETE") {
      trustedActor(ctx, request);
      await worlds.deleteWorldLoreEntry(ctx.store, id);
      return new Response(null, { status: 204 });
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  // --- World Events ---
  if (url.pathname === "/v1/world-events") {
    if (request.method === "GET") {
      const storyWorldId = url.searchParams.get("storyWorldId");
      if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId is required");
      return jsonResponse({ data: await worldEvents.listWorldEvents(ctx.store, storyWorldId) });
    }
    if (request.method === "POST") {
      trustedActor(ctx, request);
      return jsonResponse({ data: await worldEvents.createWorldEvent(ctx.store, parseCreateWorldEventDefinitionRequest(await parseBody(request))) }, 201);
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  const worldEventPath = /^\/v1\/world-events\/([^/]+)$/.exec(url.pathname);
  if (worldEventPath) {
    if (request.method !== "PUT") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    trustedActor(ctx, request);
    return jsonResponse({ data: await worldEvents.updateWorldEvent(ctx.store, decodeURIComponent(worldEventPath[1] ?? ""), parseUpdateWorldEventDefinitionRequest(await parseBody(request))) });
  }

  // --- Calendar ---
  const calendarPath = /^\/v1\/worlds\/([^/]+)\/calendar$/.exec(url.pathname);
  if (calendarPath) {
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const startsAt = url.searchParams.get("startsAt");
    const endsAt = url.searchParams.get("endsAt");
    if (!startsAt || !endsAt) throw new ApiError(400, "BAD_REQUEST", "startsAt and endsAt are required");
    const rawLimit = url.searchParams.get("limit");
    const limit = rawLimit === null ? 200 : Number(rawLimit);
    return jsonResponse({ data: await worlds.getWorldCalendar(ctx.store, decodeURIComponent(calendarPath[1] ?? ""), startsAt, endsAt, limit) });
  }

  // --- Characters ---
  if (url.pathname === "/v1/characters") {
    if (request.method === "GET") return jsonResponse({ data: await characters.listCharacters(ctx.store, url.searchParams.get("storyWorldId") ?? undefined) });
    if (request.method === "POST") {
      trustedActor(ctx, request);
      return jsonResponse({ data: await characters.createCharacter(ctx.store, parseCreateCharacterRequest(await parseBody(request))) }, 201);
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  const characterIdPath = /^\/v1\/characters\/([^/]+)$/.exec(url.pathname);
  if (characterIdPath) {
    if (request.method !== "PUT") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    trustedActor(ctx, request);
    return jsonResponse({ data: await characters.updateCharacter(ctx.store, decodeURIComponent(characterIdPath[1] ?? ""), parseUpdateCharacterRequest(await parseBody(request))) });
  }

  // --- Relationships ---
  if (url.pathname === "/v1/relationships") {
    if (request.method === "POST") {
      trustedActor(ctx, request);
      return jsonResponse({ data: await relationships.createRelationship(ctx.store, parseCreateRelationshipEdgeRequest(await parseBody(request))) }, 201);
    }
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const storyWorldId = url.searchParams.get("storyWorldId");
    if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId is required");
    return jsonResponse({ data: await relationships.listRelationships(ctx.store, storyWorldId) });
  }

  const relationshipPath = /^\/v1\/relationships\/([^/]+)$/.exec(url.pathname);
  if (relationshipPath) {
    if (request.method !== "PUT") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    trustedActor(ctx, request);
    return jsonResponse({ data: await relationships.updateRelationship(ctx.store, decodeURIComponent(relationshipPath[1] ?? ""), parseUpdateRelationshipEdgeRequest(await parseBody(request))) });
  }

  return undefined;
}
