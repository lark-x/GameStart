import {
  type V2CreateSceneGenerationJobRequest,
  type V2CreateSceneGenerationJobResponse,
  type V2IsoDateTime,
  type V2JobId,
} from "@living-network/contracts";

import {
  v2WebFixtureAssets,
  v2WebFixtureCandidate,
  v2WebFixtureExportBundle,
  v2WebFixtureRelease,
  v2WebFixtureReleasePackage,
  v2WebFixtureRun,
  v2WebFixtureGeneration,
  v2WebFixturePlayer,
  v2WebFixtureSave,
  v2WebFixtureSceneGraph,
  v2WebFixtureTypedState,
  v2WebFixtureWorld,
} from "../fixtures/mock-data.ts";
import type {
  V2AssetJobSummary,
  V2AssetReviewRequest,
  V2AssetReviewResult,
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
    releasePackage: v2WebFixtureReleasePackage,
    run: v2WebFixtureRun,
    player: v2WebFixturePlayer,
    save: v2WebFixtureSave,
    exportBundle: v2WebFixtureExportBundle,
    assets: v2WebFixtureAssets,
  };
}

export function createV2MockAdapter(): V2WorkspaceAdapter {
  return {
    mode: "mock",
    async bootstrapWorkspace(): Promise<void> {},
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
    async createRelease() {
      return v2WebFixtureReleasePackage;
    },
    async startRun() {
      return { run: v2WebFixtureRun, player: v2WebFixturePlayer };
    },
    async submitChoice(choiceId: string) {
      const archive = choiceId === "choice_archive";
      return {
        ...v2WebFixturePlayer,
        sceneId: archive ? "scene_archive" : "scene_opening",
        title: archive ? "Archive Door" : v2WebFixturePlayer.title,
        body: archive
          ? "The archive door wakes under the ticket's ink, waiting for a reviewed state delta."
          : v2WebFixturePlayer.body,
        choiceHistory: [...v2WebFixturePlayer.choiceHistory, choiceId],
      };
    },
    async saveRun(label: string) {
      return {
        ...v2WebFixtureSave,
        label: label.trim() || v2WebFixtureSave.label,
        savedAt: now,
      };
    },
    async restoreSave() {
      return v2WebFixturePlayer;
    },
    async exportRelease(format: "json" | "markdown") {
      if (format === "markdown") {
        return {
          filename: "gate-0-demo-world-0.1.0.md",
          format,
          preview: "# Gate 0 Demo World\n\nEntry scene: Opening Scene\nRelease: 0.1.0",
        };
      }
      return v2WebFixtureExportBundle;
    },
    async createAssetJob(prompt: string): Promise<V2AssetJobSummary> {
      return {
        ...v2WebFixtureAssets.job,
        status: "queued",
        promptPreview: prompt.trim() || v2WebFixtureAssets.prompt,
        terminalMessage: "Asset job queued for ComfyUI adapter.",
        updatedAt: now,
      };
    },
    async reviewAssetCandidate(request: V2AssetReviewRequest): Promise<V2AssetReviewResult> {
      const status =
        request.action === "request_changes" ? "changes_requested" : request.action === "approve" ? "approved" : "rejected";
      return {
        status,
        reviewedAt: now,
        reviewReason: request.reason.trim() || `${request.reviewer} marked ${request.candidateId} as ${status}.`,
        ...(status === "approved"
          ? {
              approvedAsset: {
                assetId: "asset_station_bg",
                title: v2WebFixtureAssets.candidate.title,
                kind: "scene_background",
                mediaRef: v2WebFixtureAssets.candidate.mediaRef,
                thumbnailRef: v2WebFixtureAssets.candidate.thumbnailRef,
                workflowVersion: v2WebFixtureAssets.job.workflowVersion,
                seed: v2WebFixtureAssets.job.seed,
                approved: true,
              },
            }
          : {}),
      };
    },
  };
}
