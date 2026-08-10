import type { HandlerContext } from "../context.ts";
import { trustedActor } from "../context.ts";
import { ApiError, jsonResponse } from "../helpers.ts";
import { parseDispatchPreviewRequest, parseCreateDispatchRequest } from "../parsers.ts";
import * as creatorUc from "../use-cases/creator-dispatch.ts";

async function parseBody(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
}

export async function handleCreatorDispatch(
  ctx: HandlerContext,
  request: Request,
  url: URL,
  _correlationId: string,
): Promise<Response | undefined> {
  // --- Creator Event Candidates ---
  const creatorCandidatesPath = /^\/v1\/creator\/worlds\/([^/]+)\/event-candidates$/.exec(url.pathname);
  if (creatorCandidatesPath) {
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const rawHorizonDays = url.searchParams.get("horizonDays");
    const horizonDays = rawHorizonDays === null ? 7 : Number(rawHorizonDays);
    return jsonResponse({ data: await creatorUc.listCreatorEventCandidates(ctx, decodeURIComponent(creatorCandidatesPath[1] ?? ""), horizonDays) });
  }

  // --- Creator Event Dispatch Preview ---
  const creatorPreviewPath = /^\/v1\/creator\/worlds\/([^/]+)\/event-dispatches\/preview$/.exec(url.pathname);
  if (creatorPreviewPath) {
    if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const input = parseDispatchPreviewRequest(await parseBody(request));
    return jsonResponse({ data: await creatorUc.previewDispatch(ctx, decodeURIComponent(creatorPreviewPath[1] ?? ""), input.selections) });
  }

  // --- Creator Event Dispatch Create ---
  const creatorDispatchPath = /^\/v1\/creator\/worlds\/([^/]+)\/event-dispatches$/.exec(url.pathname);
  if (creatorDispatchPath) {
    if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    trustedActor(ctx, request);
    const worldId = decodeURIComponent(creatorDispatchPath[1] ?? "");
    const input = parseCreateDispatchRequest(await parseBody(request));
    return jsonResponse({ data: await creatorUc.createCreatorEventDispatch(ctx, worldId, input) }, 201);
  }

  // --- Creator Dispatch Batch Status ---
  const creatorBatchPath = /^\/v1\/creator\/event-dispatches\/([^/]+)$/.exec(url.pathname);
  if (creatorBatchPath) {
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    return jsonResponse({ data: await creatorUc.getCreatorEventDispatchBatch(ctx, decodeURIComponent(creatorBatchPath[1] ?? "")) });
  }

  return undefined;
}
