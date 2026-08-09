BEGIN;

CREATE TABLE execution_dispatch_requests (
  id text PRIMARY KEY,
  batch_id text NOT NULL,
  candidate_id text NOT NULL,
  action text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  occurrence_id text NOT NULL REFERENCES scheduled_occurrences(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  requested_at timestamptz NOT NULL DEFAULT now(),
  enqueued_at timestamptz,
  last_error text,
  CONSTRAINT execution_dispatch_requests_status_check CHECK (status IN ('PENDING', 'ENQUEUED')),
  CONSTRAINT execution_dispatch_requests_attempts_check CHECK (attempts >= 0),
  CONSTRAINT execution_dispatch_requests_payload_object CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX execution_dispatch_requests_pending_idx
  ON execution_dispatch_requests (requested_at, id)
  WHERE status = 'PENDING';

CREATE INDEX execution_dispatch_requests_batch_idx
  ON execution_dispatch_requests (batch_id, requested_at, id);

CREATE TABLE worker_heartbeats (
  worker_id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'RUNNING',
  heartbeat_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT worker_heartbeats_status_check CHECK (status IN ('RUNNING', 'STOPPED')),
  CONSTRAINT worker_heartbeats_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

COMMIT;