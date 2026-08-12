import type { SocialFeedEvent } from "@living-network/domain";
import { SocialFeedEventType } from "@living-network/domain";
import type { ApiStore } from "../context.ts";
import { ApiError } from "../helpers.ts";

export async function listFeedEvents(
  store: ApiStore,
  storyWorldId: string,
  cursor?: number,
  limit?: number,
): Promise<readonly SocialFeedEvent[]> {
  if (!store.socialFeedEvents) return [];
  return store.socialFeedEvents.listByStoryWorld(storyWorldId, cursor, limit);
}

export async function likeMoment(
  store: ApiStore,
  momentId: string,
  actorCharacterId: string,
  idempotencyKey: string,
): Promise<{ interactionId: string; inserted: boolean }> {
  if (!store.momentInteractions) throw new Error("MomentInteractionRepository not available");
  if (!store.socialFeedEvents) throw new Error("SocialFeedEventRepository not available");
  if (!store.moments) throw new Error("MomentRepository not available");

  const moment = await store.moments.getById(momentId);
  if (!moment) throw new ApiError(404, "NOT_FOUND", `Moment ${momentId} not found`);

  const existing = await store.momentInteractions.getByMomentAndActor(momentId, actorCharacterId, "LIKE");
  if (existing) {
    return { interactionId: existing.id, inserted: false };
  }

  const interactionId = `like-${momentId}-${actorCharacterId}-${idempotencyKey}`;
  const result = await store.momentInteractions.save({
    id: interactionId,
    momentId,
    storyWorldId: moment.storyWorldId,
    actorCharacterId,
    kind: "LIKE",
    createdAt: new Date().toISOString(),
    idempotencyKey,
  });

  if (result.inserted) {
    await store.socialFeedEvents.save({
      id: `feed-${interactionId}`,
      storyWorldId: moment.storyWorldId,
      eventType: SocialFeedEventType.INTERACTION_CREATED,
      momentId,
      interactionId,
      actorCharacterId,
      createdAt: new Date().toISOString(),
    });
  }

  return { interactionId: result.interaction.id, inserted: result.inserted };
}

export async function unlikeMoment(
  store: ApiStore,
  momentId: string,
  actorCharacterId: string,
): Promise<boolean> {
  if (!store.momentInteractions) throw new Error("MomentInteractionRepository not available");
  if (!store.socialFeedEvents) throw new Error("SocialFeedEventRepository not available");
  if (!store.moments) throw new Error("MomentRepository not available");

  const moment = await store.moments.getById(momentId);
  if (!moment) throw new ApiError(404, "NOT_FOUND", `Moment ${momentId} not found`);

  const existing = await store.momentInteractions.getByMomentAndActor(momentId, actorCharacterId, "LIKE");
  if (!existing) return false;

  await store.momentInteractions.delete(existing.id);

  await store.socialFeedEvents.save({
    id: `feed-delete-${existing.id}`,
    storyWorldId: moment.storyWorldId,
    eventType: SocialFeedEventType.INTERACTION_DELETED,
    momentId,
    interactionId: existing.id,
    actorCharacterId,
    createdAt: new Date().toISOString(),
  });

  return true;
}

export async function createMomentInteraction(
  store: ApiStore,
  momentId: string,
  input: { actorCharacterId: string; kind: "LIKE" | "COMMENT"; text?: string; idempotencyKey: string },
): Promise<{ interactionId: string }> {
  if (!store.momentInteractions) throw new Error("MomentInteractionRepository not available");
  if (!store.socialFeedEvents) throw new Error("SocialFeedEventRepository not available");
  if (!store.moments) throw new Error("MomentRepository not available");

  const moment = await store.moments.getById(momentId);
  if (!moment) throw new Error(`Moment ${momentId} not found`);

  const interactionId = `interaction-${momentId}-${input.actorCharacterId}-${input.idempotencyKey}`;
  
  // Create the interaction using the existing repository
  const result = await store.momentInteractions.save({
    id: interactionId,
    momentId,
    storyWorldId: moment.storyWorldId,
    actorCharacterId: input.actorCharacterId,
    kind: input.kind,
    createdAt: new Date().toISOString(),
    idempotencyKey: input.idempotencyKey,
    ...(input.text !== undefined ? { text: input.text } : {}),
  });

  // Create feed event
  await store.socialFeedEvents.save({
    id: `feed-${interactionId}`,
    storyWorldId: moment.storyWorldId,
    eventType: SocialFeedEventType.INTERACTION_CREATED,
    momentId,
    interactionId,
    actorCharacterId: input.actorCharacterId,
    createdAt: new Date().toISOString(),
  });

  // Write outbox event for comments to trigger auto-reply
  if (input.kind === "COMMENT" && store.outboxEvents) {
    await store.outboxEvents.append({
      id: `outbox-${interactionId}`,
      aggregateType: "MomentInteraction",
      aggregateId: interactionId,
      eventType: "moment.comment.created",
      payload: {
        momentId,
        interactionId,
        storyWorldId: moment.storyWorldId,
        authorCharacterId: moment.authorCharacterId,
        actorCharacterId: input.actorCharacterId,
        text: input.text ?? "",
      },
      idempotencyKey: `outbox-comment-${interactionId}`,
      createdAt: new Date().toISOString(),
    });
  }

  return { interactionId };
}
