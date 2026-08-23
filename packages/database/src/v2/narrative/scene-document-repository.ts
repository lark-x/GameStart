import type { DatabaseSync } from "node:sqlite";
import type {
  V2NarrativeScene,
  V2SceneBlock,
} from "@living-network/domain/v2";
import type {
  V2SceneDocumentAndBlocks,
  V2SceneDocumentRepository,
} from "@living-network/ports/v2";

interface SceneRow {
  readonly scene_id: string;
  readonly story_world_id: string;
  readonly arc_id: string | null;
  readonly chapter_id: string | null;
  readonly quest_id: string | null;
  readonly title: string;
  readonly body: string | null;
  readonly is_entry: number;
  readonly ordinal: number;
  readonly revision: number;
  readonly document_mode: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface BlockRow {
  readonly block_id: string;
  readonly story_world_id: string;
  readonly scene_id: string;
  readonly ordinal: number;
  readonly kind: string;
  readonly speaker_character_id: string | null;
  readonly text: string | null;
  readonly payload_json: string;
  readonly revision: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export class SqliteSceneDocumentRepository implements V2SceneDocumentRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async getSceneDocument(criteria: {
    readonly storyWorldId: string;
    readonly sceneId: string;
  }): Promise<V2SceneDocumentAndBlocks | undefined> {
    const sceneRow = this.db
      .prepare(`
        SELECT scene_id, story_world_id, arc_id, chapter_id, quest_id, title, body, is_entry,
               COALESCE(ordinal, 0) as ordinal, COALESCE(revision, 1) as revision,
               COALESCE(document_mode, 'legacy_body') as document_mode, created_at,
               COALESCE(updated_at, created_at) as updated_at
        FROM v2_scenes
        WHERE story_world_id = ? AND scene_id = ?
      `)
      .get(criteria.storyWorldId, criteria.sceneId) as SceneRow | undefined;

    if (!sceneRow) return undefined;

    const blockRows = this.db
      .prepare(`
        SELECT block_id, story_world_id, scene_id, ordinal, kind, speaker_character_id, text,
               payload_json, revision, created_at, updated_at
        FROM v2_scene_blocks
        WHERE story_world_id = ? AND scene_id = ?
        ORDER BY ordinal ASC, block_id ASC
      `)
      .all(criteria.storyWorldId, criteria.sceneId) as unknown as readonly BlockRow[];

    return {
      scene: toScene(sceneRow),
      blocks: blockRows.map(toBlock),
    };
  }

  public async saveSceneDocument(document: {
    readonly scene: V2NarrativeScene;
    readonly blocks: readonly V2SceneBlock[];
  }): Promise<V2SceneDocumentAndBlocks> {
    const now = new Date().toISOString();
    const { scene, blocks } = document;

    this.db
      .prepare(`
        UPDATE v2_scenes
        SET arc_id = ?, chapter_id = ?, quest_id = ?, title = ?, body = ?, is_entry = ?,
            ordinal = ?, revision = ?, document_mode = ?, updated_at = ?
        WHERE story_world_id = ? AND scene_id = ?
      `)
      .run(
        scene.arcId ?? null,
        scene.chapterId ?? null,
        scene.questId ?? null,
        scene.title,
        scene.body ?? null,
        scene.isEntry ? 1 : 0,
        scene.ordinal,
        scene.revision,
        scene.documentMode,
        scene.updatedAt ?? now,
        scene.storyWorldId,
        scene.sceneId,
      );

    // Replace blocks atomically
    this.db
      .prepare("DELETE FROM v2_scene_blocks WHERE story_world_id = ? AND scene_id = ?")
      .run(scene.storyWorldId, scene.sceneId);

    const insertBlock = this.db.prepare(`
      INSERT INTO v2_scene_blocks (block_id, story_world_id, scene_id, ordinal, kind, speaker_character_id, text, payload_json, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]!;
      insertBlock.run(
        b.blockId,
        b.storyWorldId,
        b.sceneId,
        b.ordinal !== undefined ? b.ordinal : i,
        b.kind,
        b.speakerCharacterId ?? null,
        b.text ?? null,
        JSON.stringify(b.payload ?? {}),
        b.revision ?? 1,
        b.createdAt ?? now,
        b.updatedAt ?? now,
      );
    }

    return (await this.getSceneDocument({
      storyWorldId: scene.storyWorldId,
      sceneId: scene.sceneId,
    }))!;
  }

  public async listSceneBlocks(criteria: {
    readonly storyWorldId: string;
    readonly sceneId: string;
  }): Promise<readonly V2SceneBlock[]> {
    const rows = this.db
      .prepare(`
        SELECT block_id, story_world_id, scene_id, ordinal, kind, speaker_character_id, text,
               payload_json, revision, created_at, updated_at
        FROM v2_scene_blocks
        WHERE story_world_id = ? AND scene_id = ?
        ORDER BY ordinal ASC, block_id ASC
      `)
      .all(criteria.storyWorldId, criteria.sceneId) as unknown as readonly BlockRow[];
    return rows.map(toBlock);
  }

  public async listAllSceneBlocks(storyWorldId: string): Promise<readonly V2SceneBlock[]> {
    const rows = this.db
      .prepare(`
        SELECT block_id, story_world_id, scene_id, ordinal, kind, speaker_character_id, text,
               payload_json, revision, created_at, updated_at
        FROM v2_scene_blocks
        WHERE story_world_id = ?
        ORDER BY scene_id ASC, ordinal ASC, block_id ASC
      `)
      .all(storyWorldId) as unknown as readonly BlockRow[];
    return rows.map(toBlock);
  }

  public async listAllScenes(storyWorldId: string): Promise<readonly V2NarrativeScene[]> {
    const rows = this.db
      .prepare(`
        SELECT scene_id, story_world_id, arc_id, chapter_id, quest_id, title, body, is_entry,
               COALESCE(ordinal, 0) as ordinal, COALESCE(revision, 1) as revision,
               COALESCE(document_mode, 'legacy_body') as document_mode, created_at,
               COALESCE(updated_at, created_at) as updated_at
        FROM v2_scenes
        WHERE story_world_id = ?
        ORDER BY COALESCE(ordinal, 0) ASC, scene_id ASC
      `)
      .all(storyWorldId) as unknown as readonly SceneRow[];
    return rows.map(toScene);
  }
}

function toScene(row: SceneRow): V2NarrativeScene {
  return {
    sceneId: row.scene_id,
    storyWorldId: row.story_world_id,
    ...(row.arc_id ? { arcId: row.arc_id } : {}),
    ...(row.chapter_id ? { chapterId: row.chapter_id } : {}),
    ...(row.quest_id ? { questId: row.quest_id } : {}),
    title: row.title,
    ...(row.body ? { body: row.body } : {}),
    isEntry: row.is_entry === 1,
    ordinal: Number(row.ordinal),
    revision: Number(row.revision),
    documentMode: (row.document_mode === "blocks" ? "blocks" : "legacy_body") as "legacy_body" | "blocks",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toBlock(row: BlockRow): V2SceneBlock {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(row.payload_json);
  } catch {
    payload = {};
  }
  return {
    blockId: row.block_id,
    storyWorldId: row.story_world_id,
    sceneId: row.scene_id,
    ordinal: Number(row.ordinal),
    kind: row.kind as any,
    ...(row.speaker_character_id ? { speakerCharacterId: row.speaker_character_id } : {}),
    ...(row.text !== null ? { text: row.text } : {}),
    payload,
    revision: Number(row.revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
