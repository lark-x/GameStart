import type { DatabaseSync } from "node:sqlite";
import type { V2SqliteMigration } from "../platform/index.ts";

export const v2CharacterProfileMigration: V2SqliteMigration = {
  id: "0500_v2_character_profiles_relationships",
  up: (db) => {
    db.exec(`
      CREATE TABLE v2_character_profiles (
        story_world_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        aliases_json TEXT NOT NULL DEFAULT '[]',
        identity TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]',
        persona_json TEXT NOT NULL DEFAULT '{}',
        archived_at TEXT,
        PRIMARY KEY (story_world_id, character_id),
        FOREIGN KEY (story_world_id, character_id) REFERENCES v2_characters(story_world_id, character_id) ON DELETE CASCADE
      );
      INSERT INTO v2_character_profiles (story_world_id, character_id, persona_json)
        SELECT story_world_id, character_id,
          CASE WHEN persona_text IS NULL THEN '{}' ELSE json_object('advancedPrompt', persona_text) END
        FROM v2_characters;
      CREATE TABLE v2_character_relationships (
        relationship_id TEXT NOT NULL,
        story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
        from_character_id TEXT NOT NULL,
        to_character_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('friend','family','romantic','enemy','mentor','student','colleague','rival','unknown','custom')),
        custom_label TEXT,
        description TEXT,
        strength INTEGER NOT NULL CHECK (strength BETWEEN -100 AND 100),
        visibility TEXT NOT NULL CHECK (visibility IN ('creator_only','player_visible')),
        archived_at TEXT,
        UNIQUE (story_world_id, from_character_id, to_character_id),
        CHECK (from_character_id <> to_character_id),
        CHECK (type <> 'custom' OR length(trim(custom_label)) > 0),
        PRIMARY KEY (story_world_id, relationship_id),
        FOREIGN KEY (story_world_id, from_character_id) REFERENCES v2_characters(story_world_id, character_id) ON DELETE RESTRICT,
        FOREIGN KEY (story_world_id, to_character_id) REFERENCES v2_characters(story_world_id, character_id) ON DELETE RESTRICT
      );
      CREATE INDEX v2_character_relationships_from_idx ON v2_character_relationships(story_world_id, from_character_id);
      CREATE INDEX v2_character_relationships_to_idx ON v2_character_relationships(story_world_id, to_character_id);
    `);
  },
  down: (db) => db.exec(`
    DROP INDEX IF EXISTS v2_character_relationships_to_idx;
    DROP INDEX IF EXISTS v2_character_relationships_from_idx;
    DROP TABLE IF EXISTS v2_character_relationships;
    DROP TABLE IF EXISTS v2_character_profiles;
  `),
};

export const v2CharacterContextTraceMigration: V2SqliteMigration = {
  id: "0510_v2_character_context_traces",
  up: (db) => db.exec(`
    CREATE TABLE v2_character_context_traces (
      trace_id TEXT PRIMARY KEY,
      story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
      task TEXT NOT NULL,
      context_hash TEXT NOT NULL,
      canon_revision INTEGER NOT NULL,
      selected_sources_json TEXT NOT NULL,
      omitted_sources_json TEXT NOT NULL,
      budget_json TEXT NOT NULL,
      job_id TEXT,
      conversation_id TEXT,
      run_id TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX v2_character_context_traces_world_idx ON v2_character_context_traces(story_world_id, created_at DESC);
  `),
  down: (db) => db.exec(`DROP INDEX IF EXISTS v2_character_context_traces_world_idx; DROP TABLE IF EXISTS v2_character_context_traces;`),
};

export const v2CharacterRuntimeMigration: V2SqliteMigration = {
  id: "0520_v2_character_runtime_state",
  up: (db) => db.exec(`
    CREATE TABLE v2_character_state_definitions (
      state_definition_id TEXT PRIMARY KEY,
      story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
      character_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value_type TEXT NOT NULL CHECK (value_type IN ('string','number','boolean')),
      default_json TEXT NOT NULL,
      constraints_json TEXT NOT NULL DEFAULT '{}',
      archived_at TEXT,
      UNIQUE (story_world_id, character_id, key),
      FOREIGN KEY (story_world_id, character_id) REFERENCES v2_characters(story_world_id, character_id) ON DELETE CASCADE
    );
    CREATE TABLE v2_character_runtime_state (
      story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
      scope_type TEXT NOT NULL CHECK (scope_type IN ('conversation','run')),
      scope_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      state_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY (story_world_id, scope_type, scope_id, character_id),
      FOREIGN KEY (story_world_id, character_id) REFERENCES v2_characters(story_world_id, character_id) ON DELETE RESTRICT
    );
    CREATE TABLE v2_character_relationship_runtime (
      story_world_id TEXT NOT NULL,
      scope_type TEXT NOT NULL CHECK (scope_type IN ('conversation','run')),
      scope_id TEXT NOT NULL,
      relationship_id TEXT NOT NULL,
      strength INTEGER NOT NULL CHECK (strength BETWEEN -100 AND 100),
      revision INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (story_world_id, scope_type, scope_id, relationship_id)
    );
  `),
  down: (db) => db.exec(`DROP TABLE IF EXISTS v2_character_relationship_runtime; DROP TABLE IF EXISTS v2_character_runtime_state; DROP TABLE IF EXISTS v2_character_state_definitions;`),
};

