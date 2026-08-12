-- Story generation jobs track LLM content generation requests
-- and their outcomes. Candidates hold generated content pending
-- creator review before being applied to story nodes.

CREATE TABLE story_generation_jobs (
  id TEXT PRIMARY KEY,
  story_node_id TEXT NOT NULL REFERENCES story_nodes(id) ON DELETE CASCADE,
  story_world_id TEXT NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  attempt INTEGER NOT NULL DEFAULT 1,
  idempotency_key TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  UNIQUE(story_world_id, idempotency_key)
);

CREATE INDEX idx_story_generation_jobs_node ON story_generation_jobs(story_node_id);
CREATE INDEX idx_story_generation_jobs_status ON story_generation_jobs(status) WHERE status IN ('PENDING', 'RUNNING');

CREATE TABLE story_generation_candidates (
  id TEXT PRIMARY KEY,
  story_node_id TEXT NOT NULL REFERENCES story_nodes(id) ON DELETE CASCADE,
  story_world_id TEXT NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  source_job_id TEXT NOT NULL REFERENCES story_generation_jobs(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  choices JSONB NOT NULL DEFAULT '[]',
  prompt_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
    CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL,
  reviewed_at TIMESTAMPTZ,
  reviewer_character_id TEXT
);

CREATE INDEX idx_story_generation_candidates_node ON story_generation_candidates(story_node_id);
CREATE INDEX idx_story_generation_candidates_status ON story_generation_candidates(story_world_id, status);
