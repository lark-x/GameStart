import {
  createCharacter as createCharacterDomain,
} from "../../../../packages/domain/src/index.ts";
import type { ApiStore } from "../context.ts";
import { ApiError } from "../helpers.ts";
import { toCharacterDto, toCharacterVisualIdentityDto } from "../mappers.ts";
import { requireVisualWorkflowStore } from "../store-helpers.ts";
import type {
  CreateCharacterRequest,
  UpdateCharacterRequest,
  CharacterDto,
  CharacterVisualIdentityDto,
} from "../../../../packages/contracts/src/index.ts";

export async function listCharacters(store: ApiStore, storyWorldId?: string): Promise<CharacterDto[]> {
  return (await store.characters.listByStoryWorld(storyWorldId ?? undefined)).map(toCharacterDto);
}

export async function createCharacter(store: ApiStore, input: CreateCharacterRequest): Promise<CharacterDto> {
  if (await store.characters.getById(input.id)) throw new ApiError(409, "CONFLICT", "Character already exists");
  if (!(await store.storyWorlds.getById(input.storyWorldId))) throw new ApiError(404, "NOT_FOUND", "Story world not found");
  try {
    const character = createCharacterDomain(input);
    await store.characters.save(character);
    return toCharacterDto(character);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}

export async function updateCharacter(store: ApiStore, id: string, input: UpdateCharacterRequest): Promise<CharacterDto> {
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
    return toCharacterDto(updated);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}

export async function getCharacterVisualIdentity(store: ApiStore, characterId: string): Promise<CharacterVisualIdentityDto> {
  const vwStore = requireVisualWorkflowStore(store);
  if (!(await store.characters.getById(characterId))) throw new ApiError(404, "NOT_FOUND", "Character not found");
  const identity = await vwStore.characterVisualIdentities.getByCharacterId(characterId);
  if (!identity) throw new ApiError(404, "NOT_FOUND", "Character visual identity not found");
  return toCharacterVisualIdentityDto(identity);
}
