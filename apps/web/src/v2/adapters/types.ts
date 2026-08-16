import type {
  V2CandidateEnvelope,
  V2CandidateStatus,
  V2GenerationContextPreviewApiRequest,
  V2CreateSceneGenerationJobApiRequest,
  V2CreateSceneGenerationJobResponse,
  V2ErrorEnvelope,
  V2HealthResponse,
  V2JobRef,
  V2PrepareAssetGenerationApiResponse,
  V2ReleasePreflightResponse,
  V2SceneCandidatePayload,
  V2SceneGenerationPrepareApiResponse,
  V2StoryWorldDto,
} from "@living-network/contracts/v2";
import type { V2CreateArcRequest, V2CreateChoiceRequest, V2CreateSceneRequest, V2CreateStateVariableRequest } from "@living-network/contracts/v2";
import type { V2UpdateArcRequest, V2UpdateCharacterRequest, V2UpdateChoiceRequest, V2UpdateFactRequest, V2UpdateLocationRequest, V2UpdateRuleRequest, V2UpdateSceneRequest, V2UpdateStateVariableRequest, V2UpdateTimelineEventRequest } from "@living-network/contracts/v2";
import type { V2CreateCharacterRequest, V2CreateFactRequest, V2CreateLocationRequest, V2CreateRuleRequest, V2CreateTimelineEventRequest } from "@living-network/contracts/v2";

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
  readonly timelineEvents: readonly V2TimelineEventSummary[];
}

export interface V2TimelineEventSummary {
  readonly timelineEventId: string;
  readonly localDate: string;
  readonly title: string;
  readonly summary?: string;
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
  readonly arcs: readonly V2ArcSummary[];
  readonly scenes: readonly V2SceneSummary[];
  readonly choices: readonly V2ChoiceSummary[];
  readonly diagnostics: readonly V2GraphDiagnostic[];
}

export interface V2ArcSummary {
  readonly arcId: string;
  readonly title: string;
  readonly summary?: string;
}

export interface V2SceneSummary {
  readonly sceneId: string;
  readonly title: string;
  readonly arcId?: string;
  readonly body?: string;
  readonly isEntry: boolean;
  readonly choiceCount: number;
  readonly reachable: boolean;
  readonly stateDeltaPreview: readonly V2StateDeltaPreview[];
}

export interface V2ChoiceSummary {
  readonly choiceId: string;
  readonly sourceSceneId: string;
  readonly targetSceneId?: string;
  readonly label: string;
  readonly gates: readonly V2StateGateSummary[];
  readonly consequences: readonly V2StateConsequenceSummary[];
}

export interface V2StateGateSummary {
  readonly stateKey: string;
  readonly operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
  readonly value: boolean | number | string;
}

export interface V2StateConsequenceSummary {
  readonly stateKey: string;
  readonly operation: "set" | "increment";
  readonly value: boolean | number | string;
}

export interface V2GraphDiagnostic {
  readonly code: string;
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
  readonly defaultValue: boolean | number | string;
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
  readonly generation: V2GenerationSummary;
  readonly candidate: V2CandidateEnvelope<V2SceneCandidatePayload> | null;
  readonly release: V2ReleasePreflightResponse;
  readonly releasePackage: V2ReleasePackageSummary | null;
  readonly run: V2RunSummary | null;
  readonly player: V2PlayerRuntimeSummary | null;
  readonly save: V2SaveSummary | null;
  readonly exportBundle: V2ExportBundleSummary | null;
  readonly assets: V2AssetWorkbenchSummary;
}

export interface V2GenerationSummary {
  readonly context: V2GenerationContextSummary;
  readonly job: V2GenerationJobSummary | null;
  readonly diff: V2CandidateDiffSummary;
}

export interface V2GenerationContextSummary {
  readonly baseCanonRevision: number;
  readonly contextHash: string;
  readonly tokenBudget: number;
  readonly sources: readonly {
    readonly id: string;
    readonly label: string;
    readonly kind: "world" | "character" | "location" | "fact" | "scene";
  }[];
}

export interface V2GenerationJobSummary extends V2JobRef {
  readonly readableStatus: V2JobRef["status"] | "candidate-ready";
  readonly promptPreview: string;
  readonly candidateId?: string;
  readonly terminalMessage?: string;
}

export interface V2CandidateDiffSummary {
  readonly title: string;
  readonly scope: readonly string[];
  readonly additions: readonly string[];
  readonly warnings: readonly string[];
}

export type V2CandidateReviewAction = "approve" | "reject" | "request_changes";

