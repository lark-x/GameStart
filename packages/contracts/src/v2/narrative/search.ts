export interface V2NarrativeSearchResultItem {
  readonly kind: "scene" | "scene_block" | "character" | "location" | "lore" | "fact";
  readonly id: string;
  readonly title: string;
  readonly snippet: string;
  readonly parentPath?: string;
  readonly sceneId?: string;
}

export interface V2NarrativeSearchResponse {
  readonly query: string;
  readonly results: readonly V2NarrativeSearchResultItem[];
}
