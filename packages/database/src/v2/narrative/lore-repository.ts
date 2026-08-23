import type { DatabaseSync } from "node:sqlite";
import type { V2CanonLoreEntry } from "@living-network/domain/v2";
import type { V2CanonLoreRepository } from "@living-network/ports/v2";

interface LoreRow {
  readonly lore_entry_id: string;
  readonly story_world_id: string;
  readonly type: string;
  readonly custom_type: string | null;
  readonly name: string;
  readonly summary: string | null;
  readonly body: string | null;
  readonly tags_json: string;
  readonly revision: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export class SqliteCanonLoreRepository implements V2CanonLoreRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async getLoreEntry(criteria: {
    readonly storyWorldId: string;
    readonly loreEntryId: string;
  }): Promise<V2CanonLoreEntry | undefined> {
    const row = this.db
      .prepare(`
        SELECT lore_entry_id, story_world_id, type, custom_type, name, summary, body, tags_json, revision, created_at, updated_at
        FROM v2_lore_entries
        WHERE story_world_id = ? AND lore_entry_id = ?
      `)
      .get(criteria.storyWorldId, criteria.loreEntryId) as LoreRow | undefined;
    return row ? toLore(row) : undefined;
  }

  public async listLoreEntries(
    storyWorldId: string,
    criteria?: { readonly type?: string; readonly tag?: string },
  ): Promise<readonly V2CanonLoreEntry[]> {
    let sql = `
      SELECT lore_entry_id, story_world_id, type, custom_type, name, summary, body, tags_json, revision, created_at, updated_at
      FROM v2_lore_entries
      WHERE story_world_id = ?
    `;
    const params: (string | number)[] = [storyWorldId];

    if (criteria?.type) {
      sql += " AND type = ?";
      params.push(criteria.type);
    }
    sql += " ORDER BY name ASC, lore_entry_id ASC";

    const rows = this.db.prepare(sql).all(...params) as unknown as readonly LoreRow[];
    let results = rows.map(toLore);
    if (criteria?.tag) {
      const matchTag = criteria.tag.toLowerCase();
      results = results.filter((r) => r.tags.some((t) => t.toLowerCase() === matchTag));
    }
    return results;
  }

  public async createLoreEntry(entry: V2CanonLoreEntry): Promise<V2CanonLoreEntry> {
    const now = new Date().toISOString();
    this.db
      .prepare(`
        INSERT INTO v2_lore_entries (lore_entry_id, story_world_id, type, custom_type, name, summary, body, tags_json, revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        entry.loreEntryId,
        entry.storyWorldId,
        entry.type,
        entry.customType ?? null,
        entry.name,
        entry.summary ?? null,
        entry.body ?? null,
        JSON.stringify(entry.tags ?? []),
        entry.revision,
        entry.createdAt ?? now,
        entry.updatedAt ?? now,
      );
    return (await this.getLoreEntry({
      storyWorldId: entry.storyWorldId,
      loreEntryId: entry.loreEntryId,
    }))!;
  }

  public async updateLoreEntry(entry: V2CanonLoreEntry): Promise<V2CanonLoreEntry> {
    const now = new Date().toISOString();
    this.db
      .prepare(`
        UPDATE v2_lore_entries
        SET type = ?, custom_type = ?, name = ?, summary = ?, body = ?, tags_json = ?, revision = ?, updated_at = ?
        WHERE story_world_id = ? AND lore_entry_id = ?
      `)
      .run(
        entry.type,
        entry.customType ?? null,
        entry.name,
        entry.summary ?? null,
        entry.body ?? null,
        JSON.stringify(entry.tags ?? []),
        entry.revision,
        entry.updatedAt ?? now,
        entry.storyWorldId,
        entry.loreEntryId,
      );
    return (await this.getLoreEntry({
      storyWorldId: entry.storyWorldId,
      loreEntryId: entry.loreEntryId,
    }))!;
  }

  public async deleteLoreEntry(criteria: {
    readonly storyWorldId: string;
    readonly loreEntryId: string;
  }): Promise<void> {
    this.db
      .prepare("DELETE FROM v2_lore_entries WHERE story_world_id = ? AND lore_entry_id = ?")
      .run(criteria.storyWorldId, criteria.loreEntryId);
  }

  public async searchLore(storyWorldId: string, query: string): Promise<readonly V2CanonLoreEntry[]> {
    const trimmed = query.trim();
    if (!trimmed) return this.listLoreEntries(storyWorldId);

    try {
      const sanitized = trimmed.replace(/["*]/g, "");
      const ftsQuery = `"${sanitized}"*`;
      const rows = this.db
        .prepare(`
          SELECT l.lore_entry_id, l.story_world_id, l.type, l.custom_type, l.name, l.summary, l.body, l.tags_json, l.revision, l.created_at, l.updated_at
          FROM v2_lore_entries l
          JOIN v2_lore_entries_fts f ON l.rowid = f.rowid
          WHERE f.story_world_id = ? AND v2_lore_entries_fts MATCH ?
          ORDER BY rank
        `)
        .all(storyWorldId, ftsQuery) as unknown as readonly LoreRow[];
      if (rows.length > 0) {
        return rows.map(toLore);
      }
    } catch {
      // FTS error, continue to LIKE
    }

    const likeParam = `%${trimmed}%`;
    const rows = this.db
      .prepare(`
        SELECT lore_entry_id, story_world_id, type, custom_type, name, summary, body, tags_json, revision, created_at, updated_at
        FROM v2_lore_entries
        WHERE story_world_id = ? AND (name LIKE ? OR summary LIKE ? OR body LIKE ? OR tags_json LIKE ?)
        ORDER BY name ASC
      `)
      .all(storyWorldId, likeParam, likeParam, likeParam, likeParam) as unknown as readonly LoreRow[];
    return rows.map(toLore);
  }
}

function toLore(row: LoreRow): V2CanonLoreEntry {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags_json);
  } catch {
    tags = [];
  }
  return {
    loreEntryId: row.lore_entry_id,
    storyWorldId: row.story_world_id,
    type: row.type as any,
    ...(row.custom_type ? { customType: row.custom_type } : {}),
    name: row.name,
    ...(row.summary ? { summary: row.summary } : {}),
    ...(row.body ? { body: row.body } : {}),
    tags,
    revision: Number(row.revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
