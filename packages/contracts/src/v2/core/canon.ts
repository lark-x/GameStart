import type {
  V2CharacterId,
  V2IdempotencyKey,
  V2LocationId,
  V2Revision,
  V2StoryWorldId,
} from "../shared/index.ts";

export type V2FactVisibility = "creator_only" | "player_visible";
export type V2RuleSeverity = "guideline" | "required";

export interface V2StoryWorldDto {
  readonly storyWorldId: V2StoryWorldId;
  readonly name: string;
  readonly summary?: string;
  readonly revision: V2Revision;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface V2LocationDto {
  readonly locationId: V2LocationId;
  readonly storyWorldId: V2StoryWorldId;
  readonly name: string;
  readonly summary?: string;
  readonly createdAt: string;
}

export interface V2CharacterDto {
  readonly characterId: V2CharacterId;
  readonly storyWorldId: V2StoryWorldId;
  readonly name: string;
  readonly summary?: string;
  readonly personaText?: string;
  readonly homeLocationId?: V2LocationId;
  readonly createdAt: string;
}

export interface V2FactDto {
  readonly factId: string;
  readonly storyWorldId: V2StoryWorldId;
  readonly text: string;
  readonly visibility: V2FactVisibility;
  readonly createdAt: string;
}

export interface V2RuleDto {
  readonly ruleId: string;
  readonly storyWorldId: V2StoryWorldId;
  readonly text: string;
  readonly severity: V2RuleSeverity;
  readonly createdAt: string;
}

export interface V2TimelineEventDto {
  readonly timelineEventId: string;
  readonly storyWorldId: V2StoryWorldId;
  readonly localDate: string;
  readonly title: string;
  readonly summary?: string;
  readonly createdAt: string;
}

export interface V2CanonSnapshotDto {
  readonly world: V2StoryWorldDto;
  readonly locations: readonly V2LocationDto[];
  readonly characters: readonly V2CharacterDto[];
  readonly facts: readonly V2FactDto[];
  readonly rules: readonly V2RuleDto[];
  readonly timelineEvents: readonly V2TimelineEventDto[];
}

export interface V2CreateStoryWorldRequest {
  readonly storyWorldId: V2StoryWorldId;
  readonly name: string;
  readonly summary?: string;
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2RevisionedCommandRequest {
  readonly expectedRevision: V2Revision;
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2CreateLocationRequest extends V2RevisionedCommandRequest {
  readonly locationId: V2LocationId;
  readonly name: string;
  readonly summary?: string;
}

export interface V2CreateCharacterRequest extends V2RevisionedCommandRequest {
  readonly characterId: V2CharacterId;
  readonly name: string;
  readonly summary?: string;
  readonly homeLocationId?: V2LocationId | null;
  readonly personaText?: string;
}

export interface V2CreateFactRequest extends V2RevisionedCommandRequest {
  readonly factId: string;
  readonly text: string;
  readonly visibility: V2FactVisibility;
}

export interface V2CreateRuleRequest extends V2RevisionedCommandRequest {
  readonly ruleId: string;
  readonly text: string;
  readonly severity: V2RuleSeverity;
}

export interface V2CreateTimelineEventRequest extends V2RevisionedCommandRequest {
  readonly timelineEventId: string;
  readonly localDate: string;
  readonly title: string;
  readonly summary?: string;
}

export interface V2CanonWriteResponse<T> {
  readonly item: T;
  readonly revision: V2Revision;
}
export interface V2UpdateStoryWorldRequest extends V2RevisionedCommandRequest {
  readonly name: string;
  readonly summary?: string;
}

export interface V2UpdateLocationRequest extends V2RevisionedCommandRequest {
  readonly name: string;
  readonly summary?: string;
}

export interface V2UpdateCharacterRequest extends V2RevisionedCommandRequest {
  readonly name: string;
  readonly summary?: string;
  readonly homeLocationId?: V2LocationId | null;
  readonly personaText?: string;
}

export interface V2UpdateFactRequest extends V2RevisionedCommandRequest {
  readonly text: string;
  readonly visibility: V2FactVisibility;
}

export interface V2UpdateRuleRequest extends V2RevisionedCommandRequest {
  readonly text: string;
  readonly severity: V2RuleSeverity;
}

export interface V2UpdateTimelineEventRequest extends V2RevisionedCommandRequest {
  readonly localDate: string;
  readonly title: string;
  readonly summary?: string;
}
