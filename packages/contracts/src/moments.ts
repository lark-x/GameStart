import { MomentVisibility } from "./events.ts";
import type { BehaviorActionId, CharacterId, EventExecutionId, ImageJobId, MomentDraftId, MomentId, MomentInteractionId, StoryWorldId } from "./ids.ts";

export const ImageJobKind = {
  MOMENT: "MOMENT",
} as const;

export type ImageJobKind = (typeof ImageJobKind)[keyof typeof ImageJobKind];

export const ImageJobStatus = {
  QUEUED: "QUEUED",
  SUBMITTED: "SUBMITTED",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type ImageJobStatus = (typeof ImageJobStatus)[keyof typeof ImageJobStatus];

export interface ImageJobDto {
  id: ImageJobId;
  kind: ImageJobKind;
  actionId: BehaviorActionId;
  executionId: EventExecutionId;
  storyWorldId: StoryWorldId;
  ownerCharacterId: CharacterId;
  momentDraftId?: MomentDraftId;
  workflowVersion: string;
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  attempt: number;
  status: ImageJobStatus;
  externalJobId?: string;
  mediaRef?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MomentDto {
  id: MomentId;
  draftId: MomentDraftId;
  storyWorldId: StoryWorldId;
  authorCharacterId: CharacterId;
  visibility: MomentVisibility;
  audienceCharacterIds: readonly CharacterId[];
  body: string;
  imageMediaRef?: string;
  publishedAt: string;
  createdAt: string;
}

export const MomentInteractionKind = {
  LIKE: "LIKE",
  COMMENT: "COMMENT",
} as const;

export type MomentInteractionKind =
  (typeof MomentInteractionKind)[keyof typeof MomentInteractionKind];

export interface MomentInteractionDto {
  id: MomentInteractionId;
  momentId: MomentId;
  storyWorldId: StoryWorldId;
  actorCharacterId: CharacterId;
  kind: MomentInteractionKind;
  text?: string;
  replyToInteractionId?: MomentInteractionId;
  createdAt: string;
  idempotencyKey: string;
}

export interface CreateMomentInteractionRequest {
  id: MomentInteractionId;
  actorCharacterId: CharacterId;
  kind: MomentInteractionKind;
  text?: string;
  createdAt: string;
  idempotencyKey: string;
}
