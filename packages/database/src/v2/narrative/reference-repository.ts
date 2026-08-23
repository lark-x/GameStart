import type { DatabaseSync } from "node:sqlite";
import type { V2NarrativeReference } from "@living-network/domain/v2";
import type { V2NarrativeReferenceRepository } from "@living-network/ports/v2";

interface ReferenceRow {
  readonly reference_id: string;
  readonly story_world_id: string;
  readonly source_type: string;
  readonly source_id: string;
  readonly target_type: string;
  readonly target_id: string;
  readonly role: string;
  readonly created_at: string;
}

export class SqliteNarrativeReferenceRepository implements V2NarrativeReferenceRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async listReferencesBySource(criteria: {
    readonly storyWorldId: string;
    readonly sourceType: string;
    readonly sourceId: string;
  }): Promise<readonly V2NarrativeReference[]> {
    const rows = this.db
      .prepare(`
        SELECT reference_id, story_world_id, source_type, source_id, target_type, target_id, role, created_at
        FROM v2_narrative_references
        WHERE story_world_id = ? AND source_type = ? AND source_id = ?
        ORDER BY created_at ASC, reference_id ASC
      `)
      .all(criteria.storyWorldId, criteria.sourceType, criteria.sourceId) as unknown as readonly ReferenceRow[];
    return rows.map(toReference);
  }

  public async listReferencesByTarget(criteria: {
    readonly storyWorldId: string;
    readonly targetType: string;
    readonly targetId: string;
  }): Promise<readonly V2NarrativeReference[]> {
    const rows = this.db
      .prepare(`
        SELECT reference_id, story_world_id, source_type, source_id, target_type, target_id, role, created_at
        FROM v2_narrative_references
        WHERE story_world_id = ? AND target_type = ? AND target_id = ?
        ORDER BY created_at ASC, reference_id ASC
      `)
      .all(criteria.storyWorldId, criteria.targetType, criteria.targetId) as unknown as readonly ReferenceRow[];
    return rows.map(toReference);
  }

  public async listAllReferences(storyWorldId: string): Promise<readonly V2NarrativeReference[]> {
    const rows = this.db
      .prepare(`
        SELECT reference_id, story_world_id, source_type, source_id, target_type, target_id, role, created_at
        FROM v2_narrative_references
        WHERE story_world_id = ?
        ORDER BY created_at ASC, reference_id ASC
      `)
      .all(storyWorldId) as unknown as readonly ReferenceRow[];
    return rows.map(toReference);
  }

  public async replaceReferencesForSource(
    criteria: {
      readonly storyWorldId: string;
      readonly sourceType: string;
      readonly sourceId: string;
    },
    references: readonly V2NarrativeReference[],
  ): Promise<readonly V2NarrativeReference[]> {
    const now = new Date().toISOString();

    this.db
      .prepare(`
        DELETE FROM v2_narrative_references
        WHERE story_world_id = ? AND source_type = ? AND source_id = ?
      `)
      .run(criteria.storyWorldId, criteria.sourceType, criteria.sourceId);

    const insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO v2_narrative_references (reference_id, story_world_id, source_type, source_id, target_type, target_id, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const ref of references) {
      insertStmt.run(
        ref.referenceId,
        ref.storyWorldId,
        ref.sourceType,
        ref.sourceId,
        ref.targetType,
        ref.targetId,
        ref.role,
        ref.createdAt ?? now,
      );
    }

    return this.listReferencesBySource(criteria);
  }
}

function toReference(row: ReferenceRow): V2NarrativeReference {
  return {
    referenceId: row.reference_id,
    storyWorldId: row.story_world_id,
    sourceType: row.source_type as any,
    sourceId: row.source_id,
    targetType: row.target_type as any,
    targetId: row.target_id,
    role: row.role as any,
    createdAt: row.created_at,
  };
}
