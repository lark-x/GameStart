import {
  createWorldContextPolicy,
  createStoryGenerationJob,
  createStoryGenerationCandidate,
  StoryGenerationJobStatus,
  StoryGenerationCandidateStatus,
  type WorldContextPolicy,
  type StoryGenerationJob,
  type StoryGenerationCandidate,
  type StoryChoice,
} from "@living-network/domain";
import type {
  WorldContextPolicyRepository,
  StoryGenerationJobRepository,
  StoryGenerationCandidateRepository,
} from "../repositories.ts";
import {
  type SqlClient,
  type SqlRow,
  requiredString,
  requiredBoolean,
  requiredNumber,
  requiredTimestamp,
  optionalString,
  optionalTimestamp,
  jsonArray,
} from "./utils.ts";

// ── Row Mappers ──

function mapWorldContextPolicyRow(row: SqlRow): WorldContextPolicy {
  return {
    id: requiredString(row.id, "world_context_policies.id"),
    storyWorldId: requiredString(row.story_world_id, "world_context_policies.story_world_id"),
    worldLoreEnabled: requiredBoolean(row.world_lore_enabled, "world_context_policies.world_lore_enabled"),
    relationshipsEnabled: requiredBoolean(row.relationships_enabled, "world_context_policies.relationships_enabled"),
    schedulesEnabled: requiredBoolean(row.schedules_enabled, "world_context_policies.schedules_enabled"),
    memoriesEnabled: requiredBoolean(row.memories_enabled, "world_context_policies.memories_enabled"),
    createdAt: requiredTimestamp(row.created_at, "world_context_policies.created_at"),
    updatedAt: requiredTimestamp(row.updated_at, "world_context_policies.updated_at"),
  };
}

function mapStoryGenerationJobRow(row: SqlRow): StoryGenerationJob {
  const job: StoryGenerationJob = {
    id: requiredString(row.id, "story_generation_jobs.id"),
    storyNodeId: requiredString(row.story_node_id, "story_generation_jobs.story_node_id"),
    storyWorldId: requiredString(row.story_world_id, "story_generation_jobs.story_world_id"),
    status: requiredString(row.status, "story_generation_jobs.status") as StoryGenerationJobStatus,
    attempt: requiredNumber(row.attempt, "story_generation_jobs.attempt"),
    idempotencyKey: requiredString(row.idempotency_key, "story_generation_jobs.idempotency_key"),
    provider: optionalString(row.provider, "story_generation_jobs.provider"),
    model: optionalString(row.model, "story_generation_jobs.model"),
    failureReason: optionalString(row.failure_reason, "story_generation_jobs.failure_reason"),
    createdAt: requiredTimestamp(row.created_at, "story_generation_jobs.created_at"),
    startedAt: optionalTimestamp(row.started_at, "story_generation_jobs.started_at"),
    finishedAt: optionalTimestamp(row.finished_at, "story_generation_jobs.finished_at"),
  };
  return job;
}

function mapStoryGenerationCandidateRow(row: SqlRow): StoryGenerationCandidate {
  const rawChoices = jsonArray(row.choices, "story_generation_candidates.choices");
  const choices: StoryChoice[] = rawChoices.map((c: unknown) => {
    const obj = c as Record<string, unknown>;
    const choice: StoryChoice = {
      text: requiredString(obj.text, "story_generation_candidates.choices[].text"),
    };
    const targetNodeId = optionalString(obj.targetNodeId, "story_generation_candidates.choices[].targetNodeId");
    if (targetNodeId !== undefined) (choice as { targetNodeId?: string }).targetNodeId = targetNodeId;
    return choice;
  });

  return {
    id: requiredString(row.id, "story_generation_candidates.id"),
    storyNodeId: requiredString(row.story_node_id, "story_generation_candidates.story_node_id"),
    storyWorldId: requiredString(row.story_world_id, "story_generation_candidates.story_world_id"),
    sourceJobId: requiredString(row.source_job_id, "story_generation_candidates.source_job_id"),
    body: requiredString(row.body, "story_generation_candidates.body"),
    choices,
    promptVersion: requiredString(row.prompt_version, "story_generation_candidates.prompt_version"),
    status: requiredString(row.status, "story_generation_candidates.status") as StoryGenerationCandidateStatus,
    createdAt: requiredTimestamp(row.created_at, "story_generation_candidates.created_at"),
    reviewedAt: optionalTimestamp(row.reviewed_at, "story_generation_candidates.reviewed_at"),
    reviewerCharacterId: optionalString(row.reviewer_character_id, "story_generation_candidates.reviewer_character_id"),
  };
}

// ── SQL Constants ──

const CONTEXT_POLICY_SELECT = `
  SELECT id, story_world_id, world_lore_enabled, relationships_enabled,
         schedules_enabled, memories_enabled, created_at, updated_at
  FROM world_context_policies`;

const GENERATION_JOB_SELECT = `
  SELECT id, story_node_id, story_world_id, status, attempt, idempotency_key,
         provider, model, failure_reason, created_at, started_at, finished_at
  FROM story_generation_jobs`;

const GENERATION_CANDIDATE_SELECT = `
  SELECT id, story_node_id, story_world_id, source_job_id, body, choices,
         prompt_version, status, created_at, reviewed_at, reviewer_character_id
  FROM story_generation_candidates`;

