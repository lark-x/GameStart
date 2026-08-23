import type { V2NarrativeSearchResultItem } from "@living-network/contracts/v2";

export interface V2NarrativeSearchRepository {
  searchNarrative(
    storyWorldId: string,
    query: string,
    limit?: number,
  ): Promise<readonly V2NarrativeSearchResultItem[]>;
}
