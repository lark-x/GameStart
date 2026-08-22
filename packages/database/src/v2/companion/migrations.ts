import type { DatabaseSync } from "node:sqlite";
import type { V2SqliteMigration } from "../platform/index.ts";

export const v2CompanionMomentsMigration: V2SqliteMigration = {
  id: "0300_v2_companion_moments",
  up: (db: DatabaseSync) => db.exec(`
    CREATE TABLE IF NOT EXISTS v2_companion_moments (
      moment_id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      character_name TEXT NOT NULL,
      content TEXT NOT NULL,
      media_ref TEXT,
      media_id TEXT,
      likes_count INTEGER NOT NULL DEFAULT 0,
      is_liked INTEGER NOT NULL DEFAULT 0,
      comments_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_v2_companion_moments_character
      ON v2_companion_moments(character_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS v2_companion_comments (
      comment_id TEXT PRIMARY KEY,
      moment_id TEXT NOT NULL REFERENCES v2_companion_moments(moment_id) ON DELETE CASCADE,
      author_type TEXT NOT NULL CHECK (author_type IN ('user', 'character')),
      author_id TEXT,
      author_name TEXT NOT NULL,
      content TEXT NOT NULL,
      reply_to_comment_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_v2_companion_comments_moment
      ON v2_companion_comments(moment_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS v2_companion_affinity_schedule (
      character_id TEXT PRIMARY KEY,
      level INTEGER NOT NULL DEFAULT 1,
      current_exp INTEGER NOT NULL DEFAULT 0,
      interaction_count INTEGER NOT NULL DEFAULT 0,
      valence REAL NOT NULL DEFAULT 0.2,
      arousal REAL NOT NULL DEFAULT 0.1,
      dominance REAL NOT NULL DEFAULT 0.0,
      routines_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `),
  down: (db: DatabaseSync) => db.exec(`
    DROP TABLE IF EXISTS v2_companion_comments;
    DROP TABLE IF EXISTS v2_companion_moments;
    DROP TABLE IF EXISTS v2_companion_affinity_schedule;
  `),
};

export const v2CompanionMigrations: readonly V2SqliteMigration[] = [
  v2CompanionMomentsMigration,
];
