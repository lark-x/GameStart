import type { HandlerContext } from "../context.ts";
import { trustedActor } from "../context.ts";
import { ApiError, jsonResponse } from "../helpers.ts";
import { toImageJobDto } from "../mappers.ts";
import {
  parseValidateImageWorkflowRequest,
  parseImportImageWorkflowRequest,
  parseRequestConversationImageRequest,
  parseCreateStickerPackRequest,
} from "../parsers.ts";
import * as characters from "../use-cases/characters.ts";
import * as workflowUc from "../use-cases/workflows.ts";
import * as stickerPacks from "../use-cases/sticker-packs.ts";
import * as imageJobs from "../use-cases/image-jobs.ts";
import { requestConversationImage as requestConversationImageUseCase, requireConversationImageStore } from "../use-cases/request-conversation-image.ts";

async function parseBody(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
}

export async function handleVisualAssets(
  ctx: HandlerContext,
  request: Request,
  url: URL,
  _correlationId: string,
): Promise<Response | undefined> {
  // --- Visual Identity ---
  const visualIdentityPath = /^\/v1\/characters\/([^/]+)\/visual-identity$/.exec(url.pathname);
  if (visualIdentityPath) {
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    return jsonResponse({ data: await characters.getCharacterVisualIdentity(ctx.store, decodeURIComponent(visualIdentityPath[1] ?? "")) });
  }

  // --- ComfyUI Workflows ---
  if (url.pathname === "/v1/comfyui/workflows") {
    if (request.method === "POST") {
      const input = parseValidateImageWorkflowRequest(await parseBody(request));
      return jsonResponse({ data: workflowUc.validateImageWorkflow(input) });
    }
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    return jsonResponse({ data: await workflowUc.listImageWorkflowTemplates(ctx.store) });
  }

  // --- Image Jobs ---
  const imageJobPath = /^\/v1\/image-jobs\/([^/]+)$/.exec(url.pathname);
  if (imageJobPath) {
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    return jsonResponse({ data: await imageJobs.getImageJob(ctx.store, decodeURIComponent(imageJobPath[1] ?? "")) });
  }

  // --- Image Assets ---
  if (url.pathname === "/v1/image-assets") {
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const storyWorldId = url.searchParams.get("storyWorldId");
    if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId is required");
    const actor = trustedActor(ctx, request);
    return jsonResponse({ data: await imageJobs.listImageAssets(ctx.store, storyWorldId, actor, ctx.requireTrustedActor) });
  }

  // --- Sticker Packs ---
  if (url.pathname === "/v1/sticker-packs") {
    if (request.method === "POST") {
      const actor = trustedActor(ctx, request);
      const input = parseCreateStickerPackRequest(await parseBody(request));
      return jsonResponse({ data: await stickerPacks.importStickerPack(ctx.store, input, actor, ctx.requireTrustedActor) });
    }
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const storyWorldId = url.searchParams.get("storyWorldId");
    if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId is required");
    return jsonResponse({ data: await stickerPacks.listStickerPacks(ctx.store, storyWorldId) });
  }

  const stickerPath = /^\/v1\/sticker-packs\/([^/]+)\/stickers$/.exec(url.pathname);
  if (stickerPath) {
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    return jsonResponse({ data: await stickerPacks.listStickers(ctx.store, decodeURIComponent(stickerPath[1] ?? "")) });
  }

  // --- ComfyUI Workflows Import ---
  if (url.pathname === "/v1/comfyui/workflows/import") {
    if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    trustedActor(ctx, request);
    const input = parseImportImageWorkflowRequest(await parseBody(request));
    return jsonResponse({ data: await workflowUc.importImageWorkflow(ctx.store, input) }, 201);
  }

  // --- Conversation Image Jobs ---
  const conversationImagePath = /^\/v1\/conversations\/([^/]+)\/image-jobs$/.exec(url.pathname);
  if (conversationImagePath) {
    if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const input = parseRequestConversationImageRequest(await parseBody(request));
    trustedActor(ctx, request, input.actorCharacterId);
    const conversationId = decodeURIComponent(conversationImagePath[1] ?? "");
    const imgStore = requireConversationImageStore(ctx.store);
    return jsonResponse({ data: toImageJobDto(await requestConversationImageUseCase(imgStore, conversationId, input)) }, 201);
  }

  return undefined;
}
