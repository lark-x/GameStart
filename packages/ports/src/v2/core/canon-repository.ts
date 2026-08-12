import type {
  V2CharacterId,
  V2IdempotencyKey,
  V2LocationId,
  V2Revision,
  V2StoryWorldId,
} from "@living-network/contracts";
import type {
  V2CanonCharacter,
  V2CanonFact,
  V2CanonLocation,
  V2CanonRule,
  V2CanonTimelineEvent,
  V2CanonWorld,
} from "@living-network/domain";

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
