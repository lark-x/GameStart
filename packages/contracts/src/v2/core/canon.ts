import type {
  V2CharacterId,
  V2CharacterRelationshipId,
  V2CharacterVisualVariantId,
  V2CharacterStateDefinitionId,
  V2CharacterEventDefinitionId,
  V2CharacterContextTraceId,
  V2CharacterCandidateId,
  V2IdempotencyKey,
  V2LocationId,
  V2Revision,
  V2StoryWorldId,
} from "../shared/index.ts";

export type V2FactVisibility = "creator_only" | "player_visible";
export type V2RuleSeverity = "guideline" | "required";
export type V2CharacterRelationshipType = "friend" | "family" | "romantic" | "enemy" | "mentor" | "student" | "colleague" | "rival" | "unknown" | "custom";
export type V2CharacterRelationshipVisibility = "creator_only" | "player_visible";
export type V2CharacterStateValueType = "string" | "number" | "boolean";

export interface V2CharacterPersonaDto {
  readonly traits: readonly string[];
  readonly behaviorPatterns: readonly string[];
  readonly speechStyle?: string;
  readonly values: readonly string[];
  readonly taboos: readonly string[];
  readonly backgroundStory?: string;
  readonly advancedPrompt?: string;
}

export interface V2CharacterProfileDto {
  readonly aliases: readonly string[];
  readonly identity?: string;
  readonly tags: readonly string[];
  readonly persona: V2CharacterPersonaDto;
}

export type V2CharacterProfileInput = Partial<{
  readonly aliases: readonly string[];
  readonly identity: string | null;
  readonly tags: readonly string[];
  readonly persona: Partial<{
    readonly traits: readonly string[];
    readonly behaviorPatterns: readonly string[];
    readonly speechStyle: string | null;
    readonly values: readonly string[];
    readonly taboos: readonly string[];
    readonly backgroundStory: string | null;
    readonly advancedPrompt: string | null;
  }>;
}>;

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
  readonly profile: V2CharacterProfileDto;
  readonly homeLocationId?: V2LocationId;
  readonly createdAt: string;
}

export interface V2CharacterRelationshipDto {
  readonly relationshipId: V2CharacterRelationshipId;
  readonly storyWorldId: V2StoryWorldId;
  readonly fromCharacterId: V2CharacterId;
  readonly toCharacterId: V2CharacterId;
  readonly type: V2CharacterRelationshipType;
  readonly customLabel?: string;
  readonly description?: string;
  readonly strength: number;
  readonly visibility: V2CharacterRelationshipVisibility;
  readonly archivedAt?: string;
}

export interface V2CharacterStateDefinitionDto {
  readonly stateDefinitionId: V2CharacterStateDefinitionId;
  readonly storyWorldId: V2StoryWorldId;
  readonly characterId: V2CharacterId;
  readonly key: string;
  readonly valueType: V2CharacterStateValueType;
  readonly defaultValue: string | number | boolean;
  readonly constraints: Readonly<Record<string, string | number | boolean>>;
  readonly archivedAt?: string;
}

export interface V2CreateCharacterStateDefinitionRequest extends V2RevisionedCommandRequest {
  readonly stateDefinitionId: V2CharacterStateDefinitionId;
  readonly characterId: V2CharacterId;
  readonly key: string;
  readonly valueType: V2CharacterStateValueType;
  readonly defaultValue: string | number | boolean;
  readonly constraints?: Readonly<Record<string, string | number | boolean>>;
}

export interface V2UpdateCharacterStateDefinitionRequest extends V2RevisionedCommandRequest {
  readonly defaultValue: string | number | boolean;
  readonly constraints?: Readonly<Record<string, string | number | boolean>>;
}

export interface V2CharacterVisualVariantDto {
  readonly visualVariantId: V2CharacterVisualVariantId;
  readonly storyWorldId: V2StoryWorldId;
  readonly characterId: V2CharacterId;
  readonly name: string;
  readonly appearance: Readonly<Record<string, string>>;
  readonly loras: readonly { readonly name: string; readonly weight: number }[];
  readonly triggerWords: readonly string[];
  readonly negativePrompt?: string;
  readonly workflowPreset?: string;
  readonly isDefault: boolean;
  readonly referenceAssetIds: readonly string[];
  readonly archivedAt?: string;
}

export interface V2UpsertCharacterVisualVariantRequest extends V2RevisionedCommandRequest {
  readonly visualVariantId: V2CharacterVisualVariantId;
  readonly characterId: V2CharacterId;
  readonly name: string;
  readonly appearance?: Readonly<Record<string, string>>;
  readonly loras?: readonly { readonly name: string; readonly weight: number }[];
  readonly triggerWords?: readonly string[];
  readonly negativePrompt?: string | null;
  readonly workflowPreset?: string | null;
  readonly isDefault?: boolean;
  readonly referenceAssetIds?: readonly string[];
}

