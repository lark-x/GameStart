import { createHash } from "node:crypto";

import type {
  V2CharacterDto,
  V2ArcDto,
  V2CandidateId,
  V2CandidateReviewAuditDto,
  V2CandidateReviewResponse,
  V2ChoiceDto,
  V2CanonSnapshotDto,
  V2CanonWriteResponse,
  V2CreateArcRequest,
  V2CreateCharacterRequest,
  V2CreateChoiceRequest,
  V2CreateFactRequest,
  V2CreateLocationRequest,
  V2CreateRuleRequest,
  V2CreateSceneRequest,
  V2CreateStoryWorldRequest,
  V2CreateStateVariableRequest,
  V2CreateTimelineEventRequest,
  V2FactDto,
  V2GraphSnapshotDto,
  V2GraphValidationDto,
  V2LocationId,
  V2Revision,
  V2LocationDto,
  V2PreviewStateDeltaRequest,
  V2RuleDto,
  V2SceneDto,
  V2ReviewCandidateRequest,
  V2SceneCandidatePayload,
  V2StateDeltaPreviewDto,
  V2StateSnapshotDto,
  V2StateVariableDto,
  V2StoryWorldDto,
  V2StoryWorldId,
  V2SubmitSceneCandidateRequest,
  V2TimelineEventDto,
  V2SceneCandidateDto,
} from "@living-network/contracts";
import type {
  V2CoreSceneCandidatePayload,
} from "@living-network/domain";
import {
  buildV2SceneCandidateApplyPlan,
  buildV2InitialTypedState,
  createV2SceneCandidate,
  createV2CanonCharacter,
  createV2CanonFact,
  createV2CanonLocation,
  createV2CanonRule,
  createV2CanonTimelineEvent,
  createV2CanonWorld,
  createV2GraphArc,
  createV2GraphChoice,
  createV2GraphScene,
  createV2TypedStateVariable,
  previewV2TypedStateDelta,
  reviewV2SceneCandidate,
  validateV2Graph,
} from "@living-network/domain";
import type {
  V2CanonMutationRecord,
  V2CanonRepository,
  V2CanonUnitOfWork,
  V2CandidateReviewAuditRecord,
  V2CandidateReviewRepository,
  V2CandidateReviewUnitOfWork,
  V2GraphStateRepository,
  V2GraphStateUnitOfWork,
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
  getGraph(storyWorldId: V2StoryWorldId): Promise<V2GraphSnapshotDto>;
  validateGraph(storyWorldId: V2StoryWorldId): Promise<V2GraphValidationDto>;
  createArc(storyWorldId: V2StoryWorldId, input: V2CreateArcRequest): Promise<V2CanonWriteResponse<V2ArcDto>>;
  createScene(storyWorldId: V2StoryWorldId, input: V2CreateSceneRequest): Promise<V2CanonWriteResponse<V2SceneDto>>;
  createChoice(storyWorldId: V2StoryWorldId, input: V2CreateChoiceRequest): Promise<V2CanonWriteResponse<V2ChoiceDto>>;
  listStateVariables(storyWorldId: V2StoryWorldId): Promise<readonly V2StateVariableDto[]>;
  createStateVariable(storyWorldId: V2StoryWorldId, input: V2CreateStateVariableRequest): Promise<V2CanonWriteResponse<V2StateVariableDto>>;
  getInitialState(storyWorldId: V2StoryWorldId): Promise<V2StateSnapshotDto>;
  previewStateDelta(storyWorldId: V2StoryWorldId, input: V2PreviewStateDeltaRequest): Promise<V2StateDeltaPreviewDto>;
  submitSceneCandidate(storyWorldId: V2StoryWorldId, input: V2SubmitSceneCandidateRequest): Promise<V2SceneCandidateDto>;
  listSceneCandidates(storyWorldId: V2StoryWorldId): Promise<readonly V2SceneCandidateDto[]>;
  getSceneCandidate(storyWorldId: V2StoryWorldId, candidateId: V2CandidateId): Promise<V2SceneCandidateDto>;
  reviewSceneCandidate(
    storyWorldId: V2StoryWorldId,
    candidateId: V2CandidateId,
    input: V2ReviewCandidateRequest,
  ): Promise<V2CandidateReviewResponse>;
  listCandidateReviewAudits(storyWorldId: V2StoryWorldId, candidateId: V2CandidateId): Promise<readonly V2CandidateReviewAuditDto[]>;
}

