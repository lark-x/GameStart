import type {
  ConversationOrchestratorOptions,
  ConversationReply,
} from "./conversation-orchestrator.ts";
import type { ChatProvider } from "@living-network/ai";
import type { SecretCipher } from "@living-network/ai";
import type { InteractionLogRepository } from "@living-network/ports";
import type { InteractionLogging } from "./interaction-logging.ts";
import type { ApiMediaStore } from "./media-store.ts";
import type { DomainRepositories } from "@living-network/ports";

export type ApiStore = DomainRepositories;

export interface HandlerContext {
  store: ApiStore;
  provider: ChatProvider | undefined;
  conversationOptions: ConversationOrchestratorOptions;
  requireTrustedActor: boolean;
  readiness: (() => Promise<void>) | undefined;
  secretCipher: SecretCipher | undefined;
  creatorDispatchEnabled: boolean;
  creatorClock: () => Date;
  interactionLogs: InteractionLogRepository;
  logging: InteractionLogging;
  replyFlights: Map<string, Promise<ConversationReply>>;
  media: ApiMediaStore;
}

export function trustedActor(
  ctx: HandlerContext,
  request: Request,
  requestedCharacterId?: string,
): string | undefined {
  if (!ctx.requireTrustedActor) return requestedCharacterId;
  const actor = request.headers.get("x-actor-character-id")?.trim();
  if (!actor) throw new ApiError(401, "UNAUTHORIZED", "Trusted actor context is required");
  if (requestedCharacterId !== undefined && actor !== requestedCharacterId) {
    throw new ApiError(403, "FORBIDDEN", "Trusted actor does not match requested character");
  }
  return actor;
}

// Re-export ApiError from helpers for convenience
import { ApiError } from "./helpers.ts";
