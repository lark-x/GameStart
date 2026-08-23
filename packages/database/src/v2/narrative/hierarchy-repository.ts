import type { DatabaseSync } from "node:sqlite";
import type { V2NarrativeOutline } from "@living-network/contracts/v2";
import type {
  V2NarrativeChapter,
  V2NarrativeQuest,
} from "@living-network/domain/v2";
import type { V2NarrativeHierarchyRepository } from "@living-network/ports/v2";

interface ChapterRow {
  readonly chapter_id: string;
  readonly story_world_id: string;
  readonly arc_id: string;
  readonly title: string;
  readonly summary: string | null;
  readonly ordinal: number;
  readonly revision: number;
  readonly created_at: string;
  readonly updated_at: string;
}

interface QuestRow {
  readonly quest_id: string;
  readonly story_world_id: string;
  readonly arc_id: string | null;
  readonly chapter_id: string | null;
  readonly title: string;
  readonly summary: string | null;
  readonly kind: string;
  readonly ordinal: number;
  readonly revision: number;
  readonly created_at: string;
  readonly updated_at: string;
}

interface ArcRow {
  readonly arc_id: string;
  readonly title: string;
  readonly summary: string | null;
}

interface SceneOutlineRow {
  readonly scene_id: string;
  readonly arc_id: string | null;
  readonly chapter_id: string | null;
  readonly quest_id: string | null;
  readonly title: string;
  readonly ordinal: number;
  readonly is_entry: number;
  readonly document_mode: string;
  readonly block_count: number;
  readonly choice_count: number;
}

export class SqliteNarrativeHierarchyRepository implements V2NarrativeHierarchyRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async listOutline(storyWorldId: string): Promise<V2NarrativeOutline> {
    const arcs = this.db
      .prepare("SELECT arc_id, title, summary FROM v2_arcs WHERE story_world_id = ? ORDER BY arc_id ASC")
      .all(storyWorldId) as unknown as readonly ArcRow[];

    const chapters = (this.db
      .prepare(
        "SELECT chapter_id, story_world_id, arc_id, title, summary, ordinal, revision, created_at, updated_at " +
        "FROM v2_narrative_chapters WHERE story_world_id = ? ORDER BY ordinal ASC, chapter_id ASC",
      )
      .all(storyWorldId) as unknown as readonly ChapterRow[]).map(toChapter);

    const quests = (this.db
      .prepare(
        "SELECT quest_id, story_world_id, arc_id, chapter_id, title, summary, kind, ordinal, revision, created_at, updated_at " +
        "FROM v2_narrative_quests WHERE story_world_id = ? ORDER BY ordinal ASC, quest_id ASC",
      )
      .all(storyWorldId) as unknown as readonly QuestRow[]).map(toQuest);

    const scenes = this.db
      .prepare(`
        SELECT
          s.scene_id,
          s.arc_id,
          s.chapter_id,
          s.quest_id,
          s.title,
          s.ordinal,
          s.is_entry,
          s.document_mode,
          COALESCE(b.block_count, 0) as block_count,
          COALESCE(c.choice_count, 0) as choice_count
        FROM v2_scenes s
        LEFT JOIN (
          SELECT scene_id, COUNT(*) as block_count
          FROM v2_scene_blocks
          WHERE story_world_id = ?
          GROUP BY scene_id
        ) b ON b.scene_id = s.scene_id
        LEFT JOIN (
          SELECT source_scene_id, COUNT(*) as choice_count
          FROM v2_choices
          WHERE story_world_id = ?
          GROUP BY source_scene_id
        ) c ON c.source_scene_id = s.scene_id
        WHERE s.story_world_id = ?
        ORDER BY s.ordinal ASC, s.scene_id ASC
      `)
      .all(storyWorldId, storyWorldId, storyWorldId) as unknown as readonly SceneOutlineRow[];

    // Load locations and participant character IDs for scenes
    const refs = this.db
      .prepare(
        "SELECT source_id, target_type, target_id, role FROM v2_narrative_references WHERE story_world_id = ? AND source_type = 'scene' ORDER BY created_at ASC, reference_id ASC",
      )
      .all(storyWorldId) as unknown as readonly { source_id: string; target_type: string; target_id: string; role: string }[];

    const sceneLocationMap = new Map<string, string>();
    const sceneParticipantsMap = new Map<string, string[]>();

