import type { HandlerContext } from "../context.ts";
import { ApiError, jsonResponse } from "../helpers.ts";
import { listRelationshipChangeCandidates, reviewRelationshipChangeCandidate, listRelationshipEvents } from "../use-cases/relationship-feedback.ts";

async function parseBody(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
}

export async function handleRelationshipFeedback(
  ctx: HandlerContext,
  request: Request,
  url: URL,
  _correlationId: string,
): Promise<Response | undefined> {
  if (request.method === "GET" && url.pathname === "/v1/relationship-change-candidates") {
    const storyWorldId = url.searchParams.get("storyWorldId");
    if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId is required");
    const status = url.searchParams.get("status") ?? undefined;
    return jsonResponse({ data: await listRelationshipChangeCandidates(ctx.store, storyWorldId, status) });
  }

  const reviewPath = /^\/v1\/relationship-change-candidates\/([^/]+)\/review$/.exec(url.pathname);
  if (reviewPath && request.method === "POST") {
    const candidateId = decodeURIComponent(reviewPath[1] ?? "");
    const body = await parseBody(request) as Record<string, unknown>;
    const action = body.action as string;
    if (action !== "approve" && action !== "reject") {
      throw new ApiError(400, "BAD_REQUEST", "action must be 'approve' or 'reject'");
    }
    const reviewedBy = body.reviewedBy as string | undefined;
    return jsonResponse({ data: await reviewRelationshipChangeCandidate(ctx.store, candidateId, action, reviewedBy) });
  }

  const eventsPath = /^\/v1\/relationships\/([^/]+)\/events$/.exec(url.pathname);
  if (eventsPath && request.method === "GET") {
    const edgeId = decodeURIComponent(eventsPath[1] ?? "");
    return jsonResponse({ data: await listRelationshipEvents(ctx.store, edgeId) });
  }

  return undefined;
}
