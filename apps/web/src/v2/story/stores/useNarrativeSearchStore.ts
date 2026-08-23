import { defineStore } from "pinia";
import type { V2NarrativeSearchResultItem } from "@living-network/contracts/v2";
import { V2NarrativeClient } from "../client.ts";

export interface NarrativeSearchState {
  query: string;
  results: readonly V2NarrativeSearchResultItem[];
  searching: boolean;
  isOpen: boolean;
  error: string | null;
}

export const useNarrativeSearchStore = defineStore("narrativeSearch", {
  state: (): NarrativeSearchState => ({
    query: "",
    results: [],
    searching: false,
    isOpen: false,
    error: null,
  }),

  actions: {
    getClient(): V2NarrativeClient {
      return new V2NarrativeClient();
    },

    openSearch(): void {
      this.isOpen = true;
    },

    closeSearch(): void {
      this.isOpen = false;
      this.query = "";
      this.results = [];
    },

    async performSearch(storyWorldId: string, query: string): Promise<void> {
      this.query = query;
      if (!query.trim()) {
        this.results = [];
        return;
      }

      this.searching = true;
      this.error = null;
      try {
        const client = this.getClient();
        const res = await client.search(storyWorldId, query.trim(), 20);
        this.results = res.items;
      } catch (err: any) {
        this.error = err.message || "Search failed";
      } finally {
        this.searching = false;
      }
    },
  },
});
