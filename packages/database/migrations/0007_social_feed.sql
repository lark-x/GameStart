BEGIN;

CREATE TABLE moments (
  id text PRIMARY KEY,
  draft_id text NOT NULL UNIQUE,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  author_character_id text NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('PUBLIC', 'RELATION', 'GROUP', 'PRIVATE')),
  audience_character_ids text[] NOT NULL DEFAULT '{}',
  body text NOT NULL CHECK (btrim(body) <> ''),
  image_media_ref text CHECK (image_media_ref IS NULL OR btrim(image_media_ref) <> ''),
  published_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT moments_author_world_fk
    FOREIGN KEY (author_character_id, story_world_id)
    REFERENCES characters(id, story_world_id)
    ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION enforce_moment_audience()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  audience_id text;
BEGIN
  IF cardinality(NEW.audience_character_ids) <> cardinality(
    ARRAY(SELECT DISTINCT unnest(NEW.audience_character_ids))
  ) THEN
    RAISE EXCEPTION 'moment audience characters cannot contain duplicates';
  END IF;
  IF NEW.visibility = 'PRIVATE' AND NOT NEW.author_character_id = ANY(NEW.audience_character_ids) THEN
    RAISE EXCEPTION 'PRIVATE moment audience must include its author';
  END IF;
  IF NEW.visibility IN ('RELATION', 'GROUP') AND cardinality(NEW.audience_character_ids) = 0 THEN
    RAISE EXCEPTION 'RELATION/GROUP moment requires an audience';
  END IF;
  FOREACH audience_id IN ARRAY NEW.audience_character_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM characters
      WHERE id = audience_id AND story_world_id = NEW.story_world_id
    ) THEN
      RAISE EXCEPTION 'moment audience character must belong to the story world';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER moments_audience_trigger
  BEFORE INSERT OR UPDATE OF visibility, audience_character_ids, author_character_id, story_world_id
  ON moments
  FOR EACH ROW
  EXECUTE FUNCTION enforce_moment_audience();

CREATE INDEX moments_feed_idx
  ON moments (story_world_id, published_at DESC, id);

CREATE TABLE moment_interactions (
  id text PRIMARY KEY,
  moment_id text NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  actor_character_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('LIKE', 'COMMENT')),
  text text,
  created_at timestamptz NOT NULL,
  idempotency_key text NOT NULL CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT moment_interactions_actor_world_fk
    FOREIGN KEY (actor_character_id, story_world_id)
    REFERENCES characters(id, story_world_id)
    ON DELETE CASCADE,
  CONSTRAINT moment_interactions_payload_check CHECK (
    (kind = 'LIKE' AND text IS NULL)
    OR (kind = 'COMMENT' AND text IS NOT NULL AND btrim(text) <> '')
  ),
  CONSTRAINT moment_interactions_idempotency_unique
    UNIQUE (moment_id, idempotency_key)
);

CREATE OR REPLACE FUNCTION enforce_moment_interaction_links()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM moments moment
    WHERE moment.id = NEW.moment_id
      AND moment.story_world_id = NEW.story_world_id
  ) THEN
    RAISE EXCEPTION 'moment interaction must match moment story world';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER moment_interactions_links_trigger
  BEFORE INSERT OR UPDATE OF moment_id, story_world_id
  ON moment_interactions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_moment_interaction_links();

CREATE UNIQUE INDEX moment_interactions_like_unique
  ON moment_interactions (moment_id, actor_character_id)
  WHERE kind = 'LIKE';
CREATE INDEX moment_interactions_moment_created_idx
  ON moment_interactions (moment_id, created_at, id);

COMMIT;
