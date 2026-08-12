BEGIN;

CREATE TABLE story_arcs (
  id text PRIMARY KEY,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (btrim(title) <> ''),
  summary text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT story_arcs_world_id_unique UNIQUE (story_world_id, id)
);

CREATE INDEX story_arcs_world_status_idx
  ON story_arcs (story_world_id, status, updated_at DESC, id);

CREATE TABLE story_nodes (
  id text PRIMARY KEY,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  arc_id text NOT NULL REFERENCES story_arcs(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (btrim(title) <> ''),
  node_type text NOT NULL CHECK (
    node_type IN ('MILESTONE', 'TURNING_POINT', 'SCENE_SEED', 'CHECKPOINT', 'ENDING')
  ),
  status text NOT NULL CHECK (status IN ('DRAFT', 'PLANNED', 'READY', 'GENERATED', 'LOCKED')),
  time_mode text NOT NULL CHECK (time_mode IN ('ABSOLUTE', 'RELATIVE', 'FLOATING')),
  scheduled_at timestamptz,
  window_start timestamptz,
  window_end timestamptz,
  summary text NOT NULL DEFAULT '',
  generation_goal text NOT NULL DEFAULT '',
  required_facts text[] NOT NULL DEFAULT '{}',
  involved_character_ids text[] NOT NULL DEFAULT '{}',
  referenced_memory_ids text[] NOT NULL DEFAULT '{}',
  creator_notes text,
  priority integer NOT NULL DEFAULT 0 CHECK (priority >= 0),
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT story_nodes_world_arc_unique UNIQUE (story_world_id, id),
  CONSTRAINT story_nodes_arc_world_fk FOREIGN KEY (story_world_id, arc_id)
    REFERENCES story_arcs(story_world_id, id) ON DELETE CASCADE
);

CREATE INDEX story_nodes_arc_order_idx
  ON story_nodes (arc_id, priority DESC, scheduled_at, created_at, id);
CREATE INDEX story_nodes_world_idx
  ON story_nodes (story_world_id, updated_at DESC, id);
CREATE INDEX story_nodes_involved_characters_idx
  ON story_nodes USING gin (involved_character_ids);
CREATE INDEX story_nodes_referenced_memories_idx
  ON story_nodes USING gin (referenced_memory_ids);

CREATE TABLE story_edges (
  id text PRIMARY KEY,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  arc_id text NOT NULL REFERENCES story_arcs(id) ON DELETE CASCADE,
  from_node_id text NOT NULL REFERENCES story_nodes(id) ON DELETE CASCADE,
  to_node_id text NOT NULL REFERENCES story_nodes(id) ON DELETE CASCADE,
  edge_type text NOT NULL CHECK (
    edge_type IN ('LEADS_TO', 'BRANCHES_TO', 'BLOCKS', 'UNLOCKS', 'PARALLEL')
  ),
  condition text NOT NULL DEFAULT '',
  weight double precision NOT NULL DEFAULT 1 CHECK (weight >= 0 AND weight <= 1),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT story_edges_no_self_loop CHECK (from_node_id <> to_node_id),
  CONSTRAINT story_edges_arc_world_fk FOREIGN KEY (story_world_id, arc_id)
    REFERENCES story_arcs(story_world_id, id) ON DELETE CASCADE,
  CONSTRAINT story_edges_from_world_fk FOREIGN KEY (story_world_id, from_node_id)
    REFERENCES story_nodes(story_world_id, id) ON DELETE CASCADE,
  CONSTRAINT story_edges_to_world_fk FOREIGN KEY (story_world_id, to_node_id)
    REFERENCES story_nodes(story_world_id, id) ON DELETE CASCADE
);

CREATE INDEX story_edges_arc_idx
  ON story_edges (arc_id, created_at, id);
CREATE INDEX story_edges_from_node_idx
  ON story_edges (from_node_id, id);
CREATE INDEX story_edges_to_node_idx
  ON story_edges (to_node_id, id);

CREATE TABLE prompt_templates (
  id text PRIMARY KEY,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (
    type IN ('WORLD', 'CHARACTER', 'RELATIONSHIP', 'STORY_NODE', 'MEMORY_RETRIEVAL', 'OUTPUT_FORMAT')
  ),
  name text NOT NULL CHECK (btrim(name) <> ''),
  content text NOT NULL CHECK (btrim(content) <> ''),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX prompt_templates_world_type_idx
  ON prompt_templates (story_world_id, type, is_default DESC, updated_at DESC, id);

CREATE TABLE memory_candidates (
  id text PRIMARY KEY,
  story_world_id text NOT NULL REFERENCES story_worlds(id) ON DELETE CASCADE,
  proposed_memory_id text,
  source_ref text NOT NULL CHECK (btrim(source_ref) <> ''),
  content text NOT NULL CHECK (btrim(content) <> ''),
  rationale text NOT NULL DEFAULT '',
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  status text NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'MERGED')),
  created_at timestamptz NOT NULL,
  reviewed_at timestamptz,
  reviewer_character_id text,
  merged_into_memory_id text,
  CONSTRAINT memory_candidates_reviewer_fk FOREIGN KEY (reviewer_character_id)
    REFERENCES characters(id) ON DELETE SET NULL,
  CONSTRAINT memory_candidates_merged_memory_fk FOREIGN KEY (merged_into_memory_id)
    REFERENCES memory_items(id) ON DELETE SET NULL
);

CREATE INDEX memory_candidates_world_status_idx
  ON memory_candidates (story_world_id, status, created_at DESC, id);

COMMIT;
