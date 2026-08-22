import type { DatabaseSync } from "node:sqlite";
import type {
  V2CharacterId,
  V2CompanionAffinityDto,
  V2CompanionGalleryItemDto,
  V2CompanionMomentDto,
  V2CompanionScheduleDto,
  V2DailyRoutineItem,
  V2IsoDateTime,
  V2MediaId,
  V2MomentCommentDto,
  V2MomentCommentId,
  V2MomentId,
} from "@living-network/contracts/v2";
import {
  applyAffinityGain,
  calculateMaxExpForLevel,
  computeMoodLabel,
  generateDefaultRoutines,
  getAffinityTitle,
  getCurrentRoutine,
} from "@living-network/domain/v2";

export class V2CompanionRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  listMoments(limit = 50): readonly V2CompanionMomentDto[] {
    const momentRows = this.db
      .prepare(
        `SELECT moment_id, character_id, character_name, content, media_ref, media_id,
                likes_count, is_liked, comments_count, created_at
         FROM v2_companion_moments
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(limit) as {
        moment_id: string;
        character_id: string;
        character_name: string;
        content: string;
        media_ref: string | null;
        media_id: string | null;
        likes_count: number;
        is_liked: number;
        comments_count: number;
        created_at: string;
      }[];

    const commentStmt = this.db.prepare(
      `SELECT comment_id, moment_id, author_type, author_id, author_name, content, reply_to_comment_id, created_at
       FROM v2_companion_comments
       WHERE moment_id = ?
       ORDER BY created_at ASC`,
    );

    return momentRows.map((row) => {
      const comments = (commentStmt.all(row.moment_id) as {
        comment_id: string;
        moment_id: string;
        author_type: "user" | "character";
        author_id: string | null;
        author_name: string;
        content: string;
        reply_to_comment_id: string | null;
        created_at: string;
      }[]).map((c) => ({
        commentId: c.comment_id as V2MomentCommentId,
        momentId: c.moment_id as V2MomentId,
        authorType: c.author_type,
        ...(c.author_id ? { authorId: c.author_id as V2CharacterId } : {}),
        authorName: c.author_name,
        content: c.content,
        createdAt: c.created_at as V2IsoDateTime,
        ...(c.reply_to_comment_id ? { replyToCommentId: c.reply_to_comment_id as V2MomentCommentId } : {}),
      }));

      return {
        momentId: row.moment_id as V2MomentId,
        characterId: row.character_id as V2CharacterId,
        characterName: row.character_name,
        content: row.content,
        ...(row.media_ref ? { mediaRef: row.media_ref } : {}),
        ...(row.media_id ? { mediaId: row.media_id as V2MediaId } : {}),
        likesCount: row.likes_count,
        isLiked: Boolean(row.is_liked),
        commentsCount: comments.length,
        createdAt: row.created_at as V2IsoDateTime,
        comments,
      };
    });
  }

  getMoment(momentId: V2MomentId): V2CompanionMomentDto | null {
    const row = this.db
      .prepare(
        `SELECT moment_id, character_id, character_name, content, media_ref, media_id,
                likes_count, is_liked, comments_count, created_at
         FROM v2_companion_moments
         WHERE moment_id = ?`,
      )
      .get(momentId) as {
        moment_id: string;
        character_id: string;
        character_name: string;
        content: string;
        media_ref: string | null;
        media_id: string | null;
        likes_count: number;
        is_liked: number;
        comments_count: number;
        created_at: string;
      } | undefined;

    if (!row) return null;

    const comments = (this.db
      .prepare(
        `SELECT comment_id, moment_id, author_type, author_id, author_name, content, reply_to_comment_id, created_at
         FROM v2_companion_comments
         WHERE moment_id = ?
         ORDER BY created_at ASC`,
      )
      .all(momentId) as {
        comment_id: string;
        moment_id: string;
        author_type: "user" | "character";
        author_id: string | null;
        author_name: string;
        content: string;
        reply_to_comment_id: string | null;
        created_at: string;
      }[]).map((c) => ({
      commentId: c.comment_id as V2MomentCommentId,
      momentId: c.moment_id as V2MomentId,
      authorType: c.author_type,
      ...(c.author_id ? { authorId: c.author_id as V2CharacterId } : {}),
      authorName: c.author_name,
      content: c.content,
      createdAt: c.created_at as V2IsoDateTime,
      ...(c.reply_to_comment_id ? { replyToCommentId: c.reply_to_comment_id as V2MomentCommentId } : {}),
    }));

    return {
      momentId: row.moment_id as V2MomentId,
      characterId: row.character_id as V2CharacterId,
      characterName: row.character_name,
      content: row.content,
      ...(row.media_ref ? { mediaRef: row.media_ref } : {}),
      ...(row.media_id ? { mediaId: row.media_id as V2MediaId } : {}),
      likesCount: row.likes_count,
      isLiked: Boolean(row.is_liked),
      commentsCount: comments.length,
      createdAt: row.created_at as V2IsoDateTime,
      comments,
    };
  }

  createMoment(params: {
    readonly momentId: V2MomentId;
    readonly characterId: V2CharacterId;
    readonly characterName: string;
    readonly content: string;
    readonly mediaRef?: string;
    readonly mediaId?: V2MediaId;
    readonly createdAt: V2IsoDateTime;
  }): V2CompanionMomentDto {
    this.db
      .prepare(
        `INSERT INTO v2_companion_moments (moment_id, character_id, character_name, content, media_ref, media_id, likes_count, is_liked, comments_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?)`,
      )
      .run(
        params.momentId,
        params.characterId,
        params.characterName,
        params.content,
        params.mediaRef ?? null,
        params.mediaId ?? null,
        params.createdAt,
      );

    return {
      momentId: params.momentId,
      characterId: params.characterId,
      characterName: params.characterName,
      content: params.content,
      ...(params.mediaRef ? { mediaRef: params.mediaRef } : {}),
      ...(params.mediaId ? { mediaId: params.mediaId } : {}),
      likesCount: 0,
      isLiked: false,
      commentsCount: 0,
      createdAt: params.createdAt,
      comments: [],
    };
  }

  toggleLikeMoment(momentId: V2MomentId): { isLiked: boolean; likesCount: number } {
    const row = this.db
      .prepare(`SELECT is_liked, likes_count FROM v2_companion_moments WHERE moment_id = ?`)
      .get(momentId) as { is_liked: number; likes_count: number } | undefined;

    if (!row) {
      throw new Error(`Moment ${momentId} not found`);
    }

    const nextIsLiked = row.is_liked ? 0 : 1;
    const nextCount = nextIsLiked ? row.likes_count + 1 : Math.max(0, row.likes_count - 1);

    this.db
      .prepare(`UPDATE v2_companion_moments SET is_liked = ?, likes_count = ? WHERE moment_id = ?`)
      .run(nextIsLiked, nextCount, momentId);

    return { isLiked: Boolean(nextIsLiked), likesCount: nextCount };
  }

  addComment(params: {
    readonly commentId: V2MomentCommentId;
    readonly momentId: V2MomentId;
    readonly authorType: "user" | "character";
    readonly authorId?: V2CharacterId;
    readonly authorName: string;
    readonly content: string;
    readonly replyToCommentId?: V2MomentCommentId;
    readonly createdAt: V2IsoDateTime;
  }): V2MomentCommentDto {
    this.db
      .prepare(
        `INSERT INTO v2_companion_comments (comment_id, moment_id, author_type, author_id, author_name, content, reply_to_comment_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.commentId,
        params.momentId,
        params.authorType,
        params.authorId ?? null,
        params.authorName,
        params.content,
        params.replyToCommentId ?? null,
        params.createdAt,
      );

    this.db
      .prepare(`UPDATE v2_companion_moments SET comments_count = comments_count + 1 WHERE moment_id = ?`)
      .run(params.momentId);

    return {
      commentId: params.commentId,
      momentId: params.momentId,
      authorType: params.authorType,
      ...(params.authorId ? { authorId: params.authorId } : {}),
      authorName: params.authorName,
      content: params.content,
      createdAt: params.createdAt,
      ...(params.replyToCommentId ? { replyToCommentId: params.replyToCommentId } : {}),
    };
  }

