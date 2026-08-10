import {
  createWorldEventDefinition as createWorldEventDefinitionDomain,
  type Character,
} from "../../../../packages/domain/src/index.ts";
import type { ApiStore } from "../context.ts";
import { ApiError } from "../helpers.ts";
import { toWorldEventDefinitionDto } from "../mappers.ts";
import { requireEventCalendarStore } from "../store-helpers.ts";
import type {
  CreateWorldEventDefinitionRequest,
  UpdateWorldEventDefinitionRequest,
  WorldEventDefinitionDto,
} from "../../../../packages/contracts/src/index.ts";

export async function listWorldEvents(store: ApiStore, storyWorldId: string): Promise<WorldEventDefinitionDto[]> {
  const eventStore = requireEventCalendarStore(store);
  if (!(await eventStore.storyWorlds.getById(storyWorldId))) {
    throw new ApiError(404, "NOT_FOUND", "Story world not found");
  }
  return (await eventStore.worldEventDefinitions.listByStoryWorld(storyWorldId)).map(toWorldEventDefinitionDto);
}

export async function createWorldEvent(store: ApiStore, input: CreateWorldEventDefinitionRequest): Promise<WorldEventDefinitionDto> {
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
    return toWorldEventDefinitionDto(definition);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}

export async function updateWorldEvent(store: ApiStore, id: string, input: UpdateWorldEventDefinitionRequest): Promise<WorldEventDefinitionDto> {
  const eventStore = requireEventCalendarStore(store);
  const existing = await eventStore.worldEventDefinitions.getById(id);
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
    return toWorldEventDefinitionDto(definition);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}