// ── Factory ──

export function createStoryGenerationRepositories(client: SqlClient): {
  worldContextPolicies: WorldContextPolicyRepository;
  storyGenerationJobs: StoryGenerationJobRepository;
  storyGenerationCandidates: StoryGenerationCandidateRepository;
} {
  const worldContextPolicies: WorldContextPolicyRepository = {
    getByWorldId: async (storyWorldId) => {
      const result = await client.query(
        `${CONTEXT_POLICY_SELECT} WHERE story_world_id = $1`,
        [storyWorldId],
      );
      const row = result.rows[0];
      return row ? mapWorldContextPolicyRow(row) : undefined;
    },
    save: async (policy) => {
      await client.query(
        `INSERT INTO world_context_policies (
           id, story_world_id, world_lore_enabled, relationships_enabled,
           schedules_enabled, memories_enabled, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (story_world_id) DO UPDATE SET
           world_lore_enabled = EXCLUDED.world_lore_enabled,
           relationships_enabled = EXCLUDED.relationships_enabled,
           schedules_enabled = EXCLUDED.schedules_enabled,
           memories_enabled = EXCLUDED.memories_enabled,
           updated_at = EXCLUDED.updated_at`,
        [
          policy.id,
          policy.storyWorldId,
          policy.worldLoreEnabled,
          policy.relationshipsEnabled,
          policy.schedulesEnabled,
          policy.memoriesEnabled,
          policy.createdAt,
          policy.updatedAt,
        ],
      );
    },
  };

  const storyGenerationJobs: StoryGenerationJobRepository = {
    getById: async (id) => {
      const result = await client.query(
        `${GENERATION_JOB_SELECT} WHERE id = $1`,
        [id],
      );
      const row = result.rows[0];
      return row ? mapStoryGenerationJobRow(row) : undefined;
    },
    getByIdempotencyKey: async (storyWorldId, idempotencyKey) => {
      const result = await client.query(
        `${GENERATION_JOB_SELECT} WHERE story_world_id = $1 AND idempotency_key = $2`,
        [storyWorldId, idempotencyKey],
      );
      const row = result.rows[0];
      return row ? mapStoryGenerationJobRow(row) : undefined;
    },
    listByNode: async (storyNodeId) => {
      const result = await client.query(
        `${GENERATION_JOB_SELECT} WHERE story_node_id = $1 ORDER BY created_at DESC, id`,
        [storyNodeId],
      );
      return result.rows.map(mapStoryGenerationJobRow);
    },
    save: async (job) => {
      await client.query(
        `INSERT INTO story_generation_jobs (
           id, story_node_id, story_world_id, status, attempt, idempotency_key,
           provider, model, failure_reason, created_at, started_at, finished_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (story_world_id, idempotency_key) DO UPDATE SET
           status = EXCLUDED.status,
           attempt = EXCLUDED.attempt,
           provider = EXCLUDED.provider,
           model = EXCLUDED.model,
           failure_reason = EXCLUDED.failure_reason,
           started_at = EXCLUDED.started_at,
           finished_at = EXCLUDED.finished_at`,
        [
          job.id,
          job.storyNodeId,
          job.storyWorldId,
          job.status,
          job.attempt,
          job.idempotencyKey,
          job.provider ?? null,
          job.model ?? null,
          job.failureReason ?? null,
          job.createdAt,
          job.startedAt ?? null,
          job.finishedAt ?? null,
        ],
      );
    },
  };

  const storyGenerationCandidates: StoryGenerationCandidateRepository = {
    getById: async (id) => {
      const result = await client.query(
        `${GENERATION_CANDIDATE_SELECT} WHERE id = $1`,
        [id],
      );
      const row = result.rows[0];
      return row ? mapStoryGenerationCandidateRow(row) : undefined;
    },
    listByNode: async (storyNodeId) => {
      const result = await client.query(
        `${GENERATION_CANDIDATE_SELECT} WHERE story_node_id = $1 ORDER BY created_at DESC, id`,
        [storyNodeId],
      );
      return result.rows.map(mapStoryGenerationCandidateRow);
    },
    listByWorld: async (storyWorldId) => {
      const result = await client.query(
        `${GENERATION_CANDIDATE_SELECT} WHERE story_world_id = $1 ORDER BY created_at DESC, id`,
        [storyWorldId],
      );
      return result.rows.map(mapStoryGenerationCandidateRow);
    },
    save: async (candidate) => {
      await client.query(
        `INSERT INTO story_generation_candidates (
           id, story_node_id, story_world_id, source_job_id, body, choices,
           prompt_version, status, created_at, reviewed_at, reviewer_character_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           reviewed_at = EXCLUDED.reviewed_at,
           reviewer_character_id = EXCLUDED.reviewer_character_id`,
        [
          candidate.id,
          candidate.storyNodeId,
          candidate.storyWorldId,
          candidate.sourceJobId,
          candidate.body,
          JSON.stringify([...candidate.choices]),
          candidate.promptVersion,
          candidate.status,
          candidate.createdAt,
          candidate.reviewedAt ?? null,
          candidate.reviewerCharacterId ?? null,
        ],
      );
    },
  };

  return { worldContextPolicies, storyGenerationJobs, storyGenerationCandidates };
}
