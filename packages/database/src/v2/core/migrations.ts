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

export const v2CoreCanonMigrations = [v2CoreCanonMigration] as const;
