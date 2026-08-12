import type { V2SqliteMigration } from "../platform/index.ts";

export const v2GenerationJobMigrations: readonly V2SqliteMigration[] = [
  {
    id: "0100_generation_jobs",
    up: (db) => db.exec(`
      CREATE TABLE v2_generation_jobs (
        job_id TEXT PRIMARY KEY,
        story_world_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind = 'scene'),
        status TEXT NOT NULL CHECK (status IN ('queued', 'claimed', 'running', 'succeeded', 'failed', 'cancelled')),
        idempotency_key TEXT NOT NULL,
        base_canon_revision INTEGER NOT NULL CHECK (base_canon_revision >= 0),
        context_hash TEXT NOT NULL,
        context_json TEXT NOT NULL,
        prompt TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        claimed_at TEXT,
        lease_expires_at TEXT,
        completed_at TEXT,
        cancelled_at TEXT,
        candidate_id TEXT,
        provider_response_id TEXT,
        raw_output_preview TEXT,
        failure_reason TEXT,
        UNIQUE (story_world_id, idempotency_key)
      );

      CREATE INDEX v2_generation_jobs_status_idx ON v2_generation_jobs (status, updated_at);
      CREATE INDEX v2_generation_jobs_context_hash_idx ON v2_generation_jobs (context_hash);

      CREATE TABLE v2_generation_dispatches (
        dispatch_id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES v2_generation_jobs(job_id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('pending', 'enqueued')),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        requested_at TEXT NOT NULL,
        enqueued_at TEXT,
        last_error TEXT
      );

      CREATE INDEX v2_generation_dispatches_status_idx ON v2_generation_dispatches (status, requested_at);
    `),
    down: (db) => db.exec(`
      DROP TABLE v2_generation_dispatches;
      DROP TABLE v2_generation_jobs;
    `),
  },
  {
    id: "0101_asset_generation_jobs",
    up: (db) => db.exec(`
      CREATE TABLE v2_asset_generation_jobs (
        job_id TEXT PRIMARY KEY,
        story_world_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'claimed', 'running', 'succeeded', 'failed', 'cancelled')),
        idempotency_key TEXT NOT NULL,
        prompt TEXT NOT NULL,
        negative_prompt TEXT,
        workflow_version TEXT NOT NULL,
        workflow_json TEXT NOT NULL,
        seed INTEGER CHECK (seed IS NULL OR seed >= 0),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        claimed_at TEXT,
        lease_expires_at TEXT,
        submitted_at TEXT,
        completed_at TEXT,
        cancelled_at TEXT,
        external_job_id TEXT,
        media_ref TEXT,
        candidate_id TEXT,
        failure_reason TEXT,
        UNIQUE (story_world_id, idempotency_key)
      );

      CREATE INDEX v2_asset_generation_jobs_status_idx ON v2_asset_generation_jobs (status, updated_at);
      CREATE INDEX v2_asset_generation_jobs_external_idx ON v2_asset_generation_jobs (external_job_id);

      CREATE TABLE v2_asset_generation_dispatches (
        dispatch_id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES v2_asset_generation_jobs(job_id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('pending', 'enqueued')),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        requested_at TEXT NOT NULL,
        enqueued_at TEXT,
        last_error TEXT
      );

      CREATE INDEX v2_asset_generation_dispatches_status_idx ON v2_asset_generation_dispatches (status, requested_at);

      CREATE TABLE v2_asset_candidates (
        candidate_id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL UNIQUE REFERENCES v2_asset_generation_jobs(job_id) ON DELETE CASCADE,
        story_world_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'changes_requested')),
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        reviewed_at TEXT,
        reviewer TEXT,
        review_reason TEXT
      );

      CREATE INDEX v2_asset_candidates_status_idx ON v2_asset_candidates (story_world_id, status, created_at);
    `),
    down: (db) => db.exec(`
      DROP TABLE v2_asset_candidates;
      DROP TABLE v2_asset_generation_dispatches;
      DROP TABLE v2_asset_generation_jobs;
    `),
  },
];
