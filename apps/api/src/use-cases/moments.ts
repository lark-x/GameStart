import {
  createMomentInteraction as createMomentInteractionDomain,
  isMomentVisibleTo,
} from "@living-network/domain";
import type { ApiStore } from "../context.ts";
import { ApiError } from "../helpers.ts";
import { toMomentDto, toMomentInteractionDto } from "../mappers.ts";
import { requireMomentStore } from "../store-helpers.ts";
import type {
  CreateMomentInteractionRequest,
  MomentDto,
  MomentInteractionDto,
} from "@living-network/contracts";

export async function listMoments(store: ApiStore, storyWorldId: string, readerCharacterId: string, limit: number): Promise<MomentDto[]> {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new ApiError(400, "BAD_REQUEST", "limit must be a positive integer");
  }
  const momentStore = requireMomentStore(store);
  if (!(await store.storyWorlds.getById(storyWorldId))) throw new ApiError(404, "NOT_FOUND", "Story world not found");
  if (!(await store.characters.getById(readerCharacterId))) throw new ApiError(404, "NOT_FOUND", "Reader character not found");
  try {
    return (await momentStore.moments.listFeed(storyWorldId, readerCharacterId, limit)).map(toMomentDto);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}

export async function listMomentInteractions(store: ApiStore, momentId: string, readerCharacterId: string): Promise<MomentInteractionDto[]> {
  const momentStore = requireMomentStore(store);
  const moment = await momentStore.moments.getById(momentId);
  if (!moment) throw new ApiError(404, "NOT_FOUND", "Moment not found");
  if (!(await store.characters.getById(readerCharacterId))) throw new ApiError(404, "NOT_FOUND", "Reader character not found");
  if (!isMomentVisibleTo(moment, readerCharacterId)) throw new ApiError(403, "FORBIDDEN", "Character cannot view this moment");
  return (await momentStore.momentInteractions.listByMoment(momentId)).map(toMomentInteractionDto);
}

export async function createMomentInteraction(store: ApiStore, momentId: string, input: CreateMomentInteractionRequest): Promise<{ interaction: MomentInteractionDto; inserted: boolean }> {
  const momentStore = requireMomentStore(store);
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
    return { interaction: toMomentInteractionDto(result.interaction), inserted: result.inserted };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("idempotency")) throw new ApiError(409, "CONFLICT", error.message);
    if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}
