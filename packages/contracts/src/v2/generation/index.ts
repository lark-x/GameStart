import type {
  V2CandidateId,
  V2AssetId,
  V2CharacterId,
  V2LocationId,
  V2ConversationId,
  V2RunId,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2JobId,
  V2JobStatus,
  V2Revision,
  V2SceneCandidatePayload,
  V2StoryWorldId,
} from "../shared/index.ts";

export interface V2GenerationContextFactRef {
  readonly id: string;
  readonly text: string;
  readonly visibility: "creator_only" | "player_visible";
}

export interface V2GenerationContextCharacterRef {
  readonly characterId: V2CharacterId;
  readonly name: string;
}

export interface V2GenerationContextSceneRef {
  readonly sceneId: string;
  readonly title: string;
}

export interface V2GenerationContextSnapshot {
  readonly storyWorldId: V2StoryWorldId;
  readonly baseCanonRevision: V2Revision;
  readonly requestedAt: V2IsoDateTime;
  readonly prompt: string;
  readonly promptPreview: string;
  readonly tokenBudget: number;
  readonly contextHash: string;
  readonly sourceFactIds: readonly string[];
  readonly sourceCharacterIds: readonly V2CharacterId[];
  readonly sourceSceneIds: readonly string[];
  readonly facts: readonly V2GenerationContextFactRef[];
  readonly characters: readonly V2GenerationContextCharacterRef[];
  readonly scenes: readonly V2GenerationContextSceneRef[];
}

export interface V2ParsedSceneCandidate {
  readonly payload: V2SceneCandidatePayload;
  readonly rawTextPreview: string;
}

export type V2GenerationJobKind = "scene";
export type V2AssetMediaKind = "image";
export type V2AssetCandidateStatus = "pending" | "approved" | "rejected" | "changes_requested";
export type V2AssetReviewAction = "approve" | "reject" | "request_changes";
export type V2FormalAssetSource = "manual" | "candidate";

export interface V2AssetCandidatePayload {
  readonly asset: {
    readonly assetId: V2AssetId;
    readonly mediaKind: V2AssetMediaKind;
    readonly mediaRef: string;
    readonly prompt: string;
    readonly workflowVersion: string;
    readonly sourceJobId: V2JobId;
    readonly seed?: number;
  };
  readonly validationNotes: readonly string[];
}

export type V2GenerationDispatchStatus = "pending" | "enqueued";

export interface V2SceneGenerationJobRecord {
  readonly jobId: V2JobId;
  readonly storyWorldId: V2StoryWorldId;
  readonly kind: V2GenerationJobKind;
  readonly status: V2JobStatus;
  readonly idempotencyKey: V2IdempotencyKey;
  readonly baseCanonRevision: V2Revision;
  readonly contextHash: string;
  readonly context: V2GenerationContextSnapshot;
  readonly prompt: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly createdAt: V2IsoDateTime;
  readonly updatedAt: V2IsoDateTime;
  readonly claimedAt?: V2IsoDateTime;
  readonly leaseExpiresAt?: V2IsoDateTime;
  readonly completedAt?: V2IsoDateTime;
  readonly cancelledAt?: V2IsoDateTime;
  readonly candidateId?: V2CandidateId;
  readonly providerResponseId?: string;
  readonly rawOutputPreview?: string;
  readonly failureReason?: string;
}

export interface V2GenerationDispatchRecord {
  readonly dispatchId: string;
  readonly jobId: V2JobId;
  readonly status: V2GenerationDispatchStatus;
  readonly attempts: number;
  readonly requestedAt: V2IsoDateTime;
  readonly enqueuedAt?: V2IsoDateTime;
  readonly lastError?: string;
}

export interface V2AssetGenerationJobRecord {
  readonly jobId: V2JobId;
  readonly storyWorldId: V2StoryWorldId;
  readonly status: V2JobStatus;
  readonly idempotencyKey: V2IdempotencyKey;
  readonly prompt: string;
  readonly workflowVersion: string;
  readonly workflow: Record<string, unknown>;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly createdAt: V2IsoDateTime;
  readonly updatedAt: V2IsoDateTime;
  readonly negativePrompt?: string;
  readonly seed?: number;
  readonly claimedAt?: V2IsoDateTime;
  readonly leaseExpiresAt?: V2IsoDateTime;
  readonly submittedAt?: V2IsoDateTime;
  readonly completedAt?: V2IsoDateTime;
  readonly cancelledAt?: V2IsoDateTime;
  readonly externalJobId?: string;
  readonly mediaRef?: string;
  readonly candidateId?: V2CandidateId;
  readonly failureReason?: string;
}

