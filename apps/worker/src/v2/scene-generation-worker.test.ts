import assert from "node:assert/strict";
import test from "node:test";

import type { ChatCompletionRequest, ChatCompletionResult, ChatDelta, ChatProvider } from "@living-network/ai";
import type {
  V2CandidateEnvelope,
  V2CandidateId,
  V2CandidateStatus,
  V2CharacterId,
  V2CreateSceneGenerationJobInput,
  V2GenerationContextSnapshot,
  V2GenerationDispatchRecord,
  V2GenerationDispatchStatus,
  V2GenerationJobKind,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2JobId,
  V2JobStatus,
  V2Revision,
  V2SceneCandidatePayload,
  V2SceneGenerationJobRecord,
  V2StoryWorldId,
} from "@living-network/contracts";
import type {
  CandidateSubmissionPort,
  V2GenerationJobCreateResult,
  V2GenerationJobQueuePayload,
  V2GenerationJobRepository,
} from "@living-network/ports";
import { processV2SceneGenerationJob } from "./scene-generation-worker.ts";

const createdAt = "2026-08-12T00:00:00.000Z" as V2IsoDateTime;
const context: V2GenerationContextSnapshot = {
  storyWorldId: "world_generation" as V2StoryWorldId,
  baseCanonRevision: 7 as V2Revision,
  requestedAt: createdAt,
  prompt: "Write the bridge scene.",
  promptPreview: "Write the bridge scene.",
  tokenBudget: 512,
  contextHash: "sha256:worker-context",
  sourceFactIds: ["fact_bridge"],
  sourceCharacterIds: ["char_mira" as V2CharacterId],
  sourceSceneIds: ["scene_intro"],
  facts: [{ id: "fact_bridge", text: "The bridge is sealed.", visibility: "player_visible" }],
  characters: [{ characterId: "char_mira" as V2CharacterId, name: "Mira" }],
  scenes: [{ sceneId: "scene_intro", title: "Intro" }],
};

function makeJob(overrides: Partial<V2SceneGenerationJobRecord> = {}): V2SceneGenerationJobRecord {
  return {
    jobId: (overrides.jobId ?? "job_scene_bridge") as V2JobId,
    storyWorldId: overrides.storyWorldId ?? context.storyWorldId,
    kind: overrides.kind ?? "scene",
    status: overrides.status ?? "queued",
    idempotencyKey: (overrides.idempotencyKey ?? "idem-scene-bridge") as V2IdempotencyKey,
    baseCanonRevision: overrides.baseCanonRevision ?? context.baseCanonRevision,
    contextHash: overrides.contextHash ?? context.contextHash,
    context: overrides.context ?? context,
    prompt: overrides.prompt ?? context.prompt,
    attempts: overrides.attempts ?? 0,
    maxAttempts: overrides.maxAttempts ?? 2,
    createdAt: overrides.createdAt ?? createdAt,
    updatedAt: overrides.updatedAt ?? createdAt,
    ...(overrides.claimedAt === undefined ? {} : { claimedAt: overrides.claimedAt }),
    ...(overrides.leaseExpiresAt === undefined ? {} : { leaseExpiresAt: overrides.leaseExpiresAt }),
    ...(overrides.completedAt === undefined ? {} : { completedAt: overrides.completedAt }),
    ...(overrides.cancelledAt === undefined ? {} : { cancelledAt: overrides.cancelledAt }),
    ...(overrides.candidateId === undefined ? {} : { candidateId: overrides.candidateId }),
    ...(overrides.providerResponseId === undefined ? {} : { providerResponseId: overrides.providerResponseId }),
    ...(overrides.rawOutputPreview === undefined ? {} : { rawOutputPreview: overrides.rawOutputPreview }),
    ...(overrides.failureReason === undefined ? {} : { failureReason: overrides.failureReason }),
  };
}

function queuePayload(job: V2SceneGenerationJobRecord = makeJob()): V2GenerationJobQueuePayload {
  return {
    jobId: job.jobId,
    kind: "scene",
    contextHash: job.contextHash,
    correlationId: "corr-worker-test",
  };
}

