BEGIN;
CREATE TABLE interaction_logs (
 id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), level text NOT NULL, source text NOT NULL, category text NOT NULL,
 action text NOT NULL, outcome text NOT NULL, duration_ms integer, request_id text, correlation_id text, world_id text, actor_id text,
 conversation_id text, entity_type text, entity_id text, message text, details jsonb NOT NULL DEFAULT '{}'::jsonb,
 CONSTRAINT interaction_logs_details_object CHECK (jsonb_typeof(details) = 'object')
);
CREATE INDEX interaction_logs_created_idx ON interaction_logs (created_at DESC, id DESC);
CREATE INDEX interaction_logs_correlation_idx ON interaction_logs (correlation_id, created_at DESC, id DESC);
CREATE INDEX interaction_logs_filters_idx ON interaction_logs (world_id, actor_id, category, level, created_at DESC, id DESC);
COMMIT;