export function createV2CoreUseCases(
  unitOfWork: V2CanonUnitOfWork,
  graphStateUnitOfWork?: V2GraphStateUnitOfWork,
  candidateReviewUnitOfWork?: V2CandidateReviewUnitOfWork,
): V2CoreUseCases {
  const requireGraphState = () => {
    if (!graphStateUnitOfWork) {
      throw new V2HttpError(503, "SERVICE_UNAVAILABLE", "V2 graph/state dependencies are not configured");
    }
    return graphStateUnitOfWork;
  };
  const requireCandidateReview = () => {
    if (!candidateReviewUnitOfWork) {
      throw new V2HttpError(503, "SERVICE_UNAVAILABLE", "V2 candidate review dependencies are not configured");
    }
    return candidateReviewUnitOfWork;
  };
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
    getGraph: (storyWorldId) => requireGraphState().withGraphStateTransaction(async ({ canon, graphState }) => {
      await requireWorld(canon, storyWorldId);
      return buildGraphSnapshot(graphState, storyWorldId);
    }),
    validateGraph: (storyWorldId) => requireGraphState().withGraphStateTransaction(async ({ canon, graphState }) => {
      await requireWorld(canon, storyWorldId);
      const validation = validateV2Graph({
        scenes: await graphState.listScenes(storyWorldId),
        choices: await graphState.listChoices(storyWorldId),
      });
      return {
        valid: validation.valid,
        diagnostics: validation.diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          severity: diagnostic.severity,
          message: diagnostic.message,
          ...(diagnostic.sceneId === undefined ? {} : { sceneId: diagnostic.sceneId as V2SceneDto["sceneId"] }),
          ...(diagnostic.choiceId === undefined ? {} : { choiceId: diagnostic.choiceId as V2ChoiceDto["choiceId"] }),
        })),
      };
    }),
    createArc: (storyWorldId, input) => requireGraphState().withGraphStateTransaction(async ({ canon, graphState }) =>
      withIdempotency(canon, "createArc", input.idempotencyKey, { storyWorldId, ...input }, async () => {
        await requireWorld(canon, storyWorldId);
        const item = await graphState.createArc(createV2GraphArc({ storyWorldId, ...input }));
        const revision = await canon.advanceRevision(storyWorldId, input.expectedRevision);
        return { item: toArcDto(item), revision };
      }),
    ),
    createScene: (storyWorldId, input) => requireGraphState().withGraphStateTransaction(async ({ canon, graphState }) =>
      withIdempotency(canon, "createScene", input.idempotencyKey, { storyWorldId, ...input }, async () => {
        await requireWorld(canon, storyWorldId);
        const item = await graphState.createScene(createV2GraphScene({
          storyWorldId,
          sceneId: input.sceneId,
          ...(input.arcId === undefined ? {} : { arc: await requireArc(graphState, storyWorldId, input.arcId) }),
          title: input.title,
          ...(input.body === undefined ? {} : { body: input.body }),
          ...(input.isEntry === undefined ? {} : { isEntry: input.isEntry }),
        }));
        const revision = await canon.advanceRevision(storyWorldId, input.expectedRevision);
        return { item: toSceneDto(item), revision };
      }),
    ),
    createChoice: (storyWorldId, input) => requireGraphState().withGraphStateTransaction(async ({ canon, graphState }) =>
      withIdempotency(canon, "createChoice", input.idempotencyKey, { storyWorldId, ...input }, async () => {
        await requireWorld(canon, storyWorldId);
        const item = await graphState.createChoice(createV2GraphChoice({
          storyWorldId,
          choiceId: input.choiceId,
          sourceScene: await requireScene(graphState, storyWorldId, input.sourceSceneId),
          ...(input.targetSceneId === undefined ? {} : { targetScene: await requireScene(graphState, storyWorldId, input.targetSceneId) }),
          label: input.label,
          gates: input.gates ?? [],
          consequences: input.consequences ?? [],
        }));
        const revision = await canon.advanceRevision(storyWorldId, input.expectedRevision);
        return { item: toChoiceDto(item), revision };
      }),
    ),
    listStateVariables: (storyWorldId) => requireGraphState().withGraphStateTransaction(async ({ canon, graphState }) => {
      await requireWorld(canon, storyWorldId);
      return (await graphState.listStateVariables(storyWorldId)).map(toStateVariableDto);
    }),
    createStateVariable: (storyWorldId, input) => requireGraphState().withGraphStateTransaction(async ({ canon, graphState }) =>
      withIdempotency(canon, "createStateVariable", input.idempotencyKey, { storyWorldId, ...input }, async () => {
        await requireWorld(canon, storyWorldId);
        const item = await graphState.createStateVariable(createV2TypedStateVariable({ storyWorldId, ...input }));
        const revision = await canon.advanceRevision(storyWorldId, input.expectedRevision);
        return { item: toStateVariableDto(item), revision };
      }),
    ),
    getInitialState: (storyWorldId) => requireGraphState().withGraphStateTransaction(async ({ canon, graphState }) => {
      await requireWorld(canon, storyWorldId);
      return { values: buildV2InitialTypedState(await graphState.listStateVariables(storyWorldId)) };
    }),
    previewStateDelta: (storyWorldId, input) => requireGraphState().withGraphStateTransaction(async ({ canon, graphState }) => {
      await requireWorld(canon, storyWorldId);
      return previewV2TypedStateDelta({
        schema: await graphState.listStateVariables(storyWorldId),
        ...(input.currentValues === undefined ? {} : { currentValues: input.currentValues }),
        deltas: input.deltas,
      });
    }),
    submitSceneCandidate: (storyWorldId, input) => requireCandidateReview().withCandidateReviewTransaction(async ({ canon, candidateReview }) =>
      withIdempotency(canon, "submitSceneCandidate", input.idempotencyKey, { storyWorldId, ...input }, async () => {
        await requireWorld(canon, storyWorldId);
        const item = await candidateReview.createSceneCandidate(createV2SceneCandidate({ storyWorldId, ...input }));
        return toSceneCandidateDto(item);
      }),
    ),
    listSceneCandidates: (storyWorldId) => requireCandidateReview().withCandidateReviewTransaction(async ({ canon, candidateReview }) => {
      await requireWorld(canon, storyWorldId);
      return (await candidateReview.listSceneCandidates(storyWorldId)).map(toSceneCandidateDto);
    }),
    getSceneCandidate: (storyWorldId, candidateId) => requireCandidateReview().withCandidateReviewTransaction(async ({ canon, candidateReview }) => {
      await requireWorld(canon, storyWorldId);
      return toSceneCandidateDto(await requireSceneCandidate(candidateReview, storyWorldId, candidateId));
    }),
    reviewSceneCandidate: (storyWorldId, candidateId, input) => requireCandidateReview().withCandidateReviewTransaction(async ({ canon, graphState, candidateReview }) =>
      withIdempotency(canon, "reviewSceneCandidate", input.idempotencyKey, { storyWorldId, candidateId, ...input }, async () => {
        await requireWorld(canon, storyWorldId);
        const existing = await requireSceneCandidate(candidateReview, storyWorldId, candidateId);
        const reviewed = reviewV2SceneCandidate({ candidate: existing, ...input });
        let appliedChoiceIds: readonly string[] = [];
        if (input.action === "approve") {
          const plan = buildV2SceneCandidateApplyPlan(existing);
          if (existing.payload.scene.locationId !== undefined) {
            await requireLocation(canon, storyWorldId, existing.payload.scene.locationId);
          }
          for (const characterId of existing.payload.scene.participantCharacterIds) {
            await requireCharacter(canon, storyWorldId, characterId);
          }
          for (const choice of plan.choices) {
            if (choice.targetSceneId !== undefined) await requireScene(graphState, storyWorldId, choice.targetSceneId);
          }
          const createdScene = await graphState.createScene(createV2GraphScene({
            storyWorldId,
            sceneId: plan.scene.sceneId as V2SceneDto["sceneId"],
            title: plan.scene.title,
            body: plan.scene.body,
          }));
          const createdChoices = [];
          for (const choice of plan.choices) {
            createdChoices.push(await graphState.createChoice(createV2GraphChoice({
              storyWorldId,
              choiceId: choice.choiceId as V2ChoiceDto["choiceId"],
              sourceScene: createdScene,
              ...(choice.targetSceneId === undefined ? {} : { targetScene: await requireScene(graphState, storyWorldId, choice.targetSceneId) }),
              label: choice.label,
            })));
          }
          appliedChoiceIds = createdChoices.map((choice) => choice.choiceId);
        }
        const revision = await canon.advanceRevision(storyWorldId, input.expectedRevision);
        const updated = await candidateReview.updateSceneCandidateReview({
          candidate: reviewed,
          reviewedAt: new Date().toISOString(),
        });
        await candidateReview.createAudit({
          candidateId,
          storyWorldId,
          fromStatus: existing.status,
          toStatus: updated.status,
          action: input.action,
          reviewer: input.reviewer,
          ...(input.reason === undefined ? {} : { reason: input.reason }),
          resultingRevision: revision,
        });
        return {
          candidate: toSceneCandidateDto(updated),
          revision,
          ...(input.action === "approve" ? { appliedSceneId: existing.payload.scene.sceneId as V2SceneDto["sceneId"] } : {}),
          appliedChoiceIds,
        };
      }),
    ),
    listCandidateReviewAudits: (storyWorldId, candidateId) => requireCandidateReview().withCandidateReviewTransaction(async ({ canon, candidateReview }) => {
      await requireWorld(canon, storyWorldId);
      await requireSceneCandidate(candidateReview, storyWorldId, candidateId);
      return (await candidateReview.listAudits({ storyWorldId, candidateId })).map(toCandidateReviewAuditDto);
    }),
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

