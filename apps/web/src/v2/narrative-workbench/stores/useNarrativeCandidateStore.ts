import { defineStore } from "pinia";
import type {
  V2CandidateReviewAction,
  V2IdempotencyKey,
  V2Revision,
  V2ReviewCandidateRequest,
  V2SceneCandidateDto,
} from "@living-network/contracts/v2";

export interface NarrativeCandidateState {
  candidates: V2SceneCandidateDto[];
  selectedCandidateId: string | null;
  statusFilter: "all" | "pending" | "approved" | "rejected";
  loading: boolean;
  applying: boolean;
  error: string | null;
}

export const useNarrativeCandidateStore = defineStore("narrativeCandidate", {
  state: (): NarrativeCandidateState => ({
    candidates: [],
    selectedCandidateId: null,
    statusFilter: "pending",
    loading: false,
    applying: false,
    error: null,
  }),

  getters: {
    selectedCandidate(state): V2SceneCandidateDto | null {
      return state.candidates.find((c) => c.candidateId === state.selectedCandidateId) ?? null;
    },

    filteredCandidates(state): readonly V2SceneCandidateDto[] {
      if (state.statusFilter === "all") return state.candidates;
      return state.candidates.filter((c) => c.status === state.statusFilter);
    },

    pendingCandidates(state): readonly V2SceneCandidateDto[] {
      return state.candidates.filter((c) => c.status === "pending");
    },
  },

  actions: {
    setStatusFilter(filter: "all" | "pending" | "approved" | "rejected"): void {
      this.statusFilter = filter;
    },

    selectCandidate(candidateId: string): void {
      this.selectedCandidateId = candidateId;
    },

    async fetchCandidates(storyWorldId: string): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const url = `/api/v2/core/worlds/${storyWorldId}/candidates/scenes`;
        const res = await fetch(url).then((r) => r.ok ? r.json() : null).catch(() => null);
        if (res) {
          const list: V2SceneCandidateDto[] = Array.isArray(res)
            ? res
            : Array.isArray((res as { candidates?: V2SceneCandidateDto[] }).candidates)
            ? (res as { candidates: V2SceneCandidateDto[] }).candidates
            : [];
          this.candidates = list;
          if ((!this.selectedCandidateId || !this.candidates.some((c) => c.candidateId === this.selectedCandidateId)) && this.candidates.length > 0) {
            const firstPending = this.candidates.find((c) => c.status === "pending");
            this.selectedCandidateId = firstPending ? firstPending.candidateId : this.candidates[0]!.candidateId;
          }
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : "获取候选列表失败";
      } finally {
        this.loading = false;
      }
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
        const candidate = this.candidates.find((c) => c.candidateId === candidateId);
        const body: V2ReviewCandidateRequest = {
          action,
          reviewer: "creator",
          ...(reason ? { reason } : {}),
          expectedRevision: (candidate?.baseCanonRevision ?? 1) as V2Revision,
          idempotencyKey: `review_${candidateId}_${Date.now()}` as V2IdempotencyKey,
        };

        const res = await fetch(`/api/v2/core/worlds/${storyWorldId}/candidates/scenes/${candidateId}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as { error?: { message?: string }; message?: string };
          throw new Error(errData.error?.message || errData.message || `HTTP ${res.status}`);
        }

        await this.fetchCandidates(storyWorldId);
        return true;
      } catch (err) {
        this.error = err instanceof Error ? err.message : "审核操作失败";
        return false;
      } finally {
        this.applying = false;
      }
    },
  },
});
