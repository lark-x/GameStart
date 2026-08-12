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
  readonly premise: string;
  readonly characters: readonly V2CharacterSummary[];
  readonly locations: readonly V2LocationSummary[];
  readonly facts: readonly V2FactSummary[];
  readonly rules: readonly V2RuleSummary[];
}

export interface V2CharacterSummary {
  readonly characterId: string;
  readonly name: string;
  readonly role: string;
}

export interface V2LocationSummary {
  readonly locationId: string;
  readonly name: string;
  readonly tags: readonly string[];
}

export interface V2FactSummary {
  readonly factId: string;
  readonly text: string;
  readonly visibility: "creator" | "player";
}

export interface V2RuleSummary {
  readonly ruleId: string;
  readonly text: string;
  readonly severity: "soft" | "hard";
}

export interface V2SceneGraphSummary {
  readonly entrySceneId: string;
  readonly scenes: readonly V2SceneSummary[];
  readonly diagnostics: readonly V2GraphDiagnostic[];
}

export interface V2SceneSummary {
  readonly sceneId: string;
  readonly title: string;
  readonly choiceCount: number;
  readonly reachable: boolean;
  readonly stateDeltaPreview: readonly V2StateDeltaPreview[];
}

export interface V2GraphDiagnostic {
  readonly code: "missing_entry" | "unreachable_scene" | "dangling_choice" | "state_delta";
  readonly severity: "info" | "warning" | "danger";
  readonly message: string;
  readonly targetId?: string;
}

export interface V2TypedStateSummary {
  readonly schemaRevision: number;
  readonly variables: readonly V2StateVariableSummary[];
  readonly preview: readonly V2StateDeltaPreview[];
}

export interface V2StateVariableSummary {
  readonly key: string;
  readonly label: string;
  readonly type: "flag" | "number" | "text";
  readonly value: boolean | number | string;
}

export interface V2StateDeltaPreview {
  readonly key: string;
  readonly before: boolean | number | string;
  readonly after: boolean | number | string;
  readonly sourceSceneId: string;
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
  readonly typedState: V2TypedStateSummary;
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