export const v2CharacterVisualMigration: V2SqliteMigration = {
  id: "0530_v2_character_visual_profiles",
  up: (db) => db.exec(`
    CREATE TABLE v2_character_visual_variants (
      visual_variant_id TEXT PRIMARY KEY,
      story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
      character_id TEXT NOT NULL,
      name TEXT NOT NULL,
      appearance_json TEXT NOT NULL DEFAULT '{}',
      loras_json TEXT NOT NULL DEFAULT '[]',
      trigger_words_json TEXT NOT NULL DEFAULT '[]',
      negative_prompt TEXT,
      workflow_preset TEXT,
      is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
      archived_at TEXT,
      UNIQUE (story_world_id, character_id, name),
      FOREIGN KEY (story_world_id, character_id) REFERENCES v2_characters(story_world_id, character_id) ON DELETE CASCADE
    );
    CREATE TABLE v2_character_reference_assets (
      visual_variant_id TEXT NOT NULL REFERENCES v2_character_visual_variants(visual_variant_id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL,
      PRIMARY KEY (visual_variant_id, asset_id)
    );
    CREATE UNIQUE INDEX v2_character_visual_default_unique
      ON v2_character_visual_variants(story_world_id, character_id)
      WHERE is_default = 1 AND archived_at IS NULL;
  `),
  down: (db) => db.exec(`DROP INDEX IF EXISTS v2_character_visual_default_unique; DROP TABLE IF EXISTS v2_character_reference_assets; DROP TABLE IF EXISTS v2_character_visual_variants;`),
};

export const v2CharacterEventsCandidatesMigration: V2SqliteMigration = {
  id: "0540_v2_character_events_candidates",
  up: (db) => db.exec(`
    CREATE TABLE v2_character_event_definitions (
      event_definition_id TEXT PRIMARY KEY,
      story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      participant_ids_json TEXT NOT NULL DEFAULT '[]',
      initial_state_json TEXT NOT NULL DEFAULT '{}',
      archived_at TEXT
    );
    CREATE TABLE v2_character_event_instances (
      event_instance_id TEXT PRIMARY KEY,
      story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
      event_definition_id TEXT NOT NULL REFERENCES v2_character_event_definitions(event_definition_id) ON DELETE RESTRICT,
      scope_type TEXT NOT NULL CHECK (scope_type IN ('conversation','run')),
      scope_id TEXT NOT NULL,
      state_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE v2_character_candidates (
      candidate_id TEXT PRIMARY KEY,
      story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('profile_patch','relationship_upsert','visual_variant_upsert','memory_promotion','state_delta','relationship_delta','event_definition_upsert','event_instance_transition')),
      target_scope TEXT NOT NULL,
      base_revision INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','changes_requested')),
      payload_json TEXT NOT NULL,
      provenance_json TEXT NOT NULL,
      context_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      reviewed_at TEXT,
      reviewer TEXT,
      review_reason TEXT,
      UNIQUE (story_world_id, candidate_id)
    );
    CREATE TABLE v2_character_candidate_review_audits (
      audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
      story_world_id TEXT NOT NULL,
      candidate_id TEXT NOT NULL,
      status TEXT NOT NULL,
      reviewer TEXT NOT NULL,
      reason TEXT,
      reviewed_at TEXT NOT NULL,
      FOREIGN KEY (story_world_id, candidate_id) REFERENCES v2_character_candidates(story_world_id, candidate_id) ON DELETE CASCADE
    );
  `),
  down: (db) => db.exec(`DROP TABLE IF EXISTS v2_character_candidate_review_audits; DROP TABLE IF EXISTS v2_character_candidates; DROP TABLE IF EXISTS v2_character_event_instances; DROP TABLE IF EXISTS v2_character_event_definitions;`),
};

export const v2CharacterProactiveMigration: V2SqliteMigration = {
  id: "0550_v2_character_proactive_policy",
  up: (db) => db.exec(`
    CREATE TABLE v2_character_proactive_policy (
      story_world_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
      cooldown_minutes INTEGER NOT NULL DEFAULT 360 CHECK (cooldown_minutes >= 0),
      daily_limit INTEGER NOT NULL DEFAULT 3 CHECK (daily_limit >= 0),
      quiet_start TEXT NOT NULL DEFAULT '23:00',
      quiet_end TEXT NOT NULL DEFAULT '08:00',
      last_executed_at TEXT,
      PRIMARY KEY (story_world_id, character_id),
      FOREIGN KEY (story_world_id, character_id) REFERENCES v2_characters(story_world_id, character_id) ON DELETE CASCADE
    );
  `),
  down: (db) => db.exec(`DROP TABLE IF EXISTS v2_character_proactive_policy;`),
};

export const v2CharacterLivingMigrations: readonly V2SqliteMigration[] = [
  v2CharacterProfileMigration,
  v2CharacterContextTraceMigration,
  v2CharacterRuntimeMigration,
  v2CharacterVisualMigration,
  v2CharacterEventsCandidatesMigration,
  v2CharacterProactiveMigration,
];