export type V2CharacterCandidateKind = "profile_patch" | "relationship_upsert" | "visual_variant_upsert" | "memory_promotion" | "state_delta" | "relationship_delta" | "event_definition_upsert" | "event_instance_transition";
export type V2CharacterCandidateStatus = "pending" | "approved" | "rejected" | "changes_requested";
export interface V2CharacterCandidateDto {
  readonly candidateId: V2CharacterCandidateId;
  readonly storyWorldId: V2StoryWorldId;
  readonly kind: V2CharacterCandidateKind;
  readonly targetScope: string;
  readonly baseRevision: V2Revision;
  readonly status: V2CharacterCandidateStatus;
  readonly payload: unknown;
  readonly provenance: unknown;
  readonly contextHash?: string;
  readonly createdAt: string;
  readonly reviewedAt?: string;
  readonly reviewer?: string;
  readonly reviewReason?: string;
}
export interface V2CreateCharacterCandidateRequest extends V2RevisionedCommandRequest {
  readonly candidateId: V2CharacterCandidateId;
  readonly kind: V2CharacterCandidateKind;
  readonly targetScope: string;
  readonly payload: unknown;
  readonly provenance: unknown;
  readonly contextHash?: string;
}
export interface V2ReviewCharacterCandidateRequest extends V2RevisionedCommandRequest {
  readonly action: "approve" | "reject" | "request_changes";
  readonly reviewer: string;
  readonly reason?: string;
}

export interface V2CharacterEventDefinitionDto {
  readonly eventDefinitionId: V2CharacterEventDefinitionId;
  readonly storyWorldId: V2StoryWorldId;
  readonly name: string;
  readonly description?: string;
  readonly participantCharacterIds: readonly V2CharacterId[];
  readonly initialState: Readonly<Record<string, string | number | boolean>>;
  readonly archivedAt?: string;
}
export interface V2UpsertCharacterEventDefinitionRequest extends V2RevisionedCommandRequest {
  readonly eventDefinitionId: V2CharacterEventDefinitionId;
  readonly name: string;
  readonly description?: string | null;
  readonly participantCharacterIds: readonly V2CharacterId[];
  readonly initialState?: Readonly<Record<string, string | number | boolean>>;
}

export interface V2CharacterProactivePolicyDto {
  readonly storyWorldId: V2StoryWorldId;
  readonly characterId: V2CharacterId;
  readonly enabled: boolean;
  readonly cooldownMinutes: number;
  readonly dailyLimit: number;
  readonly quietStart: string;
  readonly quietEnd: string;
  readonly lastExecutedAt?: string;
}
export interface V2UpdateCharacterProactivePolicyRequest extends V2RevisionedCommandRequest {
  readonly enabled: boolean;
  readonly cooldownMinutes?: number;
  readonly dailyLimit?: number;
  readonly quietStart?: string;
  readonly quietEnd?: string;
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
  readonly relationships: readonly V2CharacterRelationshipDto[];
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
  readonly summary?: string | null;
}

export interface V2CreateCharacterRequest extends V2RevisionedCommandRequest {
  readonly characterId: V2CharacterId;
  readonly name: string;
  readonly summary?: string | null;
  readonly homeLocationId?: V2LocationId | null;
  readonly personaText?: string | null;
  readonly profile?: V2CharacterProfileInput | null;
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
  readonly summary?: string | null;
}

export interface V2CanonWriteResponse<T> {
  readonly item: T;
  readonly revision: V2Revision;
}
export interface V2UpdateStoryWorldRequest extends V2RevisionedCommandRequest {
  readonly name: string;
  readonly summary?: string | null;
}

export interface V2UpdateLocationRequest extends V2RevisionedCommandRequest {
  readonly name: string;
  readonly summary?: string | null;
}

export interface V2UpdateCharacterRequest extends V2RevisionedCommandRequest {
  readonly name: string;
  readonly summary?: string | null;
  readonly homeLocationId?: V2LocationId | null;
  readonly personaText?: string | null;
  readonly profile?: V2CharacterProfileInput | null;
}

export interface V2UpsertCharacterRelationshipRequest extends V2RevisionedCommandRequest {
  readonly relationshipId: V2CharacterRelationshipId;
  readonly fromCharacterId: V2CharacterId;
  readonly toCharacterId: V2CharacterId;
  readonly type: V2CharacterRelationshipType;
  readonly customLabel?: string | null;
  readonly description?: string | null;
  readonly strength: number;
  readonly visibility: V2CharacterRelationshipVisibility;
}

export interface V2CharacterContextTraceDto {
  readonly traceId: V2CharacterContextTraceId;
  readonly storyWorldId: V2StoryWorldId;
  readonly task: "chat" | "story_analyze" | "scene_generation" | "image_generation";
  readonly contextHash: string;
  readonly canonRevision: V2Revision;
  readonly sources: readonly { readonly path: string; readonly sourceId?: string; readonly reason: string; readonly tokens: number }[];
  readonly omittedSources: readonly { readonly path: string; readonly sourceId?: string; readonly reason: string; readonly tokens: number }[];
}

export interface V2CharacterContextPreviewRequest extends V2RevisionedCommandRequest {
  readonly task: "chat" | "story_analyze" | "scene_generation" | "image_generation";
  readonly characterIds?: readonly V2CharacterId[];
  readonly currentInput?: string;
  readonly tokenBudget?: number;
}

export interface V2CharacterContextPreviewResponse {
  readonly contextHash: string;
  readonly baseCanonRevision: V2Revision;
  readonly stable: { readonly characters: readonly V2CharacterDto[]; readonly relationships: readonly V2CharacterRelationshipDto[]; readonly facts: readonly V2FactDto[] };
  readonly sources: V2CharacterContextTraceDto["sources"];
  readonly omittedSources: V2CharacterContextTraceDto["omittedSources"];
  readonly budget: { readonly limit: number; readonly used: number };
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
  readonly summary?: string | null;
}
