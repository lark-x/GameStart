import type { FastifyPluginAsync } from "fastify";
import type {
  V2CharacterId,
  V2CreateCommentRequest,
  V2CreateMomentRequest,
  V2IdempotencyKey,
  V2MomentId,
} from "@living-network/contracts/v2";
import type { V2CompanionUseCases } from "./use-cases.ts";

export interface V2CompanionPluginDependencies {
  readonly useCases: V2CompanionUseCases;
}

export function createV2CompanionPlugin(
  dependencies: V2CompanionPluginDependencies,
): FastifyPluginAsync {
  return async (app) => {
    app.get("/companion/moments", async () => {
      return dependencies.useCases.listMoments();
    });

    app.post("/companion/moments", async (request) => {
      const body = request.body as Record<string, unknown> | undefined;
      const characterId = (body?.characterId as string) || "character:furina";
      const topic = body?.topic as string | undefined;
      const idempotencyKey = (body?.idempotencyKey as string) || `moment:${Date.now()}`;

      const payload: V2CreateMomentRequest = {
        characterId: characterId as V2CharacterId,
        ...(topic ? { topic } : {}),
        idempotencyKey: idempotencyKey as V2IdempotencyKey,
      };

      return dependencies.useCases.createMoment(payload);
    });

    app.post("/companion/moments/:momentId/like", async (request) => {
      const { momentId } = request.params as { momentId: string };
      return dependencies.useCases.toggleLikeMoment(momentId as V2MomentId);
    });

    app.post("/companion/moments/:momentId/comments", async (request) => {
      const { momentId } = request.params as { momentId: string };
      const body = request.body as Record<string, unknown> | undefined;
      const content = ((body?.content as string) || "").trim();
      const idempotencyKey = (body?.idempotencyKey as string) || `comment:${Date.now()}`;

      const payload: V2CreateCommentRequest = {
        content: content || "点赞支持！",
        idempotencyKey: idempotencyKey as V2IdempotencyKey,
      };

      return dependencies.useCases.addComment(momentId as V2MomentId, payload);
    });

    app.get("/companion/roster", async () => {
      return dependencies.useCases.getRoster();
    });

    app.get("/companion/gallery", async (request) => {
      const query = request.query as { characterId?: string } | undefined;
      return {
        gallery: await dependencies.useCases.getGallery(
          query?.characterId ? (query.characterId as V2CharacterId) : undefined,
        ),
      };
    });
  };
}
