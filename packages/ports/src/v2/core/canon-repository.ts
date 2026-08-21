import type {
  V2CharacterId,
  V2IdempotencyKey,
  V2LocationId,
  V2CharacterContextTraceId,
  V2CharacterCandidateDto,
  V2CharacterCandidateStatus,
  V2CharacterProactivePolicyDto,
  V2Revision,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
import type {
  V2CanonCharacter,
  V2CanonCharacterRelationship,
  V2CanonCharacterStateDefinition,
  V2CanonCharacterVisualVariant,
  V2CanonCharacterEventDefinition,
  V2CanonFact,
  V2CanonLocation,
  V2CanonRule,
  V2CanonTimelineEvent,
  V2CanonWorld,
} from "@living-network/domain/v2";

export interface V2CanonMutationRecord<TResult> {
  readonly key: V2IdempotencyKey;
  readonly operation: string;
  readonly payloadHash: string;
  readonly result: TResult;
}

export interface V2CanonRepository {
  getWorld(storyWorldId: V2StoryWorldId): Promise<V2CanonWorld | undefined>;
  listWorlds(): Promise<readonly V2CanonWorld[]>;
  createWorld(input: V2CanonWorld): Promise<V2CanonWorld>;

  getLocation(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly locationId: V2LocationId;
  }): Promise<V2CanonLocation | undefined>;
  listLocations(storyWorldId: V2StoryWorldId): Promise<readonly V2CanonLocation[]>;
  createLocation(input: V2CanonLocation): Promise<V2CanonLocation>;

  getCharacter(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly characterId: V2CharacterId;
  }): Promise<V2CanonCharacter | undefined>;
  listCharacters(storyWorldId: V2StoryWorldId): Promise<readonly V2CanonCharacter[]>;
  createCharacter(input: V2CanonCharacter): Promise<V2CanonCharacter>;

  listFacts(storyWorldId: V2StoryWorldId): Promise<readonly V2CanonFact[]>;
  createFact(input: V2CanonFact): Promise<V2CanonFact>;

  listRules(storyWorldId: V2StoryWorldId): Promise<readonly V2CanonRule[]>;
  createRule(input: V2CanonRule): Promise<V2CanonRule>;

  listTimelineEvents(storyWorldId: V2StoryWorldId): Promise<readonly V2CanonTimelineEvent[]>;
  createTimelineEvent(input: V2CanonTimelineEvent): Promise<V2CanonTimelineEvent>;

  updateWorld(input: V2CanonWorld): Promise<V2CanonWorld>;
  updateLocation(input: V2CanonLocation): Promise<V2CanonLocation>;
  updateCharacter(input: V2CanonCharacter): Promise<V2CanonCharacter>;
  listCharacterRelationships(storyWorldId: V2StoryWorldId, characterId?: V2CharacterId): Promise<readonly V2CanonCharacterRelationship[]>;
  upsertCharacterRelationship(input: V2CanonCharacterRelationship): Promise<V2CanonCharacterRelationship>;
  recordCharacterContextTrace(input: {
    readonly traceId: V2CharacterContextTraceId;
    readonly storyWorldId: V2StoryWorldId;
    readonly task: string;
    readonly contextHash: string;
    readonly canonRevision: V2Revision;
    readonly sources: unknown;
    readonly omittedSources: unknown;
    readonly budget: unknown;
  }): Promise<void>;
  listCharacterContextTraces(storyWorldId: V2StoryWorldId, limit?: number): Promise<readonly import("@living-network/contracts/v2").V2CharacterContextTraceDto[]>;
  listCharacterStateDefinitions(storyWorldId: V2StoryWorldId, characterId?: V2CharacterId): Promise<readonly V2CanonCharacterStateDefinition[]>;
  createCharacterStateDefinition(input: V2CanonCharacterStateDefinition): Promise<V2CanonCharacterStateDefinition>;
  updateCharacterStateDefinition(input: V2CanonCharacterStateDefinition): Promise<V2CanonCharacterStateDefinition>;
  listCharacterVisualVariants(storyWorldId: V2StoryWorldId, characterId?: V2CharacterId): Promise<readonly V2CanonCharacterVisualVariant[]>;
  upsertCharacterVisualVariant(input: V2CanonCharacterVisualVariant): Promise<V2CanonCharacterVisualVariant>;
  listCharacterEventDefinitions(storyWorldId: V2StoryWorldId): Promise<readonly V2CanonCharacterEventDefinition[]>;
  upsertCharacterEventDefinition(input: V2CanonCharacterEventDefinition): Promise<V2CanonCharacterEventDefinition>;
  getCharacterProactivePolicy(storyWorldId: V2StoryWorldId, characterId: V2CharacterId): Promise<V2CharacterProactivePolicyDto | undefined>;
  updateCharacterProactivePolicy(input: V2CharacterProactivePolicyDto): Promise<V2CharacterProactivePolicyDto>;
  createCharacterCandidate(input: Omit<V2CharacterCandidateDto, "createdAt"> & { readonly createdAt?: string }): Promise<V2CharacterCandidateDto>;
  getCharacterCandidate(storyWorldId: V2StoryWorldId, candidateId: string): Promise<V2CharacterCandidateDto | undefined>;
  listCharacterCandidates(storyWorldId: V2StoryWorldId, status?: V2CharacterCandidateStatus): Promise<readonly V2CharacterCandidateDto[]>;
  reviewCharacterCandidate(input: { readonly storyWorldId: V2StoryWorldId; readonly candidateId: string; readonly status: V2CharacterCandidateStatus; readonly reviewer: string; readonly reason?: string; }): Promise<V2CharacterCandidateDto>;
  updateFact(input: V2CanonFact): Promise<V2CanonFact>;
  updateRule(input: V2CanonRule): Promise<V2CanonRule>;
  updateTimelineEvent(input: V2CanonTimelineEvent): Promise<V2CanonTimelineEvent>;

  advanceRevision(storyWorldId: V2StoryWorldId, expectedRevision: V2Revision): Promise<V2Revision>;
  readMutation<TResult>(input: {
    readonly key: V2IdempotencyKey;
    readonly operation: string;
  }): Promise<V2CanonMutationRecord<TResult> | undefined>;
  saveMutation<TResult>(input: V2CanonMutationRecord<TResult>): Promise<void>;
}

export interface V2CanonUnitOfWork {
  withCanonTransaction<T>(fn: (repositories: { readonly canon: V2CanonRepository }) => Promise<T>): Promise<T>;
}
