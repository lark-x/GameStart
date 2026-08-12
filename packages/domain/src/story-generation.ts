// World Context Policy
export interface WorldContextPolicy {
  readonly id: string;
  readonly storyWorldId: string;
  readonly worldLoreEnabled: boolean;
  readonly relationshipsEnabled: boolean;
  readonly schedulesEnabled: boolean;
  readonly memoriesEnabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WorldContextPolicyInput {
  readonly id: string;
  readonly storyWorldId: string;
  readonly worldLoreEnabled?: boolean;
  readonly relationshipsEnabled?: boolean;
  readonly schedulesEnabled?: boolean;
  readonly memoriesEnabled?: boolean;
}

// Story Generation Job
export const StoryGenerationJobStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type StoryGenerationJobStatus =
  (typeof StoryGenerationJobStatus)[keyof typeof StoryGenerationJobStatus];

export interface StoryGenerationJob {
  readonly id: string;
  readonly storyNodeId: string;
  readonly storyWorldId: string;
  readonly status: StoryGenerationJobStatus;
  readonly attempt: number;
  readonly idempotencyKey: string;
  readonly provider: string | undefined;
  readonly model: string | undefined;
  readonly failureReason: string | undefined;
  readonly createdAt: string;
  readonly startedAt: string | undefined;
  readonly finishedAt: string | undefined;
}

export interface StoryGenerationJobInput {
  readonly id: string;
  readonly storyNodeId: string;
  readonly storyWorldId: string;
  readonly idempotencyKey: string;
}

// Story Generation Candidate
export const StoryGenerationCandidateStatus = {
  PENDING_REVIEW: "PENDING_REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export type StoryGenerationCandidateStatus =
  (typeof StoryGenerationCandidateStatus)[keyof typeof StoryGenerationCandidateStatus];

export interface StoryChoice {
  readonly text: string;
  readonly targetNodeId?: string;
}

export interface StoryGenerationCandidate {
  readonly id: string;
  readonly storyNodeId: string;
  readonly storyWorldId: string;
  readonly sourceJobId: string;
  readonly body: string;
  readonly choices: readonly StoryChoice[];
  readonly promptVersion: string;
  readonly status: StoryGenerationCandidateStatus;
  readonly createdAt: string;
  readonly reviewedAt: string | undefined;
  readonly reviewerCharacterId: string | undefined;
}

export interface StoryGenerationCandidateInput {
  readonly id: string;
  readonly storyNodeId: string;
  readonly storyWorldId: string;
  readonly sourceJobId: string;
  readonly body: string;
  readonly choices: readonly StoryChoice[];
  readonly promptVersion: string;
}

// Factory functions

function requiredField<T>(value: T | undefined, field: string): T {
  if (value === undefined || value === null) {
    throw new TypeError(`${field} is required`);
  }
  return value;
}

export function createWorldContextPolicy(input: WorldContextPolicyInput): WorldContextPolicy {
  const now = new Date().toISOString();
  return {
    id: requiredField(input.id, "WorldContextPolicy.id"),
    storyWorldId: requiredField(input.storyWorldId, "WorldContextPolicy.storyWorldId"),
    worldLoreEnabled: input.worldLoreEnabled ?? false,
    relationshipsEnabled: input.relationshipsEnabled ?? false,
    schedulesEnabled: input.schedulesEnabled ?? false,
    memoriesEnabled: input.memoriesEnabled ?? false,
    createdAt: now,
    updatedAt: now,
  };
}

export function createStoryGenerationJob(input: StoryGenerationJobInput): StoryGenerationJob {
  return {
    id: requiredField(input.id, "StoryGenerationJob.id"),
    storyNodeId: requiredField(input.storyNodeId, "StoryGenerationJob.storyNodeId"),
    storyWorldId: requiredField(input.storyWorldId, "StoryGenerationJob.storyWorldId"),
    status: StoryGenerationJobStatus.PENDING,
    attempt: 1,
    idempotencyKey: requiredField(input.idempotencyKey, "StoryGenerationJob.idempotencyKey"),
    provider: undefined,
    model: undefined,
    failureReason: undefined,
    createdAt: new Date().toISOString(),
    startedAt: undefined,
    finishedAt: undefined,
  };
}

export function createStoryGenerationCandidate(
  input: StoryGenerationCandidateInput,
): StoryGenerationCandidate {
  return {
    id: requiredField(input.id, "StoryGenerationCandidate.id"),
    storyNodeId: requiredField(input.storyNodeId, "StoryGenerationCandidate.storyNodeId"),
    storyWorldId: requiredField(input.storyWorldId, "StoryGenerationCandidate.storyWorldId"),
    sourceJobId: requiredField(input.sourceJobId, "StoryGenerationCandidate.sourceJobId"),
    body: requiredField(input.body, "StoryGenerationCandidate.body"),
    choices: input.choices ?? [],
    promptVersion: requiredField(input.promptVersion, "StoryGenerationCandidate.promptVersion"),
    status: StoryGenerationCandidateStatus.PENDING_REVIEW,
    createdAt: new Date().toISOString(),
    reviewedAt: undefined,
    reviewerCharacterId: undefined,
  };
}

export function approveStoryGenerationCandidate(
  candidate: StoryGenerationCandidate,
  reviewerCharacterId: string,
): StoryGenerationCandidate {
  if (candidate.status !== StoryGenerationCandidateStatus.PENDING_REVIEW) {
    throw new TypeError(`Candidate ${candidate.id} is not pending review`);
  }
  return {
    ...candidate,
    status: StoryGenerationCandidateStatus.APPROVED,
    reviewedAt: new Date().toISOString(),
    reviewerCharacterId,
  };
}

export function rejectStoryGenerationCandidate(
  candidate: StoryGenerationCandidate,
  reviewerCharacterId: string,
): StoryGenerationCandidate {
  if (candidate.status !== StoryGenerationCandidateStatus.PENDING_REVIEW) {
    throw new TypeError(`Candidate ${candidate.id} is not pending review`);
  }
  return {
    ...candidate,
    status: StoryGenerationCandidateStatus.REJECTED,
    reviewedAt: new Date().toISOString(),
    reviewerCharacterId,
  };
}
