import type { DatabaseSync } from "node:sqlite";
import type { V2NarrativeSearchResultItem } from "@living-network/contracts/v2";
import type { V2NarrativeSearchRepository } from "@living-network/ports/v2";

export class SqliteNarrativeSearchRepository implements V2NarrativeSearchRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async searchNarrative(
    storyWorldId: string,
    query: string,
    limit: number = 30,
  ): Promise<readonly V2NarrativeSearchResultItem[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const like = `%${trimmed}%`;
    const results: V2NarrativeSearchResultItem[] = [];

    // 1. Scenes
    const sceneRows = this.db
      .prepare(`
        SELECT s.scene_id, s.title, s.body, a.title as arc_title, c.title as chapter_title, q.title as quest_title
        FROM v2_scenes s
        LEFT JOIN v2_arcs a ON s.story_world_id = a.story_world_id AND s.arc_id = a.arc_id
        LEFT JOIN v2_narrative_chapters c ON s.story_world_id = c.story_world_id AND s.chapter_id = c.chapter_id
        LEFT JOIN v2_narrative_quests q ON s.story_world_id = q.story_world_id AND s.quest_id = q.quest_id
        WHERE s.story_world_id = ? AND (s.title LIKE ? OR s.body LIKE ?)
        LIMIT ?
      `)
      .all(storyWorldId, like, like, limit) as unknown as readonly {
      scene_id: string;
      title: string;
      body: string | null;
      arc_title: string | null;
      chapter_title: string | null;
      quest_title: string | null;
    }[];

    for (const row of sceneRows) {
      const parts = [row.arc_title, row.chapter_title, row.quest_title].filter(Boolean);
      results.push({
        kind: "scene",
        id: row.scene_id,
        title: row.title,
        snippet: makeSnippet(row.body || row.title, trimmed),
        ...(parts.length > 0 ? { parentPath: parts.join(" / ") } : {}),
        sceneId: row.scene_id,
      });
    }

    // 2. Scene Blocks
    const blockRows = this.db
      .prepare(`
        SELECT b.block_id, b.scene_id, b.kind, b.text, s.title as scene_title
        FROM v2_scene_blocks b
        JOIN v2_scenes s ON b.story_world_id = s.story_world_id AND b.scene_id = s.scene_id
        WHERE b.story_world_id = ? AND b.text LIKE ?
        LIMIT ?
      `)
      .all(storyWorldId, like, limit) as unknown as readonly {
      block_id: string;
      scene_id: string;
      kind: string;
      text: string | null;
      scene_title: string;
    }[];

    for (const row of blockRows) {
      if (row.text) {
        results.push({
          kind: "scene_block",
          id: row.block_id,
          title: `${row.scene_title} (${row.kind})`,
          snippet: makeSnippet(row.text, trimmed),
          sceneId: row.scene_id,
        });
      }
    }

    // 3. Characters
    const charRows = this.db
      .prepare(`
        SELECT character_id, name, summary, persona_text
        FROM v2_characters
        WHERE story_world_id = ? AND (name LIKE ? OR summary LIKE ? OR persona_text LIKE ?)
        LIMIT ?
      `)
      .all(storyWorldId, like, like, like, limit) as unknown as readonly {
      character_id: string;
      name: string;
      summary: string | null;
      persona_text: string | null;
    }[];

    for (const row of charRows) {
      results.push({
        kind: "character",
        id: row.character_id,
        title: row.name,
        snippet: makeSnippet(row.summary || row.persona_text || row.name, trimmed),
      });
    }

    // 4. Locations
    const locRows = this.db
      .prepare(`
        SELECT location_id, name, summary
        FROM v2_locations
        WHERE story_world_id = ? AND (name LIKE ? OR summary LIKE ?)
        LIMIT ?
      `)
      .all(storyWorldId, like, like, limit) as unknown as readonly {
      location_id: string;
      name: string;
      summary: string | null;
    }[];

    for (const row of locRows) {
      results.push({
        kind: "location",
        id: row.location_id,
        title: row.name,
        snippet: makeSnippet(row.summary || row.name, trimmed),
      });
    }

    // 5. Lore
    const loreRows = this.db
      .prepare(`
        SELECT lore_entry_id, name, type, summary, body
        FROM v2_lore_entries
        WHERE story_world_id = ? AND (name LIKE ? OR summary LIKE ? OR body LIKE ?)
        LIMIT ?
      `)
      .all(storyWorldId, like, like, like, limit) as unknown as readonly {
      lore_entry_id: string;
      name: string;
      type: string;
      summary: string | null;
      body: string | null;
    }[];

    for (const row of loreRows) {
      results.push({
        kind: "lore",
        id: row.lore_entry_id,
        title: `${row.name} (${row.type})`,
        snippet: makeSnippet(row.summary || row.body || row.name, trimmed),
      });
    }

    // 6. Facts
    const factRows = this.db
      .prepare(`
        SELECT fact_id, text
        FROM v2_facts
        WHERE story_world_id = ? AND text LIKE ?
        LIMIT ?
      `)
      .all(storyWorldId, like, limit) as unknown as readonly {
      fact_id: string;
      text: string;
    }[];

    for (const row of factRows) {
      results.push({
        kind: "fact",
        id: row.fact_id,
        title: "世界事实",
        snippet: makeSnippet(row.text, trimmed),
      });
    }

    return results.slice(0, limit);
  }
}

function makeSnippet(text: string, query: string, maxLength: number = 100): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const lower = clean.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return clean.slice(0, maxLength);
  const start = Math.max(0, idx - 20);
  const end = Math.min(clean.length, idx + query.length + 60);
  let snippet = clean.slice(start, end);
  if (start > 0) snippet = `...${snippet}`;
  if (end < clean.length) snippet = `${snippet}...`;
  return snippet;
}
