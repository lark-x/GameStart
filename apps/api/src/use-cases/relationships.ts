import {
  createRelationshipEdge as createRelationshipEdgeDomain,
  type Character,
} from "../../../../packages/domain/src/index.ts";
import type { ApiStore } from "../context.ts";
import { ApiError } from "../helpers.ts";
import { toRelationshipEdgeDto } from "../mappers.ts";
import type {
  CreateRelationshipEdgeRequest,
  UpdateRelationshipEdgeRequest,
  RelationshipEdgeDto,
} from "../../../../packages/contracts/src/index.ts";

export async function listRelationships(store: ApiStore, storyWorldId: string): Promise<RelationshipEdgeDto[]> {
  if (!(await store.storyWorlds.getById(storyWorldId))) throw new ApiError(404, "NOT_FOUND", "Story world not found");
  return (await store.relationshipEdges.listByStoryWorld(storyWorldId)).map(toRelationshipEdgeDto);
}

export async function createRelationship(store: ApiStore, input: CreateRelationshipEdgeRequest): Promise<RelationshipEdgeDto> {
  if (await store.relationshipEdges.getById(input.id)) throw new ApiError(409, "CONFLICT", "Relationship already exists");
  const world = await store.storyWorlds.getById(input.storyWorldId);
  if (!world) throw new ApiError(404, "NOT_FOUND", "Story world not found");
  const source = await store.characters.getById(input.sourceCharacterId);
  const target = await store.characters.getById(input.targetCharacterId);
  if (!source || !target) throw new ApiError(404, "NOT_FOUND", "Relationship character not found");
  try {
    const edge = createRelationshipEdgeDomain({ id: input.id, source, target, storyWorld: world, relationshipType: input.relationshipType, initialState: input.initialState, isPublic: input.isPublic, isBidirectional: input.isBidirectional });
    await store.relationshipEdges.save(edge);
    return toRelationshipEdgeDto(edge);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}

export async function updateRelationship(store: ApiStore, id: string, input: UpdateRelationshipEdgeRequest): Promise<RelationshipEdgeDto> {
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
    return toRelationshipEdgeDto(validated);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}
