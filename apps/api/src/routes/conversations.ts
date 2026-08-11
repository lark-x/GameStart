import type { HandlerContext } from "../context.ts";
import { trustedActor } from "../context.ts";
import { ApiError, jsonResponse, createSseResponse } from "../helpers.ts";
import {
  parseCreateConversationRequest,
  parseSendMessageRequest,
  parseSwitchRequest,
} from "../parsers.ts";
import { ConversationOrchestrator } from "../conversation-orchestrator.ts";
import { createAutoImageAfterReply } from "../auto-image-after-reply.ts";

import type { AutomaticReplyTrace } from "../auto-reply.ts";
import {
  listConversations,
  createConversation,
  sendMessage,
  listMessages,
  switchActorCharacter,
  retryAutomaticReply,
} from "../use-cases/conversations.ts";


async function parseBody(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON"); }
}

export async function handleConversations(
  ctx: HandlerContext,
  request: Request,
  url: URL,
  correlationId: string,
): Promise<Response | undefined> {
  // --- Create Conversation ---
  if (request.method === "POST" && url.pathname === "/v1/conversations") {
    const input = parseCreateConversationRequest(await parseBody(request));
    const actor = trustedActor(ctx, request);
    return jsonResponse({ data: await createConversation(ctx.store, input, actor, ctx.requireTrustedActor) });
  }

  // --- List Conversations ---
  if (url.pathname === "/v1/conversations" && request.method === "GET") {
    const characterId = url.searchParams.get("characterId");
    if (!characterId) throw new ApiError(400, "BAD_REQUEST", "characterId is required");
    trustedActor(ctx, request, characterId);
    return jsonResponse({ data: await listConversations(ctx.store, characterId) });
  }

  // --- Retry Auto Reply ---
  const retryReplyPath = /^\/v1\/conversations\/([^/]+)\/auto-reply\/retry$/.exec(url.pathname);
  if (retryReplyPath) {
    if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const body = await parseBody(request);
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
    const b = body as Record<string, unknown>;
    const allowedKeys = new Set(["readerCharacterId", "sourceMessageId"]);
    if (Object.keys(b).some((k) => !allowedKeys.has(k))) throw new ApiError(400, "BAD_REQUEST", "Request body contains unknown fields");
    const readerCharacterId = typeof b.readerCharacterId === "string" && b.readerCharacterId.trim().length > 0 ? b.readerCharacterId : (() => { throw new ApiError(400, "BAD_REQUEST", "readerCharacterId must be a non-empty string"); })();
    const sourceMessageId = b.sourceMessageId === undefined ? undefined : (typeof b.sourceMessageId === "string" && b.sourceMessageId.trim().length > 0 ? b.sourceMessageId : (() => { throw new ApiError(400, "BAD_REQUEST", "sourceMessageId must be a non-empty string"); })());
    trustedActor(ctx, request, readerCharacterId);
    const conversationId = decodeURIComponent(retryReplyPath[1] ?? "");
    const trace: AutomaticReplyTrace = {
      correlationId, conversationId, actorId: readerCharacterId,
      ...(request.headers.get("x-request-id") === null ? {} : { requestId: request.headers.get("x-request-id")! }),
    };
    return jsonResponse({ data: await retryAutomaticReply(ctx, conversationId, readerCharacterId, sourceMessageId, trace) });
  }

  // --- Messages ---
  const messagePath = /^\/v1\/conversations\/([^/]+)\/messages$/.exec(url.pathname);
  if (messagePath) {
    const conversationId = decodeURIComponent(messagePath[1] ?? "");
    if (request.method === "GET") {
      const characterId = url.searchParams.get("characterId");
      if (!characterId) throw new ApiError(400, "BAD_REQUEST", "characterId is required");
      trustedActor(ctx, request, characterId);
      return jsonResponse({ data: await listMessages(ctx.store, conversationId, characterId) });
    }
    if (request.method === "POST") {
      const input = parseSendMessageRequest(await parseBody(request));
      const actor = trustedActor(ctx, request, input.authorCharacterId);
      if (ctx.requireTrustedActor && actor !== undefined && input.authorCharacterId === undefined) {
        throw new ApiError(403, "FORBIDDEN", "Public API cannot create system messages");
      }
      const effectiveAuthorId = input.authorCharacterId ?? actor;
      const trace: AutomaticReplyTrace = {
        correlationId, conversationId,
        ...(request.headers.get("x-request-id") === null ? {} : { requestId: request.headers.get("x-request-id")! }),
        ...(effectiveAuthorId === undefined ? {} : { actorId: effectiveAuthorId }),
      };
      return jsonResponse({ data: await sendMessage(ctx, conversationId, effectiveAuthorId, input, trace) });
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  // --- Stream ---
  const streamPath = /^\/v1\/conversations\/([^/]+)\/stream$/.exec(url.pathname);
  if (streamPath) {
    if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const characterId = url.searchParams.get("characterId");
    if (!characterId) throw new ApiError(400, "BAD_REQUEST", "characterId is required");
    trustedActor(ctx, request, characterId);
    if (!ctx.provider) throw new ApiError(501, "NOT_IMPLEMENTED", "Chat provider is not configured");
    try {
      const orchestrator = new ConversationOrchestrator(ctx.store, ctx.provider, {
        ...ctx.conversationOptions,
        afterReplySaved: createAutoImageAfterReply(ctx),
      });
      return createSseResponse(orchestrator.streamReply(decodeURIComponent(streamPath[1] ?? ""), characterId));
    } catch (error) {
      if (error instanceof TypeError) throw new ApiError(400, "BAD_REQUEST", error.message);
      throw error;
    }
  }

  // --- Actor Session Switch ---
  if (request.method === "POST" && url.pathname === "/v1/actor-sessions/switch") {
    const input = parseSwitchRequest(await parseBody(request));
    const actor = trustedActor(ctx, request);
    return jsonResponse({ data: await switchActorCharacter(ctx.store, input, actor, ctx.requireTrustedActor) });
  }

  return undefined;
}
