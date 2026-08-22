import type {
  V2CharacterId,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2MediaId,
} from "../shared/index.ts";

export type V2MomentId = string & { readonly __brand: "V2MomentId" };
export type V2MomentCommentId = string & { readonly __brand: "V2MomentCommentId" };

export interface V2MomentCommentDto {
  readonly commentId: V2MomentCommentId;
  readonly momentId: V2MomentId;
  readonly authorType: "user" | "character";
  readonly authorId?: V2CharacterId;
  readonly authorName: string;
  readonly content: string;
  readonly createdAt: V2IsoDateTime;
  readonly replyToCommentId?: V2MomentCommentId;
}

export interface V2CompanionMomentDto {
  readonly momentId: V2MomentId;
  readonly characterId: V2CharacterId;
  readonly characterName: string;
  readonly content: string;
  readonly mediaRef?: string;
  readonly mediaId?: V2MediaId;
  readonly likesCount: number;
  readonly isLiked: boolean;
  readonly commentsCount: number;
  readonly createdAt: V2IsoDateTime;
  readonly comments: readonly V2MomentCommentDto[];
}

export interface V2CompanionEmotionVAD {
  readonly valence: number;
  readonly arousal: number;
  readonly dominance: number;
  readonly moodLabel: string;
}

export interface V2CompanionAffinityDto {
  readonly characterId: V2CharacterId;
  readonly level: number;
  readonly levelTitle: string;
  readonly currentExp: number;
  readonly maxExp: number;
  readonly interactionCount: number;
  readonly emotion: V2CompanionEmotionVAD;
}

export interface V2DailyRoutineItem {
  readonly timeSlot: string;
  readonly startHour: number;
  readonly endHour: number;
  readonly activityName: string;
  readonly locationName: string;
  readonly description: string;
}

export interface V2CompanionScheduleDto {
  readonly characterId: V2CharacterId;
  readonly currentActivity: V2DailyRoutineItem;
  readonly routines: readonly V2DailyRoutineItem[];
}

export interface V2CompanionGalleryItemDto {
  readonly mediaId: V2MediaId;
  readonly mediaRef: string;
  readonly characterId: V2CharacterId;
  readonly characterName: string;
  readonly title: string;
  readonly source: "chat" | "moment";
  readonly createdAt: V2IsoDateTime;
}

export interface V2CreateMomentRequest {
  readonly characterId: V2CharacterId;
  readonly topic?: string;
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2CreateMomentResponse {
  readonly moment: V2CompanionMomentDto;
}

export interface V2ListMomentsResponse {
  readonly moments: readonly V2CompanionMomentDto[];
}

export interface V2LikeMomentResponse {
  readonly momentId: V2MomentId;
  readonly isLiked: boolean;
  readonly likesCount: number;
}

export interface V2CreateCommentRequest {
  readonly content: string;
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2CreateCommentResponse {
  readonly userComment: V2MomentCommentDto;
  readonly characterReply?: V2MomentCommentDto;
  readonly updatedAffinity?: V2CompanionAffinityDto;
}

export interface V2CompanionRosterResponse {
  readonly characters: readonly {
    readonly characterId: V2CharacterId;
    readonly name: string;
    readonly summary?: string;
    readonly affinity: V2CompanionAffinityDto;
    readonly schedule: V2CompanionScheduleDto;
    readonly latestMomentPreview?: string;
  }[];
}

export interface V2CompanionGalleryResponse {
  readonly gallery: readonly V2CompanionGalleryItemDto[];
}