    for (const ref of refs) {
      if (ref.role === "location" && ref.target_type === "location") {
        sceneLocationMap.set(ref.source_id, ref.target_id);
      } else if (ref.role === "participant" && ref.target_type === "character") {
        const list = sceneParticipantsMap.get(ref.source_id) ?? [];
        list.push(ref.target_id);
        sceneParticipantsMap.set(ref.source_id, list);
      }
    }

    const outlineScenes = scenes.map((s) => {
      const locId = sceneLocationMap.get(s.scene_id);
      const participants = sceneParticipantsMap.get(s.scene_id);
      return {
        sceneId: s.scene_id as any,
        ...(s.arc_id ? { arcId: s.arc_id as any } : {}),
        ...(s.chapter_id ? { chapterId: s.chapter_id } : {}),
        ...(s.quest_id ? { questId: s.quest_id } : {}),
        title: s.title,
        ordinal: s.ordinal,
        isEntry: s.is_entry === 1,
        documentMode: (s.document_mode === "blocks" ? "blocks" : "legacy_body") as "legacy_body" | "blocks",
        blockCount: Number(s.block_count),
        choiceCount: Number(s.choice_count),
        diagnosticCount: 0,
        ...(locId ? { locationId: locId } : {}),
        ...(participants && participants.length > 0 ? { participantCharacterIds: participants } : { participantCharacterIds: [] }),
      };
    });

    const scenesByQuest = new Map<string, typeof outlineScenes>();
    const looseScenesByChapter = new Map<string, typeof outlineScenes>();
    const looseScenesByArc = new Map<string, typeof outlineScenes>();
    const unassignedScenes: (typeof outlineScenes)[number][] = [];

    for (const scene of outlineScenes) {
      if (scene.questId) {
        const list = scenesByQuest.get(scene.questId) ?? [];
        list.push(scene);
        scenesByQuest.set(scene.questId, list);
      } else if (scene.chapterId) {
        const list = looseScenesByChapter.get(scene.chapterId) ?? [];
        list.push(scene);
        looseScenesByChapter.set(scene.chapterId, list);
      } else if (scene.arcId) {
        const list = looseScenesByArc.get(scene.arcId) ?? [];
        list.push(scene);
        looseScenesByArc.set(scene.arcId, list);
      } else {
        unassignedScenes.push(scene);
      }
    }

    const questsByChapter = new Map<string, any[]>();
    const looseQuestsByArc = new Map<string, any[]>();

    for (const quest of quests) {
      const questWithScenes = {
        questId: quest.questId,
        ...(quest.arcId ? { arcId: quest.arcId } : {}),
        ...(quest.chapterId ? { chapterId: quest.chapterId } : {}),
        title: quest.title,
        ...(quest.summary ? { summary: quest.summary } : {}),
        kind: quest.kind,
        ordinal: quest.ordinal,
        scenes: scenesByQuest.get(quest.questId) ?? [],
      };
      if (quest.chapterId) {
        const list = questsByChapter.get(quest.chapterId) ?? [];
        list.push(questWithScenes);
        questsByChapter.set(quest.chapterId, list);
      } else if (quest.arcId) {
        const list = looseQuestsByArc.get(quest.arcId) ?? [];
        list.push(questWithScenes);
        looseQuestsByArc.set(quest.arcId, list);
      }
    }

    const chaptersByArc = new Map<string, any[]>();
    for (const chapter of chapters) {
      const chapterObj = {
        chapterId: chapter.chapterId,
        title: chapter.title,
        ...(chapter.summary ? { summary: chapter.summary } : {}),
        ordinal: chapter.ordinal,
        quests: questsByChapter.get(chapter.chapterId) ?? [],
        looseScenes: looseScenesByChapter.get(chapter.chapterId) ?? [],
      };
      const list = chaptersByArc.get(chapter.arcId) ?? [];
      list.push(chapterObj);
      chaptersByArc.set(chapter.arcId, list);
    }

    const outlineArcs = arcs.map((arc) => ({
      arcId: arc.arc_id as any,
      title: arc.title,
      ...(arc.summary ? { summary: arc.summary } : {}),
      chapters: chaptersByArc.get(arc.arc_id) ?? [],
      looseQuests: looseQuestsByArc.get(arc.arc_id) ?? [],
      looseScenes: looseScenesByArc.get(arc.arc_id) ?? [],
    }));

    let worldRevision = 1;
    try {
      const worldRow = this.db
        .prepare("SELECT revision FROM v2_story_worlds WHERE story_world_id = ?")
        .get(storyWorldId) as { revision: number } | undefined;
      if (worldRow?.revision !== undefined) {
        worldRevision = worldRow.revision;
      }
    } catch {
      worldRevision = 1;
    }

