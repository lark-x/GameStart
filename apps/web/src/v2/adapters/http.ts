import type {
  V2CreateSceneGenerationJobRequest,
  V2CreateSceneGenerationJobResponse,
  V2CandidateId,
  V2ErrorEnvelope,
  V2HealthResponse,
} from "@living-network/contracts";

import { createV2MockAdapter } from "./mock.ts";
import {
  V2AdapterError,
  type V2CandidateReviewRequest,
  type V2CandidateReviewResult,
  type V2ExportBundleSummary,
  type V2PlayerRuntimeSummary,
  type V2ReleasePackageSummary,
  type V2SaveSummary,
  type V2WorkspaceAdapter,
  type V2WorkspaceSnapshot,
} from "./types.ts";

export interface V2HttpAdapterOptions {
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
}

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | V2ErrorEnvelope;
  if (!response.ok && payload && typeof payload === "object" && "error" in payload) {
    throw new V2AdapterError(payload.error);
  }
  if (!response.ok) {
    throw new V2AdapterError({
      code: "INTERNAL_ERROR",
      message: `Request failed with HTTP ${response.status}`,
    });
  }
  return payload as T;
}

export function createV2HttpAdapter(options: V2HttpAdapterOptions): V2WorkspaceAdapter {
  const fetcher = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  return {
    mode: "http",
    async getSnapshot(): Promise<V2WorkspaceSnapshot> {
      const health = await parseJson<V2HealthResponse>(
        await fetcher(`${baseUrl}/api/v2/health`, { headers: { Accept: "application/json" } }),
      );

      // Proposal until Slice A backend endpoints exist: keep shell data sourced from typed fixtures.
      return {
        ...(await createV2MockAdapter().getSnapshot()),
        health,
      };
    },
    async createSceneGenerationJob(
      request: V2CreateSceneGenerationJobRequest,
    ): Promise<V2CreateSceneGenerationJobResponse> {
      return parseJson<V2CreateSceneGenerationJobResponse>(
        await fetcher(`${baseUrl}/api/v2/generation/scene-jobs`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        }),
      );
    },
    async reviewCandidate(request: V2CandidateReviewRequest): Promise<V2CandidateReviewResult> {
      const response = await parseJson<{ candidateId: V2CandidateId; status: V2CandidateReviewResult["status"] }>(
        await fetcher(`${baseUrl}/api/v2/candidates/${request.candidateId}/review`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        }),
      );
      return {
        status: response.status,
        reviewedAt: new Date().toISOString(),
        reviewReason: request.reason,
      };
    },
    async createRelease(): Promise<V2ReleasePackageSummary> {
      return parseJson<V2ReleasePackageSummary>(
        await fetcher(`${baseUrl}/api/v2/releases`, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      );
    },
    async submitChoice(choiceId: string): Promise<V2PlayerRuntimeSummary> {
      return parseJson<V2PlayerRuntimeSummary>(
        await fetcher(`${baseUrl}/api/v2/runtime/choices`, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ choiceId }),
        }),
      );
    },
    async saveRun(label: string): Promise<V2SaveSummary> {
      return parseJson<V2SaveSummary>(
        await fetcher(`${baseUrl}/api/v2/runtime/saves`, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ label }),
        }),
      );
    },
    async restoreSave(saveId: string): Promise<V2PlayerRuntimeSummary> {
      return parseJson<V2PlayerRuntimeSummary>(
        await fetcher(`${baseUrl}/api/v2/runtime/saves/${saveId}`, {
          headers: { Accept: "application/json" },
        }),
      );
    },
    async exportRelease(format: "json" | "markdown"): Promise<V2ExportBundleSummary> {
      return parseJson<V2ExportBundleSummary>(
        await fetcher(`${baseUrl}/api/v2/releases/export?format=${encodeURIComponent(format)}`, {
          headers: { Accept: "application/json" },
        }),
      );
    },
  };
}
