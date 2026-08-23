import { defineStore } from "pinia";
import type {
  V2CandidateReviewAction,
  V2SceneCandidateDto,
} from "@living-network/contracts/v2";

export interface NarrativeCandidateState {
  candidates: V2SceneCandidateDto[];
  selectedCandidateId: string | null;
  loading: boolean;
  applying: boolean;
  error: string | null;
}

export const useNarrativeCandidateStore = defineStore("narrativeCandidate", {
  state: (): NarrativeCandidateState => ({
    candidates: [],
    selectedCandidateId: null,
    loading: false,
    applying: false,
    error: null,
  }),

  getters: {
    selectedCandidate(state): V2SceneCandidateDto | null {
      return state.candidates.find((c) => c.candidateId === state.selectedCandidateId) ?? null;
    },

    pendingCandidates(state): readonly V2SceneCandidateDto[] {
      return state.candidates.filter((c) => c.status === "pending");
    },
  },

  actions: {
    async fetchCandidates(storyWorldId: string, sceneId?: string): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const url = sceneId
          ? `/api/v2/worlds/${storyWorldId}/scenes/${sceneId}/candidates`
          : `/api/v2/worlds/${storyWorldId}/candidates`;
        const res = await fetch(url).then((r) => r.ok ? r.json() : null).catch(() => null);
        if (res && Array.isArray(res)) {
          this.candidates = res as V2SceneCandidateDto[];
          if (!this.selectedCandidateId && this.candidates.length > 0) {
            this.selectedCandidateId = this.candidates[0]!.candidateId;
          }
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : "获取候选列表失败";
      } finally {
        this.loading = false;
      }
    },

    selectCandidate(candidateId: string): void {
      this.selectedCandidateId = candidateId;
    },

    async reviewCandidate(
      storyWorldId: string,
      candidateId: string,
      action: V2CandidateReviewAction,
      reason?: string,
    ): Promise<boolean> {
      this.applying = true;
      this.error = null;
      try {
        const res = await fetch(`/api/v2/worlds/${storyWorldId}/candidates/${candidateId}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reason }),
        });
        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new Error(errData.error?.message ?? `HTTP ${res.status}`);
        }
        await this.fetchCandidates(storyWorldId);
        return true;
      } catch (err) {
        this.error = err instanceof Error ? err.message : "审核失败";
        return false;
      } finally {
        this.applying = false;
      }
    },
  },
});
