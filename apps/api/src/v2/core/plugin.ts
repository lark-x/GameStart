import type { FastifyPluginAsync } from "fastify";
import type { V2StoryWorldId } from "@living-network/contracts";
import { V2SqliteCanonUnitOfWork, V2SqliteGraphStateUnitOfWork } from "@living-network/database";

import { toV2HttpError, V2HttpError } from "./errors.ts";
import {
  parseCreateCharacterBody,
  parseCreateArcBody,
  parseCreateChoiceBody,
  parseCreateFactBody,
  parseCreateLocationBody,
  parseCreateRuleBody,
  parseCreateSceneBody,
  parseCreateStateVariableBody,
  parseCreateTimelineEventBody,
  parseCreateWorldBody,
  parsePreviewStateDeltaBody,
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
