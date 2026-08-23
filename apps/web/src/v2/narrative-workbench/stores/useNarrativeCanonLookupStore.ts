import { defineStore } from "pinia";
import type { V2CanonLoreEntry } from "@living-network/contracts/v2";
import type { V2CharacterSummary, V2LocationSummary } from "../../adapters/types.ts";
import { V2NarrativeClient } from "../../story/client.ts";

export interface NarrativeCanonLookupState {
  characters: V2CharacterSummary[];
  locations: V2LocationSummary[];
  loreEntries: V2CanonLoreEntry[];
  loading: boolean;
  searchLoading: boolean;
  error: string | null;
  loadedWorldId: string | null;
}

export interface EntitySearchResultOption {
  id: string;
  type: "character" | "location" | "lore";
  title: string;
  subtitle?: string | undefined;
}

export const useNarrativeCanonLookupStore = defineStore("narrativeCanonLookup", {
  state: (): NarrativeCanonLookupState => ({
    characters: [],
    locations: [],
    loreEntries: [],
    loading: false,
    searchLoading: false,
    error: null,
    loadedWorldId: null,
  }),

  getters: {
    characterMap(state): Record<string, V2CharacterSummary> {
      const map: Record<string, V2CharacterSummary> = {};
      for (const char of state.characters) {
        map[char.characterId] = char;
      }
      return map;
    },

    locationMap(state): Record<string, V2LocationSummary> {
      const map: Record<string, V2LocationSummary> = {};
      for (const loc of state.locations) {
        map[loc.locationId] = loc;
      }
      return map;
    },

    loreMap(state): Record<string, V2CanonLoreEntry> {
      const map: Record<string, V2CanonLoreEntry> = {};
      for (const lore of state.loreEntries) {
        map[lore.loreEntryId] = lore;
      }
      return map;
    },

    loreItems(state): readonly V2CanonLoreEntry[] {
      return state.loreEntries;
    },
  },

  actions: {
    getClient(): V2NarrativeClient {
      return new V2NarrativeClient();
    },

    async fetchWorldCanon(storyWorldId: string, force = false): Promise<void> {
      if (!force && this.loadedWorldId === storyWorldId && this.characters.length > 0) {
        return;
      }

      this.loading = true;
      this.error = null;
      try {
        const narrativeClient = this.getClient();
        const [loreList, worldRes] = await Promise.all([
          narrativeClient.listLore(storyWorldId).catch(() => []),
          fetch(`/api/v2/worlds/${storyWorldId}`).then((r) => r.ok ? r.json() : null).catch(() => null),
        ]);

        this.loreEntries = (loreList as V2CanonLoreEntry[]) ?? [];
        if (worldRes && typeof worldRes === "object") {
          const w = worldRes as { characters?: V2CharacterSummary[]; locations?: V2LocationSummary[] };
          this.characters = w.characters ?? [];
          this.locations = w.locations ?? [];
        }
        this.loadedWorldId = storyWorldId;
      } catch (err) {
        this.error = err instanceof Error ? err.message : "获取正典数据失败";
      } finally {
        this.loading = false;
      }
    },

    async searchCanon(
      storyWorldId: string,
      query: string,
      targetType?: "character" | "location" | "lore",
    ): Promise<EntitySearchResultOption[]> {
      const q = query.trim();
      this.searchLoading = true;
      try {
        const client = this.getClient();
        const res = await client.search(storyWorldId, q, 20);
        const options: EntitySearchResultOption[] = [];

        for (const item of res.items) {
          if (item.kind === "character" && (!targetType || targetType === "character")) {
            options.push({
              id: item.id,
              type: "character",
              title: item.title,
              ...(item.snippet ? { subtitle: item.snippet } : {}),
            });
            if (!this.characters.some((c) => c.characterId === item.id)) {
              this.characters.push({
                characterId: item.id,
                name: item.title,
                summary: item.snippet,
              } as V2CharacterSummary);
            }
          } else if (item.kind === "location" && (!targetType || targetType === "location")) {
            options.push({
              id: item.id,
              type: "location",
              title: item.title,
              ...(item.snippet ? { subtitle: item.snippet } : {}),
            });
            if (!this.locations.some((l) => l.locationId === item.id)) {
              this.locations.push({
                locationId: item.id,
                name: item.title,
                summary: item.snippet,
              } as V2LocationSummary);
            }
          } else if (item.kind === "lore" && (!targetType || targetType === "lore")) {
            options.push({
              id: item.id,
              type: "lore",
              title: item.title,
              ...(item.snippet ? { subtitle: item.snippet } : {}),
            });
          }
        }
        return options;
      } catch (err) {
        console.error("Canon search failed:", err);
        return [];
      } finally {
        this.searchLoading = false;
      }
    },

    setCanonData(characters: V2CharacterSummary[], locations: V2LocationSummary[]): void {
      this.characters = characters;
      this.locations = locations;
    },
  },
});
