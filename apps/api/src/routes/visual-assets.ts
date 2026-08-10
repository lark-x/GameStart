import {
  createImageWorkflowTemplate,
  importImageWorkflow,
  assertImageWorkflowTemplateBindings,
  createSticker as createStickerDomain,
  createStickerPack as createStickerPackDomain,
  createWorldEventDefinition as createWorldEventDefinitionDomain,
  createScheduledOccurrence,
  createEventExecution,
  createBehaviorAction,
  createImageJob,
  ActionKind,
  EventRecurrenceKind,
  ScheduledOccurrenceStatus,
  TriggerSource,
  type JsonObject,
} from "../../../../packages/domain/src/index.ts";
import type { HandlerContext } from "../context.ts";
import { trustedActor } from "../context.ts";
import { ApiError, jsonResponse } from "../helpers.ts";
import {
  toCharacterVisualIdentityDto,
  toImageWorkflowTemplateDto,
  toImageJobDto,
  toImageAssetDto,
  toStickerPackDto,
  toStickerDto,
  toStickerPackImportResult,
} from "../mappers.ts";
import {
  parseValidateImageWorkflowRequest,
  parseImportImageWorkflowRequest,
  parseRequestConversationImageRequest,
  parseCreateStickerPackRequest,
} from "../parsers.ts";
import {
  requireVisualWorkflowStore,
  requireImageJobStore,
  requireImageAssetStore,
  requireStickerStore,
  requireEventCalendarStore,
  requireChatStore,
} from "../store-helpers.ts";
import type { ChatStore, EventCalendarStore } from "../store-helpers.ts";
import { requestConversationImage as requestConversationImageUseCase, requireConversationImageStore } from "../use-cases/request-conversation-image.ts";
import type { ExecutionDispatchRequest } from "../../../../packages/database/src/index.ts";

async function parseBody(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
}

type ConversationImageStore = ChatStore & EventCalendarStore & {
  imageJobs: NonNullable<import("../context.ts").ApiStore["imageJobs"]>;
  eventExecutions: NonNullable<import("../context.ts").ApiStore["eventExecutions"]>;
  behaviorActions: NonNullable<import("../context.ts").ApiStore["behaviorActions"]>;
};

function requireConversationImageStoreFull(store: import("../context.ts").ApiStore): ConversationImageStore {
  if (!store.eventExecutions || !store.behaviorActions) {
    throw new ApiError(501, "NOT_IMPLEMENTED", "Image request repositories are not configured");
  }
  requireEventCalendarStore(store);
  requireImageJobStore(store);
  requireChatStore(store);
  return store as ConversationImageStore;
}

