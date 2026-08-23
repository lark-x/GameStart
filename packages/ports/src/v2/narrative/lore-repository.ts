import type { V2CanonLoreEntry } from "@living-network/domain/v2";

export interface V2CanonLoreRepository {
  getLoreEntry(criteria: { readonly storyWorldId: string; readonly loreEntryId: string }): Promise<V2CanonLoreEntry | undefined>;
  listLoreEntries(storyWorldId: string, criteria?: { readonly type?: string; readonly tag?: string }): Promise<readonly V2CanonLoreEntry[]>;
  createLoreEntry(entry: V2CanonLoreEntry): Promise<V2CanonLoreEntry>;
  updateLoreEntry(entry: V2CanonLoreEntry): Promise<V2CanonLoreEntry>;
  deleteLoreEntry(criteria: { readonly storyWorldId: string; readonly loreEntryId: string }): Promise<void>;
  searchLore(storyWorldId: string, query: string): Promise<readonly V2CanonLoreEntry[]>;
}
