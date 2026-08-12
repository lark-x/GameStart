import { randomUUID } from "node:crypto";
import {
  createWorldContextPolicy,
  createStoryGenerationJob,
  createStoryGenerationCandidate,
  approveStoryGenerationCandidate,
  rejectStoryGenerationCandidate,
  StoryGenerationJobStatus,
  type WorldContextPolicy,
  type StoryGenerationJob,
  type StoryGenerationCandidate,
} from "@living-network/domain";
import type { DomainRepositories } from "@living-network/database";
import { ApiError } from "../helpers.ts";

// ── World Context Policy ──

export async function getWorldContextPolicy(
  repos: DomainRepositories,
  storyWorldId: string,
): Promise<WorldContextPolicy> {
  const policies = repos.worldContextPolicies;
  if (!policies) throw new ApiError(501, "NOT_IMPLEMENTED", "World context policy not available");
  const existing = await policies.getByWorldId(storyWorldId);
  if (existing) return existing;
  // Return default (all disabled)
  return createWorldContextPolicy({ id: randomUUID(), storyWorldId });
}

export async function updateWorldContextPolicy(
  repos: DomainRepositories,
  storyWorldId: string,
  updates: {
    worldLoreEnabled?: boolean;
    relationshipsEnabled?: boolean;
    schedulesEnabled?: boolean;
    memoriesEnabled?: boolean;
  },
): Promise<WorldContextPolicy> {
  const policies = repos.worldContextPolicies;
  if (!policies) throw new ApiError(501, "NOT_IMPLEMENTED", "World context policy not available");
  const existing = await policies.getByWorldId(storyWorldId);
  const now = new Date().toISOString();
  const policy: WorldContextPolicy = {
    id: existing?.id ?? randomUUID(),
    storyWorldId,
    worldLoreEnabled: updates.worldLoreEnabled ?? existing?.worldLoreEnabled ?? false,
    relationshipsEnabled: updates.relationshipsEnabled ?? existing?.relationshipsEnabled ?? false,
    schedulesEnabled: updates.schedulesEnabled ?? existing?.schedulesEnabled ?? false,
    memoriesEnabled: updates.memoriesEnabled ?? existing?.memoriesEnabled ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await policies.save(policy);
  return policy;
}

// ── Story Generation Jobs ──

export async function createGenerationJob(
  repos: DomainRepositories,
  storyNodeId: string,
  idempotencyKey: string,
): Promise<{ job: StoryGenerationJob; inserted: boolean }> {
  const jobs = repos.storyGenerationJobs;
  const nodes = repos.storyNodes;
  if (!jobs || !nodes) throw new ApiError(501, "NOT_IMPLEMENTED", "Story generation not available");

  const node = await nodes.getById(storyNodeId);
  if (!node) throw new ApiError(404, "NOT_FOUND", `Story node ${storyNodeId} not found`);

  // Idempotency check
  const existing = await jobs.getByIdempotencyKey(node.storyWorldId, idempotencyKey);
  if (existing) return { job: existing, inserted: false };

  const job = createStoryGenerationJob({
    id: randomUUID(),
    storyNodeId,
    storyWorldId: node.storyWorldId,
    idempotencyKey,
  });
  await jobs.save(job);
  return { job, inserted: true };
}

export async function getGenerationJob(
  repos: DomainRepositories,
  jobId: string,
): Promise<StoryGenerationJob> {
  const jobs = repos.storyGenerationJobs;
  if (!jobs) throw new ApiError(501, "NOT_IMPLEMENTED", "Story generation not available");
  const job = await jobs.getById(jobId);
  if (!job) throw new ApiError(404, "NOT_FOUND", `Story generation job ${jobId} not found`);
  return job;
}

// ── Story Generation Candidates ──

export async function listGenerationCandidates(
  repos: DomainRepositories,
  storyWorldId: string,
): Promise<readonly StoryGenerationCandidate[]> {
  const candidates = repos.storyGenerationCandidates;
  if (!candidates) throw new ApiError(501, "NOT_IMPLEMENTED", "Story generation not available");
  return candidates.listByWorld(storyWorldId);
}

export async function reviewGenerationCandidate(
  repos: DomainRepositories,
  candidateId: string,
  action: "approve" | "reject",
  reviewerCharacterId: string,
  idempotencyKey: string,
): Promise<{ candidate: StoryGenerationCandidate; inserted: boolean }> {
  const candidates = repos.storyGenerationCandidates;
  if (!candidates) throw new ApiError(501, "NOT_IMPLEMENTED", "Story generation not available");

  const candidate = await candidates.getById(candidateId);
  if (!candidate) throw new ApiError(404, "NOT_FOUND", `Story generation candidate ${candidateId} not found`);

  // Already reviewed — idempotency
  if (candidate.status !== "PENDING_REVIEW") {
    if (
      (action === "approve" && candidate.status === "APPROVED") ||
      (action === "reject" && candidate.status === "REJECTED")
    ) {
      return { candidate, inserted: false };
    }
    throw new ApiError(409, "CONFLICT", `Candidate ${candidateId} already ${candidate.status}`);
  }

  const reviewed = action === "approve"
    ? approveStoryGenerationCandidate(candidate, reviewerCharacterId)
    : rejectStoryGenerationCandidate(candidate, reviewerCharacterId);

  await candidates.save(reviewed);
  return { candidate: reviewed, inserted: true };
}
