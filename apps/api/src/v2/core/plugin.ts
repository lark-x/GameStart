import type { FastifyPluginAsync } from "fastify";
import type {
  V2CandidateId,
  V2ReleaseId,
  V2Revision,
  V2RunId,
  V2SaveId,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
import { toV2HttpError, V2HttpError } from "./errors.ts";
import {
  parseCreateCharacterBody,
  parseCreateCharacterCandidateBody,
  parseUpsertCharacterRelationshipBody,
  parseCharacterContextPreviewBody,
  parseCreateCharacterStateDefinitionBody,
  parseUpdateCharacterStateDefinitionBody,
  parseUpsertCharacterVisualVariantBody,
  parseUpsertCharacterEventDefinitionBody,
  parseUpdateCharacterProactivePolicyBody,
  parseCreateArcBody,
  parseCreateChoiceBody,
  parseCreateFactBody,
  parseCreateLocationBody,
  parseCreateReleaseBody,
  parseCreateRuleBody,
  parseCreateRuntimeSaveBody,
  parseCreateSceneBody,
  parseCreateStateVariableBody,
  parseCreateTimelineEventBody,
  parseCreateWorldBody,
  parseLoadRuntimeSaveBody,
  parsePreviewStateDeltaBody,
  parseReviewCandidateBody,
  parseStartRuntimeRunBody,
  parseSubmitRuntimeChoiceBody,
  parseSubmitSceneCandidateBody,
  parseUpdateArcBody,
  parseUpdateCharacterBody,
  parseUpdateChoiceBody,
  parseUpdateFactBody,
  parseUpdateLocationBody,
  parseUpdateRuleBody,
  parseUpdateSceneBody,
  parseUpdateStateVariableBody,
  parseUpdateTimelineEventBody,
  parseUpdateWorldBody,
} from "./parsers.ts";
import { createV2CoreUseCases, type V2CoreUseCases } from "./use-cases.ts";

export interface V2CorePluginOptions {
  readonly useCases?: V2CoreUseCases;
}

export const v2CorePlugin: FastifyPluginAsync<V2CorePluginOptions> = async (app, options) => {
  const useCases = options.useCases;
  if (!useCases) {
    app.get("/status", async () => ({ available: false, reason: "V2 core dependencies are not configured" }));
    return;
  }

  app.setErrorHandler((error, _request, reply) => {
    const httpError = toV2HttpError(error);
    void reply.status(httpError.statusCode).send({ error: { code: httpError.code, message: httpError.message } });
  });

  app.get("/worlds", async () => useCases.listWorlds());
  app.post("/worlds", async (request, reply) => {
    const result = await useCases.createWorld(parseCreateWorldBody(request.body));
    return reply.status(201).send(result);
  });
  app.get("/worlds/:storyWorldId/canon", async (request) => {
    const { storyWorldId } = getWorldParams(request.params as Record<string, unknown>);
    return useCases.getSnapshot(storyWorldId);
  });
  app.post("/worlds/:storyWorldId/locations", async (request, reply) => {
    const { storyWorldId } = getWorldParams(request.params);
    const result = await useCases.createLocation(storyWorldId, parseCreateLocationBody(request.body));
    return reply.status(201).send(result);
  });
  app.post("/worlds/:storyWorldId/characters", async (request, reply) => {
    const { storyWorldId } = getWorldParams(request.params);
    const result = await useCases.createCharacter(storyWorldId, parseCreateCharacterBody(request.body));
    return reply.status(201).send(result);
  });
  app.get("/worlds/:storyWorldId/characters/:characterId", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.getCharacter(storyWorldId, getRouteParam(request.params, "characterId") as never);
  });
  app.post("/worlds/:storyWorldId/characters/:characterId/context/preview", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.previewCharacterContext(storyWorldId, getRouteParam(request.params, "characterId") as never, parseCharacterContextPreviewBody(request.body));
  });
  app.get("/worlds/:storyWorldId/character-context-traces", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return { traces: await useCases.listCharacterContextTraces(storyWorldId) };
  });
  app.get("/worlds/:storyWorldId/characters/:characterId/state-definitions", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return { definitions: await useCases.listCharacterStateDefinitions(storyWorldId, getRouteParam(request.params, "characterId") as never) };
  });
  app.post("/worlds/:storyWorldId/characters/:characterId/state-definitions", async (request, reply) => {
    const { storyWorldId } = getWorldParams(request.params);
    const characterId = getRouteParam(request.params, "characterId");
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
    const result = await useCases.createCharacterStateDefinition(storyWorldId, parseCreateCharacterStateDefinitionBody({ ...body, characterId: body.characterId ?? characterId }));
    return reply.status(201).send(result);
  });
  app.patch("/worlds/:storyWorldId/characters/:characterId/state-definitions/:stateDefinitionId", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.updateCharacterStateDefinition(storyWorldId, getRouteParam(request.params, "stateDefinitionId"), parseUpdateCharacterStateDefinitionBody(request.body));
  });
  app.get("/worlds/:storyWorldId/characters/:characterId/visual-variants", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return { variants: await useCases.listCharacterVisualVariants(storyWorldId, getRouteParam(request.params, "characterId") as never) };
  });
  app.post("/worlds/:storyWorldId/characters/:characterId/visual-variants", async (request, reply) => {
    const { storyWorldId } = getWorldParams(request.params);
    const characterId = getRouteParam(request.params, "characterId");
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
    const result = await useCases.upsertCharacterVisualVariant(storyWorldId, parseUpsertCharacterVisualVariantBody({ ...body, characterId: body.characterId ?? characterId }));
    return reply.status(201).send(result);
  });
  app.get("/worlds/:storyWorldId/characters/:characterId/events", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return { events: await useCases.listCharacterEventDefinitions(storyWorldId, getRouteParam(request.params, "characterId") as never) };
  });
  app.post("/worlds/:storyWorldId/characters/:characterId/events", async (request, reply) => {
    const { storyWorldId } = getWorldParams(request.params);
    const result = await useCases.upsertCharacterEventDefinition(storyWorldId, parseUpsertCharacterEventDefinitionBody(request.body));
    return reply.status(201).send(result);
  });
  app.get("/worlds/:storyWorldId/characters/:characterId/proactive-policy", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.getCharacterProactivePolicy(storyWorldId, getRouteParam(request.params, "characterId") as never);
  });
  app.patch("/worlds/:storyWorldId/characters/:characterId/proactive-policy", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.updateCharacterProactivePolicy(storyWorldId, getRouteParam(request.params, "characterId") as never, parseUpdateCharacterProactivePolicyBody(request.body));
  });
  app.get("/worlds/:storyWorldId/characters/:characterId/relationships", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return { relationships: await useCases.listCharacterRelationships(storyWorldId, getRouteParam(request.params, "characterId") as never) };
  });
  app.post("/worlds/:storyWorldId/characters/:characterId/relationships", async (request, reply) => {
    const { storyWorldId } = getWorldParams(request.params);
    const characterId = getRouteParam(request.params, "characterId");
    const body = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
    const parsed = parseUpsertCharacterRelationshipBody({ ...body, fromCharacterId: body.fromCharacterId ?? characterId });
    const result = await useCases.upsertCharacterRelationship(storyWorldId, parsed);
    return reply.status(201).send(result);
  });
  app.post("/worlds/:storyWorldId/character-relationships", async (request, reply) => {
    const { storyWorldId } = getWorldParams(request.params);
    const result = await useCases.upsertCharacterRelationship(storyWorldId, parseUpsertCharacterRelationshipBody(request.body));
    return reply.status(201).send(result);
  });
  app.post("/worlds/:storyWorldId/facts", async (request, reply) => {
    const { storyWorldId } = getWorldParams(request.params);
    const result = await useCases.createFact(storyWorldId, parseCreateFactBody(request.body));
    return reply.status(201).send(result);
  });
  app.post("/worlds/:storyWorldId/rules", async (request, reply) => {
    const { storyWorldId } = getWorldParams(request.params);
    const result = await useCases.createRule(storyWorldId, parseCreateRuleBody(request.body));
    return reply.status(201).send(result);
  });
  app.post("/worlds/:storyWorldId/timeline-events", async (request, reply) => {
    const { storyWorldId } = getWorldParams(request.params);
    const result = await useCases.createTimelineEvent(storyWorldId, parseCreateTimelineEventBody(request.body));
    return reply.status(201).send(result);
  });
  app.patch("/worlds/:storyWorldId", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.updateWorld(storyWorldId, parseUpdateWorldBody(request.body));
  });
  app.patch("/worlds/:storyWorldId/locations/:locationId", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.updateLocation(storyWorldId, getRouteParam(request.params, "locationId") as never, parseUpdateLocationBody(request.body));
  });
  app.patch("/worlds/:storyWorldId/characters/:characterId", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.updateCharacter(storyWorldId, getRouteParam(request.params, "characterId") as never, parseUpdateCharacterBody(request.body));
  });
  app.patch("/worlds/:storyWorldId/facts/:factId", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.updateFact(storyWorldId, getRouteParam(request.params, "factId"), parseUpdateFactBody(request.body));
  });
  app.patch("/worlds/:storyWorldId/rules/:ruleId", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.updateRule(storyWorldId, getRouteParam(request.params, "ruleId"), parseUpdateRuleBody(request.body));
  });
  app.patch("/worlds/:storyWorldId/timeline-events/:timelineEventId", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.updateTimelineEvent(storyWorldId, getRouteParam(request.params, "timelineEventId"), parseUpdateTimelineEventBody(request.body));
  });
  app.get("/worlds/:storyWorldId/graph", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.getGraph(storyWorldId);
  });
  app.get("/worlds/:storyWorldId/graph/validation", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.validateGraph(storyWorldId);
  });
  app.post("/worlds/:storyWorldId/arcs", async (request, reply) => {
    const { storyWorldId } = getWorldParams(request.params);
    const result = await useCases.createArc(storyWorldId, parseCreateArcBody(request.body));
    return reply.status(201).send(result);
  });
  app.post("/worlds/:storyWorldId/scenes", async (request, reply) => {
    const { storyWorldId } = getWorldParams(request.params);
    const result = await useCases.createScene(storyWorldId, parseCreateSceneBody(request.body));
    return reply.status(201).send(result);
  });
  app.post("/worlds/:storyWorldId/choices", async (request, reply) => {
    const { storyWorldId } = getWorldParams(request.params);
    const result = await useCases.createChoice(storyWorldId, parseCreateChoiceBody(request.body));
    return reply.status(201).send(result);
  });
  app.patch("/worlds/:storyWorldId/arcs/:arcId", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.updateArc(storyWorldId, getRouteParam(request.params, "arcId") as never, parseUpdateArcBody(request.body));
  });
  app.patch("/worlds/:storyWorldId/scenes/:sceneId", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.updateScene(storyWorldId, getRouteParam(request.params, "sceneId") as never, parseUpdateSceneBody(request.body));
  });
  app.patch("/worlds/:storyWorldId/choices/:choiceId", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.updateChoice(storyWorldId, getRouteParam(request.params, "choiceId") as never, parseUpdateChoiceBody(request.body));
  });
  app.get("/worlds/:storyWorldId/state/variables", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.listStateVariables(storyWorldId);
  });
  app.post("/worlds/:storyWorldId/state/variables", async (request, reply) => {
    const { storyWorldId } = getWorldParams(request.params);
    const result = await useCases.createStateVariable(storyWorldId, parseCreateStateVariableBody(request.body));
    return reply.status(201).send(result);
  });
  app.patch("/worlds/:storyWorldId/state/variables/:key", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.updateStateVariable(storyWorldId, getRouteParam(request.params, "key"), parseUpdateStateVariableBody(request.body));
  });
  app.get("/worlds/:storyWorldId/state/initial", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.getInitialState(storyWorldId);
  });
  app.post("/worlds/:storyWorldId/state/preview-delta", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.previewStateDelta(storyWorldId, parsePreviewStateDeltaBody(request.body));
  });
  app.get("/worlds/:storyWorldId/candidates/scenes", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.listSceneCandidates(storyWorldId);
  });
  app.post("/worlds/:storyWorldId/candidates/scenes", async (request, reply) => {
    const { storyWorldId } = getWorldParams(request.params);
    const result = await useCases.submitSceneCandidate(storyWorldId, parseSubmitSceneCandidateBody(request.body));
    return reply.status(201).send(result);
  });
  app.get("/worlds/:storyWorldId/candidates/characters", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    const status = (request.query as Record<string, unknown>).status;
    return useCases.listCharacterCandidates(storyWorldId, typeof status === "string" ? status as never : undefined);
  });
  app.post("/worlds/:storyWorldId/candidates/characters", async (request, reply) => {
    const { storyWorldId } = getWorldParams(request.params);
    const result = await useCases.createCharacterCandidate(storyWorldId, parseCreateCharacterCandidateBody(request.body));
    return reply.status(201).send(result);
  });
  app.get("/worlds/:storyWorldId/candidates/characters/:candidateId", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.getCharacterCandidate(storyWorldId, getRouteParam(request.params, "candidateId"));
  });
  app.post("/worlds/:storyWorldId/candidates/characters/:candidateId/review", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.reviewCharacterCandidate(storyWorldId, getRouteParam(request.params, "candidateId"), parseReviewCandidateBody(request.body) as never);
  });
  app.get("/worlds/:storyWorldId/candidates/scenes/:candidateId", async (request) => {
    const { storyWorldId, candidateId } = getCandidateParams(request.params);
    return useCases.getSceneCandidate(storyWorldId, candidateId);
  });
  app.post("/worlds/:storyWorldId/candidates/scenes/:candidateId/review", async (request) => {
    const { storyWorldId, candidateId } = getCandidateParams(request.params);
    return useCases.reviewSceneCandidate(storyWorldId, candidateId, parseReviewCandidateBody(request.body));
  });
  app.get("/worlds/:storyWorldId/candidates/scenes/:candidateId/audits", async (request) => {
    const { storyWorldId, candidateId } = getCandidateParams(request.params);
    return useCases.listCandidateReviewAudits(storyWorldId, candidateId);
  });
  app.get("/worlds/:storyWorldId/releases", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.listReleases(storyWorldId);
  });
  app.get("/worlds/:storyWorldId/releases/preflight", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.preflightRelease(storyWorldId);
  });
  app.post("/worlds/:storyWorldId/releases", async (request, reply) => {
    const { storyWorldId } = getWorldParams(request.params);
    const result = await useCases.createRelease(storyWorldId, parseCreateReleaseBody(request.body));
    return reply.status(201).send(result);
  });
  app.post("/runtime/runs", async (request, reply) => {
    const result = await useCases.startRuntimeRun(parseStartRuntimeRunBody(request.body));
    return reply.status(201).send(result);
  });
  app.get("/runtime/runs/:runId/scene", async (request) => {
    const { runId } = getRunParams(request.params);
    return useCases.getRuntimeScene(runId);
  });
  app.post("/runtime/runs/:runId/choices", async (request) => {
    const { runId } = getRunParams(request.params);
    return useCases.submitRuntimeChoice(runId, parseSubmitRuntimeChoiceBody(request.body));
  });
  app.post("/runtime/runs/:runId/saves", async (request, reply) => {
    const { runId } = getRunParams(request.params);
    const result = await useCases.createRuntimeSave(runId, parseCreateRuntimeSaveBody(request.body));
    return reply.status(201).send(result);
  });
  app.get("/worlds/:storyWorldId/runtime/saves", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.listRuntimeSaves(storyWorldId);
  });
  app.get("/runtime/saves/:saveId", async (request) => {
    const { saveId } = getSaveParams(request.params);
    return useCases.getRuntimeSave(saveId);
  });
  app.post("/runtime/saves/:saveId/load", async (request, reply) => {
    const { saveId } = getSaveParams(request.params);
    const result = await useCases.loadRuntimeSave(saveId, parseLoadRuntimeSaveBody(request.body));
    return reply.status(201).send(result);
  });
  app.get("/worlds/:storyWorldId/export", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.exportWorkspace(storyWorldId, getRevisionQuery(request.query));
  });
  app.get("/releases/:releaseId/export", async (request) => {
    const { releaseId } = getReleaseParams(request.params);
    return useCases.exportRelease(releaseId);
  });
};

