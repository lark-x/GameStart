import { createHash } from "node:crypto";

import type {
  V2CharacterDto,
  V2CanonSnapshotDto,
  V2CanonWriteResponse,
  V2CreateCharacterRequest,
  V2CreateFactRequest,
  V2CreateLocationRequest,
  V2CreateRuleRequest,
  V2CreateStoryWorldRequest,
  V2CreateTimelineEventRequest,
  V2FactDto,
  V2LocationId,
  V2Revision,
  V2LocationDto,
  V2RuleDto,
  V2StoryWorldDto,
  V2StoryWorldId,
  V2TimelineEventDto,
} from "@living-network/contracts";
import {
  createV2CanonCharacter,
  createV2CanonFact,
  createV2CanonLocation,
  createV2CanonRule,
  createV2CanonTimelineEvent,
  createV2CanonWorld,
} from "@living-network/domain";
import type {
  V2CanonMutationRecord,
  V2CanonRepository,
  V2CanonUnitOfWork,
} from "@living-network/ports";

import { V2HttpError } from "./errors.ts";

export interface V2CoreUseCases {
  createWorld(input: V2CreateStoryWorldRequest): Promise<V2CanonWriteResponse<V2StoryWorldDto>>;
  listWorlds(): Promise<readonly V2StoryWorldDto[]>;
  getSnapshot(storyWorldId: V2StoryWorldId): Promise<V2CanonSnapshotDto>;
  createLocation(storyWorldId: V2StoryWorldId, input: V2CreateLocationRequest): Promise<V2CanonWriteResponse<V2LocationDto>>;
  createCharacter(storyWorldId: V2StoryWorldId, input: V2CreateCharacterRequest): Promise<V2CanonWriteResponse<V2CharacterDto>>;
  createFact(storyWorldId: V2StoryWorldId, input: V2CreateFactRequest): Promise<V2CanonWriteResponse<V2FactDto>>;
  createRule(storyWorldId: V2StoryWorldId, input: V2CreateRuleRequest): Promise<V2CanonWriteResponse<V2RuleDto>>;
  createTimelineEvent(storyWorldId: V2StoryWorldId, input: V2CreateTimelineEventRequest): Promise<V2CanonWriteResponse<V2TimelineEventDto>>;
}

export function createV2CoreUseCases(unitOfWork: V2CanonUnitOfWork): V2CoreUseCases {
  return {
    createWorld: (input) => unitOfWork.withCanonTransaction(async ({ canon }) =>
      withIdempotency(canon, "createWorld", input.idempotencyKey, input, async () => {
        const world = await canon.createWorld(createV2CanonWorld(input));
        return { item: toWorldDto(world), revision: world.revision as V2Revision };
      }),
    ),
    listWorlds: () => unitOfWork.withCanonTransaction(async ({ canon }) =>
      (await canon.listWorlds()).map(toWorldDto),
    ),
    getSnapshot: (storyWorldId) => unitOfWork.withCanonTransaction(async ({ canon }) =>
      buildSnapshot(canon, storyWorldId),
    ),
    createLocation: (storyWorldId, input) => unitOfWork.withCanonTransaction(async ({ canon }) =>
      withIdempotency(canon, "createLocation", input.idempotencyKey, { storyWorldId, ...input }, async () => {
        const world = await requireWorld(canon, storyWorldId);
        const item = await canon.createLocation(createV2CanonLocation({ storyWorldId, ...input }));
        const revision = await canon.advanceRevision(storyWorldId, input.expectedRevision);
        void world;
        return { item: toLocationDto(item), revision };
      }),
    ),
    createCharacter: (storyWorldId, input) => unitOfWork.withCanonTransaction(async ({ canon }) =>
      withIdempotency(canon, "createCharacter", input.idempotencyKey, { storyWorldId, ...input }, async () => {
        await requireWorld(canon, storyWorldId);
        const item = await canon.createCharacter(createV2CanonCharacter({
          storyWorldId,
          characterId: input.characterId,
          name: input.name,
          ...(input.summary === undefined ? {} : { summary: input.summary }),
          ...(input.homeLocationId === undefined ? {} : {
            homeLocation: await requireLocation(canon, storyWorldId, input.homeLocationId),
          }),
        }));
        const revision = await canon.advanceRevision(storyWorldId, input.expectedRevision);
        return { item: toCharacterDto(item), revision };
      }),
    ),
    createFact: (storyWorldId, input) => unitOfWork.withCanonTransaction(async ({ canon }) =>
      withIdempotency(canon, "createFact", input.idempotencyKey, { storyWorldId, ...input }, async () => {
        await requireWorld(canon, storyWorldId);
        const item = await canon.createFact(createV2CanonFact({ storyWorldId, ...input }));
        const revision = await canon.advanceRevision(storyWorldId, input.expectedRevision);
        return { item: toFactDto(item), revision };
      }),
    ),
    createRule: (storyWorldId, input) => unitOfWork.withCanonTransaction(async ({ canon }) =>
      withIdempotency(canon, "createRule", input.idempotencyKey, { storyWorldId, ...input }, async () => {
        await requireWorld(canon, storyWorldId);
        const item = await canon.createRule(createV2CanonRule({ storyWorldId, ...input }));
        const revision = await canon.advanceRevision(storyWorldId, input.expectedRevision);
        return { item: toRuleDto(item), revision };
      }),
    ),
    createTimelineEvent: (storyWorldId, input) => unitOfWork.withCanonTransaction(async ({ canon }) =>
      withIdempotency(canon, "createTimelineEvent", input.idempotencyKey, { storyWorldId, ...input }, async () => {
        await requireWorld(canon, storyWorldId);
        const item = await canon.createTimelineEvent(createV2CanonTimelineEvent({ storyWorldId, ...input }));
        const revision = await canon.advanceRevision(storyWorldId, input.expectedRevision);
        return { item: toTimelineEventDto(item), revision };
      }),
    ),
  };
}

