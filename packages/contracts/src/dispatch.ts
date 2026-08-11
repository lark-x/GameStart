import type { EventExecutionDto, ScheduledOccurrenceDto, WorldEventDefinitionDto } from "./events.ts";
import type { CharacterId, ConversationId, EventExecutionId, ImageJobId, MomentDraftId, OccurrenceId, StoryWorldId } from "./ids.ts";
import type { MomentInteractionDto } from "./moments.ts";

export const CreatorEventCandidateCategory = {
  OVERDUE: "OVERDUE",
  UPCOMING: "UPCOMING",
  FAILED: "FAILED",
  STALLED: "STALLED",
  MANUAL: "MANUAL",
} as const;

export type CreatorEventCandidateCategory =
  (typeof CreatorEventCandidateCategory)[keyof typeof CreatorEventCandidateCategory];

export const EventDispatchAction = {
  EXECUTE_EXISTING: "EXECUTE_EXISTING",
  RETRY_FAILED: "RETRY_FAILED",
  RUN_TRIAL: "RUN_TRIAL",
} as const;

export type EventDispatchAction =
  (typeof EventDispatchAction)[keyof typeof EventDispatchAction];

export interface CreatorEventCandidateDto {
  id: string;
  category: CreatorEventCandidateCategory;
  worldId: StoryWorldId;
  definition: WorldEventDefinitionDto;
  occurrence?: ScheduledOccurrenceDto;
  execution?: EventExecutionDto;
  projected?: boolean;
  scheduledFor: string;
  targetCharacterIds: readonly CharacterId[];
  recipientCharacterIds: readonly CharacterId[];
  outputSummary: readonly string[];
  risks: readonly string[];
  allowedActions: readonly EventDispatchAction[];
}

export interface EventDispatchPreviewItemDto {
  candidateId: string;
  action: EventDispatchAction;
  effect: string;
  risks: readonly string[];
}

export interface EventDispatchSelectionDto {
  candidateId: string;
  action: EventDispatchAction;
}

export interface EventDispatchPreviewRequest {
  selections: readonly EventDispatchSelectionDto[];
}

export const EventDispatchBatchStatus = {
  PENDING_DISPATCH: "PENDING_DISPATCH",
  DISPATCHED: "DISPATCHED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type EventDispatchBatchStatus =
  (typeof EventDispatchBatchStatus)[keyof typeof EventDispatchBatchStatus];

export const EventDispatchItemStatus = {
  PENDING_DISPATCH: "PENDING_DISPATCH",
  DISPATCHED: "DISPATCHED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type EventDispatchItemStatus =
  (typeof EventDispatchItemStatus)[keyof typeof EventDispatchItemStatus];

export interface EventDispatchBatchItemDto {
  id: string;
  candidateId: string;
  action: EventDispatchAction;
  status: EventDispatchItemStatus;
  occurrenceId?: OccurrenceId;
  executionId?: EventExecutionId;
  outputSnapshot?: Readonly<Record<string, unknown>>;
  failureReason?: string;
}

export interface EventDispatchBatchDto {
  id: string;
  worldId: StoryWorldId;
  status: EventDispatchBatchStatus;
  idempotencyKey: string;
  items: readonly EventDispatchBatchItemDto[];
  createdAt: string;
  updatedAt: string;
}

export const ImageAssetCategory = {
  CHAT: "CHAT",
  MOMENT: "MOMENT",
  EVENT: "EVENT",
} as const;

export type ImageAssetCategory =
  (typeof ImageAssetCategory)[keyof typeof ImageAssetCategory];

/** A completed ComfyUI result exposed through the persistent story-world album. */
export interface ImageAssetDto {
  id: ImageJobId;
  category: ImageAssetCategory;
  storyWorldId: StoryWorldId;
  ownerCharacterId: CharacterId;
  subjectCharacterId: CharacterId;
  conversationId?: ConversationId;
  momentDraftId?: MomentDraftId;
  workflowVersion: string;
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  mediaRef: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventDispatchBatchRequest {
  idempotencyKey: string;
  selections: readonly EventDispatchSelectionDto[];
}
export interface EventDispatchPreviewDto {
  worldId: StoryWorldId;
  items: readonly EventDispatchPreviewItemDto[];
  risks: readonly string[];
  canDispatch: boolean;
}
export interface MomentInteractionWriteResultDto {
  interaction: MomentInteractionDto;
  inserted: boolean;
}
