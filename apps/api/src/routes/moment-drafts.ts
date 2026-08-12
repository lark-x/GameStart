import type { HandlerContext } from "../context.ts";
import { ApiError, jsonResponse } from "../helpers.ts";
import { listMomentDrafts, reviewMomentDraft, retryImageJob } from "../use-cases/moment-drafts.ts";

async function parseBody(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
}

export async function handleMomentDrafts(
  ctx: HandlerContext,
  request: Request,
  url: URL,
  _correlationId: string,
): Promise<Response | undefined> {
  if (request.method === "GET" && url.pathname === "/v1/moment-drafts") {
    const storyWorldId = url.searchParams.get("storyWorldId");
    if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId is required");
    return jsonResponse({ data: await listMomentDrafts(ctx.store, storyWorldId) });
  }

  const reviewPath = /^\/v1\/moment-drafts\/([^/]+)\/review$/.exec(url.pathname);
  if (reviewPath && request.method === "POST") {
    const draftId = decodeURIComponent(reviewPath[1] ?? "");
    const body = await parseBody(request) as Record<string, unknown>;
    const action = body.action as string;
    if (action !== "approve" && action !== "reject") {
      throw new ApiError(400, "BAD_REQUEST", "action must be 'approve' or 'reject'");
    }
    return jsonResponse({ data: await reviewMomentDraft(ctx.store, draftId, action) });
  }

  return undefined;
}

export async function handleImageJobs(
  ctx: HandlerContext,
  request: Request,
  url: URL,
  _correlationId: string,
): Promise<Response | undefined> {
  const retryPath = /^\/v1\/image-jobs\/([^/]+)\/retry$/.exec(url.pathname);
  if (retryPath && request.method === "POST") {
    const jobId = decodeURIComponent(retryPath[1] ?? "");
    return jsonResponse({ data: await retryImageJob(ctx.store, jobId) });
  }
  return undefined;
}