function validOutput(): string {
  return JSON.stringify({
    scene: {
      sceneId: "scene_bridge",
      title: "The Sealed Bridge",
      body: "Mira studies the runes and hears the water stop below.",
      participantCharacterIds: ["char_mira"],
    },
    choices: [{ label: "Touch the nearest rune", consequenceSummary: "The bridge answers." }],
    validationNotes: ["Uses visible bridge fact."],
  });
}

class FakeProvider implements ChatProvider {
  public readonly requests: ChatCompletionRequest[] = [];
  private readonly responses: (() => ChatCompletionResult | Promise<ChatCompletionResult>)[];

  public constructor(responses: readonly (() => ChatCompletionResult | Promise<ChatCompletionResult>)[]) {
    this.responses = [...responses];
  }

  public async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    this.requests.push(request);
    const response = this.responses.shift();
    if (response === undefined) throw Object.assign(new Error("LLM request timed out"), { retryable: true });
    return response();
  }

  public async *stream(): AsyncIterable<ChatDelta> {
    yield {};
  }
}

class FakeCandidateSubmission implements CandidateSubmissionPort {
  public readonly submissions: Array<{
    readonly candidate: V2CandidateEnvelope<V2SceneCandidatePayload>;
    readonly idempotencyKey: V2IdempotencyKey;
  }> = [];

  public async submitSceneCandidate(input: {
    readonly candidate: V2CandidateEnvelope<V2SceneCandidatePayload>;
    readonly idempotencyKey: V2IdempotencyKey;
  }): Promise<{ readonly candidateId: V2CandidateId; readonly status: V2CandidateStatus }> {
    this.submissions.push(input);
    return { candidateId: input.candidate.candidateId, status: input.candidate.status };
  }
}

class FakeJobRepository implements V2GenerationJobRepository {
  public job: V2SceneGenerationJobRecord;

  public constructor(job: V2SceneGenerationJobRecord = makeJob()) {
    this.job = job;
  }

  public async createSceneJob(input: V2CreateSceneGenerationJobInput): Promise<V2GenerationJobCreateResult> {
    this.job = makeJob({
      jobId: input.jobId,
      storyWorldId: input.storyWorldId,
      baseCanonRevision: input.baseCanonRevision,
      idempotencyKey: input.idempotencyKey,
      prompt: input.prompt,
      contextHash: input.context.contextHash,
      context: input.context,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      maxAttempts: input.maxAttempts ?? 3,
    });
    return { job: this.job, inserted: true };
  }

  public async getJob(jobId: V2JobId): Promise<V2SceneGenerationJobRecord | undefined> {
    return this.job.jobId === jobId ? this.job : undefined;
  }

  public async listJobsByStatus(status: V2JobStatus): Promise<readonly V2SceneGenerationJobRecord[]> {
    return this.job.status === status ? [this.job] : [];
  }

  public async markJobClaimed(input: { readonly jobId: V2JobId; readonly claimedAt: string; readonly leaseExpiresAt: string }): Promise<V2SceneGenerationJobRecord> {
    if (this.job.jobId === input.jobId && this.job.status === "queued") {
      this.job = { ...this.job, status: "claimed", claimedAt: input.claimedAt as V2IsoDateTime, leaseExpiresAt: input.leaseExpiresAt as V2IsoDateTime, updatedAt: input.claimedAt as V2IsoDateTime };
    }
    return this.job;
  }

  public async markJobRunning(input: { readonly jobId: V2JobId; readonly updatedAt: string }): Promise<V2SceneGenerationJobRecord> {
    if (this.job.jobId === input.jobId && this.job.status === "claimed") {
      this.job = { ...this.job, status: "running", updatedAt: input.updatedAt as V2IsoDateTime };
    }
    return this.job;
  }

  public async recoverExpiredJobLease(input: { readonly jobId: V2JobId; readonly recoveredAt: string }): Promise<V2SceneGenerationJobRecord> {
    if (this.job.jobId === input.jobId && (this.job.status === "claimed" || this.job.status === "running")) {
      this.job = {
        ...this.job,
        status: "queued",
        updatedAt: input.recoveredAt as V2IsoDateTime,
        failureReason: "lease expired before worker completion",
      };
      const { claimedAt: _claimedAt, leaseExpiresAt: _leaseExpiresAt, ...withoutLease } = this.job;
      this.job = withoutLease;
    }
    return this.job;
  }