export interface V2CreateAssetGenerationJobInput {
  readonly jobId: V2JobId;
  readonly storyWorldId: V2StoryWorldId;
  readonly idempotencyKey: V2IdempotencyKey;
  readonly prompt: string;
  readonly workflowVersion: string;
  readonly workflow: Record<string, unknown>;
  readonly createdAt: V2IsoDateTime;
  readonly negativePrompt?: string;
  readonly seed?: number;
  readonly maxAttempts?: number;
}

export interface V2CreateAssetGenerationJobApiRequest {
  readonly storyWorldId: V2StoryWorldId;
  readonly idempotencyKey: V2IdempotencyKey;
  readonly prompt: string;
  readonly workflowVersion: string;
  readonly workflow: Record<string, unknown>;
  readonly negativePrompt?: string;
  readonly seed?: number;
  readonly maxAttempts?: number;
  readonly mode?: "manual" | "character";
  readonly characterId?: V2CharacterId;
  readonly visualVariantId?: string;
  readonly scene?: string;
  readonly location?: string;
  readonly emotion?: string;
}

export interface V2AssetGenerationPreparedRequest {
  readonly idempotencyKey: V2IdempotencyKey;
  readonly prompt: string;
  readonly workflowVersion: string;
  readonly workflow: Record<string, unknown>;
  readonly negativePrompt?: string;
  readonly seed?: number;
  readonly mode?: "manual" | "character";
  readonly characterId?: V2CharacterId;
  readonly visualVariantId?: string;
  readonly scene?: string;
  readonly location?: string;
  readonly emotion?: string;
}

export interface V2PrepareAssetGenerationApiRequest extends V2AssetGenerationPreparedRequest {
  readonly storyWorldId: V2StoryWorldId;
}

export interface V2ComfyUiPromptPayload {
  readonly prompt: Record<string, unknown>;
  readonly client_id: string;
  readonly extra_data: {
    readonly living_network_job_id: string;
    readonly workflow_version: string;
    readonly prompt: string;
    readonly negative_prompt?: string;
    readonly seed?: number;
  };
}

export function buildV2ComfyUiPromptPayload(input: {
  readonly jobId: string;
  readonly workflowVersion: string;
  readonly prompt: string;
  readonly workflow: Record<string, unknown>;
  readonly clientId?: string;
  readonly negativePrompt?: string;
  readonly seed?: number;
}): V2ComfyUiPromptPayload {
  return {
    prompt: input.workflow,
    client_id: input.clientId?.trim() || "living-network-worker",
    extra_data: {
      living_network_job_id: input.jobId,
      workflow_version: input.workflowVersion,
      prompt: input.prompt,
      ...(input.negativePrompt === undefined ? {} : { negative_prompt: input.negativePrompt }),
      ...(input.seed === undefined ? {} : { seed: input.seed }),
    },
  };
}

export interface V2CreateAssetGenerationJobApiResponse {
  readonly job: V2AssetGenerationJobRecord;
  readonly inserted: boolean;
}

export interface V2PrepareAssetGenerationApiResponse {
  readonly jobId: V2JobId;
  readonly request: V2AssetGenerationPreparedRequest;
  readonly comfyUiPayload: V2ComfyUiPromptPayload;
}

export interface V2AssetGenerationJobApiResponse {
  readonly job: V2AssetGenerationJobRecord;
}

export interface V2AssetGenerationJobListApiResponse {
  readonly jobs: readonly V2AssetGenerationJobRecord[];
}

export interface V2AssetCandidateRecord {
  readonly candidateId: V2CandidateId;
  readonly jobId: V2JobId;
  readonly storyWorldId: V2StoryWorldId;
  readonly status: V2AssetCandidateStatus;
  readonly payload: V2AssetCandidatePayload;
  readonly createdAt: V2IsoDateTime;
  readonly reviewedAt?: V2IsoDateTime;
  readonly reviewer?: string;
  readonly reviewReason?: string;
}

