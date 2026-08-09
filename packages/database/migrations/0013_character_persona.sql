BEGIN;

ALTER TABLE characters
  ADD COLUMN persona_prompt text CHECK (persona_prompt IS NULL OR btrim(persona_prompt) <> '');

COMMIT;