export async function handleVisualAssets(
  ctx: HandlerContext,
  request: Request,
  url: URL,
  correlationId: string,
): Promise<Response | undefined> {
  const store = ctx.store;

  // --- Visual Identity ---
  const visualIdentityPath = /^\/v1\/characters\/([^/]+)\/visual-identity$/.exec(url.pathname);
  if (visualIdentityPath) {
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const vwStore = requireVisualWorkflowStore(store);
    const characterId = decodeURIComponent(visualIdentityPath[1] ?? "");
    if (!(await store.characters.getById(characterId))) throw new ApiError(404, "NOT_FOUND", "Character not found");
    const identity = await vwStore.characterVisualIdentities.getByCharacterId(characterId);
    if (!identity) throw new ApiError(404, "NOT_FOUND", "Character visual identity not found");
    return jsonResponse({ data: toCharacterVisualIdentityDto(identity) });
  }

  // --- ComfyUI Workflows ---
  if (url.pathname === "/v1/comfyui/workflows") {
    if (request.method === "POST") {
      const input = parseValidateImageWorkflowRequest(await parseBody(request));
      try {
        const template = createImageWorkflowTemplate({
          id: input.id, version: input.version, workflow: input.workflow as JsonObject,
          positivePromptPath: input.positivePromptPath,
          ...(input.negativePromptPath === undefined ? {} : { negativePromptPath: input.negativePromptPath }),
          ...(input.seedPath === undefined ? {} : { seedPath: input.seedPath }),
        });
        assertImageWorkflowTemplateBindings(template);
        return jsonResponse({ data: { valid: true, id: template.id, version: template.version, checkedBindings: ["positivePromptPath", ...(template.negativePromptPath === undefined ? [] : ["negativePromptPath"]), ...(template.seedPath === undefined ? [] : ["seedPath"])] } });
      } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
        throw error;
      }
    }
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const vwStore = requireVisualWorkflowStore(store);
    return jsonResponse({ data: (await vwStore.imageWorkflowTemplates.list()).map(toImageWorkflowTemplateDto) });
  }

  // --- Image Jobs ---
  const imageJobPath = /^\/v1\/image-jobs\/([^/]+)$/.exec(url.pathname);
  if (imageJobPath) {
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const jobStore = requireImageJobStore(store);
    const job = await jobStore.imageJobs.getById(decodeURIComponent(imageJobPath[1] ?? ""));
    if (!job) throw new ApiError(404, "NOT_FOUND", "Image job not found");
    return jsonResponse({ data: toImageJobDto(job) });
  }

  // --- Image Assets ---
  if (url.pathname === "/v1/image-assets") {
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const storyWorldId = url.searchParams.get("storyWorldId");
    if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId is required");
    const actor = trustedActor(ctx, request);
    if (ctx.requireTrustedActor && actor !== undefined) {
      const character = await store.characters.getById(actor);
      if (!character || character.storyWorldId !== storyWorldId) {
        throw new ApiError(403, "FORBIDDEN", "Trusted actor cannot view this story-world album");
      }
    }
    const assetStore = requireImageAssetStore(store);
    if (!(await store.storyWorlds.getById(storyWorldId))) throw new ApiError(404, "NOT_FOUND", "Story world not found");
    const jobs = await assetStore.imageJobs.listSucceededByStoryWorld(storyWorldId);
    const assets = await Promise.all(jobs.map(async (job) => {
      const action = await assetStore.behaviorActions.getById(job.actionId);
      if (!action) throw new ApiError(500, "INTERNAL_ERROR", "Image asset action is missing");
      return toImageAssetDto(job, action);
    }));
    return jsonResponse({ data: assets });
  }

  // --- Sticker Packs ---
  if (url.pathname === "/v1/sticker-packs") {
    if (request.method === "POST") {
      const actor = trustedActor(ctx, request);
      const input = parseCreateStickerPackRequest(await parseBody(request));
      if (ctx.requireTrustedActor && actor !== undefined) {
        const character = await store.characters.getById(actor);
        if (!character || character.storyWorldId !== input.storyWorldId) {
          throw new ApiError(403, "FORBIDDEN", "Trusted actor cannot import into this story world");
        }
      }
      const stickerStore = requireStickerStore(store);
      const world = await store.storyWorlds.getById(input.storyWorldId);
      if (!world) throw new ApiError(404, "NOT_FOUND", "Story world not found");
      try {
        const pack = createStickerPackDomain({ id: input.id, storyWorld: world, name: input.name, createdAt: input.createdAt, ...(input.sourceRef === undefined ? {} : { sourceRef: input.sourceRef }) });
        const stickers = input.stickers.map((s) => createStickerDomain({ id: s.id, pack, label: s.label, mediaRef: s.mediaRef, ...(s.tags === undefined ? {} : { tags: s.tags }), createdAt: input.createdAt }));
        await stickerStore.stickerPacks.save(pack);
        for (const sticker of stickers) await stickerStore.stickers.save(sticker);
        return jsonResponse({ data: toStickerPackImportResult(pack, stickers) });
      } catch (error) {
        if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
        throw error;
      }
    }
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const storyWorldId = url.searchParams.get("storyWorldId");
    if (!storyWorldId) throw new ApiError(400, "BAD_REQUEST", "storyWorldId is required");
    const stickerStore = requireStickerStore(store);
    if (!(await store.storyWorlds.getById(storyWorldId))) throw new ApiError(404, "NOT_FOUND", "Story world not found");
    return jsonResponse({ data: (await stickerStore.stickerPacks.listByStoryWorld(storyWorldId)).map(toStickerPackDto) });
  }

  const stickerPath = /^\/v1\/sticker-packs\/([^/]+)\/stickers$/.exec(url.pathname);
  if (stickerPath) {
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const stickerStore = requireStickerStore(store);
    const packId = decodeURIComponent(stickerPath[1] ?? "");
    if (!(await stickerStore.stickerPacks.getById(packId))) throw new ApiError(404, "NOT_FOUND", "Sticker pack not found");
    return jsonResponse({ data: (await stickerStore.stickers.listByPack(packId)).map(toStickerDto) });
  }

  // --- ComfyUI Workflows Import ---
  if (url.pathname === "/v1/comfyui/workflows/import") {
    if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    trustedActor(ctx, request);
    const input = parseImportImageWorkflowRequest(await parseBody(request));
    const vwStore = requireVisualWorkflowStore(store);
    try {
      const imported = importImageWorkflow(input.workflow);
      const template = createImageWorkflowTemplate({
        id: input.id, version: input.version, workflow: imported.workflow,
        positivePromptPath: input.positivePromptPath ?? imported.positivePromptPath,
        ...(input.negativePromptPath ?? imported.negativePromptPath ? { negativePromptPath: input.negativePromptPath ?? imported.negativePromptPath } : {}),
        ...(input.seedPath ?? imported.seedPath ? { seedPath: input.seedPath ?? imported.seedPath } : {}),
      });
      assertImageWorkflowTemplateBindings(template);
      await vwStore.imageWorkflowTemplates.save(template);
      return jsonResponse({ data: toImageWorkflowTemplateDto(template) }, 201);
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  // --- Conversation Image Jobs ---
  const conversationImagePath = /^\/v1\/conversations\/([^/]+)\/image-jobs$/.exec(url.pathname);
  if (conversationImagePath) {
    if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const { parseRequestConversationImageRequest } = await import("../parsers.ts");
    const input = parseRequestConversationImageRequest(await parseBody(request));
    trustedActor(ctx, request, input.actorCharacterId);
    const conversationId = decodeURIComponent(conversationImagePath[1] ?? "");
    const imgStore = requireConversationImageStore(store);
    try {
      const job = await requestConversationImageUseCase(imgStore, conversationId, input);
      return jsonResponse({ data: toImageJobDto(job) }, 201);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  return undefined;
}