export interface V2AssetCandidateReviewRecord {
  readonly reviewId: string;
  readonly candidateId: V2CandidateId;
  readonly action: V2AssetReviewAction;
  readonly resultingStatus: V2AssetCandidateStatus;
  readonly reviewedAt: V2IsoDateTime;
  readonly idempotencyKey: V2IdempotencyKey;
  readonly reviewer?: string;
  readonly reason?: string;
}

export interface V2ApprovedAssetRecord {
  readonly assetId: V2AssetId;
  readonly storyWorldId: V2StoryWorldId;
  readonly sourceType: V2FormalAssetSource;
  readonly candidateId?: V2CandidateId;
  readonly title: string;
  readonly mediaRef: string;
  readonly contentHash: string;
  readonly approvedAt: V2IsoDateTime;
  readonly originalFilename?: string;
  readonly mimeType?: string;
  readonly byteSize?: number;
  readonly reviewer?: string;
  readonly reviewReason?: string;
}

export interface V2CreateManualAssetInput {
  readonly assetId: V2AssetId;
  readonly storyWorldId: V2StoryWorldId;
  readonly title: string;
  readonly mediaRef: string;
  readonly contentHash: string;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly createdAt: V2IsoDateTime;
}

export interface V2CreateManualAssetApiResponse {
  readonly asset: V2ApprovedAssetRecord;
}

export interface V2ReviewAssetCandidateInput {
  readonly candidateId: V2CandidateId;
  readonly action: V2AssetReviewAction;
  readonly reviewedAt: V2IsoDateTime;
  readonly idempotencyKey: V2IdempotencyKey;
  readonly reviewer?: string;
  readonly reason?: string;
}

export interface V2AssetCandidateApiResponse {
  readonly candidate: V2AssetCandidateRecord;
}


export interface V2AssetCandidateListApiResponse {
  readonly candidates: readonly V2AssetCandidateRecord[];
}

export interface V2ApprovedAssetListApiResponse {
  readonly assets: readonly V2ApprovedAssetRecord[];
}
export interface V2ReviewAssetCandidateApiRequest {
  readonly action: V2AssetReviewAction;
  readonly idempotencyKey: V2IdempotencyKey;
  readonly reviewer?: string;
  readonly reason?: string;
}

export interface V2ReviewAssetCandidateApiResponse {
  readonly candidate: V2AssetCandidateRecord;
  readonly review: V2AssetCandidateReviewRecord;
  readonly inserted: boolean;
  readonly approvedAsset?: V2ApprovedAssetRecord;
}

export interface V2CreateSceneGenerationJobInput {
  readonly jobId: V2JobId;
  readonly storyWorldId: V2StoryWorldId;
  readonly baseCanonRevision: V2Revision;
  readonly idempotencyKey: V2IdempotencyKey;
  readonly prompt: string;
  readonly context: V2GenerationContextSnapshot;
  readonly createdAt: V2IsoDateTime;
  readonly maxAttempts?: number;
}

export interface V2GenerationContextPreviewApiRequest {
  readonly storyWorldId: V2StoryWorldId;
  readonly baseCanonRevision: V2Revision;
  readonly prompt: string;
  readonly tokenBudget?: number;
  readonly characterIds?: readonly V2CharacterId[];
  readonly locationId?: V2LocationId;
  readonly conversationId?: V2ConversationId;
  readonly runId?: V2RunId;
}

export interface V2GenerationContextPreviewApiResponse {
  readonly context: V2GenerationContextSnapshot;
}

export interface V2SceneGenerationPreparedMessage {
  readonly role: "system" | "user";
  readonly content: string;
}

export interface V2SceneGenerationPrepareApiResponse {
  readonly context: V2GenerationContextSnapshot;
  readonly request: {
    readonly responseFormat: "json_object";
    readonly temperature: number;
    readonly maxTokens: number;
    readonly messages: readonly V2SceneGenerationPreparedMessage[];
  };
}

export interface V2CreateSceneGenerationJobApiRequest extends V2GenerationContextPreviewApiRequest {
  readonly idempotencyKey: V2IdempotencyKey;
  readonly preparedContext?: V2GenerationContextSnapshot;
  readonly maxAttempts?: number;
}

export interface V2CreateSceneGenerationJobApiResponse {
  readonly job: V2SceneGenerationJobRecord;
  readonly inserted: boolean;
}

export interface V2GenerationJobApiResponse {
  readonly job: V2SceneGenerationJobRecord;
}

export interface V2GenerationJobListApiResponse {
  readonly jobs: readonly V2SceneGenerationJobRecord[];
}