async function requireCharacter(canon: V2CanonRepository, storyWorldId: V2StoryWorldId, characterId: unknown) {
  if (typeof characterId !== "string") throw new V2HttpError(400, "BAD_REQUEST", "characterId must be a string");
  const character = await canon.getCharacter({ storyWorldId, characterId: characterId as never });
  if (!character) throw new V2HttpError(422, "VALIDATION_FAILED", "participantCharacterIds must reference existing characters in this story world");
  return character;
}

async function requireArc(graphState: V2GraphStateRepository, storyWorldId: V2StoryWorldId, arcId: unknown) {
  if (typeof arcId !== "string") throw new V2HttpError(400, "BAD_REQUEST", "arcId must be a string");
  const arc = await graphState.getArc({ storyWorldId, arcId: arcId as never });
  if (!arc) throw new V2HttpError(422, "VALIDATION_FAILED", "arcId must reference an existing arc in this story world");
  return arc;
}

async function requireScene(graphState: V2GraphStateRepository, storyWorldId: V2StoryWorldId, sceneId: unknown) {
  if (typeof sceneId !== "string") throw new V2HttpError(400, "BAD_REQUEST", "sceneId must be a string");
  const scene = await graphState.getScene({ storyWorldId, sceneId: sceneId as never });
  if (!scene) throw new V2HttpError(422, "VALIDATION_FAILED", "sceneId must reference an existing scene in this story world");
  return scene;
}

