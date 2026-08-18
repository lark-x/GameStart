import type { DatabaseSync } from "node:sqlite";

import type { V2ConversationId, V2StoryWorldId } from "@living-network/contracts/v2";

export interface V2HybridMemoryRow {
  readonly memoryId: string;
  readonly assertionId: string;
  readonly batchId: string;
  readonly storyWorldId: string;
  readonly conversationId: string;
  readonly scopeType: "user" | "world" | "character" | "conversation";
  readonly scopeId: string;
  readonly subjectEntityType: string;
  readonly subjectEntityId: string;
  readonly predicate: string;
  readonly kind: string;
  readonly text: string;
  readonly importance: number;
  readonly confidence: number;
  readonly observedAt: string;
  readonly createdAt: string;
}

export interface V2HybridMemoryRepository {
  append(input: V2HybridMemoryRow): Promise<boolean>;
  getByAssertionId(assertionId: string): Promise<V2HybridMemoryRow | undefined>;
  search(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly conversationId?: V2ConversationId;
    readonly query: string;
    readonly limit: number;
  }): Promise<readonly V2HybridMemoryRow[]>;
  listRecent(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly conversationId?: V2ConversationId;
    readonly limit: number;
  }): Promise<readonly V2HybridMemoryRow[]>;
  clear(input: { readonly conversationId?: V2ConversationId; readonly storyWorldId?: V2StoryWorldId }): Promise<void>;
}

type HybridRow = {
  memory_id: string;
  assertion_id: string;
  batch_id: string;
  story_world_id: string;
  conversation_id: string;
  scope_type: "user" | "world" | "character" | "conversation";
  scope_id: string;
  subject_entity_type: string;
  subject_entity_id: string;
  predicate: string;
  kind: string;
  text: string;
  importance: number;
  confidence: number;
  observed_at: string;
  created_at: string;
};

function mapHybridRow(row: HybridRow): V2HybridMemoryRow {
  return {
    memoryId: row.memory_id,
    assertionId: row.assertion_id,
    batchId: row.batch_id,
    storyWorldId: row.story_world_id,
    conversationId: row.conversation_id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    subjectEntityType: row.subject_entity_type,
    subjectEntityId: row.subject_entity_id,
    predicate: row.predicate,
    kind: row.kind,
    text: row.text,
    importance: row.importance,
    confidence: row.confidence,
    observedAt: row.observed_at,
    createdAt: row.created_at,
  };
}

export class V2SqliteHybridMemoryRepository implements V2HybridMemoryRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async append(input: V2HybridMemoryRow): Promise<boolean> {
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO v2_hybrid_memories (
        memory_id, assertion_id, batch_id, story_world_id, conversation_id, scope_type, scope_id,
        subject_entity_type, subject_entity_id, predicate, kind, text, importance, confidence, observed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.memoryId,
      input.assertionId,
      input.batchId,
      input.storyWorldId,
      input.conversationId,
      input.scopeType,
      input.scopeId,
      input.subjectEntityType,
      input.subjectEntityId,
      input.predicate,
      input.kind,
      input.text,
      input.importance,
      input.confidence,
      input.observedAt,
      input.createdAt,
    );
    return Number(result.changes) > 0;
  }

  public async getByAssertionId(assertionId: string): Promise<V2HybridMemoryRow | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_hybrid_memories WHERE assertion_id = ?").get(assertionId) as HybridRow | undefined;
    return row === undefined ? undefined : mapHybridRow(row);
  }

  public async search(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly conversationId?: V2ConversationId;
    readonly query: string;
    readonly limit: number;
  }): Promise<readonly V2HybridMemoryRow[]> {
    const limit = Math.min(Math.max(1, input.limit), 50);
    const rawTokens = input.query.trim().split(/\s+/).filter(Boolean);
    const cjkWords = input.query.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z0-9]{2,}/g) ?? [];
    const allTokens = Array.from(new Set([...rawTokens, ...cjkWords])).slice(0, 10);
    const conversationClause = input.conversationId === undefined ? "" : " AND m.conversation_id = ?";
    const conversationParams = input.conversationId === undefined ? [] : [input.conversationId];

    if (allTokens.length > 0) {
      const match = allTokens.map((token) => `"${token.replace(/"/g, "")}"`).join(" OR ");
      let rows: HybridRow[] = [];
      try {
        rows = this.db.prepare(`
          SELECT m.* FROM v2_hybrid_memories m
          JOIN v2_hybrid_memories_fts f ON f.rowid = m.rowid AND f.memory_id = m.memory_id
          WHERE m.story_world_id = ?${conversationClause} AND v2_hybrid_memories_fts MATCH ?
          ORDER BY bm25(v2_hybrid_memories_fts), m.importance DESC, m.observed_at DESC
          LIMIT ?
        `).all(input.storyWorldId, ...conversationParams, match, limit) as HybridRow[];
      } catch {
        // Fall through to LIKE-based retrieval if FTS fails.
      }
      if (rows.length === 0) {
        // FTS tokenization does not split CJK phrases; fall back to substring match.
        const likeClauses = allTokens.map((token) => {
          const single = [...token];
          return single.length > 1
            ? single.map((char) => "m.text LIKE '%' || ? || '%'").join(" OR ")
            : "m.text LIKE '%' || ? || '%'";
        }).join(" OR ");
        const likeParams = allTokens.flatMap((token) => {
          const single = [...token];
          return single.length > 1 ? single : [token];
        });
        rows = this.db.prepare(`
          SELECT m.* FROM v2_hybrid_memories m
          WHERE m.story_world_id = ?${conversationClause} AND (${likeClauses})
          ORDER BY m.importance DESC, m.observed_at DESC
          LIMIT ?
        `).all(input.storyWorldId, ...conversationParams, ...likeParams, limit) as HybridRow[];
      }
      return rows.map(mapHybridRow);
    }
    return this.listRecent({
      storyWorldId: input.storyWorldId,
      limit,
      ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
    });
  }

  public async listRecent(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly conversationId?: V2ConversationId;
    readonly limit: number;
  }): Promise<readonly V2HybridMemoryRow[]> {
    const limit = Math.min(Math.max(1, input.limit), 50);
    if (input.conversationId !== undefined) {
      return (this.db.prepare(`
        SELECT * FROM v2_hybrid_memories
        WHERE story_world_id = ? AND conversation_id = ?
        ORDER BY observed_at DESC, memory_id DESC
        LIMIT ?
      `).all(input.storyWorldId, input.conversationId, limit) as HybridRow[]).map(mapHybridRow);
    }
    return (this.db.prepare(`
      SELECT * FROM v2_hybrid_memories
      WHERE story_world_id = ?
      ORDER BY observed_at DESC, memory_id DESC
      LIMIT ?
    `).all(input.storyWorldId, limit) as HybridRow[]).map(mapHybridRow);
  }

  public async clear(input: { readonly conversationId?: V2ConversationId; readonly storyWorldId?: V2StoryWorldId }): Promise<void> {
    if (input.conversationId !== undefined) {
      this.db.prepare("DELETE FROM v2_hybrid_memories WHERE conversation_id = ?").run(input.conversationId);
      return;
    }
    if (input.storyWorldId !== undefined) {
      this.db.prepare("DELETE FROM v2_hybrid_memories WHERE story_world_id = ?").run(input.storyWorldId);
      return;
    }
    this.db.exec("DELETE FROM v2_hybrid_memories;");
  }
}
