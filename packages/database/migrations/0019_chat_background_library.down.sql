BEGIN;

ALTER TABLE appearance_settings
  DROP COLUMN IF EXISTS chat_background_items;

COMMIT;
