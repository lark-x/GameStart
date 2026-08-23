import { defineStore } from "pinia";
import type {
  V2NarrativeDiagnostic,
  V2NarrativeDiagnosticsReport,
} from "@living-network/contracts/v2";
import { V2NarrativeClient } from "../client.ts";

export interface NarrativeDiagnosticsState {
  report: V2NarrativeDiagnosticsReport | null;
  loading: boolean;
  error: string | null;
  selectedSeverity: "all" | "error" | "warning" | "info";
}

export const useNarrativeDiagnosticsStore = defineStore("narrativeDiagnostics", {
  state: (): NarrativeDiagnosticsState => ({
    report: null,
    loading: false,
    error: null,
    selectedSeverity: "all",
  }),

  getters: {
    issues(state): readonly V2NarrativeDiagnostic[] {
      return state.report?.diagnostics ?? [];
    },

    errorCount(state): number {
      return state.report?.errorCount ?? 0;
    },

    warningCount(state): number {
      return state.report?.warningCount ?? 0;
    },

    filteredIssues(state): readonly V2NarrativeDiagnostic[] {
      if (!state.report) return [];
      if (state.selectedSeverity === "all") return state.report.diagnostics;
      return state.report.diagnostics.filter((i) => i.severity === state.selectedSeverity);
    },

    issuesBySceneId(state): Readonly<Record<string, V2NarrativeDiagnostic[]>> {
      const map: Record<string, V2NarrativeDiagnostic[]> = {};
      for (const issue of state.report?.diagnostics ?? []) {
        if (issue.entityType === "scene" || issue.entityType === "block") {
          const sid = issue.entityId;
          if (!map[sid]) map[sid] = [];
          map[sid]!.push(issue);
        }
      }
      return map;
    },
  },

  actions: {
    getClient(): V2NarrativeClient {
      return new V2NarrativeClient();
    },

    async fetchDiagnostics(storyWorldId: string): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const client = this.getClient();
        this.report = await client.getDiagnostics(storyWorldId);
      } catch (err: unknown) {
        this.error = err instanceof Error ? err.message : "Failed to load diagnostics";
      } finally {
        this.loading = false;
      }
    },

    setFilterSeverity(severity: "all" | "error" | "warning" | "info"): void {
      this.selectedSeverity = severity;
    },
  },
});
