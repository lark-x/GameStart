import type { V2SqliteMigration } from "../platform/index.ts";

export const v2CoreCanonMigration: V2SqliteMigration = {
  id: "0001_v2_core_canon",
  up: (db) => {
    db.exec(`
      CREATE TABLE v2_worlds (
        story_world_id TEXT PRIMARY KEY,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        summary TEXT,
        revision INTEGER NOT NULL CHECK (revision >= 1),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE v2_locations (
        location_id TEXT NOT NULL,
        story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        summary TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (story_world_id, location_id)
      );

      CREATE TABLE v2_characters (
        character_id TEXT NOT NULL,
        story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        summary TEXT,
        home_location_id TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (story_world_id, character_id),
        FOREIGN KEY (story_world_id, home_location_id)
          REFERENCES v2_locations(story_world_id, location_id)
          ON DELETE SET NULL
      );

      CREATE TABLE v2_facts (
        fact_id TEXT NOT NULL,
        story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
        text TEXT NOT NULL CHECK (length(trim(text)) > 0),
        visibility TEXT NOT NULL CHECK (visibility IN ('creator_only', 'player_visible')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (story_world_id, fact_id)
      );

      CREATE VIRTUAL TABLE v2_facts_fts USING fts5(
        story_world_id UNINDEXED,
        fact_id UNINDEXED,
        text,
        content='v2_facts',
        content_rowid='rowid'
      );

      CREATE TRIGGER v2_facts_ai AFTER INSERT ON v2_facts BEGIN
        INSERT INTO v2_facts_fts(rowid, story_world_id, fact_id, text)
        VALUES (new.rowid, new.story_world_id, new.fact_id, new.text);
      END;

      CREATE TRIGGER v2_facts_ad AFTER DELETE ON v2_facts BEGIN
        INSERT INTO v2_facts_fts(v2_facts_fts, rowid, story_world_id, fact_id, text)
        VALUES ('delete', old.rowid, old.story_world_id, old.fact_id, old.text);
      END;

      CREATE TABLE v2_rules (
        rule_id TEXT NOT NULL,
        story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
        text TEXT NOT NULL CHECK (length(trim(text)) > 0),
        severity TEXT NOT NULL CHECK (severity IN ('guideline', 'required')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (story_world_id, rule_id)
      );

      CREATE TABLE v2_timeline_events (
        timeline_event_id TEXT NOT NULL,
        story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
        local_date TEXT NOT NULL CHECK (local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        summary TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (story_world_id, timeline_event_id)
      );

      CREATE TABLE v2_canon_idempotency (
        key TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (key, operation)
      );

      CREATE INDEX v2_locations_world_idx ON v2_locations(story_world_id);
      CREATE INDEX v2_characters_world_idx ON v2_characters(story_world_id);
      CREATE INDEX v2_facts_world_idx ON v2_facts(story_world_id);
      CREATE INDEX v2_rules_world_idx ON v2_rules(story_world_id);
      CREATE INDEX v2_timeline_world_date_idx ON v2_timeline_events(story_world_id, local_date);
    `);
  },
  down: (db) => {
    db.exec(`
      DROP INDEX IF EXISTS v2_timeline_world_date_idx;
      DROP INDEX IF EXISTS v2_rules_world_idx;
      DROP INDEX IF EXISTS v2_facts_world_idx;
      DROP INDEX IF EXISTS v2_characters_world_idx;
      DROP INDEX IF EXISTS v2_locations_world_idx;
      DROP TABLE IF EXISTS v2_canon_idempotency;
      DROP TABLE IF EXISTS v2_timeline_events;
      DROP TABLE IF EXISTS v2_rules;
      DROP TRIGGER IF EXISTS v2_facts_ad;
      DROP TRIGGER IF EXISTS v2_facts_ai;
      DROP TABLE IF EXISTS v2_facts_fts;
      DROP TABLE IF EXISTS v2_facts;
      DROP TABLE IF EXISTS v2_characters;
      DROP TABLE IF EXISTS v2_locations;
      DROP TABLE IF EXISTS v2_worlds;
    `);
  },
};

export const v2CoreGraphStateMigration: V2SqliteMigration = {
  id: "0002_v2_core_graph_state",
  up: (db) => {
    db.exec(`
      CREATE TABLE v2_arcs (
        arc_id TEXT NOT NULL,
        story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        summary TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (story_world_id, arc_id)
      );

      CREATE TABLE v2_scenes (
        scene_id TEXT NOT NULL,
        story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
        arc_id TEXT,
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        body TEXT,
        is_entry INTEGER NOT NULL CHECK (is_entry IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (story_world_id, scene_id),
        FOREIGN KEY (story_world_id, arc_id)
          REFERENCES v2_arcs(story_world_id, arc_id)
          ON DELETE SET NULL
      );

      CREATE TABLE v2_choices (
        choice_id TEXT NOT NULL,
        story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
        source_scene_id TEXT NOT NULL,
        target_scene_id TEXT,
        label TEXT NOT NULL CHECK (length(trim(label)) > 0),
        gates_json TEXT NOT NULL DEFAULT '[]',
        consequences_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (story_world_id, choice_id),
        FOREIGN KEY (story_world_id, source_scene_id)
          REFERENCES v2_scenes(story_world_id, scene_id)
          ON DELETE CASCADE,
        FOREIGN KEY (story_world_id, target_scene_id)
          REFERENCES v2_scenes(story_world_id, scene_id)
          ON DELETE SET NULL
      );

      CREATE TABLE v2_state_variables (
        story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value_type TEXT NOT NULL CHECK (value_type IN ('string', 'number', 'boolean')),
        default_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (story_world_id, key)
      );

      CREATE INDEX v2_arcs_world_idx ON v2_arcs(story_world_id);
      CREATE INDEX v2_scenes_world_idx ON v2_scenes(story_world_id);
      CREATE INDEX v2_scenes_world_entry_idx ON v2_scenes(story_world_id, is_entry);
      CREATE INDEX v2_choices_world_source_idx ON v2_choices(story_world_id, source_scene_id);
      CREATE INDEX v2_choices_world_target_idx ON v2_choices(story_world_id, target_scene_id);
      CREATE INDEX v2_state_variables_world_idx ON v2_state_variables(story_world_id);
    `);
  },
  down: (db) => {
    db.exec(`
      DROP INDEX IF EXISTS v2_state_variables_world_idx;
      DROP INDEX IF EXISTS v2_choices_world_target_idx;
      DROP INDEX IF EXISTS v2_choices_world_source_idx;
      DROP INDEX IF EXISTS v2_scenes_world_entry_idx;
      DROP INDEX IF EXISTS v2_scenes_world_idx;
      DROP INDEX IF EXISTS v2_arcs_world_idx;
      DROP TABLE IF EXISTS v2_state_variables;
      DROP TABLE IF EXISTS v2_choices;
      DROP TABLE IF EXISTS v2_scenes;
      DROP TABLE IF EXISTS v2_arcs;
    `);
  },
};

