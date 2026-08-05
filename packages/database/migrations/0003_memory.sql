BEGIN;

CREATE TABLE memory_items (
  id text PRIMARY KEY,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'EVENT_FACT', 'CONVERSATION_SUMMARY', 'CHARACTER_IMPRESSION', 'USER_PREFERENCE'
  )),
  visibility text NOT NULL CHECK (visibility IN ('PRIVATE', 'RELATION', 'GROUP', 'PUBLIC', 'SYSTEM')),
  source text NOT NULL CHECK (source IN ('USER_AUTHORED', 'LLM_DERIVED', 'SYSTEM_EVENT', 'IMPORTED')),
  content text NOT NULL CHECK (btrim(content) <> ''),
  confidence double precision NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL,
  occurred_at timestamptz,
  subject_character_id text,
  audience_character_ids text[] NOT NULL DEFAULT '{}',
  source_ref text CHECK (source_ref IS NULL OR btrim(source_ref) <> ''),
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  CONSTRAINT memory_items_subject_world_fk
    FOREIGN KEY (subject_character_id, story_world_id)
    REFERENCES characters(id, story_world_id)
    ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION enforce_memory_visibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  audience_id text;
BEGIN
  IF NEW.visibility = 'PRIVATE' AND NEW.subject_character_id IS NULL THEN
    RAISE EXCEPTION 'PRIVATE memory requires a subject character';
  END IF;
  IF NEW.visibility IN ('RELATION', 'GROUP') AND cardinality(NEW.audience_character_ids) = 0 THEN
    RAISE EXCEPTION 'RELATION/GROUP memory requires an audience';
  END IF;
  IF NEW.visibility = 'SYSTEM' AND cardinality(NEW.audience_character_ids) > 0 THEN
    RAISE EXCEPTION 'SYSTEM memory cannot have an audience';
  END IF;
  FOREACH audience_id IN ARRAY NEW.audience_character_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM characters
      WHERE id = audience_id AND story_world_id = NEW.story_world_id
    ) THEN
      RAISE EXCEPTION 'memory audience character must belong to the story world';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER memory_visibility_trigger
  BEFORE INSERT OR UPDATE OF visibility, subject_character_id, audience_character_ids, story_world_id
  ON memory_items
  FOR EACH ROW
  EXECUTE FUNCTION enforce_memory_visibility();

CREATE INDEX memory_items_search_vector_idx ON memory_items USING GIN (search_vector);
CREATE INDEX memory_items_world_created_idx ON memory_items (story_world_id, created_at DESC, id);
CREATE INDEX memory_items_subject_idx ON memory_items (subject_character_id);

COMMIT;
