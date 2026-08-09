BEGIN;
DROP TRIGGER IF EXISTS world_event_definitions_recipients_trigger ON world_event_definitions;
DROP FUNCTION IF EXISTS enforce_event_definition_recipients();
ALTER TABLE world_event_definitions
  DROP COLUMN IF EXISTS output_generate_image,
  DROP COLUMN IF EXISTS output_publish_moment,
  DROP COLUMN IF EXISTS output_send_message,
  DROP COLUMN IF EXISTS recipient_character_ids;
COMMIT;
