BEGIN;

CREATE TABLE world_event_definitions (
  id text PRIMARY KEY,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  event_key text NOT NULL CHECK (btrim(event_key) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  trigger_source text NOT NULL CHECK (trigger_source IN (
    'BIRTHDAY', 'REAL_HOLIDAY', 'WORLD_HOLIDAY', 'STORY_NODE',
    'USER_INTERACTION', 'RELATIONSHIP_EVENT', 'MANUAL'
  )),
  timezone text NOT NULL CHECK (btrim(timezone) <> ''),
  recurrence_kind text NOT NULL CHECK (recurrence_kind IN ('ONCE', 'ANNUAL')),
  run_at timestamptz,
  recurrence_month integer,
  recurrence_day integer,
  recurrence_local_time text,
  target_character_ids text[] NOT NULL DEFAULT '{}',
  priority integer NOT NULL DEFAULT 0 CHECK (priority >= 0),
  cooldown_seconds integer CHECK (cooldown_seconds IS NULL OR cooldown_seconds >= 0),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL,
  CONSTRAINT world_event_definitions_id_world_unique UNIQUE (id, story_world_id),
  CONSTRAINT world_event_definitions_key_unique UNIQUE (story_world_id, event_key),
  CONSTRAINT world_event_definitions_recurrence_shape CHECK (
    (
      recurrence_kind = 'ONCE'
      AND run_at IS NOT NULL
      AND recurrence_month IS NULL
      AND recurrence_day IS NULL
      AND recurrence_local_time IS NULL
    )
    OR (
      recurrence_kind = 'ANNUAL'
      AND run_at IS NULL
      AND recurrence_month BETWEEN 1 AND 12
      AND recurrence_day BETWEEN 1 AND 31
      AND recurrence_local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    )
  )
);

CREATE OR REPLACE FUNCTION enforce_event_definition_targets()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_id text;
BEGIN
  IF cardinality(NEW.target_character_ids) <> cardinality(
    ARRAY(SELECT DISTINCT unnest(NEW.target_character_ids))
  ) THEN
    RAISE EXCEPTION 'event target characters cannot contain duplicates';
  END IF;
  FOREACH target_id IN ARRAY NEW.target_character_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM characters
      WHERE id = target_id AND story_world_id = NEW.story_world_id
    ) THEN
      RAISE EXCEPTION 'event target character must belong to the story world';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER world_event_definitions_targets_trigger
  BEFORE INSERT OR UPDATE OF story_world_id, target_character_ids
  ON world_event_definitions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_event_definition_targets();

CREATE INDEX world_event_definitions_world_enabled_idx
  ON world_event_definitions (story_world_id, enabled, id);

CREATE TABLE scheduled_occurrences (
  id text PRIMARY KEY,
  definition_id text NOT NULL,
  story_world_id text NOT NULL,
  event_key text NOT NULL CHECK (btrim(event_key) <> ''),
  scheduled_for timestamptz NOT NULL,
  timezone text NOT NULL CHECK (btrim(timezone) <> ''),
  occurrence_key text NOT NULL CHECK (btrim(occurrence_key) <> ''),
  status text NOT NULL CHECK (status IN (
    'PENDING', 'ENQUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'
  )),
  created_at timestamptz NOT NULL,
  CONSTRAINT scheduled_occurrences_definition_world_fk
    FOREIGN KEY (definition_id, story_world_id)
    REFERENCES world_event_definitions(id, story_world_id)
    ON DELETE CASCADE,
  CONSTRAINT scheduled_occurrences_key_unique UNIQUE (story_world_id, occurrence_key)
);

CREATE INDEX scheduled_occurrences_due_idx
  ON scheduled_occurrences (story_world_id, status, scheduled_for, id);

COMMIT;
