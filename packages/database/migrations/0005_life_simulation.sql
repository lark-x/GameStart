BEGIN;

CREATE TABLE character_plans (
  id text PRIMARY KEY,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  character_id text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL CHECK (btrim(timezone) <> ''),
  location text CHECK (location IS NULL OR btrim(location) <> ''),
  activity text NOT NULL CHECK (btrim(activity) <> ''),
  interruptibility text NOT NULL CHECK (interruptibility IN ('BLOCKED', 'LIMITED', 'FLEXIBLE')),
  created_at timestamptz NOT NULL,
  CONSTRAINT character_plans_time_order CHECK (starts_at < ends_at),
  CONSTRAINT character_plans_character_world_fk
    FOREIGN KEY (character_id, story_world_id)
    REFERENCES characters(id, story_world_id)
    ON DELETE CASCADE
);

CREATE INDEX character_plans_character_time_idx
  ON character_plans (character_id, starts_at, ends_at, id);

CREATE TABLE event_executions (
  id text PRIMARY KEY,
  occurrence_id text NOT NULL REFERENCES scheduled_occurrences(id) ON DELETE CASCADE,
  definition_id text NOT NULL,
  story_world_id text NOT NULL,
  event_key text NOT NULL CHECK (btrim(event_key) <> ''),
  target_character_ids text[] NOT NULL DEFAULT '{}',
  attempt integer NOT NULL CHECK (attempt >= 1),
  rule_version text NOT NULL CHECK (btrim(rule_version) <> ''),
  input_snapshot jsonb NOT NULL CHECK (jsonb_typeof(input_snapshot) = 'object'),
  status text NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  output_snapshot jsonb CHECK (output_snapshot IS NULL OR jsonb_typeof(output_snapshot) = 'object'),
  failure_reason text CHECK (failure_reason IS NULL OR btrim(failure_reason) <> ''),
  CONSTRAINT event_executions_definition_world_fk
    FOREIGN KEY (definition_id, story_world_id)
    REFERENCES world_event_definitions(id, story_world_id)
    ON DELETE CASCADE,
  CONSTRAINT event_executions_attempt_unique UNIQUE (occurrence_id, attempt),
  CONSTRAINT event_executions_terminal_shape CHECK (
    (status = 'RUNNING' AND finished_at IS NULL AND output_snapshot IS NULL AND failure_reason IS NULL)
    OR (status = 'COMPLETED' AND finished_at IS NOT NULL AND output_snapshot IS NOT NULL AND failure_reason IS NULL)
    OR (status IN ('FAILED', 'CANCELLED') AND finished_at IS NOT NULL AND failure_reason IS NOT NULL)
  )
);

CREATE OR REPLACE FUNCTION enforce_event_execution_links()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_id text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM scheduled_occurrences occurrence
    WHERE occurrence.id = NEW.occurrence_id
      AND occurrence.definition_id = NEW.definition_id
      AND occurrence.story_world_id = NEW.story_world_id
      AND occurrence.event_key = NEW.event_key
  ) THEN
    RAISE EXCEPTION 'event execution must match its occurrence and definition';
  END IF;
  IF cardinality(NEW.target_character_ids) <> cardinality(
    ARRAY(SELECT DISTINCT unnest(NEW.target_character_ids))
  ) THEN
    RAISE EXCEPTION 'event execution target characters cannot contain duplicates';
  END IF;
  FOREACH target_id IN ARRAY NEW.target_character_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM characters
      WHERE id = target_id AND story_world_id = NEW.story_world_id
    ) THEN
      RAISE EXCEPTION 'event execution target character must belong to the story world';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER event_executions_links_trigger
  BEFORE INSERT OR UPDATE OF occurrence_id, definition_id, story_world_id, event_key, target_character_ids
  ON event_executions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_event_execution_links();

CREATE INDEX event_executions_occurrence_attempt_idx
  ON event_executions (occurrence_id, attempt DESC);

CREATE TABLE proactive_message_budgets (
  id text PRIMARY KEY,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  character_id text NOT NULL,
  window_starts_at timestamptz NOT NULL,
  window_ends_at timestamptz NOT NULL,
  limit_count integer NOT NULL CHECK (limit_count >= 0),
  consumed integer NOT NULL DEFAULT 0 CHECK (consumed >= 0 AND consumed <= limit_count),
  updated_at timestamptz NOT NULL,
  CONSTRAINT proactive_message_budgets_time_order CHECK (window_starts_at < window_ends_at),
  CONSTRAINT proactive_message_budgets_character_world_fk
    FOREIGN KEY (character_id, story_world_id)
    REFERENCES characters(id, story_world_id)
    ON DELETE CASCADE,
  CONSTRAINT proactive_message_budgets_window_unique
    UNIQUE (story_world_id, character_id, window_starts_at, window_ends_at)
);

CREATE INDEX proactive_message_budgets_active_idx
  ON proactive_message_budgets (story_world_id, character_id, window_starts_at, window_ends_at);

COMMIT;
