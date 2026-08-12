import { assertIsoTimestamp, assertNonEmptyString } from "./validation.ts";

export const SocialFeedEventType = {
  MOMENT_CREATED: "MOMENT_CREATED",
  MOMENT_DELETED: "MOMENT_DELETED",
  INTERACTION_CREATED: "INTERACTION_CREATED",
  INTERACTION_DELETED: "INTERACTION_DELETED",
  REPLY_CREATED: "REPLY_CREATED",
} as const;

export type SocialFeedEventType =
  (typeof SocialFeedEventType)[keyof typeof SocialFeedEventType];

export interface SocialFeedEvent {
  readonly id: string;
  readonly storyWorldId: string;
  readonly eventType: SocialFeedEventType;
  readonly momentId?: string;
  readonly interactionId?: string;
  readonly actorCharacterId?: string;
  readonly cursorValue: number;
  readonly payload?: Record<string, unknown>;
  readonly createdAt: string;
}

export interface SocialFeedEventInput {
  readonly id: string;
  readonly storyWorldId: string;
  readonly eventType: SocialFeedEventType;
  readonly momentId?: string;
  readonly interactionId?: string;
  readonly actorCharacterId?: string;
  readonly payload?: Record<string, unknown>;
  readonly createdAt: string;
}

export function createSocialFeedEvent(
  input: SocialFeedEventInput,
): SocialFeedEvent {
  assertNonEmptyString(input.id, "feedEvent.id");
  assertNonEmptyString(input.storyWorldId, "feedEvent.storyWorldId");
  assertNonEmptyString(input.eventType, "feedEvent.eventType");
  assertIsoTimestamp(input.createdAt, "feedEvent.createdAt");

  const event: SocialFeedEvent = {
    id: input.id,
    storyWorldId: input.storyWorldId,
    eventType: input.eventType,
    cursorValue: 0, // Will be set by the database
    createdAt: input.createdAt,
    ...(input.momentId !== undefined ? { momentId: input.momentId } : {}),
    ...(input.interactionId !== undefined ? { interactionId: input.interactionId } : {}),
    ...(input.actorCharacterId !== undefined ? { actorCharacterId: input.actorCharacterId } : {}),
    ...(input.payload !== undefined ? { payload: input.payload } : {}),
  };
  return event;
}
