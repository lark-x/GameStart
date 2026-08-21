import type {
  V2CharacterId,
  V2Revision,
  V2StoryWorldId,
} from "@living-network/contracts/v2";

export interface V2CanonSnapshot {
  readonly storyWorldId: V2StoryWorldId;
  readonly revision: V2Revision;
  readonly facts: readonly V2CanonSnapshotFact[];
  readonly characters: readonly V2CanonSnapshotCharacter[];
  readonly scenes: readonly V2CanonSnapshotScene[];
}

export interface V2CanonSnapshotFact {
  readonly id: string;
  readonly text: string;
  readonly visibility: "creator_only" | "player_visible";
}

export interface V2CanonSnapshotCharacter {
  readonly characterId: V2CharacterId;
  readonly name: string;
  readonly profile?: unknown;
}

export interface V2CanonSnapshotScene {
  readonly sceneId: string;
  readonly title: string;
}

export interface CanonSnapshotReaderPort {
  getCanonSnapshot(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly revision: V2Revision;
  }): Promise<V2CanonSnapshot>;
}
