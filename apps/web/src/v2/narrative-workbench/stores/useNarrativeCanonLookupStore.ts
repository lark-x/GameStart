import { defineStore } from "pinia";
import type { V2CanonLoreEntry } from "@living-network/contracts/v2";
import type { V2CharacterSummary, V2LocationSummary } from "../../adapters/types.ts";
import { V2NarrativeClient } from "../../story/client.ts";

export interface NarrativeCanonLookupState {
  characters: V2CharacterSummary[];
  locations: V2LocationSummary[];
  loreEntries: V2CanonLoreEntry[];
  loading: boolean;
  error: string | null;
  loadedWorldId: string | null;
}

export const useNarrativeCanonLookupStore = defineStore("narrativeCanonLookup", {
  state: (): NarrativeCanonLookupState => ({
    characters: [],
    locations: [],
    loreEntries: [],
    loading: false,
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
    async fetchWorldCanon(storyWorldId: string, force = false): Promise<void> {
      if (!force && this.loadedWorldId === storyWorldId && this.characters.length > 0) {
        return;
      }

      this.loading = true;
      this.error = null;
      try {
        const narrativeClient = new V2NarrativeClient();
        const [loreList, worldRes] = await Promise.all([
          narrativeClient.listLore(storyWorldId).catch(() => []),
          fetch(`/api/v2/worlds/${storyWorldId}`).then((r) => r.ok ? r.json() : null).catch(() => null),
        ]);

        this.loreEntries = loreList as V2CanonLoreEntry[];
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

    setCanonData(characters: V2CharacterSummary[], locations: V2LocationSummary[]): void {
      this.characters = characters;
      this.locations = locations;
    },
  },
});
