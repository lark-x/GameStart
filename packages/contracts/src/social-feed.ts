export interface SocialFeedEventDto {
  id: string;
  storyWorldId: string;
  eventType: "MOMENT_CREATED" | "MOMENT_DELETED" | "INTERACTION_CREATED" | "INTERACTION_DELETED" | "REPLY_CREATED";
  momentId?: string;
  interactionId?: string;
  actorCharacterId?: string;
  cursorValue: number;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface MomentInteractionPageDto {
  interactions: readonly SocialMomentInteractionDto[];
  nextCursor?: number;
}

export interface SocialMomentInteractionDto {
  id: string;
  momentId: string;
  storyWorldId: string;
  actorCharacterId: string;
  kind: "LIKE" | "COMMENT";
  text?: string;
  replyToInteractionId?: string;
  createdAt: string;
  idempotencyKey: string;
}
