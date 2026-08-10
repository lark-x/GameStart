import {
  createStoryWorld as createStoryWorldDomain,
  createCharacter as createCharacterDomain,
  createRelationshipEdge as createRelationshipEdgeDomain,
  createWorldEventDefinition as createWorldEventDefinitionDomain,
  createWorldLoreEntry as createWorldLoreEntryDomain,
  type Character,
} from "../../../../packages/domain/src/index.ts";
import type { HandlerContext } from "../context.ts";
import { trustedActor } from "../context.ts";
import { ApiError, jsonResponse } from "../helpers.ts";
import {
  toWorldDto,
  toCharacterDto,
  toRelationshipEdgeDto,
  toWorldEventDefinitionDto,
  toScheduledOccurrenceDto,
  toWorldLoreEntryDto,
} from "../mappers.ts";
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
import {
  requireEventCalendarStore,
  requireWorldLoreStore,
} from "../store-helpers.ts";
import type { ApiStore } from "../context.ts";

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON");
  }
}

export async function handleWorldContent(
  ctx: HandlerContext,
  request: Request,
  url: URL,
  correlationId: string,
): Promise<Response | undefined> {
  const store = ctx.store;

  // --- Worlds ---
  if (url.pathname === "/v1/worlds") {
    if (request.method === "GET") {
      return jsonResponse({ data: (await store.storyWorlds.list()).map(toWorldDto) });
    }
    if (request.method === "POST") {
      trustedActor(ctx, request);
      const input = parseCreateStoryWorldRequest(await parseBody(request));
      if (await store.storyWorlds.getById(input.id)) {
        throw new ApiError(409, "CONFLICT", "Story world already exists");
      }
      try {
        const world = createStoryWorldDomain(input);
        await store.storyWorlds.save(world);
        return jsonResponse({ data: toWorldDto(world) }, 201);
      } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
        throw error;
      }
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  const worldIdPath = /^\/v1\/worlds\/([^/]+)$/.exec(url.pathname);
  if (worldIdPath && !url.pathname.endsWith("/calendar")) {
    const worldId = decodeURIComponent(worldIdPath[1] ?? "");
    if (request.method !== "PUT") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    trustedActor(ctx, request);
    const input = parseUpdateStoryWorldRequest(await parseBody(request));
    const existing = await store.storyWorlds.getById(worldId);
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Story world not found");
    try {
      const storyMode = input.storyMode ?? existing.storyMode;
      const updated = createStoryWorldDomain({
        id: existing.id,
        name: input.name ?? existing.name,
        timezone: input.timezone ?? existing.timezone,
        storyMode,
        relationshipDynamicsEnabled: input.relationshipDynamicsEnabled
          ?? (input.storyMode === undefined ? existing.relationshipDynamicsEnabled : storyMode === "DYNAMIC"),
      });
      await store.storyWorlds.save(updated);
      return jsonResponse({ data: toWorldDto(updated) });
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  // --- World Lore ---
  if (url.pathname === "/v1/world-lore") {
    if (request.method === "GET") {
      const storyWorldId = url.searchParams.get("storyWorldId");
      if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId is required");
      const loreStore = requireWorldLoreStore(store);
      if (!(await store.storyWorlds.getById(storyWorldId))) throw new ApiError(404, "NOT_FOUND", "Story world not found");
      const rawQuery = url.searchParams.get("q");
      const query = rawQuery === null ? undefined : (rawQuery.trim().length === 0 ? (() => { throw new ApiError(400, "BAD_REQUEST", "q must be a non-empty string"); })() : rawQuery);
      const entries = query === undefined
        ? await loreStore.worldLoreEntries.listByStoryWorld(storyWorldId)
        : await loreStore.worldLoreEntries.search(storyWorldId, query);
      return jsonResponse({ data: entries.map(toWorldLoreEntryDto) });
    }
    if (request.method === "POST") {
      trustedActor(ctx, request);
      const input = parseCreateWorldLoreEntryRequest(await parseBody(request));
      const loreStore = requireWorldLoreStore(store);
      if (await loreStore.worldLoreEntries.getById(input.id)) throw new ApiError(409, "CONFLICT", "World lore entry already exists");
      if (!(await store.storyWorlds.getById(input.storyWorldId))) throw new ApiError(404, "NOT_FOUND", "Story world not found");
      try {
        const now = new Date().toISOString();
        const entry = createWorldLoreEntryDomain({ ...input, createdAt: now, updatedAt: now });
        await loreStore.worldLoreEntries.save(entry);
        return jsonResponse({ data: toWorldLoreEntryDto(entry) }, 201);
      } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
        throw error;
      }
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  const worldLorePath = /^\/v1\/world-lore\/([^/]+)$/.exec(url.pathname);
  if (worldLorePath) {
    const id = decodeURIComponent(worldLorePath[1] ?? "");
    const loreStore = requireWorldLoreStore(store);
    if (request.method === "PUT") {
      trustedActor(ctx, request);
      const input = parseUpdateWorldLoreEntryRequest(await parseBody(request));
      const existing = await loreStore.worldLoreEntries.getById(id);
      if (!existing) throw new ApiError(404, "NOT_FOUND", "World lore entry not found");
      try {
        const entry = createWorldLoreEntryDomain({
          id: existing.id, storyWorldId: existing.storyWorldId,
          category: input.category ?? existing.category, title: input.title ?? existing.title,
          content: input.content ?? existing.content, tags: input.tags ?? existing.tags,
          isEnabled: input.isEnabled ?? existing.isEnabled,
          createdAt: existing.createdAt, updatedAt: new Date().toISOString(),
        });
        await loreStore.worldLoreEntries.save(entry);
        return jsonResponse({ data: toWorldLoreEntryDto(entry) });
      } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
        throw error;
      }
    }
    if (request.method === "DELETE") {
      trustedActor(ctx, request);
      if (!(await loreStore.worldLoreEntries.getById(id))) throw new ApiError(404, "NOT_FOUND", "World lore entry not found");
      await loreStore.worldLoreEntries.delete(id);
      return new Response(null, { status: 204 });
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  // --- World Events ---
  if (url.pathname === "/v1/world-events") {
    if (request.method === "GET") {
      const storyWorldId = url.searchParams.get("storyWorldId");
      if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId is required");
      const eventStore = requireEventCalendarStore(store);
      if (!(await eventStore.storyWorlds.getById(storyWorldId))) throw new ApiError(404, "NOT_FOUND", "Story world not found");
      return jsonResponse({ data: (await eventStore.worldEventDefinitions.listByStoryWorld(storyWorldId)).map(toWorldEventDefinitionDto) });
    }
    if (request.method === "POST") {
      trustedActor(ctx, request);
      const input = parseCreateWorldEventDefinitionRequest(await parseBody(request));
      const eventStore = requireEventCalendarStore(store);
      if (await eventStore.worldEventDefinitions.getById(input.id)) throw new ApiError(409, "CONFLICT", "World event already exists");
      const world = await eventStore.storyWorlds.getById(input.storyWorldId);
      if (!world) throw new ApiError(404, "NOT_FOUND", "Story world not found");
      const targetCharacters = await Promise.all(input.targetCharacterIds.map((id) => store.characters.getById(id)));
      const recipientIds = input.recipientCharacterIds ?? input.targetCharacterIds;
      const recipientCharacters = await Promise.all(recipientIds.map((id) => store.characters.getById(id)));
      if (targetCharacters.some((c) => c === undefined) || recipientCharacters.some((c) => c === undefined)) {
        throw new ApiError(404, "NOT_FOUND", "Event target or recipient character not found");
      }
      try {
        const definition = createWorldEventDefinitionDomain({
          id: input.id, storyWorld: world, eventKey: input.eventKey, name: input.name,
          triggerSource: input.triggerSource, ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
          recurrence: input.recurrence,
          targetCharacters: targetCharacters.filter((c): c is Character => c !== undefined),
          recipientCharacters: recipientCharacters.filter((c): c is Character => c !== undefined),
          ...(input.outputs === undefined ? {} : { outputs: input.outputs }),
          ...(input.priority === undefined ? {} : { priority: input.priority }),
          ...(input.cooldownSeconds === undefined ? {} : { cooldownSeconds: input.cooldownSeconds }),
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
          createdAt: input.createdAt,
        });
        await eventStore.worldEventDefinitions.save(definition);
        return jsonResponse({ data: toWorldEventDefinitionDto(definition) }, 201);
      } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
        throw error;
      }
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  const worldEventPath = /^\/v1\/world-events\/([^/]+)$/.exec(url.pathname);
  if (worldEventPath) {
    if (request.method !== "PUT") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    trustedActor(ctx, request);
    const input = parseUpdateWorldEventDefinitionRequest(await parseBody(request));
    const eventStore = requireEventCalendarStore(store);
    const existing = await eventStore.worldEventDefinitions.getById(decodeURIComponent(worldEventPath[1] ?? ""));
    if (!existing) throw new ApiError(404, "NOT_FOUND", "World event not found");
    const targetIds = input.targetCharacterIds ?? existing.targetCharacterIds;
    const recipientIds = input.recipientCharacterIds ?? existing.recipientCharacterIds;
    const targetCharacters = await Promise.all(targetIds.map((cid) => store.characters.getById(cid)));
    const recipientCharacters = await Promise.all(recipientIds.map((cid) => store.characters.getById(cid)));
    if (targetCharacters.some((c) => c === undefined) || recipientCharacters.some((c) => c === undefined)) {
      throw new ApiError(404, "NOT_FOUND", "Event target or recipient character not found");
    }
    const world = await eventStore.storyWorlds.getById(existing.storyWorldId);
    if (!world) throw new ApiError(409, "CONFLICT", "World event references an unknown story world");
    try {
      const definition = createWorldEventDefinitionDomain({
        id: existing.id, storyWorld: world,
        eventKey: input.eventKey ?? existing.eventKey, name: input.name ?? existing.name,
        triggerSource: input.triggerSource ?? existing.triggerSource,
        timezone: input.timezone ?? existing.timezone,
        recurrence: input.recurrence ?? existing.recurrence,
        targetCharacters: targetCharacters.filter((c): c is Character => c !== undefined),
        recipientCharacters: recipientCharacters.filter((c): c is Character => c !== undefined),
        outputs: { ...existing.outputs, ...input.outputs },
        priority: input.priority ?? existing.priority,
        ...(input.cooldownSeconds === undefined
          ? existing.cooldownSeconds === undefined ? {} : { cooldownSeconds: existing.cooldownSeconds }
          : { cooldownSeconds: input.cooldownSeconds }),
        enabled: input.enabled ?? existing.enabled,
        createdAt: existing.createdAt,
      });
      await eventStore.worldEventDefinitions.save(definition);
      return jsonResponse({ data: toWorldEventDefinitionDto(definition) });
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
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
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new ApiError(400, "BAD_REQUEST", "limit must be an integer between 1 and 500");
    }
    const eventStore = requireEventCalendarStore(store);
    const worldId = decodeURIComponent(calendarPath[1] ?? "");
    if (!(await eventStore.storyWorlds.getById(worldId))) throw new ApiError(404, "NOT_FOUND", "Story world not found");
    try {
      const [definitions, occurrences] = await Promise.all([
        eventStore.worldEventDefinitions.listByStoryWorld(worldId),
        eventStore.scheduledOccurrences.listByWindow(worldId, startsAt, endsAt, limit),
      ]);
      return jsonResponse({ data: { storyWorldId: worldId, startsAt, endsAt, definitions: definitions.map(toWorldEventDefinitionDto), occurrences: occurrences.map(toScheduledOccurrenceDto) } });
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  // --- Characters ---
  if (url.pathname === "/v1/characters") {
    if (request.method === "GET") {
      return jsonResponse({ data: (await store.characters.listByStoryWorld(url.searchParams.get("storyWorldId") ?? undefined)).map(toCharacterDto) });
    }
    if (request.method === "POST") {
      trustedActor(ctx, request);
      const input = parseCreateCharacterRequest(await parseBody(request));
      if (await store.characters.getById(input.id)) throw new ApiError(409, "CONFLICT", "Character already exists");
      if (!(await store.storyWorlds.getById(input.storyWorldId))) throw new ApiError(404, "NOT_FOUND", "Story world not found");
      try {
        const character = createCharacterDomain(input);
        await store.characters.save(character);
        return jsonResponse({ data: toCharacterDto(character) }, 201);
      } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
        throw error;
      }
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  const characterIdPath = /^\/v1\/characters\/([^/]+)$/.exec(url.pathname);
  if (characterIdPath) {
    if (request.method !== "PUT") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    trustedActor(ctx, request);
    const input = parseUpdateCharacterRequest(await parseBody(request));
    const id = decodeURIComponent(characterIdPath[1] ?? "");
    const existing = await store.characters.getById(id);
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Character not found");
    try {
      const updated = createCharacterDomain({
        id: existing.id, displayName: input.displayName ?? existing.displayName,
        role: existing.role, storyWorldId: existing.storyWorldId,
        timezone: input.timezone ?? existing.timezone,
        ...(input.birthDate !== undefined ? { birthDate: input.birthDate } : existing.birthDate !== undefined ? { birthDate: existing.birthDate } : {}),
        ...(input.personaPrompt !== undefined ? { personaPrompt: input.personaPrompt } : existing.personaPrompt !== undefined ? { personaPrompt: existing.personaPrompt } : {}),
        ...(input.personaPromptRef !== undefined ? { personaPromptRef: input.personaPromptRef } : existing.personaPromptRef !== undefined ? { personaPromptRef: existing.personaPromptRef } : {}),
        ...(input.visualPromptRef !== undefined ? { visualPromptRef: input.visualPromptRef } : existing.visualPromptRef !== undefined ? { visualPromptRef: existing.visualPromptRef } : {}),
      });
      await store.characters.save(updated);
      return jsonResponse({ data: toCharacterDto(updated) });
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  // --- Relationships ---
  if (url.pathname === "/v1/relationships") {
    if (request.method === "POST") {
      trustedActor(ctx, request);
      const input = parseCreateRelationshipEdgeRequest(await parseBody(request));
      if (await store.relationshipEdges.getById(input.id)) throw new ApiError(409, "CONFLICT", "Relationship already exists");
      const world = await store.storyWorlds.getById(input.storyWorldId);
      if (!world) throw new ApiError(404, "NOT_FOUND", "Story world not found");
      const source = await store.characters.getById(input.sourceCharacterId);
      const target = await store.characters.getById(input.targetCharacterId);
      if (!source || !target) throw new ApiError(404, "NOT_FOUND", "Relationship character not found");
      try {
        const edge = createRelationshipEdgeDomain({ id: input.id, source, target, storyWorld: world, relationshipType: input.relationshipType, initialState: input.initialState, isPublic: input.isPublic, isBidirectional: input.isBidirectional });
        await store.relationshipEdges.save(edge);
        return jsonResponse({ data: toRelationshipEdgeDto(edge) }, 201);
      } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
        throw error;
      }
    }
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const storyWorldId = url.searchParams.get("storyWorldId");
    if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId is required");
    if (!(await store.storyWorlds.getById(storyWorldId))) throw new ApiError(404, "NOT_FOUND", "Story world not found");
    return jsonResponse({ data: (await store.relationshipEdges.listByStoryWorld(storyWorldId)).map(toRelationshipEdgeDto) });
  }

  const relationshipPath = /^\/v1\/relationships\/([^/]+)$/.exec(url.pathname);
  if (relationshipPath) {
    if (request.method !== "PUT") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    trustedActor(ctx, request);
    const input = parseUpdateRelationshipEdgeRequest(await parseBody(request));
    const id = decodeURIComponent(relationshipPath[1] ?? "");
    const existing = await store.relationshipEdges.getById(id);
    if (!existing) throw new ApiError(404, "NOT_FOUND", "Relationship not found");
    try {
      const world = await store.storyWorlds.getById(existing.storyWorldId);
      const source = await store.characters.getById(existing.sourceCharacterId);
      const target = await store.characters.getById(existing.targetCharacterId);
      if (!world || !source || !target) throw new ApiError(409, "CONFLICT", "Relationship references are invalid");
      const validated = createRelationshipEdgeDomain({
        id: existing.id, source, target, storyWorld: world,
        relationshipType: input.relationshipType ?? existing.relationshipType,
        initialState: { ...(input.initialState ?? existing.initialState) },
        isPublic: input.isPublic ?? existing.isPublic,
        isBidirectional: input.isBidirectional ?? existing.isBidirectional,
      });
      await store.relationshipEdges.save(validated);
      return jsonResponse({ data: toRelationshipEdgeDto(validated) });
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  return undefined;
}