export const v2CoreCandidateReviewMigration: V2SqliteMigration = {
  id: "0003_v2_core_candidate_review",
  up: (db) => {
    db.exec(`
      CREATE TABLE v2_scene_candidates (
        candidate_id TEXT NOT NULL,
        story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
        base_canon_revision INTEGER NOT NULL CHECK (base_canon_revision >= 1),
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'changes_requested')),
        payload_json TEXT NOT NULL,
        provenance_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        reviewed_at TEXT,
        reviewer TEXT,
        review_reason TEXT,
        PRIMARY KEY (story_world_id, candidate_id)
      );

      CREATE TABLE v2_candidate_review_audits (
        audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidate_id TEXT NOT NULL,
        story_world_id TEXT NOT NULL,
        from_status TEXT NOT NULL CHECK (from_status IN ('pending', 'approved', 'rejected', 'changes_requested')),
        to_status TEXT NOT NULL CHECK (to_status IN ('pending', 'approved', 'rejected', 'changes_requested')),
        action TEXT NOT NULL CHECK (action IN ('approve', 'reject', 'request_changes')),
        reviewer TEXT NOT NULL CHECK (length(trim(reviewer)) > 0),
        reason TEXT,
        resulting_revision INTEGER NOT NULL CHECK (resulting_revision >= 1),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY (story_world_id, candidate_id)
          REFERENCES v2_scene_candidates(story_world_id, candidate_id)
          ON DELETE CASCADE
      );

      CREATE INDEX v2_scene_candidates_world_status_idx ON v2_scene_candidates(story_world_id, status, created_at);
      CREATE INDEX v2_candidate_review_audits_candidate_idx ON v2_candidate_review_audits(story_world_id, candidate_id, created_at);
    `);
  },
  down: (db) => {
    db.exec(`
      DROP INDEX IF EXISTS v2_candidate_review_audits_candidate_idx;
      DROP INDEX IF EXISTS v2_scene_candidates_world_status_idx;
      DROP TABLE IF EXISTS v2_candidate_review_audits;
      DROP TABLE IF EXISTS v2_scene_candidates;
    `);
  },
};

export const v2CoreReleaseRuntimeMigration: V2SqliteMigration = {
  id: "0004_v2_core_release_runtime",
  up: (db) => {
    db.exec(`
      CREATE TABLE v2_releases (
        release_id TEXT PRIMARY KEY,
        story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE RESTRICT,
        version TEXT NOT NULL,
        source_revision INTEGER NOT NULL CHECK (source_revision >= 1),
        content_hash TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (story_world_id, version)
      );

      CREATE TABLE v2_runtime_runs (
        run_id TEXT PRIMARY KEY,
        release_id TEXT NOT NULL REFERENCES v2_releases(release_id) ON DELETE RESTRICT,
        release_version TEXT NOT NULL,
        current_scene_id TEXT NOT NULL,
        state_json TEXT NOT NULL,
        choice_history_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE v2_runtime_saves (
        save_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES v2_runtime_runs(run_id) ON DELETE CASCADE,
        release_id TEXT NOT NULL REFERENCES v2_releases(release_id) ON DELETE RESTRICT,
        release_version TEXT NOT NULL,
        current_scene_id TEXT NOT NULL,
        state_json TEXT NOT NULL,
        choice_history_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX v2_releases_world_idx ON v2_releases(story_world_id, created_at);
      CREATE INDEX v2_runtime_runs_release_idx ON v2_runtime_runs(release_id, updated_at);
      CREATE INDEX v2_runtime_saves_run_idx ON v2_runtime_saves(run_id, created_at);
    `);
  },
  down: (db) => {
    db.exec(`
      DROP INDEX IF EXISTS v2_runtime_saves_run_idx;
      DROP INDEX IF EXISTS v2_runtime_runs_release_idx;
      DROP INDEX IF EXISTS v2_releases_world_idx;
      DROP TABLE IF EXISTS v2_runtime_saves;
      DROP TABLE IF EXISTS v2_runtime_runs;
      DROP TABLE IF EXISTS v2_releases;
    `);
  },
};

export const v2CoreCanonMigrations = [
  v2CoreCanonMigration,
  v2CoreGraphStateMigration,
  v2CoreCandidateReviewMigration,
  v2CoreReleaseRuntimeMigration,
] as const;
