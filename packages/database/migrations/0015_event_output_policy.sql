BEGIN;

ALTER TABLE world_event_definitions
  ADD COLUMN recipient_character_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN output_send_message boolean NOT NULL DEFAULT false,
  ADD COLUMN output_publish_moment boolean NOT NULL DEFAULT false,
  ADD COLUMN output_generate_image boolean NOT NULL DEFAULT false;

UPDATE world_event_definitions
SET recipient_character_ids = target_character_ids;

CREATE OR REPLACE FUNCTION enforce_event_definition_recipients()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE recipient_id text;
BEGIN
  IF cardinality(NEW.recipient_character_ids) <> cardinality(ARRAY(SELECT DISTINCT unnest(NEW.recipient_character_ids))) THEN
    RAISE EXCEPTION 'event recipient characters cannot contain duplicates';
  END IF;
  IF (NEW.output_send_message OR NEW.output_publish_moment OR NEW.output_generate_image)
     AND cardinality(NEW.recipient_character_ids) = 0 THEN
    RAISE EXCEPTION 'event recipients are required when an output is enabled';
  END IF;
  FOREACH recipient_id IN ARRAY NEW.recipient_character_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM characters WHERE id = recipient_id AND story_world_id = NEW.story_world_id) THEN
      RAISE EXCEPTION 'event recipient character must belong to the story world';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER world_event_definitions_recipients_trigger
  BEFORE INSERT OR UPDATE OF story_world_id, recipient_character_ids, output_send_message, output_publish_moment, output_generate_image
  ON world_event_definitions FOR EACH ROW EXECUTE FUNCTION enforce_event_definition_recipients();

COMMIT;
