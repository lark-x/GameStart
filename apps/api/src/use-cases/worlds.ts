import {
  createStoryWorld as createStoryWorldDomain,
  createWorldLoreEntry as createWorldLoreEntryDomain,
} from "../../../../packages/domain/src/index.ts";
import type { ApiStore } from "../context.ts";
import { ApiError } from "../helpers.ts";
import {
  toWorldDto,
  toWorldEventDefinitionDto,
  toScheduledOccurrenceDto,
  toWorldLoreEntryDto,
} from "../mappers.ts";
import {
  requireEventCalendarStore,
  requireWorldLoreStore,
} from "../store-helpers.ts";
import type {
  CreateStoryWorldRequest,
  UpdateStoryWorldRequest,
  StoryWorldDto,
  WorldEventDefinitionDto,
  ScheduledOccurrenceDto,
  WorldLoreEntryDto,
  CreateWorldLoreEntryRequest,
  UpdateWorldLoreEntryRequest,
} from "../../../../packages/contracts/src/index.ts";

export async function listWorlds(store: ApiStore): Promise<StoryWorldDto[]> {
  return (await store.storyWorlds.list()).map(toWorldDto);
}

export async function createWorld(store: ApiStore, input: CreateStoryWorldRequest): Promise<StoryWorldDto> {
  if (await store.storyWorlds.getById(input.id)) {
    throw new ApiError(409, "CONFLICT", "Story world already exists");
  }
  try {
    const world = createStoryWorldDomain(input);
    await store.storyWorlds.save(world);
    return toWorldDto(world);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}

export async function updateWorld(store: ApiStore, id: string, input: UpdateStoryWorldRequest): Promise<StoryWorldDto> {
  const existing = await store.storyWorlds.getById(id);
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
    return toWorldDto(updated);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}

export async function getWorldCalendar(
  store: ApiStore,
  worldId: string,
  startsAt: string,
  endsAt: string,
  limit: number,
): Promise<{ storyWorldId: string; startsAt: string; endsAt: string; definitions: WorldEventDefinitionDto[]; occurrences: ScheduledOccurrenceDto[] }> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new ApiError(400, "BAD_REQUEST", "limit must be an integer between 1 and 500");
  }
  const eventStore = requireEventCalendarStore(store);
  if (!(await eventStore.storyWorlds.getById(worldId))) throw new ApiError(404, "NOT_FOUND", "Story world not found");
  try {
    const [definitions, occurrences] = await Promise.all([
      eventStore.worldEventDefinitions.listByStoryWorld(worldId),
      eventStore.scheduledOccurrences.listByWindow(worldId, startsAt, endsAt, limit),
    ]);
    return {
      storyWorldId: worldId, startsAt, endsAt,
      definitions: definitions.map(toWorldEventDefinitionDto),
      occurrences: occurrences.map(toScheduledOccurrenceDto),
    };
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}

export async function listWorldLoreEntries(store: ApiStore, storyWorldId: string, query?: string): Promise<WorldLoreEntryDto[]> {
  const loreStore = requireWorldLoreStore(store);
  if (!(await store.storyWorlds.getById(storyWorldId))) throw new ApiError(404, "NOT_FOUND", "Story world not found");
  const entries = query === undefined
    ? await loreStore.worldLoreEntries.listByStoryWorld(storyWorldId)
    : await loreStore.worldLoreEntries.search(storyWorldId, query);
  return entries.map(toWorldLoreEntryDto);
}

export async function createWorldLoreEntry(store: ApiStore, input: CreateWorldLoreEntryRequest): Promise<WorldLoreEntryDto> {
  const loreStore = requireWorldLoreStore(store);
  if (await loreStore.worldLoreEntries.getById(input.id)) throw new ApiError(409, "CONFLICT", "World lore entry already exists");
  if (!(await store.storyWorlds.getById(input.storyWorldId))) throw new ApiError(404, "NOT_FOUND", "Story world not found");
  try {
    const now = new Date().toISOString();
    const entry = createWorldLoreEntryDomain({ ...input, createdAt: now, updatedAt: now });
    await loreStore.worldLoreEntries.save(entry);
    return toWorldLoreEntryDto(entry);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}

export async function updateWorldLoreEntry(store: ApiStore, id: string, input: UpdateWorldLoreEntryRequest): Promise<WorldLoreEntryDto> {
  const loreStore = requireWorldLoreStore(store);
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
    return toWorldLoreEntryDto(entry);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}

export async function deleteWorldLoreEntry(store: ApiStore, id: string): Promise<void> {
  const loreStore = requireWorldLoreStore(store);
  if (!(await loreStore.worldLoreEntries.getById(id))) throw new ApiError(404, "NOT_FOUND", "World lore entry not found");
  await loreStore.worldLoreEntries.delete(id);
}
