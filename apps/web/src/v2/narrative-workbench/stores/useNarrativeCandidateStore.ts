import { defineStore } from "pinia";
import type {
  V2CandidateReviewAction,
  V2ReviewCandidateRequest,
  V2Revision,
  V2SceneCandidateDto,
} from "@living-network/contracts/v2";
import { useNarrativeRevisionStore } from "./useNarrativeRevisionStore.ts";
import { createNarrativeMutationKey } from "../utils/idempotency.ts";

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
    pendingCandidates(state): V2SceneCandidateDto[] {
      return state.candidates.filter((c) => c.status === "pending");
    },

    filteredCandidates(state): V2SceneCandidateDto[] {
      if (state.statusFilter === "all") return state.candidates;
      return state.candidates.filter((c) => c.status === state.statusFilter);
    },

    selectedCandidate(state): V2SceneCandidateDto | null {
      if (!state.selectedCandidateId) return null;
      return state.candidates.find((c) => c.candidateId === state.selectedCandidateId) ?? null;
    },
  },

  actions: {
    selectCandidate(candidateId: string | null): void {
      this.selectedCandidateId = candidateId;
    },

    setSelectedCandidate(candidateId: string | null): void {
      this.selectedCandidateId = candidateId;
    },

    setStatusFilter(filter: "all" | "pending" | "approved" | "rejected"): void {
      this.statusFilter = filter;
    },

    async fetchCandidates(storyWorldId: string): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const res = await fetch(`/api/v2/core/worlds/${storyWorldId}/candidates/scenes`);
        if (!res.ok) {
          throw new Error(`Failed to load candidates: ${res.statusText}`);
        }
        const data = await res.json();
        this.candidates = Array.isArray(data)
          ? data
          : Array.isArray((data as { candidates?: V2SceneCandidateDto[] }).candidates)
          ? (data as { candidates: V2SceneCandidateDto[] }).candidates
          : Array.isArray((data as { items?: V2SceneCandidateDto[] }).items)
          ? (data as { items: V2SceneCandidateDto[] }).items
          : [];
        if (this.candidates.length > 0 && !this.selectedCandidateId) {
          const firstPending = this.candidates.find((c) => c.status === "pending") ?? this.candidates[0];
          if (firstPending) {
            this.selectedCandidateId = firstPending.candidateId;
          }
        }
      } catch (err: unknown) {
        this.error = err instanceof Error ? err.message : "Failed to load candidates";
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
      const revisionStore = useNarrativeRevisionStore();
      try {
        const candidate = this.candidates.find((c) => c.candidateId === candidateId);
        const body: V2ReviewCandidateRequest = {
          action,
          reviewer: "creator",
          ...(reason ? { reason } : {}),
          expectedRevision: (candidate?.baseCanonRevision ?? revisionStore.requireRevision()) as V2Revision,
          idempotencyKey: createNarrativeMutationKey("review_candidate"),
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

        const data = (await res.json()) as { revision?: number; worldRevision?: number };
        const nextRev = data.worldRevision ?? data.revision;
        if (nextRev !== undefined) {
          revisionStore.setRevision(nextRev);
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
