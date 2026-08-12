import type { HandlerContext } from "../context.ts";
import { trustedActor } from "../context.ts";
import { ApiError, jsonResponse } from "../helpers.ts";
import * as storyGeneration from "../use-cases/story-generation.ts";

async function parseBody(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
}

export async function handleStoryGeneration(
  ctx: HandlerContext,
  request: Request,
  url: URL,
  _correlationId: string,
): Promise<Response | undefined> {
  const { pathname } = url;

  // --- GET/PUT /v1/worlds/:id/context-policy ---
  const contextPolicyMatch = pathname.match(/^\/v1\/worlds\/([^/]+)\/context-policy$/);
  if (contextPolicyMatch) {
    const worldId = decodeURIComponent(contextPolicyMatch[1]!);
    if (request.method === "GET") {
      const policy = await storyGeneration.getWorldContextPolicy(ctx.store, worldId);
      return jsonResponse({ data: policy });
    }
    if (request.method === "PUT") {
      trustedActor(ctx, request);
      const body = await parseBody(request);
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
      }
      const b = body as Record<string, unknown>;
      const parseBool = (key: string): boolean | undefined => {
        const val = b[key];
        if (val === undefined) return undefined;
        if (typeof val !== "boolean") throw new ApiError(400, "BAD_REQUEST", `${key} must be a boolean`);
        return val;
      };
      const policy = await storyGeneration.updateWorldContextPolicy(ctx.store, worldId, {
        ...(parseBool("worldLoreEnabled") !== undefined ? { worldLoreEnabled: parseBool("worldLoreEnabled")! } : {}),
        ...(parseBool("relationshipsEnabled") !== undefined ? { relationshipsEnabled: parseBool("relationshipsEnabled")! } : {}),
        ...(parseBool("schedulesEnabled") !== undefined ? { schedulesEnabled: parseBool("schedulesEnabled")! } : {}),
        ...(parseBool("memoriesEnabled") !== undefined ? { memoriesEnabled: parseBool("memoriesEnabled")! } : {}),
      });
      return jsonResponse({ data: policy });
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  // --- POST /v1/story-nodes/:id/generation-jobs ---
  const generationJobMatch = pathname.match(/^\/v1\/story-nodes\/([^/]+)\/generation-jobs$/);
  if (generationJobMatch) {
    if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    trustedActor(ctx, request);
    const nodeId = decodeURIComponent(generationJobMatch[1]!);
    const body = await parseBody(request);
    const input = body as { idempotencyKey?: string };
    if (!input.idempotencyKey || typeof input.idempotencyKey !== "string") {
      throw new ApiError(400, "BAD_REQUEST", "idempotencyKey is required");
    }
    const { job, inserted } = await storyGeneration.createGenerationJob(ctx.store, nodeId, input.idempotencyKey);
    return jsonResponse({ data: job }, inserted ? 201 : 200);
  }

  // --- GET /v1/story-generation-jobs/:id ---
  const jobMatch = pathname.match(/^\/v1\/story-generation-jobs\/([^/]+)$/);
  if (jobMatch) {
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const jobId = decodeURIComponent(jobMatch[1]!);
    const job = await storyGeneration.getGenerationJob(ctx.store, jobId);
    return jsonResponse({ data: job });
  }

  // --- GET /v1/story-generation-candidates ---
  if (pathname === "/v1/story-generation-candidates") {
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const storyWorldId = url.searchParams.get("storyWorldId");
    if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId query parameter is required");
    const candidates = await storyGeneration.listGenerationCandidates(ctx.store, storyWorldId);
    return jsonResponse({ data: candidates });
  }

  // --- POST /v1/story-generation-candidates/:id/review ---
  const reviewMatch = pathname.match(/^\/v1\/story-generation-candidates\/([^/]+)\/review$/);
  if (reviewMatch) {
    if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    trustedActor(ctx, request);
    const candidateId = decodeURIComponent(reviewMatch[1]!);
    const body = await parseBody(request);
    const input = body as { action?: string; reviewerCharacterId?: string; idempotencyKey?: string };
    if (!input.action || (input.action !== "approve" && input.action !== "reject")) {
      throw new ApiError(400, "BAD_REQUEST", "action must be 'approve' or 'reject'");
    }
    if (!input.reviewerCharacterId) {
      throw new ApiError(400, "BAD_REQUEST", "reviewerCharacterId is required");
    }
    if (!input.idempotencyKey) {
      throw new ApiError(400, "BAD_REQUEST", "idempotencyKey is required");
    }
    const { candidate, inserted } = await storyGeneration.reviewGenerationCandidate(
      ctx.store, candidateId, input.action, input.reviewerCharacterId, input.idempotencyKey,
    );
    return jsonResponse({ data: candidate }, inserted ? 200 : 200);
  }

  return undefined;
}
