export interface WorldContextPolicyDto {
  readonly id: string;
  readonly storyWorldId: string;
  readonly worldLoreEnabled: boolean;
  readonly relationshipsEnabled: boolean;
  readonly schedulesEnabled: boolean;
  readonly memoriesEnabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UpdateWorldContextPolicyRequest {
  readonly worldLoreEnabled?: boolean;
  readonly relationshipsEnabled?: boolean;
  readonly schedulesEnabled?: boolean;
  readonly memoriesEnabled?: boolean;
}

export interface StoryGenerationJobDto {
  readonly id: string;
  readonly storyNodeId: string;
  readonly storyWorldId: string;
  readonly status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  readonly attempt: number;
  readonly idempotencyKey: string;
  readonly provider?: string;
  readonly model?: string;
  readonly failureReason?: string;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
}

export interface CreateStoryGenerationJobRequest {
  readonly idempotencyKey: string;
}

export interface StoryChoiceDto {
  readonly text: string;
  readonly targetNodeId?: string;
}

export interface StoryGenerationCandidateDto {
  readonly id: string;
  readonly storyNodeId: string;
  readonly storyWorldId: string;
  readonly sourceJobId: string;
  readonly body: string;
  readonly choices: readonly StoryChoiceDto[];
  readonly promptVersion: string;
  readonly status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  readonly createdAt: string;
  readonly reviewedAt?: string;
  readonly reviewerCharacterId?: string;
}

export interface ReviewStoryGenerationCandidateRequest {
  readonly action: "approve" | "reject";
  readonly reviewerCharacterId: string;
  readonly idempotencyKey: string;
}