  getAffinityAndSchedule(
    characterId: V2CharacterId,
    characterName: string,
  ): { affinity: V2CompanionAffinityDto; schedule: V2CompanionScheduleDto } {
    let row = this.db
      .prepare(
        `SELECT character_id, level, current_exp, interaction_count, valence, arousal, dominance, routines_json
         FROM v2_companion_affinity_schedule
         WHERE character_id = ?`,
      )
      .get(characterId) as {
        character_id: string;
        level: number;
        current_exp: number;
        interaction_count: number;
        valence: number;
        arousal: number;
        dominance: number;
        routines_json: string;
      } | undefined;

    if (!row) {
      const defaultRoutines = generateDefaultRoutines(characterName);
      const nowIso = new Date().toISOString();
      this.db
        .prepare(
          `INSERT INTO v2_companion_affinity_schedule (character_id, level, current_exp, interaction_count, valence, arousal, dominance, routines_json, updated_at)
           VALUES (?, 1, 0, 0, 0.4, 0.2, 0.1, ?, ?)`,
        )
        .run(characterId, JSON.stringify(defaultRoutines), nowIso);

      row = {
        character_id: characterId,
        level: 1,
        current_exp: 0,
        interaction_count: 0,
        valence: 0.4,
        arousal: 0.2,
        dominance: 0.1,
        routines_json: JSON.stringify(defaultRoutines),
      };
    }

    const routines = JSON.parse(row.routines_json) as V2DailyRoutineItem[];
    const currentActivity = getCurrentRoutine(routines);

    return {
      affinity: {
        characterId,
        level: row.level,
        levelTitle: getAffinityTitle(row.level),
        currentExp: row.current_exp,
        maxExp: calculateMaxExpForLevel(row.level),
        interactionCount: row.interaction_count,
        emotion: {
          valence: row.valence,
          arousal: row.arousal,
          dominance: row.dominance,
          moodLabel: computeMoodLabel(row.valence, row.arousal, row.dominance),
        },
      },
      schedule: {
        characterId,
        currentActivity,
        routines,
      },
    };
  }

