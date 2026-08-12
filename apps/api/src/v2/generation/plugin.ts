import { createHash } from "node:crypto";

import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type {
  V2CreateSceneGenerationJobApiRequest,
  V2GenerationContextPreviewApiRequest,
  V2GenerationContextSnapshot,
  V2GenerationJobApiResponse,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2JobId,
  V2Revision,
  V2StoryWorldId,
} from "@living-network/contracts";
import { buildV2GenerationContextSnapshot } from "@living-network/domain";
import type {
  CanonSnapshotReaderPort,
  V2GenerationJobRepository,
} from "@living-network/ports";

export const v2GenerationPlugin: FastifyPluginAsync = async () => {
  // Gate 0 freezes the module hook. AI-2 owns generation routes after bootstrap approval.
};

export interface V2GenerationPluginDependencies {
  readonly canonSnapshots: CanonSnapshotReaderPort;
  readonly jobs: V2GenerationJobRepository;
  readonly now?: () => Date;
  readonly defaultTokenBudget?: number;
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
  return {
    ...preview,
    idempotencyKey: nonEmptyString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
    ...(maxAttempts === undefined ? {} : { maxAttempts }),
  };
}

function stableSceneJobId(input: V2CreateSceneGenerationJobApiRequest): V2JobId {
  const hash = createHash("sha256")
    .update(`${input.storyWorldId}\n${input.baseCanonRevision}\n${input.idempotencyKey}`)
    .digest("hex")
    .slice(0, 24);
  return `job:scene:${hash}` as V2JobId;
}

function paramsJobId(value: unknown): V2JobId {
  if (!isRecord(value)) throw new TypeError("route params must be an object");
  return nonEmptyString(value.jobId, "jobId") as V2JobId;
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

export function createV2GenerationPlugin(
  dependencies: V2GenerationPluginDependencies,
): FastifyPluginAsync {
  const now = dependencies.now ?? (() => new Date());
  const defaultTokenBudget = dependencies.defaultTokenBudget ?? 4096;

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
        return { context };
      } catch (error) {
        return replyWithError(reply, error);
      }
    });

    app.post("/jobs/scene", async (request, reply) => {
      try {
        const input = parseCreateJobRequest(request.body);
        const requestedAt = now().toISOString() as V2IsoDateTime;
        const snapshot = await dependencies.canonSnapshots.getCanonSnapshot({
          storyWorldId: input.storyWorldId,
          revision: input.baseCanonRevision,
        });
        const context = buildV2GenerationContextSnapshot({
          snapshot,
          prompt: input.prompt,
          requestedAt,
          tokenBudget: input.tokenBudget ?? defaultTokenBudget,
        }) as V2GenerationContextSnapshot;
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
  };
}