  public async markJobSucceeded(input: { readonly jobId: V2JobId; readonly completedAt: string; readonly candidateId: string; readonly providerResponseId: string; readonly rawOutputPreview: string }): Promise<V2SceneGenerationJobRecord> {
    if (this.job.jobId === input.jobId && this.job.status === "running") {
      this.job = {
        ...this.job,
        status: "succeeded",
        completedAt: input.completedAt as V2IsoDateTime,
        updatedAt: input.completedAt as V2IsoDateTime,
        candidateId: input.candidateId as V2CandidateId,
        providerResponseId: input.providerResponseId,
        rawOutputPreview: input.rawOutputPreview,
      };
    }
    return this.job;
  }

  public async markJobFailed(input: { readonly jobId: V2JobId; readonly failedAt: string; readonly reason: string; readonly retryable: boolean }): Promise<V2SceneGenerationJobRecord> {
    if (this.job.jobId === input.jobId) {
      const attempts = this.job.attempts + 1;
      const status: V2JobStatus = input.retryable && attempts < this.job.maxAttempts ? "queued" : "failed";
      this.job = {
        ...this.job,
        status,
        attempts,
        updatedAt: input.failedAt as V2IsoDateTime,
        failureReason: input.reason,
      };
      const { claimedAt: _claimedAt, leaseExpiresAt: _leaseExpiresAt, ...withoutLease } = this.job;
      this.job = withoutLease;
    }
    return this.job;
  }

  public async cancelJob(input: { readonly jobId: V2JobId; readonly cancelledAt: string; readonly reason?: string }): Promise<V2SceneGenerationJobRecord> {
    if (this.job.jobId === input.jobId) {
      this.job = {
        ...this.job,
        status: "cancelled",
        cancelledAt: input.cancelledAt as V2IsoDateTime,
        updatedAt: input.cancelledAt as V2IsoDateTime,
        ...(input.reason === undefined ? {} : { failureReason: input.reason }),
      };
    }
    return this.job;
  }
}

function deps(job = makeJob(), responses: readonly (() => ChatCompletionResult | Promise<ChatCompletionResult>)[] = [
  () => ({ id: "provider-response-1", model: "fake-model", content: validOutput() }),
]): {
  readonly jobs: FakeJobRepository;
  readonly candidateSubmission: FakeCandidateSubmission;
  readonly provider: FakeProvider;
} {
  return {
    jobs: new FakeJobRepository(job),
    candidateSubmission: new FakeCandidateSubmission(),
    provider: new FakeProvider(responses),
  };
}

test("submits parsed scene candidates through CandidateSubmissionPort", async () => {
  const dependencies = deps();
  const result = await processV2SceneGenerationJob(queuePayload(), dependencies, {
    now: () => new Date("2026-08-12T00:01:00.000Z"),
  });
  assert.equal(result.kind, "succeeded");
  assert.equal(result.job.status, "succeeded");
  assert.equal(result.job.candidateId, "candidate:job_scene_bridge");
  assert.equal(dependencies.candidateSubmission.submissions.length, 1);
  assert.equal(dependencies.candidateSubmission.submissions[0]?.candidate.status, "pending");
  assert.equal(dependencies.candidateSubmission.submissions[0]?.candidate.baseCanonRevision, 7);
  assert.equal(dependencies.candidateSubmission.submissions[0]?.candidate.provenance.jobId, "job_scene_bridge");
  assert.equal(dependencies.provider.requests[0]?.responseFormat, "json_object");
});

test("does not resubmit a terminal succeeded job during duplicate consumption", async () => {
  const dependencies = deps();
  await processV2SceneGenerationJob(queuePayload(), dependencies, {
    now: () => new Date("2026-08-12T00:01:00.000Z"),
  });
  const replay = await processV2SceneGenerationJob(queuePayload(), dependencies, {
    now: () => new Date("2026-08-12T00:02:00.000Z"),
  });
  assert.equal(replay.kind, "skipped_terminal");
  assert.equal(dependencies.candidateSubmission.submissions.length, 1);
});

