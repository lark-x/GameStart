BEGIN;

CREATE TABLE story_worlds (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (btrim(name) <> ''),
  timezone text NOT NULL CHECK (btrim(timezone) <> ''),
  story_mode text NOT NULL CHECK (story_mode IN ('STATIC', 'DYNAMIC')),
  relationship_dynamics_enabled boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT story_worlds_dynamics_match_mode CHECK (
    (story_mode = 'STATIC' AND relationship_dynamics_enabled = false)
    OR (story_mode = 'DYNAMIC' AND relationship_dynamics_enabled = true)
  )
);

CREATE TABLE characters (
  id text PRIMARY KEY,
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  role text NOT NULL CHECK (role IN ('AI', 'USER')),
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  timezone text NOT NULL CHECK (btrim(timezone) <> ''),
  birth_date date,
  persona_prompt_ref text CHECK (persona_prompt_ref IS NULL OR btrim(persona_prompt_ref) <> ''),
  visual_prompt_ref text CHECK (visual_prompt_ref IS NULL OR btrim(visual_prompt_ref) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT characters_id_world_unique UNIQUE (id, story_world_id)
);

CREATE TABLE relationship_edges (
  id text PRIMARY KEY,
  source_character_id text NOT NULL,
  target_character_id text NOT NULL,
  story_world_id text NOT NULL,
  relationship_type text NOT NULL CHECK (btrim(relationship_type) <> ''),
  affinity double precision NOT NULL CHECK (affinity BETWEEN -100 AND 100),
  trust double precision NOT NULL CHECK (trust BETWEEN -100 AND 100),
  conflict double precision NOT NULL CHECK (conflict BETWEEN -100 AND 100),
  dependency double precision NOT NULL CHECK (dependency BETWEEN -100 AND 100),
  is_public boolean NOT NULL,
  is_bidirectional boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relationship_edges_no_self_loop CHECK (source_character_id <> target_character_id),
  CONSTRAINT relationship_edges_source_world_fk
    FOREIGN KEY (source_character_id, story_world_id)
    REFERENCES characters(id, story_world_id)
    ON DELETE CASCADE,
  CONSTRAINT relationship_edges_target_world_fk
    FOREIGN KEY (target_character_id, story_world_id)
    REFERENCES characters(id, story_world_id)
    ON DELETE CASCADE
);

CREATE TABLE actor_sessions (
  id text PRIMARY KEY,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  user_character_id text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  CONSTRAINT actor_sessions_time_order CHECK (ended_at IS NULL OR ended_at >= started_at),
  CONSTRAINT actor_sessions_user_world_fk
    FOREIGN KEY (user_character_id, story_world_id)
    REFERENCES characters(id, story_world_id)
    ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION enforce_actor_session_user_character()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM characters
    WHERE id = NEW.user_character_id
      AND story_world_id = NEW.story_world_id
      AND role = 'USER'
  ) THEN
    RAISE EXCEPTION 'actor session user character must have role USER';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER actor_sessions_user_character_role_trigger
  BEFORE INSERT OR UPDATE OF user_character_id, story_world_id
  ON actor_sessions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_actor_session_user_character();

CREATE INDEX characters_story_world_idx ON characters (story_world_id);
CREATE INDEX relationship_edges_story_world_idx ON relationship_edges (story_world_id);
CREATE INDEX actor_sessions_story_world_idx ON actor_sessions (story_world_id);
CREATE INDEX actor_sessions_user_character_idx ON actor_sessions (user_character_id);

COMMIT;