async function withIdempotency<TResult>(
  canon: V2CanonRepository,
  operation: string,
  key: V2CanonMutationRecord<TResult>["key"],
  payload: unknown,
  run: () => Promise<TResult>,
): Promise<TResult> {
  const payloadHash = hashV2CanonPayload(payload);
  const existing = await canon.readMutation<TResult>({ key, operation });
  if (existing) {
    if (existing.payloadHash !== payloadHash) {
      throw new V2HttpError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different payload");
    }
    return existing.result;
  }
  const result = await run();
  await canon.saveMutation({ key, operation, payloadHash, result });
  return result;
}

async function requireWorld(canon: V2CanonRepository, storyWorldId: V2StoryWorldId) {
  const world = await canon.getWorld(storyWorldId);
  if (!world) throw new V2HttpError(404, "NOT_FOUND", "Story world not found");
  return world;
}

async function requireLocation(canon: V2CanonRepository, storyWorldId: V2StoryWorldId, locationId: unknown) {
  if (typeof locationId !== "string") throw new V2HttpError(400, "BAD_REQUEST", "homeLocationId must be a string");
  const location = await canon.getLocation({ storyWorldId, locationId: locationId as never });
  if (!location) throw new V2HttpError(422, "VALIDATION_FAILED", "homeLocationId must reference an existing location in this story world");
  return location;
}

async function buildSnapshot(canon: V2CanonRepository, storyWorldId: V2StoryWorldId): Promise<V2CanonSnapshotDto> {
  const world = await requireWorld(canon, storyWorldId);
  return {
    world: toWorldDto(world),
    locations: (await canon.listLocations(storyWorldId)).map(toLocationDto),
    characters: (await canon.listCharacters(storyWorldId)).map(toCharacterDto),
    facts: (await canon.listFacts(storyWorldId)).map(toFactDto),
    rules: (await canon.listRules(storyWorldId)).map(toRuleDto),
    timelineEvents: (await canon.listTimelineEvents(storyWorldId)).map(toTimelineEventDto),
  };
}

function toWorldDto(world: Awaited<ReturnType<V2CanonRepository["getWorld"]>> & {}): V2StoryWorldDto {
  return {
    storyWorldId: world.storyWorldId as V2StoryWorldId,
    name: world.name,
    ...(world.summary === undefined ? {} : { summary: world.summary }),
    revision: world.revision as V2Revision,
    createdAt: world.createdAt ?? "1970-01-01T00:00:00.000Z",
    updatedAt: world.updatedAt ?? "1970-01-01T00:00:00.000Z",
  };
}

function toLocationDto(location: Awaited<ReturnType<V2CanonRepository["getLocation"]>> & {}): V2LocationDto {
  return {
    locationId: location.locationId as V2LocationDto["locationId"],
    storyWorldId: location.storyWorldId as V2StoryWorldId,
    name: location.name,
    ...(location.summary === undefined ? {} : { summary: location.summary }),
    createdAt: location.createdAt ?? "1970-01-01T00:00:00.000Z",
  };
}

function toCharacterDto(character: Awaited<ReturnType<V2CanonRepository["getCharacter"]>> & {}): V2CharacterDto {
  return {
    characterId: character.characterId as V2CharacterDto["characterId"],
    storyWorldId: character.storyWorldId as V2StoryWorldId,
    name: character.name,
    ...(character.summary === undefined ? {} : { summary: character.summary }),
    ...(character.homeLocationId === undefined ? {} : { homeLocationId: character.homeLocationId as V2LocationId }),
    createdAt: character.createdAt ?? "1970-01-01T00:00:00.000Z",
  };
}

function toFactDto(fact: Awaited<ReturnType<V2CanonRepository["listFacts"]>>[number]): V2FactDto {
  return {
    factId: fact.factId,
    storyWorldId: fact.storyWorldId as V2StoryWorldId,
    text: fact.text,
    visibility: fact.visibility,
    createdAt: fact.createdAt ?? "1970-01-01T00:00:00.000Z",
  };
}

function toRuleDto(rule: Awaited<ReturnType<V2CanonRepository["listRules"]>>[number]): V2RuleDto {
  return {
    ruleId: rule.ruleId,
    storyWorldId: rule.storyWorldId as V2StoryWorldId,
    text: rule.text,
    severity: rule.severity,
    createdAt: rule.createdAt ?? "1970-01-01T00:00:00.000Z",
  };
}

function toTimelineEventDto(event: Awaited<ReturnType<V2CanonRepository["listTimelineEvents"]>>[number]): V2TimelineEventDto {
  return {
    timelineEventId: event.timelineEventId,
    storyWorldId: event.storyWorldId as V2StoryWorldId,
    localDate: event.localDate,
    title: event.title,
    ...(event.summary === undefined ? {} : { summary: event.summary }),
    createdAt: event.createdAt ?? "1970-01-01T00:00:00.000Z",
  };
}

function hashV2CanonPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
