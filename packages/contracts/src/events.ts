import type { BehaviorActionId, CharacterId, CharacterPlanId, EventDefinitionId, EventExecutionId, ImageJobId, MomentDraftId, OccurrenceId, ProactiveMessageBudgetId, StoryWorldId } from "./ids.ts";


export const TriggerSource = {
  BIRTHDAY: "BIRTHDAY",
  REAL_HOLIDAY: "REAL_HOLIDAY",
  WORLD_HOLIDAY: "WORLD_HOLIDAY",
  STORY_NODE: "STORY_NODE",
  USER_INTERACTION: "USER_INTERACTION",
  RELATIONSHIP_EVENT: "RELATIONSHIP_EVENT",
  MANUAL: "MANUAL",
} as const;

export type TriggerSource = (typeof TriggerSource)[keyof typeof TriggerSource];

export const EventRecurrenceKind = {
  ONCE: "ONCE",
  ANNUAL: "ANNUAL",
} as const;

export type EventRecurrenceKind =
  (typeof EventRecurrenceKind)[keyof typeof EventRecurrenceKind];

export interface OnceEventRecurrenceDto {
  kind: typeof EventRecurrenceKind.ONCE;
  runAt: string;
}

export interface AnnualEventRecurrenceDto {
  kind: typeof EventRecurrenceKind.ANNUAL;
  month: number;
  day: number;
  localTime: string;
}

export type EventRecurrenceDto = OnceEventRecurrenceDto | AnnualEventRecurrenceDto;

export interface EventOutputPolicyDto {
  sendMessage: boolean;
  publishMoment: boolean;
  generateImage: boolean;
}

export interface WorldEventDefinitionDto {
  id: EventDefinitionId;
  storyWorldId: StoryWorldId;
  eventKey: string;
  name: string;
  triggerSource: TriggerSource;
  timezone: string;
  recurrence: EventRecurrenceDto;
  targetCharacterIds: readonly CharacterId[];
  recipientCharacterIds: readonly CharacterId[];
  outputs: EventOutputPolicyDto;
  priority: number;
  cooldownSeconds?: number;
  enabled: boolean;
  createdAt: string;
}

export interface CreateWorldEventDefinitionRequest {
  id: EventDefinitionId;
  storyWorldId: StoryWorldId;
  eventKey: string;
  name: string;
  triggerSource: TriggerSource;
  timezone?: string;
  recurrence: EventRecurrenceDto;
  targetCharacterIds: readonly CharacterId[];
  recipientCharacterIds?: readonly CharacterId[];
  outputs?: Partial<EventOutputPolicyDto>;
  priority?: number;
  cooldownSeconds?: number;
  enabled?: boolean;
  createdAt: string;
}

export interface UpdateWorldEventDefinitionRequest {
  eventKey?: string;
  name?: string;
  triggerSource?: TriggerSource;
  timezone?: string;
  recurrence?: EventRecurrenceDto;
  targetCharacterIds?: readonly CharacterId[];
  recipientCharacterIds?: readonly CharacterId[];
  outputs?: Partial<EventOutputPolicyDto>;
  priority?: number;
  cooldownSeconds?: number;
  enabled?: boolean;
}

export const ScheduledOccurrenceStatus = {
  PENDING: "PENDING",
  ENQUEUED: "ENQUEUED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type ScheduledOccurrenceStatus =
  (typeof ScheduledOccurrenceStatus)[keyof typeof ScheduledOccurrenceStatus];

export interface ScheduledOccurrenceDto {
  id: OccurrenceId;
  definitionId: EventDefinitionId;
  storyWorldId: StoryWorldId;
  eventKey: string;
  scheduledFor: string;
  timezone: string;
  occurrenceKey: string;
  status: ScheduledOccurrenceStatus;
  createdAt: string;
}

export interface WorldCalendarDto {
  storyWorldId: StoryWorldId;
  startsAt: string;
  endsAt: string;
  definitions: readonly WorldEventDefinitionDto[];
  occurrences: readonly ScheduledOccurrenceDto[];
}

export const PlanInterruptibility = {
  BLOCKED: "BLOCKED",
  LIMITED: "LIMITED",
  FLEXIBLE: "FLEXIBLE",
} as const;

export type PlanInterruptibility =
  (typeof PlanInterruptibility)[keyof typeof PlanInterruptibility];

export interface CharacterPlanDto {
  id: CharacterPlanId;
  storyWorldId: StoryWorldId;
  characterId: CharacterId;
  startsAt: string;
  endsAt: string;
  timezone: string;
  location?: string;
  activity: string;
  interruptibility: PlanInterruptibility;
  createdAt: string;
}

export const EventExecutionStatus = {
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type EventExecutionStatus =
  (typeof EventExecutionStatus)[keyof typeof EventExecutionStatus];

export interface EventExecutionDto {
  id: EventExecutionId;
  occurrenceId: OccurrenceId;
  definitionId: EventDefinitionId;
  storyWorldId: StoryWorldId;
  eventKey: string;
  targetCharacterIds: readonly CharacterId[];
  attempt: number;
  ruleVersion: string;
  inputSnapshot: Readonly<Record<string, unknown>>;
  status: EventExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  outputSnapshot?: Readonly<Record<string, unknown>>;
  failureReason?: string;
}

export interface ProactiveMessageBudgetDto {
  id: ProactiveMessageBudgetId;
  storyWorldId: StoryWorldId;
  characterId: CharacterId;
  windowStartsAt: string;
  windowEndsAt: string;
  limit: number;
  consumed: number;
  updatedAt: string;
}

export const ActionKind = {
  NOOP: "NOOP",
  SEND_MESSAGE: "SEND_MESSAGE",
  CREATE_MOMENT: "CREATE_MOMENT",
  REQUEST_IMAGE: "REQUEST_IMAGE",
} as const;

export type ActionKind = (typeof ActionKind)[keyof typeof ActionKind];

export const ActionStatus = {
  PROPOSED: "PROPOSED",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
} as const;

export type ActionStatus = (typeof ActionStatus)[keyof typeof ActionStatus];

export interface BehaviorActionDto {
  id: BehaviorActionId;
  executionId: EventExecutionId;
  storyWorldId: StoryWorldId;
  actorCharacterId: CharacterId;
  kind: ActionKind;
  status: ActionStatus;
  priority: number;
  payload: Readonly<Record<string, unknown>>;
  createdAt: string;
}

export const MomentVisibility = {
  PUBLIC: "PUBLIC",
  RELATION: "RELATION",
  GROUP: "GROUP",
  PRIVATE: "PRIVATE",
} as const;

export type MomentVisibility =
  (typeof MomentVisibility)[keyof typeof MomentVisibility];

export const MomentDraftStatus = {
  DRAFT: "DRAFT",
  READY: "READY",
  PUBLISHED: "PUBLISHED",
  REJECTED: "REJECTED",
} as const;

export type MomentDraftStatus =
  (typeof MomentDraftStatus)[keyof typeof MomentDraftStatus];

export interface MomentDraftDto {
  id: MomentDraftId;
  actionId: BehaviorActionId;
  executionId: EventExecutionId;
  storyWorldId: StoryWorldId;
  authorCharacterId: CharacterId;
  visibility: MomentVisibility;
  body: string;
  status: MomentDraftStatus;
  imageJobId?: ImageJobId;
  createdAt: string;
  updatedAt: string;
}