function getRouteParam(params: unknown, key: string): string {
  const value = (params as Record<string, unknown>)[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new V2HttpError(400, "BAD_REQUEST", `${key} must be a non-empty string`);
  }
  return value;
}
function getWorldParams(params: unknown): { readonly storyWorldId: V2StoryWorldId } {
  const record = params as Record<string, unknown>;
  const storyWorldId = record.storyWorldId;
  if (typeof storyWorldId !== "string" || storyWorldId.trim().length === 0) {
    throw new V2HttpError(400, "BAD_REQUEST", "storyWorldId must be a non-empty string");
  }
  return { storyWorldId: storyWorldId as V2StoryWorldId };
}

function getCandidateParams(params: unknown): {
  readonly storyWorldId: V2StoryWorldId;
  readonly candidateId: V2CandidateId;
} {
  const { storyWorldId } = getWorldParams(params);
  const candidateId = (params as Record<string, unknown>).candidateId;
  if (typeof candidateId !== "string" || candidateId.trim().length === 0) {
    throw new V2HttpError(400, "BAD_REQUEST", "candidateId must be a non-empty string");
  }
  return { storyWorldId, candidateId: candidateId as V2CandidateId };
}

function getRunParams(params: unknown): { readonly runId: V2RunId } {
  const runId = (params as Record<string, unknown>).runId;
  if (typeof runId !== "string" || runId.trim().length === 0) {
    throw new V2HttpError(400, "BAD_REQUEST", "runId must be a non-empty string");
  }
  return { runId: runId as V2RunId };
}

function getSaveParams(params: unknown): { readonly saveId: V2SaveId } {
  const saveId = (params as Record<string, unknown>).saveId;
  if (typeof saveId !== "string" || saveId.trim().length === 0) {
    throw new V2HttpError(400, "BAD_REQUEST", "saveId must be a non-empty string");
  }
  return { saveId: saveId as V2SaveId };
}

function getReleaseParams(params: unknown): { readonly releaseId: V2ReleaseId } {
  const releaseId = (params as Record<string, unknown>).releaseId;
  if (typeof releaseId !== "string" || releaseId.trim().length === 0) {
    throw new V2HttpError(400, "BAD_REQUEST", "releaseId must be a non-empty string");
  }
  return { releaseId: releaseId as V2ReleaseId };
}

function getRevisionQuery(query: unknown): V2Revision {
  const revision = (query as Record<string, unknown>).revision;
  const parsed = typeof revision === "string" ? Number(revision) : revision;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed < 1) {
    throw new V2HttpError(400, "BAD_REQUEST", "revision query must be a positive integer");
  }
  return parsed as V2Revision;
}
