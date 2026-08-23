import type { V2NarrativeReference } from "@living-network/domain/v2";

export interface V2NarrativeReferenceRepository {
  listReferencesBySource(criteria: {
    readonly storyWorldId: string;
    readonly sourceType: string;
    readonly sourceId: string;
  }): Promise<readonly V2NarrativeReference[]>;

  listReferencesByTarget(criteria: {
    readonly storyWorldId: string;
    readonly targetType: string;
    readonly targetId: string;
  }): Promise<readonly V2NarrativeReference[]>;

  listAllReferences(storyWorldId: string): Promise<readonly V2NarrativeReference[]>;

  replaceReferencesForSource(
    criteria: {
      readonly storyWorldId: string;
      readonly sourceType: string;
      readonly sourceId: string;
    },
    references: readonly V2NarrativeReference[],
  ): Promise<readonly V2NarrativeReference[]>;
}
