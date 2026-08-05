BEGIN;

CREATE TABLE conversations (
  id text PRIMARY KEY,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('PRIVATE', 'GROUP')),
  title text CHECK (title IS NULL OR btrim(title) <> ''),
  created_at timestamptz NOT NULL,
  CONSTRAINT conversations_id_world_unique UNIQUE (id, story_world_id)
);

CREATE TABLE conversation_members (
  conversation_id text NOT NULL,
  character_id text NOT NULL,
  story_world_id text NOT NULL,
  joined_at timestamptz NOT NULL,
  left_at timestamptz,
  PRIMARY KEY (conversation_id, character_id),
  CONSTRAINT conversation_members_time_order
    CHECK (left_at IS NULL OR left_at >= joined_at),
  CONSTRAINT conversation_members_conversation_world_fk
    FOREIGN KEY (conversation_id, story_world_id)
    REFERENCES conversations(id, story_world_id)
    ON DELETE CASCADE,
  CONSTRAINT conversation_members_character_world_fk
    FOREIGN KEY (character_id, story_world_id)
    REFERENCES characters(id, story_world_id)
    ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION enforce_conversation_member_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  conversation_type text;
  member_count integer;
  affected_conversation_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_conversation_id := OLD.conversation_id;
  ELSE
    affected_conversation_id := NEW.conversation_id;
  END IF;

  SELECT type INTO conversation_type
  FROM conversations
  WHERE id = affected_conversation_id;

  IF conversation_type IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO member_count
  FROM conversation_members
  WHERE conversation_id = affected_conversation_id;

  IF conversation_type = 'PRIVATE' AND member_count <> 2 THEN
    RAISE EXCEPTION 'PRIVATE conversation must have exactly two members';
  END IF;
  IF conversation_type = 'GROUP' AND member_count < 2 THEN
    RAISE EXCEPTION 'GROUP conversation must have at least two members';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER conversation_member_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON conversation_members
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION enforce_conversation_member_count();

CREATE TABLE messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author_character_id text,
  kind text NOT NULL CHECK (kind IN ('TEXT', 'IMAGE', 'STICKER', 'SYSTEM')),
  text text,
  media_ref text,
  sticker_id text,
  created_at timestamptz NOT NULL,
  idempotency_key text NOT NULL CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT messages_payload_matches_kind CHECK (
    (kind = 'TEXT' AND text IS NOT NULL AND btrim(text) <> '' AND media_ref IS NULL AND sticker_id IS NULL)
    OR (kind = 'IMAGE' AND media_ref IS NOT NULL AND btrim(media_ref) <> '' AND sticker_id IS NULL)
    OR (kind = 'STICKER' AND sticker_id IS NOT NULL AND btrim(sticker_id) <> '' AND media_ref IS NULL)
    OR (kind = 'SYSTEM' AND text IS NOT NULL AND btrim(text) <> '' AND media_ref IS NULL AND sticker_id IS NULL)
  ),
  CONSTRAINT messages_conversation_idempotency_unique
    UNIQUE (conversation_id, idempotency_key)
);

CREATE OR REPLACE FUNCTION enforce_message_active_author()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.kind = 'SYSTEM' AND NEW.author_character_id IS NOT NULL THEN
    RAISE EXCEPTION 'SYSTEM message cannot have an author';
  END IF;
  IF NEW.kind <> 'SYSTEM' AND NEW.author_character_id IS NULL THEN
    RAISE EXCEPTION 'non-system message requires an author';
  END IF;
  IF NEW.author_character_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM conversation_members
    WHERE conversation_id = NEW.conversation_id
      AND character_id = NEW.author_character_id
      AND left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'message author must be an active conversation member';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_active_author_trigger
  BEFORE INSERT OR UPDATE OF conversation_id, author_character_id, kind
  ON messages
  FOR EACH ROW
  EXECUTE FUNCTION enforce_message_active_author();

CREATE INDEX conversation_members_character_idx ON conversation_members (character_id);
CREATE INDEX messages_conversation_created_idx ON messages (conversation_id, created_at, id);

COMMIT;
