import { defineStore } from "pinia";
import type { V2NarrativeSearchResultItem } from "@living-network/contracts/v2";
import { V2NarrativeClient } from "../../story/client.ts";

export interface NarrativeSearchState {
  query: string;
  results: V2NarrativeSearchResultItem[];
  loading: boolean;
  error: string | null;
  recentSearches: string[];
}

export const useNarrativeSearchStore = defineStore("narrativeSearch", {
  state: (): NarrativeSearchState => ({
    query: "",
    results: [],
    loading: false,
    error: null,
    recentSearches: [],
  }),

  actions: {
    getClient(): V2NarrativeClient {
      return new V2NarrativeClient();
    },

    async search(storyWorldId: string, query: string, limit = 30): Promise<V2NarrativeSearchResultItem[]> {
      const q = query.trim();
      this.query = q;
      if (!q) {
        this.results = [];
        this.loading = false;
        return [];
      }

      this.loading = true;
      this.error = null;
      try {
        const client = this.getClient();
        const res = await client.search(storyWorldId, q, limit);
        this.results = [...res.items];

        if (!this.recentSearches.includes(q)) {
          this.recentSearches = [q, ...this.recentSearches.slice(0, 9)];
        }
        return this.results;
      } catch (err) {
        this.error = err instanceof Error ? err.message : "搜索失败";
        this.results = [];
        return [];
      } finally {
        this.loading = false;
      }
    },

    clear(): void {
      this.query = "";
      this.results = [];
      this.error = null;
    },
  },
});