test("marks invalid and empty LLM output as terminal failures", async () => {
  for (const content of ["", JSON.stringify({ choices: [] })]) {
    const dependencies = deps(makeJob({ maxAttempts: 3 }), [
      () => ({ id: "provider-response-bad", model: "fake-model", content }),
    ]);
    const result = await processV2SceneGenerationJob(queuePayload(), dependencies, {
      now: () => new Date("2026-08-12T00:03:00.000Z"),
    });
    assert.equal(result.kind, "failed_terminal");
    assert.equal(result.job.status, "failed");
    assert.equal(dependencies.candidateSubmission.submissions.length, 0);
  }
});

test("retries explicit retryable provider failures until attempts are exhausted", async () => {
  const timeout = () => {
    throw Object.assign(new Error("LLM request timed out"), { retryable: true });
  };
  const dependencies = deps(makeJob({ maxAttempts: 2 }), [timeout, timeout]);
  const first = await processV2SceneGenerationJob(queuePayload(), dependencies, {
    now: () => new Date("2026-08-12T00:04:00.000Z"),
  });
  assert.equal(first.kind, "failed_retryable");
  assert.equal(first.job.status, "queued");
  assert.equal(first.job.attempts, 1);

  const second = await processV2SceneGenerationJob(queuePayload(first.job), dependencies, {
    now: () => new Date("2026-08-12T00:05:00.000Z"),
  });
  assert.equal(second.kind, "failed_terminal");
  assert.equal(second.job.status, "failed");
  assert.equal(second.job.attempts, 2);
});

test("recovers an expired lease and skips currently active jobs", async () => {
  const expired = makeJob({
    status: "running",
    claimedAt: "2026-08-12T00:01:00.000Z" as V2IsoDateTime,
    leaseExpiresAt: "2026-08-12T00:02:00.000Z" as V2IsoDateTime,
  });
  const recoveredDeps = deps(expired);
  const recovered = await processV2SceneGenerationJob(queuePayload(expired), recoveredDeps, {
    now: () => new Date("2026-08-12T00:03:00.000Z"),
  });
  assert.equal(recovered.kind, "succeeded");

  const active = makeJob({
    status: "claimed",
    claimedAt: "2026-08-12T00:01:00.000Z" as V2IsoDateTime,
    leaseExpiresAt: "2026-08-12T00:10:00.000Z" as V2IsoDateTime,
  });
  const activeDeps = deps(active);
  const skipped = await processV2SceneGenerationJob(queuePayload(active), activeDeps, {
    now: () => new Date("2026-08-12T00:03:00.000Z"),
  });
  assert.equal(skipped.kind, "skipped_active");
  assert.equal(activeDeps.candidateSubmission.submissions.length, 0);
});

test("rejects mismatched queue payloads without submitting candidates", async () => {
  const dependencies = deps();
  const payload = {
    ...queuePayload(),
    contextHash: "sha256:stale-queue-payload",
  } satisfies V2GenerationJobQueuePayload;
  const result = await processV2SceneGenerationJob(payload, dependencies, {
    now: () => new Date("2026-08-12T00:06:00.000Z"),
  });
  assert.equal(result.kind, "failed_terminal");
  assert.equal(result.job.status, "failed");
  assert.equal(dependencies.candidateSubmission.submissions.length, 0);
});

test("keeps dispatch payload contracts importable by the worker package", () => {
  const payload: V2GenerationJobQueuePayload = {
    jobId: "job_scene_bridge" as V2JobId,
    kind: "scene" as V2GenerationJobKind,
    contextHash: "sha256:worker-context",
    correlationId: "corr-worker-test",
  };
  const dispatch: V2GenerationDispatchRecord = {
    dispatchId: "generation-dispatch:job_scene_bridge",
    jobId: payload.jobId,
    status: "pending" as V2GenerationDispatchStatus,
    attempts: 0,
    requestedAt: createdAt,
  };
  assert.equal(dispatch.jobId, payload.jobId);
});