  updateAffinityAndEmotion(
    characterId: V2CharacterId,
    characterName: string,
    patch: {
      readonly expGained?: number;
      readonly valenceDelta?: number;
      readonly arousalDelta?: number;
      readonly dominanceDelta?: number;
    },
  ): V2CompanionAffinityDto {
    const current = this.getAffinityAndSchedule(characterId, characterName).affinity;

    const expProgress = applyAffinityGain(current.level, current.currentExp, patch.expGained ?? 0);
    const nextValence = Math.max(-1, Math.min(1, current.emotion.valence + (patch.valenceDelta ?? 0)));
    const nextArousal = Math.max(-1, Math.min(1, current.emotion.arousal + (patch.arousalDelta ?? 0)));
    const nextDominance = Math.max(-1, Math.min(1, current.emotion.dominance + (patch.dominanceDelta ?? 0)));
    const nextInteraction = current.interactionCount + (patch.expGained ? 1 : 0);

    const nowIso = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE v2_companion_affinity_schedule
         SET level = ?, current_exp = ?, interaction_count = ?, valence = ?, arousal = ?, dominance = ?, updated_at = ?
         WHERE character_id = ?`,
      )
      .run(
        expProgress.level,
        expProgress.currentExp,
        nextInteraction,
        nextValence,
        nextArousal,
        nextDominance,
        nowIso,
        characterId,
      );

    return {
      characterId,
      level: expProgress.level,
      levelTitle: getAffinityTitle(expProgress.level),
      currentExp: expProgress.currentExp,
      maxExp: expProgress.maxExp,
      interactionCount: nextInteraction,
      emotion: {
        valence: nextValence,
        arousal: nextArousal,
        dominance: nextDominance,
        moodLabel: computeMoodLabel(nextValence, nextArousal, nextDominance),
      },
    };
  }

  listGallery(characterId?: V2CharacterId): readonly V2CompanionGalleryItemDto[] {
    const moments = this.db
      .prepare(
        `SELECT media_id, media_ref, character_id, character_name, content, created_at
         FROM v2_companion_moments
         WHERE media_id IS NOT NULL AND media_ref IS NOT NULL
         ${characterId ? "AND character_id = ?" : ""}
         ORDER BY created_at DESC`,
      )
      .all(...(characterId ? [characterId] : [])) as {
        media_id: string;
        media_ref: string;
        character_id: string;
        character_name: string;
        content: string;
        created_at: string;
      }[];

    return moments.map((m) => ({
      mediaId: m.media_id as V2MediaId,
      mediaRef: m.media_ref,
      characterId: m.character_id as V2CharacterId,
      characterName: m.character_name,
      title: m.content.slice(0, 30),
      source: "moment",
      createdAt: m.created_at as V2IsoDateTime,
    }));
  }
}
