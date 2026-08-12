import {
  type V2CreateSceneGenerationJobRequest,
  type V2CreateSceneGenerationJobResponse,
  type V2IsoDateTime,
  type V2JobId,
} from "@living-network/contracts";

import {
  v2WebFixtureCandidate,
  v2WebFixtureRelease,
  v2WebFixtureRun,
  v2WebFixtureGeneration,
  v2WebFixtureSceneGraph,
  v2WebFixtureTypedState,
  v2WebFixtureWorld,
} from "../fixtures/mock-data.ts";
import type {
  V2CandidateReviewRequest,
  V2CandidateReviewResult,
  V2WorkspaceAdapter,
  V2WorkspaceSnapshot,
} from "./types.ts";

const now = "2026-08-12T00:00:00.000Z" as V2IsoDateTime;

export function createV2MockSnapshot(): V2WorkspaceSnapshot {
  return {
    health: { ok: true, version: "v2" },
    world: v2WebFixtureWorld,
    sceneGraph: v2WebFixtureSceneGraph,
    typedState: v2WebFixtureTypedState,
    generation: v2WebFixtureGeneration,
    candidate: v2WebFixtureCandidate,
    release: v2WebFixtureRelease,
    run: v2WebFixtureRun,
  };
}

export function createV2MockAdapter(): V2WorkspaceAdapter {
  return {
    mode: "mock",
    async getSnapshot(): Promise<V2WorkspaceSnapshot> {
      return createV2MockSnapshot();
    },
    async createSceneGenerationJob(
      request: V2CreateSceneGenerationJobRequest,
    ): Promise<V2CreateSceneGenerationJobResponse> {
      return {
        job: {
          jobId: `job_${request.storyWorldId}_${request.baseCanonRevision}` as V2JobId,
          status: "queued",
          createdAt: now,
          updatedAt: now,
        },
      };
    },
    async reviewCandidate(request: V2CandidateReviewRequest): Promise<V2CandidateReviewResult> {
      const status = request.action === "request_changes" ? "changes_requested" : request.action === "approve" ? "approved" : "rejected";
      return {
        status,
        reviewedAt: now,
        reviewReason: request.reason.trim() || `${request.reviewer} marked ${request.candidateId} as ${status}.`,
      };
    },
  };
}
