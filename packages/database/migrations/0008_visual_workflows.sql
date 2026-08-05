BEGIN;

CREATE TABLE character_visual_identities (
  id text PRIMARY KEY,
  character_id text NOT NULL,
  story_world_id text NOT NULL,
  positive_prompt text NOT NULL CHECK (btrim(positive_prompt) <> ''),
  negative_prompt text CHECK (negative_prompt IS NULL OR btrim(negative_prompt) <> ''),
  style_tags text[] NOT NULL DEFAULT '{}',
  reference_image_refs text[] NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at timestamptz NOT NULL,
  CONSTRAINT character_visual_identities_character_unique UNIQUE (character_id),
  CONSTRAINT character_visual_identities_character_world_fk
    FOREIGN KEY (character_id, story_world_id)
    REFERENCES characters(id, story_world_id)
    ON DELETE CASCADE
);

CREATE INDEX character_visual_identities_world_idx
  ON character_visual_identities (story_world_id, character_id);

CREATE TABLE image_workflow_templates (
  id text NOT NULL,
  version text NOT NULL CHECK (btrim(version) <> ''),
  workflow jsonb NOT NULL CHECK (jsonb_typeof(workflow) = 'object'),
  positive_prompt_path text[] NOT NULL CHECK (cardinality(positive_prompt_path) > 0),
  negative_prompt_path text[],
  seed_path text[],
  PRIMARY KEY (id, version)
);

COMMIT;