export interface V2CandidateReviewRequest {
  readonly candidateId: string;
  readonly action: V2CandidateReviewAction;
  readonly reviewer: string;
  readonly reason: string;
}

export interface V2CandidateReviewResult {
  readonly status: V2CandidateStatus;
  readonly reviewedAt: string;
  readonly reviewReason: string;
}

export interface V2ReleasePackageSummary {
  readonly releaseId: string;
  readonly version: string;
  readonly manifestHash: string;
  readonly immutable: boolean;
  readonly createdAt: string;
  readonly exportFormats: readonly ("json" | "markdown")[];
}

export interface V2PlayerChoiceSummary {
  readonly choiceId: string;
  readonly label: string;
  readonly targetSceneId: string;
  readonly disabled: boolean;
}

export interface V2PlayerRuntimeSummary {
  readonly sceneId: string;
  readonly title: string;
  readonly body: string;
  readonly choices: readonly V2PlayerChoiceSummary[];
  readonly choiceHistory: readonly string[];
}

export interface V2SaveSummary {
  readonly saveId: string;
  readonly label: string;
  readonly runId: string;
  readonly releaseVersion: string;
  readonly currentSceneId: string;
  readonly savedAt: string;
}

export interface V2ExportBundleSummary {
  readonly filename: string;
  readonly format: "json" | "markdown";
  readonly preview: string;
}

export interface V2AssetWorkbenchSummary {
  readonly workflowName: string;
  readonly prompt: string;
  readonly job: V2AssetJobSummary | null;
  readonly candidate: V2AssetCandidateSummary | null;
  readonly library: readonly V2ApprovedAssetSummary[];
}

export interface V2AssetJobSummary extends V2JobRef {
  readonly readableStatus: V2JobRef["status"] | "candidate-ready";
  readonly workflowVersion: string;
  readonly seed: number;
  readonly promptPreview: string;
  readonly candidateId?: string;
  readonly terminalMessage?: string;
}

export interface V2AssetCandidateSummary {
  readonly candidateId: string;
  readonly status: V2CandidateStatus;
  readonly title: string;
  readonly mediaRef: string;
  readonly thumbnailRef: string;
  readonly sourceJobId: string;
  readonly provenanceSummary: string;
  readonly validationNotes: readonly string[];
  readonly reviewedAt?: string;
  readonly reviewer?: string;
  readonly reviewReason?: string;
}

export interface V2ApprovedAssetSummary {
  readonly assetId: string;
  readonly title: string;
  readonly kind: "character_sprite" | "scene_background" | "prop";
  readonly mediaRef: string;
  readonly thumbnailRef: string;
  readonly workflowVersion: string;
  readonly seed: number;
  readonly approved: boolean;
  readonly sourceType: "manual" | "candidate";
  readonly originalFilename?: string;
  readonly mimeType?: string;
  readonly byteSize?: number;
}

export interface V2AssetReviewRequest {
  readonly candidateId: string;
  readonly action: V2CandidateReviewAction;
  readonly reviewer: string;
  readonly reason: string;
}

export interface V2AssetReviewResult {
  readonly status: V2CandidateStatus;
  readonly reviewedAt: string;
  readonly reviewReason: string;
  readonly approvedAsset?: V2ApprovedAssetSummary;
}

export interface V2AssetGenerationRequestInput {
  readonly prompt: string;
  readonly workflowVersion: string;
  readonly workflow: Record<string, unknown>;
  readonly negativePrompt?: string;
  readonly seed?: number;
}

export type V2CanonCreateInput =
  | { readonly kind: "location"; readonly input: Omit<V2CreateLocationRequest, "locationId" | "expectedRevision" | "idempotencyKey"> }
  | { readonly kind: "character"; readonly input: Omit<V2CreateCharacterRequest, "characterId" | "expectedRevision" | "idempotencyKey"> }
  | { readonly kind: "fact"; readonly input: Omit<V2CreateFactRequest, "factId" | "expectedRevision" | "idempotencyKey"> }
  | { readonly kind: "rule"; readonly input: Omit<V2CreateRuleRequest, "ruleId" | "expectedRevision" | "idempotencyKey"> }
  | { readonly kind: "timeline"; readonly input: Omit<V2CreateTimelineEventRequest, "timelineEventId" | "expectedRevision" | "idempotencyKey"> };
export type V2GraphCreateInput =
  | { readonly kind: "arc"; readonly input: Omit<V2CreateArcRequest, "arcId" | "expectedRevision" | "idempotencyKey"> }
  | { readonly kind: "scene"; readonly input: Omit<V2CreateSceneRequest, "sceneId" | "expectedRevision" | "idempotencyKey"> }
  | { readonly kind: "choice"; readonly input: Omit<V2CreateChoiceRequest, "choiceId" | "expectedRevision" | "idempotencyKey"> }
  | { readonly kind: "state"; readonly input: Omit<V2CreateStateVariableRequest, "expectedRevision" | "idempotencyKey"> };
