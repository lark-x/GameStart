import type { FastifyPluginAsync } from "fastify";
import type {
  V2CandidateId,
  V2ReleaseId,
  V2Revision,
  V2RunId,
  V2SaveId,
  V2StoryWorldId,
} from "@living-network/contracts";
import {
  V2SqliteCanonUnitOfWork,
  V2SqliteCandidateReviewUnitOfWork,
  V2SqliteGraphStateUnitOfWork,
  V2SqliteReleaseRuntimeUnitOfWork,
} from "@living-network/database";

import { toV2HttpError, V2HttpError } from "./errors.ts";
import {
  parseCreateCharacterBody,
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
} from "./parsers.ts";
import { createV2CoreUseCases, type V2CoreUseCases } from "./use-cases.ts";

export interface V2CorePluginOptions {
  readonly useCases?: V2CoreUseCases;
  readonly sqlite?: import("node:sqlite").DatabaseSync;
}

export const v2CorePlugin: FastifyPluginAsync<V2CorePluginOptions> = async (app, options) => {
  const useCases = options.useCases ?? (options.sqlite
    ? createV2CoreUseCases(
      new V2SqliteCanonUnitOfWork(options.sqlite),
      new V2SqliteGraphStateUnitOfWork(options.sqlite),
      new V2SqliteCandidateReviewUnitOfWork(options.sqlite),
      new V2SqliteReleaseRuntimeUnitOfWork(options.sqlite),
    )
    : undefined);
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
    const { storyWorldId } = getWorldParams(request.params);
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
  app.get("/worlds/:storyWorldId/state/variables", async (request) => {
    const { storyWorldId } = getWorldParams(request.params);
    return useCases.listStateVariables(storyWorldId);
  });
  app.post("/worlds/:storyWorldId/state/variables", async (request, reply) => {
    const { storyWorldId } = getWorldParams(request.params);
    const result = await useCases.createStateVariable(storyWorldId, parseCreateStateVariableBody(request.body));
    return reply.status(201).send(result);
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

function getWorldParams(params: unknown): { readonly storyWorldId: V2StoryWorldId } {
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    throw new V2HttpError(400, "BAD_REQUEST", "Route params must be an object");
  }
  const storyWorldId = (params as { readonly storyWorldId?: unknown }).storyWorldId;
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
  const candidateId = (params as { readonly candidateId?: unknown }).candidateId;
  if (typeof candidateId !== "string" || candidateId.trim().length === 0) {
    throw new V2HttpError(400, "BAD_REQUEST", "candidateId must be a non-empty string");
  }
  return { storyWorldId, candidateId: candidateId as V2CandidateId };
}

function getRunParams(params: unknown): { readonly runId: V2RunId } {
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    throw new V2HttpError(400, "BAD_REQUEST", "Route params must be an object");
  }
  const runId = (params as { readonly runId?: unknown }).runId;
  if (typeof runId !== "string" || runId.trim().length === 0) {
    throw new V2HttpError(400, "BAD_REQUEST", "runId must be a non-empty string");
  }
  return { runId: runId as V2RunId };
}

function getSaveParams(params: unknown): { readonly saveId: V2SaveId } {
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    throw new V2HttpError(400, "BAD_REQUEST", "Route params must be an object");
  }
  const saveId = (params as { readonly saveId?: unknown }).saveId;
  if (typeof saveId !== "string" || saveId.trim().length === 0) {
    throw new V2HttpError(400, "BAD_REQUEST", "saveId must be a non-empty string");
  }
  return { saveId: saveId as V2SaveId };
}

function getReleaseParams(params: unknown): { readonly releaseId: V2ReleaseId } {
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    throw new V2HttpError(400, "BAD_REQUEST", "Route params must be an object");
  }
  const releaseId = (params as { readonly releaseId?: unknown }).releaseId;
  if (typeof releaseId !== "string" || releaseId.trim().length === 0) {
    throw new V2HttpError(400, "BAD_REQUEST", "releaseId must be a non-empty string");
  }
  return { releaseId: releaseId as V2ReleaseId };
}

function getRevisionQuery(query: unknown): V2Revision {
  if (typeof query !== "object" || query === null || Array.isArray(query)) {
    throw new V2HttpError(400, "BAD_REQUEST", "Query must be an object");
  }
  const revision = (query as { readonly revision?: unknown }).revision;
  const parsed = typeof revision === "string" ? Number(revision) : revision;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed < 1) {
    throw new V2HttpError(400, "BAD_REQUEST", "revision query must be a positive integer");
  }
  return parsed as V2Revision;
}
