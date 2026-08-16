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
  {
    id: "0102_asset_candidate_review",
    up: (db) => db.exec(`
      CREATE TABLE v2_asset_candidate_reviews (
        review_id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL REFERENCES v2_asset_candidates(candidate_id) ON DELETE CASCADE,
        action TEXT NOT NULL CHECK (action IN ('approve', 'reject', 'request_changes')),
        resulting_status TEXT NOT NULL CHECK (resulting_status IN ('pending', 'approved', 'rejected', 'changes_requested')),
        reviewed_at TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        reviewer TEXT,
        reason TEXT,
        UNIQUE (candidate_id, idempotency_key)
      );

      CREATE INDEX v2_asset_candidate_reviews_candidate_idx ON v2_asset_candidate_reviews (candidate_id, reviewed_at);

      CREATE TABLE v2_approved_assets (
        asset_id TEXT PRIMARY KEY,
        story_world_id TEXT NOT NULL,
        candidate_id TEXT NOT NULL UNIQUE REFERENCES v2_asset_candidates(candidate_id) ON DELETE CASCADE,
        media_ref TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        approved_at TEXT NOT NULL,
        reviewer TEXT,
        review_reason TEXT,
        release_id TEXT
      );

      CREATE INDEX v2_approved_assets_story_world_idx ON v2_approved_assets (story_world_id, asset_id);
      CREATE INDEX v2_approved_assets_release_idx ON v2_approved_assets (story_world_id, release_id);
    `),
    down: (db) => db.exec(`
      DROP TABLE v2_approved_assets;
      DROP TABLE v2_asset_candidate_reviews;
    `),
  },
  {
    id: "0103_manual_formal_assets",
    up: (db) => db.exec(`
      ALTER TABLE v2_approved_assets RENAME TO v2_approved_assets_legacy;

      CREATE TABLE v2_approved_assets (
        asset_id TEXT PRIMARY KEY,
        story_world_id TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'candidate')),
        candidate_id TEXT UNIQUE REFERENCES v2_asset_candidates(candidate_id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        media_ref TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        original_filename TEXT,
        mime_type TEXT,
        byte_size INTEGER CHECK (byte_size IS NULL OR byte_size >= 0),
        approved_at TEXT NOT NULL,
        reviewer TEXT,
        review_reason TEXT,
        release_id TEXT,
        CHECK ((source_type = 'manual' AND candidate_id IS NULL) OR (source_type = 'candidate' AND candidate_id IS NOT NULL))
      );

      INSERT INTO v2_approved_assets (
        asset_id, story_world_id, source_type, candidate_id, title, media_ref,
        content_hash, approved_at, reviewer, review_reason, release_id
      )
      SELECT asset_id, story_world_id, 'candidate', candidate_id, asset_id, media_ref,
        content_hash, approved_at, reviewer, review_reason, release_id
      FROM v2_approved_assets_legacy;

      DROP TABLE v2_approved_assets_legacy;
      CREATE INDEX v2_approved_assets_story_world_idx ON v2_approved_assets (story_world_id, asset_id);
      CREATE INDEX v2_approved_assets_release_idx ON v2_approved_assets (story_world_id, release_id);
      CREATE INDEX v2_approved_assets_content_hash_idx ON v2_approved_assets (story_world_id, content_hash);
    `),
    down: (db) => db.exec(`
      DELETE FROM v2_approved_assets WHERE source_type = 'manual';
      ALTER TABLE v2_approved_assets RENAME TO v2_approved_assets_extended;
      CREATE TABLE v2_approved_assets (
        asset_id TEXT PRIMARY KEY,
        story_world_id TEXT NOT NULL,
        candidate_id TEXT NOT NULL UNIQUE REFERENCES v2_asset_candidates(candidate_id) ON DELETE CASCADE,
        media_ref TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        approved_at TEXT NOT NULL,
        reviewer TEXT,
        review_reason TEXT,
        release_id TEXT
      );
      INSERT INTO v2_approved_assets SELECT asset_id, story_world_id, candidate_id, media_ref, content_hash, approved_at, reviewer, review_reason, release_id FROM v2_approved_assets_extended;
      DROP TABLE v2_approved_assets_extended;
      CREATE INDEX v2_approved_assets_story_world_idx ON v2_approved_assets (story_world_id, asset_id);
      CREATE INDEX v2_approved_assets_release_idx ON v2_approved_assets (story_world_id, release_id);
    `),
  },
];