async function requireSceneCandidate(
  candidateReview: V2CandidateReviewRepository,
  storyWorldId: V2StoryWorldId,
  candidateId: unknown,
) {
  if (typeof candidateId !== "string") throw new V2HttpError(400, "BAD_REQUEST", "candidateId must be a string");
  const candidate = await candidateReview.getSceneCandidate({ storyWorldId, candidateId: candidateId as never });
  if (!candidate) throw new V2HttpError(404, "NOT_FOUND", "Scene candidate not found");
  return candidate;
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

async function buildGraphSnapshot(graphState: V2GraphStateRepository, storyWorldId: V2StoryWorldId): Promise<V2GraphSnapshotDto> {
  return {
    arcs: (await graphState.listArcs(storyWorldId)).map(toArcDto),
    scenes: (await graphState.listScenes(storyWorldId)).map(toSceneDto),
    choices: (await graphState.listChoices(storyWorldId)).map(toChoiceDto),
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

function toArcDto(arc: Awaited<ReturnType<V2GraphStateRepository["getArc"]>> & {}): V2ArcDto {
  return {
    arcId: arc.arcId as V2ArcDto["arcId"],
    storyWorldId: arc.storyWorldId as V2StoryWorldId,
    title: arc.title,
    ...(arc.summary === undefined ? {} : { summary: arc.summary }),
    createdAt: arc.createdAt ?? "1970-01-01T00:00:00.000Z",
  };
}

function toSceneDto(scene: Awaited<ReturnType<V2GraphStateRepository["getScene"]>> & {}): V2SceneDto {
  return {
    sceneId: scene.sceneId as V2SceneDto["sceneId"],
    storyWorldId: scene.storyWorldId as V2StoryWorldId,
    ...(scene.arcId === undefined ? {} : { arcId: scene.arcId as V2ArcDto["arcId"] }),
    title: scene.title,
    ...(scene.body === undefined ? {} : { body: scene.body }),
    isEntry: scene.isEntry,
    createdAt: scene.createdAt ?? "1970-01-01T00:00:00.000Z",
  };
}

function toChoiceDto(choice: Awaited<ReturnType<V2GraphStateRepository["getChoice"]>> & {}): V2ChoiceDto {
  return {
    choiceId: choice.choiceId as V2ChoiceDto["choiceId"],
    storyWorldId: choice.storyWorldId as V2StoryWorldId,
    sourceSceneId: choice.sourceSceneId as V2SceneDto["sceneId"],
    ...(choice.targetSceneId === undefined ? {} : { targetSceneId: choice.targetSceneId as V2SceneDto["sceneId"] }),
    label: choice.label,
    gates: choice.gates,
    consequences: choice.consequences,
    createdAt: choice.createdAt ?? "1970-01-01T00:00:00.000Z",
  };
}

function toStateVariableDto(variable: Awaited<ReturnType<V2GraphStateRepository["getStateVariable"]>> & {}): V2StateVariableDto {
  return {
    storyWorldId: variable.storyWorldId as V2StoryWorldId,
    key: variable.key,
    valueType: variable.valueType,
    defaultValue: variable.defaultValue,
    createdAt: variable.createdAt ?? "1970-01-01T00:00:00.000Z",
  };
}

function toSceneCandidateDto(candidate: Awaited<ReturnType<V2CandidateReviewRepository["getSceneCandidate"]>> & {}): V2SceneCandidateDto {
  const dto: V2SceneCandidateDto = {
    candidateId: candidate.candidateId as V2SceneCandidateDto["candidateId"],
    kind: "scene",
    storyWorldId: candidate.storyWorldId as V2StoryWorldId,
    baseCanonRevision: candidate.baseCanonRevision as V2Revision,
    status: candidate.status,
    payload: toSceneCandidatePayloadDto(candidate.payload),
    provenance: candidate.provenance,
    createdAt: (candidate.createdAt ?? "1970-01-01T00:00:00.000Z") as V2SceneCandidateDto["createdAt"],
    ...(candidate.reviewedAt === undefined ? {} : { reviewedAt: candidate.reviewedAt as NonNullable<V2SceneCandidateDto["reviewedAt"]> }),
    ...(candidate.reviewer === undefined ? {} : { reviewer: candidate.reviewer }),
    ...(candidate.reviewReason === undefined ? {} : { reviewReason: candidate.reviewReason }),
  };
  return dto;
}

function toCandidateReviewAuditDto(audit: V2CandidateReviewAuditRecord): V2CandidateReviewAuditDto {
  return {
    auditId: audit.auditId ?? 0,
    candidateId: audit.candidateId as V2CandidateId,
    storyWorldId: audit.storyWorldId as V2StoryWorldId,
    fromStatus: audit.fromStatus,
    toStatus: audit.toStatus,
    action: audit.action,
    reviewer: audit.reviewer,
    ...(audit.reason === undefined ? {} : { reason: audit.reason }),
    resultingRevision: audit.resultingRevision as V2Revision,
    createdAt: audit.createdAt ?? "1970-01-01T00:00:00.000Z",
  };
}

function toSceneCandidatePayloadDto(payload: V2CoreSceneCandidatePayload): V2SceneCandidatePayload {
  return {
    scene: {
      sceneId: payload.scene.sceneId as V2SceneCandidatePayload["scene"]["sceneId"],
      title: payload.scene.title,
      body: payload.scene.body,
      ...(payload.scene.locationId === undefined ? {} : { locationId: payload.scene.locationId as NonNullable<V2SceneCandidatePayload["scene"]["locationId"]> }),
      participantCharacterIds: payload.scene.participantCharacterIds.map((characterId) =>
        characterId as V2SceneCandidatePayload["scene"]["participantCharacterIds"][number]
      ),
    },
    choices: payload.choices.map((choice) => ({
      label: choice.label,
      ...(choice.targetSceneId === undefined ? {} : { targetSceneId: choice.targetSceneId as NonNullable<V2SceneCandidatePayload["choices"][number]["targetSceneId"]> }),
      ...(choice.consequenceSummary === undefined ? {} : { consequenceSummary: choice.consequenceSummary }),
    })),
    validationNotes: payload.validationNotes,
  };
}

function hashV2CanonPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