    return {
      storyWorldId: storyWorldId as any,
      worldRevision: worldRevision as any,
      arcs: outlineArcs,
      unassignedScenes,
    };
  }

  public async getChapter(criteria: { readonly storyWorldId: string; readonly chapterId: string }): Promise<V2NarrativeChapter | undefined> {
    const row = this.db
      .prepare(
        "SELECT chapter_id, story_world_id, arc_id, title, summary, ordinal, revision, created_at, updated_at " +
        "FROM v2_narrative_chapters WHERE story_world_id = ? AND chapter_id = ?",
      )
      .get(criteria.storyWorldId, criteria.chapterId) as ChapterRow | undefined;
    return row ? toChapter(row) : undefined;
  }

  public async listChapters(storyWorldId: string, arcId?: string): Promise<readonly V2NarrativeChapter[]> {
    const sql = arcId
      ? "SELECT chapter_id, story_world_id, arc_id, title, summary, ordinal, revision, created_at, updated_at FROM v2_narrative_chapters WHERE story_world_id = ? AND arc_id = ? ORDER BY ordinal ASC"
      : "SELECT chapter_id, story_world_id, arc_id, title, summary, ordinal, revision, created_at, updated_at FROM v2_narrative_chapters WHERE story_world_id = ? ORDER BY ordinal ASC";
    const rows = (arcId
      ? this.db.prepare(sql).all(storyWorldId, arcId)
      : this.db.prepare(sql).all(storyWorldId)) as unknown as readonly ChapterRow[];
    return rows.map(toChapter);
  }

  public async createChapter(chapter: V2NarrativeChapter): Promise<V2NarrativeChapter> {
    const now = new Date().toISOString();
    this.db
      .prepare(`
        INSERT INTO v2_narrative_chapters (chapter_id, story_world_id, arc_id, title, summary, ordinal, revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        chapter.chapterId,
        chapter.storyWorldId,
        chapter.arcId,
        chapter.title,
        chapter.summary ?? null,
        chapter.ordinal,
        chapter.revision,
        chapter.createdAt ?? now,
        chapter.updatedAt ?? now,
      );
    return (await this.getChapter({ storyWorldId: chapter.storyWorldId, chapterId: chapter.chapterId }))!;
  }

  public async updateChapter(chapter: V2NarrativeChapter): Promise<V2NarrativeChapter> {
    const now = new Date().toISOString();
    this.db
      .prepare(`
        UPDATE v2_narrative_chapters
        SET arc_id = ?, title = ?, summary = ?, ordinal = ?, revision = ?, updated_at = ?
        WHERE story_world_id = ? AND chapter_id = ?
      `)
      .run(
        chapter.arcId,
        chapter.title,
        chapter.summary ?? null,
        chapter.ordinal,
        chapter.revision,
        chapter.updatedAt ?? now,
        chapter.storyWorldId,
        chapter.chapterId,
      );
    return (await this.getChapter({ storyWorldId: chapter.storyWorldId, chapterId: chapter.chapterId }))!;
  }

  public async deleteChapter(criteria: { readonly storyWorldId: string; readonly chapterId: string }): Promise<void> {
    this.db
      .prepare("DELETE FROM v2_narrative_chapters WHERE story_world_id = ? AND chapter_id = ?")
      .run(criteria.storyWorldId, criteria.chapterId);
  }

  public async countQuestsByChapter(criteria: { readonly storyWorldId: string; readonly chapterId: string }): Promise<number> {
    const row = this.db
      .prepare("SELECT COUNT(*) as cnt FROM v2_narrative_quests WHERE story_world_id = ? AND chapter_id = ?")
      .get(criteria.storyWorldId, criteria.chapterId) as { cnt: number } | undefined;
    return Number(row?.cnt ?? 0);
  }

  public async countScenesByChapter(criteria: { readonly storyWorldId: string; readonly chapterId: string }): Promise<number> {
    const row = this.db
      .prepare("SELECT COUNT(*) as cnt FROM v2_scenes WHERE story_world_id = ? AND chapter_id = ?")
      .get(criteria.storyWorldId, criteria.chapterId) as { cnt: number } | undefined;
    return Number(row?.cnt ?? 0);
  }

  public async getQuest(criteria: { readonly storyWorldId: string; readonly questId: string }): Promise<V2NarrativeQuest | undefined> {
    const row = this.db
      .prepare(
        "SELECT quest_id, story_world_id, arc_id, chapter_id, title, summary, kind, ordinal, revision, created_at, updated_at " +
        "FROM v2_narrative_quests WHERE story_world_id = ? AND quest_id = ?",
      )
      .get(criteria.storyWorldId, criteria.questId) as QuestRow | undefined;
    return row ? toQuest(row) : undefined;
  }

  public async listQuests(storyWorldId: string, criteria?: { readonly arcId?: string; readonly chapterId?: string }): Promise<readonly V2NarrativeQuest[]> {
    let sql = "SELECT quest_id, story_world_id, arc_id, chapter_id, title, summary, kind, ordinal, revision, created_at, updated_at FROM v2_narrative_quests WHERE story_world_id = ?";
    const params: (string | number)[] = [storyWorldId];
    if (criteria?.chapterId) {
      sql += " AND chapter_id = ?";
      params.push(criteria.chapterId);
    } else if (criteria?.arcId) {
      sql += " AND arc_id = ?";
      params.push(criteria.arcId);
    }
    sql += " ORDER BY ordinal ASC";
    const rows = this.db.prepare(sql).all(...params) as unknown as readonly QuestRow[];
    return rows.map(toQuest);
  }

  public async createQuest(quest: V2NarrativeQuest): Promise<V2NarrativeQuest> {
    const now = new Date().toISOString();
    this.db
      .prepare(`
        INSERT INTO v2_narrative_quests (quest_id, story_world_id, arc_id, chapter_id, title, summary, kind, ordinal, revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        quest.questId,
        quest.storyWorldId,
        quest.arcId ?? null,
        quest.chapterId ?? null,
        quest.title,
        quest.summary ?? null,
        quest.kind,
        quest.ordinal,
        quest.revision,
        quest.createdAt ?? now,
        quest.updatedAt ?? now,
      );
    return (await this.getQuest({ storyWorldId: quest.storyWorldId, questId: quest.questId }))!;
  }

  public async updateQuest(quest: V2NarrativeQuest): Promise<V2NarrativeQuest> {
    const now = new Date().toISOString();
    this.db
      .prepare(`
        UPDATE v2_narrative_quests
        SET arc_id = ?, chapter_id = ?, title = ?, summary = ?, kind = ?, ordinal = ?, revision = ?, updated_at = ?
        WHERE story_world_id = ? AND quest_id = ?
      `)
      .run(
        quest.arcId ?? null,
        quest.chapterId ?? null,
        quest.title,
        quest.summary ?? null,
        quest.kind,
        quest.ordinal,
        quest.revision,
        quest.updatedAt ?? now,
        quest.storyWorldId,
        quest.questId,
      );
    return (await this.getQuest({ storyWorldId: quest.storyWorldId, questId: quest.questId }))!;
  }

  public async deleteQuest(criteria: { readonly storyWorldId: string; readonly questId: string }): Promise<void> {
    this.db
      .prepare("DELETE FROM v2_narrative_quests WHERE story_world_id = ? AND quest_id = ?")
      .run(criteria.storyWorldId, criteria.questId);
  }

  public async countScenesByQuest(criteria: { readonly storyWorldId: string; readonly questId: string }): Promise<number> {
    const row = this.db
      .prepare("SELECT COUNT(*) as cnt FROM v2_scenes WHERE story_world_id = ? AND quest_id = ?")
      .get(criteria.storyWorldId, criteria.questId) as { cnt: number } | undefined;
    return Number(row?.cnt ?? 0);
  }
}

function toChapter(row: ChapterRow): V2NarrativeChapter {
  return {
    chapterId: row.chapter_id,
    storyWorldId: row.story_world_id,
    arcId: row.arc_id,
    title: row.title,
    ...(row.summary ? { summary: row.summary } : {}),
    ordinal: Number(row.ordinal),
    revision: Number(row.revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toQuest(row: QuestRow): V2NarrativeQuest {
  return {
    questId: row.quest_id,
    storyWorldId: row.story_world_id,
    ...(row.arc_id ? { arcId: row.arc_id } : {}),
    ...(row.chapter_id ? { chapterId: row.chapter_id } : {}),
    title: row.title,
    ...(row.summary ? { summary: row.summary } : {}),
    kind: row.kind as any,
    ordinal: Number(row.ordinal),
    revision: Number(row.revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
