import { createHash } from "node:crypto";

import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { buildV2SceneGenerationMessages } from "@living-network/ai/v2";
import type {
  V2AssetCandidateApiResponse,
  V2AssetReviewAction,
  V2AssetCandidateListApiResponse,
  V2ApprovedAssetListApiResponse,
  V2AssetGenerationJobApiResponse,
  V2AssetGenerationJobListApiResponse,
  V2CreateAssetGenerationJobApiRequest,
  V2CreateAssetGenerationJobApiResponse,
  V2CreateSceneGenerationJobApiRequest,
  V2GenerationContextPreviewApiRequest,
  V2GenerationContextPreviewApiResponse,
  V2GenerationContextSnapshot,
  V2GenerationJobApiResponse,
  V2GenerationJobListApiResponse,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2JobId,
  V2PrepareAssetGenerationApiResponse,
  V2Revision,
  V2ReviewAssetCandidateApiRequest,
  V2ReviewAssetCandidateApiResponse,
  V2SceneGenerationPrepareApiResponse,
  V2StoryWorldId,
  V2CandidateId,
} from "@living-network/contracts/v2";
import { buildV2GenerationContextSnapshot } from "@living-network/domain/v2";
import type {
  CanonSnapshotReaderPort,
  V2AssetCandidateRepository,
  V2AssetGenerationJobRepository,
  V2AssetReviewRepository,
  V2GenerationJobRepository,
} from "@living-network/ports/v2";

export const v2GenerationPlugin: FastifyPluginAsync = async () => {
  // Gate 0 freezes the module hook. AI-2 owns generation routes after bootstrap approval.
};

export interface V2GenerationPluginDependencies {
  readonly canonSnapshots: CanonSnapshotReaderPort;
  readonly jobs: V2GenerationJobRepository;
  readonly assetJobs?: V2AssetGenerationJobRepository;
  readonly assetCandidates?: V2AssetCandidateRepository;
  readonly assetReviews?: V2AssetReviewRepository;
  readonly now?: () => Date;
  readonly defaultTokenBudget?: number;
  readonly capabilities?: {
    readonly sceneGenerationEnabled: boolean;
    readonly assetGenerationEnabled: boolean;
  };
  readonly capabilitiesProvider?: () => Promise<{
    readonly sceneGeneration: { readonly enabled: boolean; readonly configured: boolean };
    readonly assetGeneration: { readonly enabled: boolean; readonly configured: boolean };
  }>;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalPositiveInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${field} must be a positive integer`);
  }
  return value;
}

function optionalNonNegativeInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative integer`);
  }
  return value;
}

function revision(value: unknown): V2Revision {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("baseCanonRevision must be a non-negative integer");
  }
  return value as V2Revision;
}

function parseContextPreviewRequest(value: unknown): V2GenerationContextPreviewApiRequest {
  if (!isRecord(value)) throw new TypeError("request body must be an object");
  const tokenBudget = optionalPositiveInteger(value.tokenBudget, "tokenBudget");
  return {
    storyWorldId: nonEmptyString(value.storyWorldId, "storyWorldId") as V2StoryWorldId,
    baseCanonRevision: revision(value.baseCanonRevision),
    prompt: nonEmptyString(value.prompt, "prompt"),
    ...(tokenBudget === undefined ? {} : { tokenBudget }),
  };
}

function parseCreateJobRequest(value: unknown): V2CreateSceneGenerationJobApiRequest {
  if (!isRecord(value)) throw new TypeError("request body must be an object");
  const preview = parseContextPreviewRequest(value);
  const maxAttempts = optionalPositiveInteger(value.maxAttempts, "maxAttempts");
  const preparedContext = value.preparedContext === undefined
    ? undefined
    : isRecord(value.preparedContext)
      ? value.preparedContext as unknown as V2GenerationContextSnapshot
      : undefined;
  if (value.preparedContext !== undefined && preparedContext === undefined) {
    throw new TypeError("preparedContext must be an object");
  }
  return {
    ...preview,
    idempotencyKey: nonEmptyString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
    ...(preparedContext === undefined ? {} : { preparedContext }),
    ...(maxAttempts === undefined ? {} : { maxAttempts }),
  };
}

function workflowRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError("workflow must be an object");
  return value;
}

function parseCreateAssetJobRequest(value: unknown): V2CreateAssetGenerationJobApiRequest {
  if (!isRecord(value)) throw new TypeError("request body must be an object");
  const seed = optionalNonNegativeInteger(value.seed, "seed");
  const maxAttempts = optionalPositiveInteger(value.maxAttempts, "maxAttempts");
  return {
    storyWorldId: nonEmptyString(value.storyWorldId, "storyWorldId") as V2StoryWorldId,
    idempotencyKey: nonEmptyString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
    prompt: nonEmptyString(value.prompt, "prompt"),
    workflowVersion: nonEmptyString(value.workflowVersion, "workflowVersion"),
    workflow: workflowRecord(value.workflow),
    ...(value.negativePrompt === undefined ? {} : { negativePrompt: nonEmptyString(value.negativePrompt, "negativePrompt") }),
    ...(seed === undefined ? {} : { seed }),
    ...(maxAttempts === undefined ? {} : { maxAttempts }),
  };
}

function parsePrepareAssetRequest(value: unknown): Omit<V2CreateAssetGenerationJobApiRequest, "idempotencyKey" | "maxAttempts"> {
  if (!isRecord(value)) throw new TypeError("request body must be an object");
  const seed = optionalNonNegativeInteger(value.seed, "seed");
  return {
    storyWorldId: nonEmptyString(value.storyWorldId, "storyWorldId") as V2StoryWorldId,
    prompt: nonEmptyString(value.prompt, "prompt"),
    workflowVersion: nonEmptyString(value.workflowVersion, "workflowVersion"),
    workflow: workflowRecord(value.workflow),
    ...(value.negativePrompt === undefined ? {} : { negativePrompt: nonEmptyString(value.negativePrompt, "negativePrompt") }),
    ...(seed === undefined ? {} : { seed }),
  };
}

function stableSceneJobId(input: V2CreateSceneGenerationJobApiRequest): V2JobId {
  const hash = createHash("sha256")
    .update(`${input.storyWorldId}\n${input.baseCanonRevision}\n${input.idempotencyKey}`)
    .digest("hex")
    .slice(0, 24);
  return `job:scene:${hash}` as V2JobId;
}

function stableAssetJobId(input: V2CreateAssetGenerationJobApiRequest): V2JobId {
  const hash = createHash("sha256")
    .update(`${input.storyWorldId}\n${input.idempotencyKey}\n${input.workflowVersion}`)
    .digest("hex")
    .slice(0, 24);
  return `job:asset:${hash}` as V2JobId;
}

function paramsJobId(value: unknown): V2JobId {
  if (!isRecord(value)) throw new TypeError("route params must be an object");
  return nonEmptyString(value.jobId, "jobId") as V2JobId;
}

function paramsCandidateId(value: unknown): V2CandidateId {
  if (!isRecord(value)) throw new TypeError("route params must be an object");
  return nonEmptyString(value.candidateId, "candidateId") as V2CandidateId;
}


function paramsStoryWorldId(value: unknown): V2StoryWorldId {
  if (!isRecord(value)) throw new TypeError("route params must be an object");
  return nonEmptyString(value.storyWorldId, "storyWorldId") as V2StoryWorldId;
}
function assetReviewAction(value: unknown): V2AssetReviewAction {
  if (value === "approve" || value === "reject" || value === "request_changes") return value;
  throw new TypeError("action must be approve, reject, or request_changes");
}

