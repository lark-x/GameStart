import type {
  V2CandidateEnvelope,
  V2CreateSceneGenerationJobRequest,
  V2CreateSceneGenerationJobResponse,
  V2ErrorEnvelope,
  V2HealthResponse,
  V2ReleasePreflightResponse,
  V2SceneCandidatePayload,
} from "@living-network/contracts";

export type V2WorkspaceMode = "mock" | "http";

export interface V2WorkspaceSummary {
  readonly storyWorldId: string;
  readonly name: string;
  readonly revision: number;
}

export interface V2SceneGraphSummary {
  readonly entrySceneId: string;
  readonly scenes: readonly {
    readonly sceneId: string;
    readonly title: string;
    readonly choiceCount: number;
  }[];
}

export interface V2RunSummary {
  readonly runId: string;
  readonly releaseVersion: string;
  readonly currentSceneId: string;
}

export interface V2WorkspaceSnapshot {
  readonly health: V2HealthResponse;
  readonly world: V2WorkspaceSummary;
  readonly sceneGraph: V2SceneGraphSummary;
  readonly candidate: V2CandidateEnvelope<V2SceneCandidatePayload>;
  readonly release: V2ReleasePreflightResponse;
  readonly run: V2RunSummary;
}

export interface V2WorkspaceAdapter {
  readonly mode: V2WorkspaceMode;
  getSnapshot(): Promise<V2WorkspaceSnapshot>;
  createSceneGenerationJob(
    request: V2CreateSceneGenerationJobRequest,
  ): Promise<V2CreateSceneGenerationJobResponse>;
}

export class V2AdapterError extends Error {
  readonly code: V2ErrorEnvelope["error"]["code"];
  readonly field: string | undefined;
  readonly correlationId: string | undefined;

  constructor(error: V2ErrorEnvelope["error"]) {
    super(error.message);
    this.name = "V2AdapterError";
    this.code = error.code;
    this.field = error.field;
    this.correlationId = error.correlationId;
  }
}
