BEGIN;

ALTER TABLE moment_interactions
  ADD COLUMN reply_to_interaction_id text REFERENCES moment_interactions(id) ON DELETE SET NULL;

CREATE TABLE social_feed_events (
  id text PRIMARY KEY,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (btrim(event_type) <> ''),
  moment_id text REFERENCES moments(id) ON DELETE CASCADE,
  interaction_id text REFERENCES moment_interactions(id) ON DELETE SET NULL,
  actor_character_id text,
  cursor_value bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
  payload jsonb,
  created_at timestamptz NOT NULL
);

CREATE INDEX social_feed_events_world_cursor_idx
  ON social_feed_events (story_world_id, cursor_value);

CREATE INDEX social_feed_events_moment_idx
  ON social_feed_events (moment_id, created_at);

COMMIT;