export type V2CanonUpdateInput =
  | { readonly kind: "location"; readonly id: string; readonly input: Omit<V2UpdateLocationRequest, "expectedRevision" | "idempotencyKey"> }
  | { readonly kind: "character"; readonly id: string; readonly input: Omit<V2UpdateCharacterRequest, "expectedRevision" | "idempotencyKey"> }
  | { readonly kind: "fact"; readonly id: string; readonly input: Omit<V2UpdateFactRequest, "expectedRevision" | "idempotencyKey"> }
  | { readonly kind: "rule"; readonly id: string; readonly input: Omit<V2UpdateRuleRequest, "expectedRevision" | "idempotencyKey"> }
  | { readonly kind: "timeline"; readonly id: string; readonly input: Omit<V2UpdateTimelineEventRequest, "expectedRevision" | "idempotencyKey"> };
export type V2GraphUpdateInput =
  | { readonly kind: "arc"; readonly id: string; readonly input: Omit<V2UpdateArcRequest, "expectedRevision" | "idempotencyKey"> }
  | { readonly kind: "scene"; readonly id: string; readonly input: Omit<V2UpdateSceneRequest, "expectedRevision" | "idempotencyKey"> }
  | { readonly kind: "choice"; readonly id: string; readonly input: Omit<V2UpdateChoiceRequest, "expectedRevision" | "idempotencyKey"> }
  | { readonly kind: "state"; readonly id: string; readonly input: Omit<V2UpdateStateVariableRequest, "expectedRevision" | "idempotencyKey"> };

export interface V2WorkspaceAdapter {
  readonly mode: V2WorkspaceMode;
  bootstrapWorkspace(): Promise<void>;
  listStoryWorlds(): Promise<readonly V2StoryWorldDto[]>;
  createStoryWorld(input: { readonly name: string; readonly summary?: string }): Promise<V2StoryWorldDto>;
  updateStoryWorld(input: { readonly storyWorldId: string; readonly name: string; readonly summary?: string; readonly expectedRevision: number }): Promise<V2StoryWorldDto>;
  getSnapshot(storyWorldId?: string): Promise<V2WorkspaceSnapshot>;
  createCanonEntity(input: V2CanonCreateInput & { readonly storyWorldId: string; readonly expectedRevision: number }): Promise<void>;
  updateCanonEntity(input: V2CanonUpdateInput & { readonly storyWorldId: string; readonly expectedRevision: number }): Promise<void>;
  createGraphEntity(input: V2GraphCreateInput & { readonly storyWorldId: string; readonly expectedRevision: number }): Promise<void>;
  updateGraphEntity(input: V2GraphUpdateInput & { readonly storyWorldId: string; readonly expectedRevision: number }): Promise<void>;
  prepareSceneGenerationRequest(request: V2GenerationContextPreviewApiRequest): Promise<V2SceneGenerationPrepareApiResponse>;
  createSceneGenerationJob(request: V2CreateSceneGenerationJobApiRequest): Promise<V2CreateSceneGenerationJobResponse>;
  getSceneGenerationJob(jobId: string): Promise<V2GenerationJobSummary>;
  getAssetGenerationJob(jobId: string): Promise<V2AssetJobSummary>;
  reviewCandidate(request: V2CandidateReviewRequest): Promise<V2CandidateReviewResult>;
  createRelease(): Promise<V2ReleasePackageSummary>;
  startRun(): Promise<{ readonly run: V2RunSummary; readonly player: V2PlayerRuntimeSummary }>;
  submitChoice(choiceId: string): Promise<V2PlayerRuntimeSummary>;
  saveRun(label: string): Promise<V2SaveSummary>;
  restoreSave(saveId: string): Promise<V2PlayerRuntimeSummary>;
  exportRelease(format: "json" | "markdown"): Promise<V2ExportBundleSummary>;
  uploadManualAsset(input: { readonly file: File; readonly title: string }): Promise<V2ApprovedAssetSummary>;
  prepareAssetGenerationRequest(request: V2AssetGenerationRequestInput): Promise<V2PrepareAssetGenerationApiResponse>;
  createAssetJob(request: V2AssetGenerationRequestInput | string): Promise<V2AssetJobSummary>;
  reviewAssetCandidate(request: V2AssetReviewRequest): Promise<V2AssetReviewResult>;
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
