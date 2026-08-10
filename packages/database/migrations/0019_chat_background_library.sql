BEGIN;

ALTER TABLE appearance_settings
  ADD COLUMN IF NOT EXISTS chat_background_items jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
