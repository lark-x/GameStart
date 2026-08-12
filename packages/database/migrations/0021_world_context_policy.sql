-- World-level context policy governs what contextual data
-- the LLM may receive when generating story content.

CREATE TABLE world_context_policies (
  id TEXT PRIMARY KEY,
  story_world_id TEXT NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  world_lore_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  relationships_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  schedules_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  memories_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(story_world_id)
);

CREATE INDEX idx_world_context_policies_world ON world_context_policies(story_world_id);
