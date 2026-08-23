import { defineStore } from "pinia";
import type { V2Revision, V2StoryWorldId } from "@living-network/contracts/v2";

export interface NarrativeRevisionState {
  storyWorldId: string | null;
  worldRevision: number | null;
  initialized: boolean;
  lastMutationAt: string | null;
}

export const useNarrativeRevisionStore = defineStore("narrativeRevision", {
  state: (): NarrativeRevisionState => ({
    storyWorldId: null,
    worldRevision: null,
    initialized: false,
    lastMutationAt: null,
  }),

  getters: {
    currentRevision(state): number {
      return state.worldRevision ?? 1;
    },

    isReady(state): boolean {
      return state.initialized && state.worldRevision !== null;
    },
  },

  actions: {
    initialize(storyWorldId: string | V2StoryWorldId, revision: number | V2Revision): void {
      this.storyWorldId = storyWorldId;
      this.worldRevision = Number(revision);
      this.initialized = true;
      this.lastMutationAt = new Date().toISOString();
    },

    setRevision(revision: number | V2Revision): void {
      const nextRev = Number(revision);
      if (Number.isFinite(nextRev)) {
        if (this.worldRevision === null || nextRev > this.worldRevision) {
          this.worldRevision = nextRev;
        }
        this.lastMutationAt = new Date().toISOString();
      }
    },

    advanceFromResponse(response: { revision?: number | V2Revision } | number | V2Revision | null | undefined): void {
      if (response === null || response === undefined) return;
      if (typeof response === "number") {
        this.setRevision(response);
      } else if (typeof response === "object" && "revision" in response && response.revision !== undefined) {
        this.setRevision(response.revision);
      }
    },

    requireRevision(): V2Revision {
      if (this.worldRevision === null) {
        return 1 as V2Revision;
      }
      return this.worldRevision as V2Revision;
    },

    reset(): void {
      this.storyWorldId = null;
      this.worldRevision = null;
      this.initialized = false;
      this.lastMutationAt = null;
    },
  },
});
