import type { DatabaseSync } from "node:sqlite";
import type { V2SqliteMigration } from "../platform/migrations.ts";

export const v2NarrativeHierarchyMigration: V2SqliteMigration = {
  id: "0006_v2_narrative_hierarchy",
  up: (db: DatabaseSync) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS v2_narrative_chapters (
        chapter_id TEXT NOT NULL,
        story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
        arc_id TEXT NOT NULL,
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        summary TEXT,
        ordinal INTEGER NOT NULL DEFAULT 0 CHECK (ordinal >= 0),
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (story_world_id, chapter_id),
        FOREIGN KEY (story_world_id, arc_id)
          REFERENCES v2_arcs(story_world_id, arc_id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS v2_narrative_quests (
        quest_id TEXT NOT NULL,
        story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
        arc_id TEXT,
        chapter_id TEXT,
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        summary TEXT,
        kind TEXT NOT NULL DEFAULT 'main' CHECK (kind IN ('main', 'story', 'character', 'side', 'world', 'event', 'custom')),
        ordinal INTEGER NOT NULL DEFAULT 0 CHECK (ordinal >= 0),
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (story_world_id, quest_id),
        FOREIGN KEY (story_world_id, arc_id)
          REFERENCES v2_arcs(story_world_id, arc_id)
          ON DELETE SET NULL,
        FOREIGN KEY (story_world_id, chapter_id)
          REFERENCES v2_narrative_chapters(story_world_id, chapter_id)
          ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS v2_narrative_chapters_arc_idx ON v2_narrative_chapters(story_world_id, arc_id, ordinal);
      CREATE INDEX IF NOT EXISTS v2_narrative_quests_chapter_idx ON v2_narrative_quests(story_world_id, chapter_id, ordinal);
      CREATE INDEX IF NOT EXISTS v2_narrative_quests_arc_idx ON v2_narrative_quests(story_world_id, arc_id, ordinal);
    `);

    // Safely add columns to v2_scenes
    const columns = db.prepare("PRAGMA table_info(v2_scenes)").all() as unknown as readonly { name: string }[];
    const names = new Set(columns.map((c) => c.name));

    if (!names.has("chapter_id")) {
      db.exec("ALTER TABLE v2_scenes ADD COLUMN chapter_id TEXT;");
    }
    if (!names.has("quest_id")) {
      db.exec("ALTER TABLE v2_scenes ADD COLUMN quest_id TEXT;");
    }
    if (!names.has("ordinal")) {
      db.exec("ALTER TABLE v2_scenes ADD COLUMN ordinal INTEGER NOT NULL DEFAULT 0;");
    }
    if (!names.has("revision")) {
      db.exec("ALTER TABLE v2_scenes ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;");
    }
    if (!names.has("document_mode")) {
      db.exec("ALTER TABLE v2_scenes ADD COLUMN document_mode TEXT NOT NULL DEFAULT 'legacy_body';");
    }
    if (!names.has("updated_at")) {
      db.exec("ALTER TABLE v2_scenes ADD COLUMN updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));");
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS v2_scenes_chapter_idx ON v2_scenes(story_world_id, chapter_id);
      CREATE INDEX IF NOT EXISTS v2_scenes_quest_idx ON v2_scenes(story_world_id, quest_id);
    `);
  },
  down: (db: DatabaseSync) => {
    db.exec(`
      DROP INDEX IF EXISTS v2_scenes_quest_idx;
      DROP INDEX IF EXISTS v2_scenes_chapter_idx;
      DROP INDEX IF EXISTS v2_narrative_quests_arc_idx;
      DROP INDEX IF EXISTS v2_narrative_quests_chapter_idx;
      DROP INDEX IF EXISTS v2_narrative_chapters_arc_idx;
      DROP TABLE IF EXISTS v2_narrative_quests;
      DROP TABLE IF EXISTS v2_narrative_chapters;
    `);
  },
};

export const v2SceneBlocksMigration: V2SqliteMigration = {
  id: "0007_v2_scene_blocks",
  up: (db: DatabaseSync) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS v2_scene_blocks (
        block_id TEXT PRIMARY KEY,
        story_world_id TEXT NOT NULL,
        scene_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
        kind TEXT NOT NULL CHECK (kind IN ('dialogue', 'narration', 'stage_direction', 'action', 'command')),
        speaker_character_id TEXT,
        text TEXT,
        payload_json TEXT NOT NULL DEFAULT '{}',
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY (story_world_id, scene_id)
          REFERENCES v2_scenes(story_world_id, scene_id)
          ON DELETE CASCADE,
        FOREIGN KEY (story_world_id, speaker_character_id)
          REFERENCES v2_characters(story_world_id, character_id)
          ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS v2_scene_blocks_scene_ord_idx
        ON v2_scene_blocks(story_world_id, scene_id, ordinal);
      CREATE INDEX IF NOT EXISTS v2_scene_blocks_speaker_idx
        ON v2_scene_blocks(story_world_id, speaker_character_id);
    `);
  },
  down: (db: DatabaseSync) => {
    db.exec(`
      DROP INDEX IF EXISTS v2_scene_blocks_speaker_idx;
      DROP INDEX IF EXISTS v2_scene_blocks_scene_ord_idx;
      DROP TABLE IF EXISTS v2_scene_blocks;
    `);
  },
};

export const v2NarrativeReferencesMigration: V2SqliteMigration = {
  id: "0008_v2_narrative_references",
  up: (db: DatabaseSync) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS v2_narrative_references (
        reference_id TEXT PRIMARY KEY,
        story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
        source_type TEXT NOT NULL CHECK (source_type IN ('arc', 'chapter', 'quest', 'scene', 'scene_block')),
        source_id TEXT NOT NULL,
        target_type TEXT NOT NULL CHECK (target_type IN ('character', 'location', 'lore', 'timeline_event', 'fact', 'rule')),
        target_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('participant', 'speaker', 'location', 'mentioned', 'subject', 'affected', 'related', 'prerequisite')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (story_world_id, source_type, source_id, target_type, target_id, role)
      );

      CREATE INDEX IF NOT EXISTS v2_narrative_refs_source_idx
        ON v2_narrative_references(story_world_id, source_type, source_id);
      CREATE INDEX IF NOT EXISTS v2_narrative_refs_target_idx
        ON v2_narrative_references(story_world_id, target_type, target_id);
    `);
  },
  down: (db: DatabaseSync) => {
    db.exec(`
      DROP INDEX IF EXISTS v2_narrative_refs_target_idx;
      DROP INDEX IF EXISTS v2_narrative_refs_source_idx;
      DROP TABLE IF EXISTS v2_narrative_references;
    `);
  },
};

