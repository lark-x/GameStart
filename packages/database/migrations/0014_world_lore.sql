BEGIN;

CREATE TABLE world_lore_entries (
  id text PRIMARY KEY,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (btrim(category) <> ''),
  title text NOT NULL CHECK (btrim(title) <> ''),
  content text NOT NULL CHECK (btrim(content) <> ''),
  tags text[] NOT NULL DEFAULT '{}',
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX world_lore_entries_world_enabled_idx
  ON world_lore_entries (story_world_id, is_enabled, id);
CREATE INDEX world_lore_entries_search_idx ON world_lore_entries
  USING gin ((to_tsvector('simple'::regconfig, title || ' ' || content) || array_to_tsvector(tags)));

COMMIT;
