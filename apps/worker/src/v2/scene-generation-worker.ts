import { generateV2SceneCandidate, type ChatProvider } from "@living-network/ai/v2";
import type {
  V2CandidateEnvelope,
  V2CandidateId,
  V2CandidateStatus,
  V2CharacterId,
  V2GenerationContextSnapshot,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2JobId,
  V2LocationId,
  V2SceneCandidatePayload,
  V2SceneId,
  V2SceneGenerationJobRecord,
} from "@living-network/contracts/v2";
import { parseV2SceneCandidateText } from "@living-network/domain/v2";
import type {
  CandidateSubmissionPort,
  V2GenerationJobQueuePayload,
  V2GenerationJobRepository,
} from "@living-network/ports/v2";

export type V2SceneGenerationWorkerResultKind =
  | "succeeded"
  | "failed_retryable"
  | "failed_terminal"
  | "skipped_active"
  | "skipped_terminal";

export interface V2SceneGenerationWorkerResult {
  readonly kind: V2SceneGenerationWorkerResultKind;
  readonly job: V2SceneGenerationJobRecord;
  readonly candidateId?: V2CandidateId;
  readonly candidateStatus?: V2CandidateStatus;
  readonly error?: string;
}

export interface V2SceneGenerationWorkerOptions {
  readonly now?: () => Date;
  readonly leaseMs?: number;
  readonly model?: string;
  readonly temperature?: number;
}

export interface V2SceneGenerationWorkerDependencies {
  readonly jobs: V2GenerationJobRepository;
  readonly candidateSubmission: CandidateSubmissionPort;
  readonly provider: ChatProvider;
}

const DEFAULT_LEASE_MS = 5 * 60 * 1000;

function iso(date: Date): V2IsoDateTime {
  return date.toISOString() as V2IsoDateTime;
}

function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

function terminal(status: V2SceneGenerationJobRecord["status"]): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function retryable(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    (error as { readonly retryable?: unknown }).retryable === true;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function candidateIdFor(jobId: V2JobId): V2CandidateId {
  return `candidate:${jobId}` as V2CandidateId;
}

function submissionKeyFor(jobId: V2JobId): V2IdempotencyKey {
  return `generation-candidate:${jobId}` as V2IdempotencyKey;
}

function toContractPayload(payload: ReturnType<typeof parseV2SceneCandidateText>["payload"]): V2SceneCandidatePayload {
  return {
    scene: {
      sceneId: payload.scene.sceneId as V2SceneId,
      title: payload.scene.title,
      body: payload.scene.body,
      ...(payload.scene.locationId === undefined ? {} : { locationId: payload.scene.locationId as V2LocationId }),
      participantCharacterIds: payload.scene.participantCharacterIds.map((id) => id as V2CharacterId),
    },
    choices: payload.choices.map((choice) => ({
      label: choice.label,
      ...(choice.targetSceneId === undefined ? {} : { targetSceneId: choice.targetSceneId as V2SceneId }),
      ...(choice.consequenceSummary === undefined ? {} : { consequenceSummary: choice.consequenceSummary }),
    })),
    validationNotes: payload.validationNotes,
  };
}

function candidateFor(input: {
  readonly job: V2SceneGenerationJobRecord;
  readonly payload: V2SceneCandidatePayload;
  readonly createdAt: V2IsoDateTime;
}): V2CandidateEnvelope<V2SceneCandidatePayload> {
  return {
    candidateId: candidateIdFor(input.job.jobId),
    kind: "scene",
    storyWorldId: input.job.storyWorldId,
    baseCanonRevision: input.job.baseCanonRevision,
    status: "pending",
    payload: input.payload,
    provenance: {
      source: "llm",
      jobId: input.job.jobId,
      contextHash: input.job.contextHash,
      summary: `V2 scene generation job ${input.job.jobId}`,
    },
    createdAt: input.createdAt,
  };
}

async function recoverExpiredLease(
  job: V2SceneGenerationJobRecord,
  jobs: V2GenerationJobRepository,
  now: Date,
): Promise<V2SceneGenerationJobRecord> {
  if (
    (job.status === "claimed" || job.status === "running") &&
    job.leaseExpiresAt !== undefined &&
    Date.parse(job.leaseExpiresAt) <= now.getTime()
  ) {
    return jobs.recoverExpiredJobLease({ jobId: job.jobId, recoveredAt: iso(now) });
  }
  return job;
}

export async function processV2SceneGenerationJob(
  payload: V2GenerationJobQueuePayload,
  dependencies: V2SceneGenerationWorkerDependencies,
  options: V2SceneGenerationWorkerOptions = {},
): Promise<V2SceneGenerationWorkerResult> {
  const now = options.now ?? (() => new Date());
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1) throw new RangeError("leaseMs must be a positive integer");

  const stored = await dependencies.jobs.getJob(payload.jobId);
  if (stored === undefined) throw new TypeError(`Unknown V2 generation job: ${payload.jobId}`);
  let job = await recoverExpiredLease(stored, dependencies.jobs, now());
  if (terminal(job.status)) return { kind: "skipped_terminal", job };
  if (job.kind !== "scene" || payload.kind !== "scene" || job.contextHash !== payload.contextHash) {
    const failed = await dependencies.jobs.markJobFailed({
      jobId: job.jobId,
      failedAt: iso(now()),
      reason: "generation queue payload does not match stored job facts",
      retryable: false,
    });
    return {
      kind: "failed_terminal",
      job: failed,
      ...(failed.failureReason === undefined ? {} : { error: failed.failureReason }),
    };
  }
  if (job.status !== "queued") return { kind: "skipped_active", job };

  const claimTime = now();
  job = await dependencies.jobs.markJobClaimed({
    jobId: job.jobId,
    claimedAt: iso(claimTime),
    leaseExpiresAt: iso(addMs(claimTime, leaseMs)),
  });
  if (job.status !== "claimed") return { kind: "skipped_active", job };

  job = await dependencies.jobs.markJobRunning({ jobId: job.jobId, updatedAt: iso(now()) });
  if (job.status !== "running") return { kind: "skipped_active", job };

  try {
    const generated = await generateV2SceneCandidate(dependencies.provider, {
      context: job.context as V2GenerationContextSnapshot,
      jobId: job.jobId,
      ...(options.model === undefined ? {} : { model: options.model }),
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    });
    const parsed = parseV2SceneCandidateText(generated.content);
    const submitted = await dependencies.candidateSubmission.submitSceneCandidate({
      candidate: candidateFor({
        job,
        payload: toContractPayload(parsed.payload),
        createdAt: iso(now()),
      }),
      idempotencyKey: submissionKeyFor(job.jobId),
    });
    const succeeded = await dependencies.jobs.markJobSucceeded({
      jobId: job.jobId,
      completedAt: iso(now()),
      candidateId: submitted.candidateId,
      providerResponseId: generated.providerResponseId,
      rawOutputPreview: parsed.rawTextPreview,
    });
    return {
      kind: "succeeded",
      job: succeeded,
      candidateId: submitted.candidateId,
      candidateStatus: submitted.status,
    };
  } catch (error) {
    const failed = await dependencies.jobs.markJobFailed({
      jobId: job.jobId,
      failedAt: iso(now()),
      reason: errorMessage(error),
      retryable: retryable(error),
    });
    return {
      kind: failed.status === "queued" ? "failed_retryable" : "failed_terminal",
      job: failed,
      ...(failed.failureReason === undefined ? {} : { error: failed.failureReason }),
    };
  }
}