export const v2LoreAndNarrativeTimeMigration: V2SqliteMigration = {
  id: "0009_v2_lore_and_narrative_time",
  up: (db: DatabaseSync) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS v2_lore_entries (
        lore_entry_id TEXT PRIMARY KEY,
        story_world_id TEXT NOT NULL REFERENCES v2_worlds(story_world_id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('faction', 'item', 'organization', 'species', 'culture', 'religion', 'technology', 'concept', 'historical_event', 'custom')),
        custom_type TEXT,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        summary TEXT,
        body TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]',
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS v2_lore_entries_world_idx ON v2_lore_entries(story_world_id, type);

      CREATE VIRTUAL TABLE IF NOT EXISTS v2_lore_entries_fts USING fts5(
        story_world_id UNINDEXED,
        lore_entry_id UNINDEXED,
        name,
        summary,
        body,
        tags_json,
        content='v2_lore_entries',
        content_rowid='rowid'
      );

      CREATE TRIGGER IF NOT EXISTS v2_lore_entries_ai AFTER INSERT ON v2_lore_entries BEGIN
        INSERT INTO v2_lore_entries_fts(rowid, story_world_id, lore_entry_id, name, summary, body, tags_json)
        VALUES (new.rowid, new.story_world_id, new.lore_entry_id, new.name, new.summary, new.body, new.tags_json);
      END;

      CREATE TRIGGER IF NOT EXISTS v2_lore_entries_ad AFTER DELETE ON v2_lore_entries BEGIN
        INSERT INTO v2_lore_entries_fts(v2_lore_entries_fts, rowid, story_world_id, lore_entry_id, name, summary, body, tags_json)
        VALUES ('delete', old.rowid, old.story_world_id, old.lore_entry_id, old.name, old.summary, old.body, old.tags_json);
      END;

      CREATE TRIGGER IF NOT EXISTS v2_lore_entries_au AFTER UPDATE ON v2_lore_entries BEGIN
        INSERT INTO v2_lore_entries_fts(v2_lore_entries_fts, rowid, story_world_id, lore_entry_id, name, summary, body, tags_json)
        VALUES ('delete', old.rowid, old.story_world_id, old.lore_entry_id, old.name, old.summary, old.body, old.tags_json);
        INSERT INTO v2_lore_entries_fts(rowid, story_world_id, lore_entry_id, name, summary, body, tags_json)
        VALUES (new.rowid, new.story_world_id, new.lore_entry_id, new.name, new.summary, new.body, new.tags_json);
      END;
    `);

    // Add narrative time columns to v2_timeline_events
    const columns = db.prepare("PRAGMA table_info(v2_timeline_events)").all() as unknown as readonly { name: string }[];
    const names = new Set(columns.map((c) => c.name));

    if (!names.has("time_type")) {
      db.exec("ALTER TABLE v2_timeline_events ADD COLUMN time_type TEXT NOT NULL DEFAULT 'absolute';");
    }
    if (!names.has("time_display_text")) {
      db.exec("ALTER TABLE v2_timeline_events ADD COLUMN time_display_text TEXT;");
      db.exec("UPDATE v2_timeline_events SET time_display_text = local_date WHERE time_display_text IS NULL;");
    }
    if (!names.has("time_sort_key")) {
      db.exec("ALTER TABLE v2_timeline_events ADD COLUMN time_sort_key REAL;");
    }
    if (!names.has("time_certainty")) {
      db.exec("ALTER TABLE v2_timeline_events ADD COLUMN time_certainty TEXT NOT NULL DEFAULT 'exact';");
    }
  },
  down: (db: DatabaseSync) => {
    db.exec(`
      DROP TRIGGER IF EXISTS v2_lore_entries_au;
      DROP TRIGGER IF EXISTS v2_lore_entries_ad;
      DROP TRIGGER IF EXISTS v2_lore_entries_ai;
      DROP TABLE IF EXISTS v2_lore_entries_fts;
      DROP INDEX IF EXISTS v2_lore_entries_world_idx;
      DROP TABLE IF EXISTS v2_lore_entries;
    `);
  },
};

export const v2NarrativeMigrations = [
  v2NarrativeHierarchyMigration,
  v2SceneBlocksMigration,
  v2NarrativeReferencesMigration,
  v2LoreAndNarrativeTimeMigration,
] as const;
