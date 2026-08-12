BEGIN;

CREATE TABLE relationship_change_candidates (
  id text PRIMARY KEY,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  edge_id text NOT NULL REFERENCES relationship_edges(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (btrim(source_type) <> ''),
  source_ref text CHECK (source_ref IS NULL OR btrim(source_ref) <> ''),
  delta_affinity integer NOT NULL CHECK (delta_affinity BETWEEN -20 AND 20),
  delta_trust integer NOT NULL CHECK (delta_trust BETWEEN -20 AND 20),
  delta_conflict integer NOT NULL CHECK (delta_conflict BETWEEN -20 AND 20),
  delta_dependency integer NOT NULL CHECK (delta_dependency BETWEEN -20 AND 20),
  reason text CHECK (reason IS NULL OR btrim(reason) <> ''),
  rule_version text CHECK (rule_version IS NULL OR btrim(rule_version) <> ''),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  idempotency_key text CHECK (idempotency_key IS NULL OR btrim(idempotency_key) <> ''),
  created_at timestamptz NOT NULL,
  reviewed_at timestamptz,
  CONSTRAINT relationship_change_candidates_idempotency_key_unique
    UNIQUE (story_world_id, idempotency_key)
);

CREATE INDEX relationship_change_candidates_world_idx
  ON relationship_change_candidates (story_world_id, status, created_at);

CREATE TABLE relationship_events (
  id text PRIMARY KEY,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  edge_id text NOT NULL REFERENCES relationship_edges(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (btrim(source_type) <> ''),
  source_ref text CHECK (source_ref IS NULL OR btrim(source_ref) <> ''),
  before_affinity integer NOT NULL,
  before_trust integer NOT NULL,
  before_conflict integer NOT NULL,
  before_dependency integer NOT NULL,
  delta_affinity integer NOT NULL,
  delta_trust integer NOT NULL,
  delta_conflict integer NOT NULL,
  delta_dependency integer NOT NULL,
  after_affinity integer NOT NULL,
  after_trust integer NOT NULL,
  after_conflict integer NOT NULL,
  after_dependency integer NOT NULL,
  reason text CHECK (reason IS NULL OR btrim(reason) <> ''),
  rule_version text CHECK (rule_version IS NULL OR btrim(rule_version) <> ''),
  reviewed_by text CHECK (reviewed_by IS NULL OR btrim(reviewed_by) <> ''),
  idempotency_key text CHECK (idempotency_key IS NULL OR btrim(idempotency_key) <> ''),
  created_at timestamptz NOT NULL,
  CONSTRAINT relationship_events_idempotency_key_unique
    UNIQUE (story_world_id, idempotency_key)
);

CREATE INDEX relationship_events_edge_idx
  ON relationship_events (edge_id, created_at);

CREATE TABLE memory_candidates (
  id text PRIMARY KEY,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (btrim(kind) <> ''),
  visibility text NOT NULL CHECK (visibility IN ('PUBLIC', 'PRIVATE', 'GROUP')),
  source text NOT NULL CHECK (btrim(source) <> ''),
  content text NOT NULL CHECK (btrim(content) <> ''),
  confidence real NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
  source_ref text CHECK (source_ref IS NULL OR btrim(source_ref) <> ''),
  subject_character_id text,
  audience_character_ids text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'MERGED')),
  idempotency_key text CHECK (idempotency_key IS NULL OR btrim(idempotency_key) <> ''),
  created_at timestamptz NOT NULL,
  reviewed_at timestamptz,
  CONSTRAINT memory_candidates_idempotency_key_unique
    UNIQUE (story_world_id, idempotency_key)
);

CREATE INDEX memory_candidates_world_idx
  ON memory_candidates (story_world_id, status, created_at);

COMMIT;