function parseAssetReviewRequest(value: unknown): V2ReviewAssetCandidateApiRequest {
  if (!isRecord(value)) throw new TypeError("request body must be an object");
  return {
    action: assetReviewAction(value.action),
    idempotencyKey: nonEmptyString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
    ...(value.reviewer === undefined ? {} : { reviewer: nonEmptyString(value.reviewer, "reviewer") }),
    ...(value.reason === undefined ? {} : { reason: nonEmptyString(value.reason, "reason") }),
  };
}

function parseCancelReason(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || value.reason === undefined) return undefined;
  return nonEmptyString(value.reason, "reason");
}

function errorStatus(error: unknown): number {
  if (error instanceof TypeError || (error instanceof Error && error.name === "V2DomainError")) return 422;
  return 500;
}

function errorPayload(error: unknown): { readonly error: { readonly message: string } } {
  return {
    error: {
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

async function replyWithError(reply: FastifyReply, error: unknown): Promise<never> {
  return reply.code(errorStatus(error)).send(errorPayload(error));
}

function replyMissingCapability(reply: FastifyReply, capability: string): FastifyReply {
  return reply.code(503).send({ error: { code: "CAPABILITY_UNAVAILABLE", message: `${capability} is not configured` } });
}

export function createV2GenerationPlugin(
  dependencies: V2GenerationPluginDependencies,
): FastifyPluginAsync {
  const now = dependencies.now ?? (() => new Date());
  const defaultTokenBudget = dependencies.defaultTokenBudget ?? 4096;
  const capabilities = dependencies.capabilities ?? { sceneGenerationEnabled: false, assetGenerationEnabled: false };

  const sceneCapabilityAvailable = async (): Promise<boolean> => {
    if (dependencies.capabilitiesProvider !== undefined) {
      const current = await dependencies.capabilitiesProvider();
      return current.sceneGeneration.enabled && current.sceneGeneration.configured;
    }
    return capabilities.sceneGenerationEnabled;
  };
  const assetCapabilityAvailable = async (): Promise<boolean> => {
    if (dependencies.capabilitiesProvider !== undefined) {
      const current = await dependencies.capabilitiesProvider();
      return current.assetGeneration.enabled && current.assetGeneration.configured;
    }
    return capabilities.assetGenerationEnabled;
  };

  return async (app) => {
    app.post("/context-preview", async (request, reply) => {
      try {
        const input = parseContextPreviewRequest(request.body);
        const snapshot = await dependencies.canonSnapshots.getCanonSnapshot({
          storyWorldId: input.storyWorldId,
          revision: input.baseCanonRevision,
        });
        const context = buildV2GenerationContextSnapshot({
          snapshot,
          prompt: input.prompt,
          requestedAt: now().toISOString(),
          tokenBudget: input.tokenBudget ?? defaultTokenBudget,
        }) as V2GenerationContextSnapshot;
        return { context } satisfies V2GenerationContextPreviewApiResponse;
      } catch (error) {
        return replyWithError(reply, error);
      }
    });

    app.post("/scene/prepare", async (request, reply) => {
      try {
        const input = parseContextPreviewRequest(request.body);
        const snapshot = await dependencies.canonSnapshots.getCanonSnapshot({
          storyWorldId: input.storyWorldId,
          revision: input.baseCanonRevision,
        });
        const context = buildV2GenerationContextSnapshot({
          snapshot,
          prompt: input.prompt,
          requestedAt: now().toISOString(),
          tokenBudget: input.tokenBudget ?? defaultTokenBudget,
        }) as V2GenerationContextSnapshot;
        return {
          context,
          request: {
            responseFormat: "json_object",
            temperature: 0.2,
            maxTokens: context.tokenBudget,
            messages: buildV2SceneGenerationMessages(context),
          },
        } satisfies V2SceneGenerationPrepareApiResponse;
      } catch (error) {
        return replyWithError(reply, error);
      }
    });

    app.post("/jobs/scene", async (request, reply) => {
      try {
        if (!await sceneCapabilityAvailable()) return replyMissingCapability(reply, "scene generation");
        const input = parseCreateJobRequest(request.body);
        const requestedAt = now().toISOString() as V2IsoDateTime;
        const context = input.preparedContext ?? buildV2GenerationContextSnapshot({
          snapshot: await dependencies.canonSnapshots.getCanonSnapshot({
            storyWorldId: input.storyWorldId,
            revision: input.baseCanonRevision,
          }),
          prompt: input.prompt,
          requestedAt,
          tokenBudget: input.tokenBudget ?? defaultTokenBudget,
        }) as V2GenerationContextSnapshot;
        if (
          context.storyWorldId !== input.storyWorldId ||
          context.baseCanonRevision !== input.baseCanonRevision ||
          context.prompt !== input.prompt
        ) {
          throw new TypeError("preparedContext does not match requested storyWorldId, baseCanonRevision, and prompt");
        }
        const result = await dependencies.jobs.createSceneJob({
          jobId: stableSceneJobId(input),
          storyWorldId: input.storyWorldId,
          baseCanonRevision: input.baseCanonRevision,
          idempotencyKey: input.idempotencyKey,
          prompt: input.prompt,
          context,
          createdAt: requestedAt,
          ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
        });
        return reply.code(result.inserted ? 201 : 200).send(result);
      } catch (error) {
        return replyWithError(reply, error);
      }
    });

    app.get("/jobs/:jobId", async (request, reply) => {
      try {
        const job = await dependencies.jobs.getJob(paramsJobId(request.params));
        if (job === undefined) return reply.code(404).send({ error: { message: "generation job not found" } });
        return { job } satisfies V2GenerationJobApiResponse;
      } catch (error) {
        return replyWithError(reply, error);
      }
    });

    app.get("/worlds/:storyWorldId/jobs", async (request, reply) => {
      try {
        return {
          jobs: await dependencies.jobs.listJobsByStoryWorld(paramsStoryWorldId(request.params), 20),
        } satisfies V2GenerationJobListApiResponse;
      } catch (error) {
        return replyWithError(reply, error);
      }
    });

    app.post("/jobs/:jobId/cancel", async (request, reply) => {
      try {
        const reason = parseCancelReason(request.body);
        const job = await dependencies.jobs.cancelJob({
          jobId: paramsJobId(request.params),
          cancelledAt: now().toISOString(),
          ...(reason === undefined ? {} : { reason }),
        });
        return { job } satisfies V2GenerationJobApiResponse;
      } catch (error) {
        return replyWithError(reply, error);
      }
    });

    app.post("/assets/jobs", async (request, reply) => {
      try {
        if (!await assetCapabilityAvailable()) return replyMissingCapability(reply, "asset generation");
        if (dependencies.assetJobs === undefined) return replyMissingCapability(reply, "asset generation repository");
        const input = parseCreateAssetJobRequest(request.body);
        const createdAt = now().toISOString() as V2IsoDateTime;
        const result = await dependencies.assetJobs.createAssetJob({
          jobId: stableAssetJobId(input),
          storyWorldId: input.storyWorldId,
          idempotencyKey: input.idempotencyKey,
          prompt: input.prompt,
          workflowVersion: input.workflowVersion,
          workflow: input.workflow,
          createdAt,
          ...(input.negativePrompt === undefined ? {} : { negativePrompt: input.negativePrompt }),
          ...(input.seed === undefined ? {} : { seed: input.seed }),
          ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
        });
        return reply.code(result.inserted ? 201 : 200).send(result satisfies V2CreateAssetGenerationJobApiResponse);
      } catch (error) {
        return replyWithError(reply, error);
      }
    });

    app.post("/assets/prepare", async (request, reply) => {
      try {
        const input = parsePrepareAssetRequest(request.body);
        return {
          request: {
            prompt: input.prompt,
            workflowVersion: input.workflowVersion,
            workflow: input.workflow,
            ...(input.negativePrompt === undefined ? {} : { negativePrompt: input.negativePrompt }),
            ...(input.seed === undefined ? {} : { seed: input.seed }),
          },
        } satisfies V2PrepareAssetGenerationApiResponse;
      } catch (error) {
        return replyWithError(reply, error);
      }
    });

    app.get("/assets/jobs/:jobId", async (request, reply) => {
      try {
        if (dependencies.assetJobs === undefined) return replyMissingCapability(reply, "asset generation repository");
        const job = await dependencies.assetJobs.getAssetJob(paramsJobId(request.params));
        if (job === undefined) return reply.code(404).send({ error: { message: "asset generation job not found" } });
        return { job } satisfies V2AssetGenerationJobApiResponse;
      } catch (error) {
        return replyWithError(reply, error);
      }
    });

    app.get("/assets/worlds/:storyWorldId/jobs", async (request, reply) => {
      try {
        if (dependencies.assetJobs === undefined) return replyMissingCapability(reply, "asset generation repository");
        return {
          jobs: await dependencies.assetJobs.listAssetJobsByStoryWorld(paramsStoryWorldId(request.params), 20),
        } satisfies V2AssetGenerationJobListApiResponse;
      } catch (error) {
        return replyWithError(reply, error);
      }
    });

    app.post("/assets/jobs/:jobId/cancel", async (request, reply) => {
      try {
        if (dependencies.assetJobs === undefined) return replyMissingCapability(reply, "asset generation repository");
        const reason = parseCancelReason(request.body);
        const job = await dependencies.assetJobs.cancelAssetJob({
          jobId: paramsJobId(request.params),
          cancelledAt: now().toISOString(),
          ...(reason === undefined ? {} : { reason }),
        });
        return { job } satisfies V2AssetGenerationJobApiResponse;
      } catch (error) {
        return replyWithError(reply, error);
      }
    });

    app.get("/assets/candidates/:candidateId", async (request, reply) => {
      try {
        if (dependencies.assetCandidates === undefined) return replyMissingCapability(reply, "asset candidate repository");
        const candidate = await dependencies.assetCandidates.getAssetCandidate(paramsCandidateId(request.params));
        if (candidate === undefined) return reply.code(404).send({ error: { message: "asset candidate not found" } });
        return { candidate } satisfies V2AssetCandidateApiResponse;
      } catch (error) {
        return replyWithError(reply, error);
      }
    });

    app.post("/assets/candidates/:candidateId/review", async (request, reply) => {
      try {
        if (dependencies.assetReviews === undefined) return replyMissingCapability(reply, "asset review repository");
        const input = parseAssetReviewRequest(request.body);
        const result = await dependencies.assetReviews.reviewAssetCandidate({
          candidateId: paramsCandidateId(request.params),
          action: input.action,
          reviewedAt: now().toISOString() as V2IsoDateTime,
          idempotencyKey: input.idempotencyKey,
          ...(input.reviewer === undefined ? {} : { reviewer: input.reviewer }),
          ...(input.reason === undefined ? {} : { reason: input.reason }),
        });
        return reply.code(result.inserted ? 201 : 200).send(result satisfies V2ReviewAssetCandidateApiResponse);
      } catch (error) {
        return replyWithError(reply, error);
      }
    });

    app.get("/assets/worlds/:storyWorldId/candidates", async (request, reply) => {
      try {
        if (dependencies.assetCandidates === undefined) return replyMissingCapability(reply, "asset candidate repository");
        return { candidates: await dependencies.assetCandidates.listAssetCandidates(paramsStoryWorldId(request.params)) } satisfies V2AssetCandidateListApiResponse;
      } catch (error) {
        return replyWithError(reply, error);
      }
    });

    app.get("/assets/worlds/:storyWorldId/library", async (request, reply) => {
      try {
        if (dependencies.assetReviews === undefined) return replyMissingCapability(reply, "asset review repository");
        return { assets: await dependencies.assetReviews.listApprovedAssets(paramsStoryWorldId(request.params)) } satisfies V2ApprovedAssetListApiResponse;
      } catch (error) {
        return replyWithError(reply, error);
      }
    });
  };
}
