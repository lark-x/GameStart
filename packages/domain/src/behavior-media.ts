import type {
  EventExecution,
  JsonObject,
} from "./life-simulation.ts";
import {
  assertJsonValue,
  cloneJsonObject,
} from "./life-simulation.ts";
import {
  assertIsoTimestamp,
  assertNonEmptyString,
} from "./validation.ts";

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

export interface BehaviorAction {
  id: string;
  executionId: string;
  storyWorldId: string;
  actorCharacterId: string;
  kind: ActionKind;
  status: ActionStatus;
  priority: number;
  payload: JsonObject;
  createdAt: string;
}

export interface BehaviorActionInput {
  id: string;
  execution: EventExecution;
  actorCharacterId: string;
  kind: ActionKind;
  payload: JsonObject;
  priority?: number;
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

export interface MomentDraft {
  id: string;
  actionId: string;
  executionId: string;
  storyWorldId: string;
  authorCharacterId: string;
  visibility: MomentVisibility;
  body: string;
  status: MomentDraftStatus;
  imageJobId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MomentDraftInput {
  id: string;
  action: BehaviorAction;
  visibility: MomentVisibility;
  body?: string;
  createdAt: string;
}

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

export interface ImageJob {
  id: string;
  kind: ImageJobKind;
  actionId: string;
  executionId: string;
  storyWorldId: string;
  ownerCharacterId: string;
  momentDraftId?: string;
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

export interface ImageJobInput {
  id: string;
  action: BehaviorAction;
  momentDraftId?: string;
  createdAt: string;
}

function assertEnum<T extends string>(value: T, values: readonly T[], field: string): void {
  if (!values.includes(value)) throw new TypeError(`${field} has an unsupported value`);
}

function requiredPayloadString(payload: JsonObject, key: string, field: string): string {
  const value = payload[key];
  assertNonEmptyString(value, field);
  return value;
}

function optionalPayloadString(payload: JsonObject, key: string, field: string): string | undefined {
  const value = payload[key];
  if (value === undefined) return undefined;
  assertNonEmptyString(value, field);
  return value;
}

function optionalPayloadSeed(payload: JsonObject): number | undefined {
  const value = payload.seed;
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("action.payload.seed must be a non-negative integer");
  }
  return value;
}

function assertActionPayload(kind: ActionKind, payload: JsonObject): void {
  assertJsonValue(payload, "action.payload");
  if (kind === ActionKind.SEND_MESSAGE) {
    requiredPayloadString(payload, "text", "action.payload.text");
  }
  if (kind === ActionKind.CREATE_MOMENT) {
    requiredPayloadString(payload, "body", "action.payload.body");
  }
  if (kind === ActionKind.REQUEST_IMAGE) {
    requiredPayloadString(payload, "prompt", "action.payload.prompt");
    requiredPayloadString(payload, "workflowVersion", "action.payload.workflowVersion");
  }
  if (kind === ActionKind.CREATE_MOMENT && payload.imagePrompt !== undefined) {
    assertNonEmptyString(payload.imagePrompt, "action.payload.imagePrompt");
    requiredPayloadString(payload, "workflowVersion", "action.payload.workflowVersion");
  }
  optionalPayloadString(payload, "negativePrompt", "action.payload.negativePrompt");
  optionalPayloadSeed(payload);
}

export function createBehaviorAction(input: BehaviorActionInput): BehaviorAction {
  assertNonEmptyString(input.id, "action.id");
  assertNonEmptyString(input.execution.id, "action.execution.id");
  assertNonEmptyString(input.actorCharacterId, "action.actorCharacterId");
  assertEnum(input.kind, Object.values(ActionKind), "action.kind");
  assertActionPayload(input.kind, input.payload);
  if (!input.execution.targetCharacterIds.includes(input.actorCharacterId)) {
    throw new TypeError("action.actorCharacterId must be an execution target");
  }
  const priority = input.priority ?? 0;
  if (!Number.isSafeInteger(priority) || priority < 0) {
    throw new RangeError("action.priority must be a non-negative integer");
  }
  assertIsoTimestamp(input.createdAt, "action.createdAt");
  return {
    id: input.id,
    executionId: input.execution.id,
    storyWorldId: input.execution.storyWorldId,
    actorCharacterId: input.actorCharacterId,
    kind: input.kind,
    status: ActionStatus.PROPOSED,
    priority,
    payload: cloneJsonObject(input.payload),
    createdAt: input.createdAt,
  };
}

export function assertBehaviorAction(action: BehaviorAction): void {
  assertNonEmptyString(action.id, "action.id");
  assertNonEmptyString(action.executionId, "action.executionId");
  assertNonEmptyString(action.storyWorldId, "action.storyWorldId");
  assertNonEmptyString(action.actorCharacterId, "action.actorCharacterId");
  assertEnum(action.kind, Object.values(ActionKind), "action.kind");
  assertEnum(action.status, Object.values(ActionStatus), "action.status");
  assertActionPayload(action.kind, action.payload);
  if (!Number.isSafeInteger(action.priority) || action.priority < 0) {
    throw new RangeError("action.priority must be a non-negative integer");
  }
  assertIsoTimestamp(action.createdAt, "action.createdAt");
}

export function transitionBehaviorAction(
  action: BehaviorAction,
  nextStatus: ActionStatus,
): BehaviorAction {
  assertBehaviorAction(action);
  assertEnum(nextStatus, Object.values(ActionStatus), "action.nextStatus");
  if (action.status === nextStatus) return { ...action, payload: cloneJsonObject(action.payload) };
  if (action.status !== ActionStatus.PROPOSED) {
    throw new Error(`cannot transition action from ${action.status} to ${nextStatus}`);
  }
  return { ...action, status: nextStatus, payload: cloneJsonObject(action.payload) };
}

export function createMomentDraft(input: MomentDraftInput): MomentDraft {
  assertNonEmptyString(input.id, "moment.id");
  assertBehaviorAction(input.action);
  if (input.action.kind !== ActionKind.CREATE_MOMENT) {
    throw new TypeError("moment draft requires a CREATE_MOMENT action");
  }
  assertEnum(input.visibility, Object.values(MomentVisibility), "moment.visibility");
  const body = input.body ?? requiredPayloadString(input.action.payload, "body", "moment.body");
  assertNonEmptyString(body, "moment.body");
  assertIsoTimestamp(input.createdAt, "moment.createdAt");
  return {
    id: input.id,
    actionId: input.action.id,
    executionId: input.action.executionId,
    storyWorldId: input.action.storyWorldId,
    authorCharacterId: input.action.actorCharacterId,
    visibility: input.visibility,
    body,
    status: MomentDraftStatus.DRAFT,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export function assertMomentDraft(draft: MomentDraft): void {
  assertNonEmptyString(draft.id, "moment.id");
  assertNonEmptyString(draft.actionId, "moment.actionId");
  assertNonEmptyString(draft.executionId, "moment.executionId");
  assertNonEmptyString(draft.storyWorldId, "moment.storyWorldId");
  assertNonEmptyString(draft.authorCharacterId, "moment.authorCharacterId");
  assertEnum(draft.visibility, Object.values(MomentVisibility), "moment.visibility");
  assertNonEmptyString(draft.body, "moment.body");
  assertEnum(draft.status, Object.values(MomentDraftStatus), "moment.status");
  if (draft.imageJobId !== undefined) assertNonEmptyString(draft.imageJobId, "moment.imageJobId");
  assertIsoTimestamp(draft.createdAt, "moment.createdAt");
  assertIsoTimestamp(draft.updatedAt, "moment.updatedAt");
  if (draft.status === MomentDraftStatus.PUBLISHED && draft.imageJobId === undefined) {
    // Text-only moments are publishable; an image is optional.
  }
}

export function attachMomentImageJob(
  draft: MomentDraft,
  imageJobId: string,
  updatedAt: string,
): MomentDraft {
  assertMomentDraft(draft);
  assertNonEmptyString(imageJobId, "moment.imageJobId");
  assertIsoTimestamp(updatedAt, "moment.updatedAt");
  if (draft.status === MomentDraftStatus.PUBLISHED || draft.status === MomentDraftStatus.REJECTED) {
    throw new Error(`cannot attach an image job to ${draft.status} moment`);
  }
  return { ...draft, imageJobId, updatedAt };
}

export function transitionMomentDraft(
  draft: MomentDraft,
  nextStatus: MomentDraftStatus,
  updatedAt: string,
): MomentDraft {
  assertMomentDraft(draft);
  assertEnum(nextStatus, Object.values(MomentDraftStatus), "moment.nextStatus");
  assertIsoTimestamp(updatedAt, "moment.updatedAt");
  if (draft.status === nextStatus) return { ...draft, updatedAt };
  const allowed: Record<MomentDraftStatus, readonly MomentDraftStatus[]> = {
    [MomentDraftStatus.DRAFT]: [MomentDraftStatus.READY, MomentDraftStatus.REJECTED],
    [MomentDraftStatus.READY]: [MomentDraftStatus.PUBLISHED, MomentDraftStatus.REJECTED],
    [MomentDraftStatus.PUBLISHED]: [],
    [MomentDraftStatus.REJECTED]: [],
  };
  if (!allowed[draft.status].includes(nextStatus)) {
    throw new Error(`cannot transition moment from ${draft.status} to ${nextStatus}`);
  }
  return { ...draft, status: nextStatus, updatedAt };
}

function imagePayload(action: BehaviorAction): {
  prompt: string;
  workflowVersion: string;
  negativePrompt?: string;
  seed?: number;
} {
  assertBehaviorAction(action);
  if (action.kind !== ActionKind.REQUEST_IMAGE && action.kind !== ActionKind.CREATE_MOMENT) {
    throw new TypeError("image job requires a REQUEST_IMAGE or CREATE_MOMENT action");
  }
  const prompt = action.kind === ActionKind.REQUEST_IMAGE
    ? requiredPayloadString(action.payload, "prompt", "image.prompt")
    : requiredPayloadString(action.payload, "imagePrompt", "image.prompt");
  const workflowVersion = requiredPayloadString(
    action.payload,
    "workflowVersion",
    "image.workflowVersion",
  );
  const negativePrompt = optionalPayloadString(
    action.payload,
    "negativePrompt",
    "image.negativePrompt",
  );
  const seed = optionalPayloadSeed(action.payload);
  const result: { prompt: string; workflowVersion: string; negativePrompt?: string; seed?: number } = {
    prompt,
    workflowVersion,
  };
  if (negativePrompt !== undefined) result.negativePrompt = negativePrompt;
  if (seed !== undefined) result.seed = seed;
  return result;
}

export function createImageJob(input: ImageJobInput): ImageJob {
  assertNonEmptyString(input.id, "imageJob.id");
  assertBehaviorAction(input.action);
  const payload = imagePayload(input.action);
  assertIsoTimestamp(input.createdAt, "imageJob.createdAt");
  const job: ImageJob = {
    id: input.id,
    kind: ImageJobKind.MOMENT,
    actionId: input.action.id,
    executionId: input.action.executionId,
    storyWorldId: input.action.storyWorldId,
    ownerCharacterId: input.action.actorCharacterId,
    workflowVersion: payload.workflowVersion,
    prompt: payload.prompt,
    attempt: 1,
    status: ImageJobStatus.QUEUED,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
  if (input.momentDraftId !== undefined) job.momentDraftId = input.momentDraftId;
  if (payload.negativePrompt !== undefined) job.negativePrompt = payload.negativePrompt;
  if (payload.seed !== undefined) job.seed = payload.seed;
  assertImageJob(job);
  return job;
}

export function assertImageJob(job: ImageJob): void {
  assertNonEmptyString(job.id, "imageJob.id");
  assertEnum(job.kind, Object.values(ImageJobKind), "imageJob.kind");
  assertNonEmptyString(job.actionId, "imageJob.actionId");
  assertNonEmptyString(job.executionId, "imageJob.executionId");
  assertNonEmptyString(job.storyWorldId, "imageJob.storyWorldId");
  assertNonEmptyString(job.ownerCharacterId, "imageJob.ownerCharacterId");
  if (job.momentDraftId !== undefined) assertNonEmptyString(job.momentDraftId, "imageJob.momentDraftId");
  assertNonEmptyString(job.workflowVersion, "imageJob.workflowVersion");
  assertNonEmptyString(job.prompt, "imageJob.prompt");
  if (!Number.isSafeInteger(job.attempt) || job.attempt < 1) {
    throw new RangeError("imageJob.attempt must be a positive integer");
  }
  if (job.negativePrompt !== undefined) assertNonEmptyString(job.negativePrompt, "imageJob.negativePrompt");
  if (job.seed !== undefined && (!Number.isSafeInteger(job.seed) || job.seed < 0)) {
    throw new RangeError("imageJob.seed must be a non-negative integer");
  }
  assertEnum(job.status, Object.values(ImageJobStatus), "imageJob.status");
  if (job.externalJobId !== undefined) assertNonEmptyString(job.externalJobId, "imageJob.externalJobId");
  if (job.mediaRef !== undefined) assertNonEmptyString(job.mediaRef, "imageJob.mediaRef");
  if (job.failureReason !== undefined) assertNonEmptyString(job.failureReason, "imageJob.failureReason");
  assertIsoTimestamp(job.createdAt, "imageJob.createdAt");
  assertIsoTimestamp(job.updatedAt, "imageJob.updatedAt");
  if (job.status === ImageJobStatus.QUEUED && job.externalJobId !== undefined) {
    throw new TypeError("QUEUED image job cannot have externalJobId");
  }
  if (job.status === ImageJobStatus.SUBMITTED && job.externalJobId === undefined) {
    throw new TypeError("SUBMITTED image job requires externalJobId");
  }
  if (job.status === ImageJobStatus.SUCCEEDED && (job.externalJobId === undefined || job.mediaRef === undefined)) {
    throw new TypeError("SUCCEEDED image job requires externalJobId and mediaRef");
  }
  if (
    (job.status === ImageJobStatus.FAILED || job.status === ImageJobStatus.CANCELLED) &&
    job.failureReason === undefined
  ) {
    throw new TypeError(`${job.status} image job requires failureReason`);
  }
}

export function submitImageJob(job: ImageJob, externalJobId: string, updatedAt: string): ImageJob {
  assertImageJob(job);
  assertNonEmptyString(externalJobId, "imageJob.externalJobId");
  assertIsoTimestamp(updatedAt, "imageJob.updatedAt");
  if (job.status !== ImageJobStatus.QUEUED) {
    throw new Error(`cannot submit image job from ${job.status}`);
  }
  return { ...job, status: ImageJobStatus.SUBMITTED, externalJobId, updatedAt };
}

export function completeImageJob(job: ImageJob, mediaRef: string, updatedAt: string): ImageJob {
  assertImageJob(job);
  assertNonEmptyString(mediaRef, "imageJob.mediaRef");
  assertIsoTimestamp(updatedAt, "imageJob.updatedAt");
  if (job.status !== ImageJobStatus.SUBMITTED || job.externalJobId === undefined) {
    throw new Error(`cannot complete image job from ${job.status}`);
  }
  return { ...job, status: ImageJobStatus.SUCCEEDED, mediaRef, updatedAt };
}

export function failImageJob(job: ImageJob, failureReason: string, updatedAt: string): ImageJob {
  assertImageJob(job);
  assertNonEmptyString(failureReason, "imageJob.failureReason");
  assertIsoTimestamp(updatedAt, "imageJob.updatedAt");
  if (job.status !== ImageJobStatus.QUEUED && job.status !== ImageJobStatus.SUBMITTED) {
    throw new Error(`cannot fail image job from ${job.status}`);
  }
  return { ...job, status: ImageJobStatus.FAILED, failureReason, updatedAt };
}

export function retryImageJob(
  job: ImageJob,
  updatedAt: string,
  maxAttempts = 3,
): ImageJob {
  assertImageJob(job);
  assertIsoTimestamp(updatedAt, "imageJob.updatedAt");
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("imageJob.maxAttempts must be a positive integer");
  }
  if (job.status !== ImageJobStatus.FAILED) {
    throw new Error(`cannot retry image job from ${job.status}`);
  }
  if (job.attempt >= maxAttempts) {
    throw new RangeError("image job maximum retry attempts reached");
  }
  const queued: ImageJob = {
    ...job,
    attempt: job.attempt + 1,
    status: ImageJobStatus.QUEUED,
    updatedAt,
  };
  delete queued.externalJobId;
  delete queued.mediaRef;
  delete queued.failureReason;
  assertImageJob(queued);
  return queued;
}
