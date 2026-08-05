BEGIN;

CREATE TABLE sticker_packs (
  id text PRIMARY KEY,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  source_ref text CHECK (source_ref IS NULL OR btrim(source_ref) <> ''),
  created_at timestamptz NOT NULL,
  CONSTRAINT sticker_packs_id_world_unique UNIQUE (id, story_world_id)
);

CREATE INDEX sticker_packs_world_idx ON sticker_packs (story_world_id, id);

CREATE TABLE stickers (
  id text PRIMARY KEY,
  pack_id text NOT NULL REFERENCES sticker_packs(id) ON DELETE CASCADE,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (btrim(label) <> ''),
  media_ref text NOT NULL CHECK (btrim(media_ref) <> ''),
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL,
  CONSTRAINT stickers_pack_world_fk
    FOREIGN KEY (pack_id, story_world_id)
    REFERENCES sticker_packs(id, story_world_id)
    ON DELETE CASCADE
);

CREATE INDEX stickers_pack_idx ON stickers (pack_id, id);

COMMIT;
