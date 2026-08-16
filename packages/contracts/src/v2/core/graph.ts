import type {
  V2ChoiceId,
  V2IdempotencyKey,
  V2Revision,
  V2SceneId,
  V2StoryWorldId,
} from "../shared/index.ts";

export type V2ArcId = string & { readonly __brand: "V2ArcId" };
export type V2StateValue = string | number | boolean;
export type V2StateComparisonOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
export type V2StateConsequenceOperation = "set" | "increment";
export type V2GraphDiagnosticSeverity = "error" | "warning";

export interface V2ArcDto {
  readonly arcId: V2ArcId;
  readonly storyWorldId: V2StoryWorldId;
  readonly title: string;
  readonly summary?: string;
  readonly createdAt: string;
}

export interface V2StateGateDto {
  readonly stateKey: string;
  readonly operator: V2StateComparisonOperator;
  readonly value: V2StateValue;
}

export interface V2StateConsequenceDto {
  readonly stateKey: string;
  readonly operation: V2StateConsequenceOperation;
  readonly value: V2StateValue;
}

export interface V2SceneDto {
  readonly sceneId: V2SceneId;
  readonly storyWorldId: V2StoryWorldId;
  readonly arcId?: V2ArcId;
  readonly title: string;
  readonly body?: string;
  readonly isEntry: boolean;
  readonly createdAt: string;
}

export interface V2ChoiceDto {
  readonly choiceId: V2ChoiceId;
  readonly storyWorldId: V2StoryWorldId;
  readonly sourceSceneId: V2SceneId;
  readonly targetSceneId?: V2SceneId;
  readonly label: string;
  readonly gates: readonly V2StateGateDto[];
  readonly consequences: readonly V2StateConsequenceDto[];
  readonly createdAt: string;
}

export interface V2GraphSnapshotDto {
  readonly arcs: readonly V2ArcDto[];
  readonly scenes: readonly V2SceneDto[];
  readonly choices: readonly V2ChoiceDto[];
}

export interface V2GraphDiagnosticDto {
  readonly code: string;
  readonly severity: V2GraphDiagnosticSeverity;
  readonly message: string;
  readonly sceneId?: V2SceneId;
  readonly choiceId?: V2ChoiceId;
}

export interface V2GraphValidationDto {
  readonly valid: boolean;
  readonly diagnostics: readonly V2GraphDiagnosticDto[];
}

export interface V2CreateArcRequest {
  readonly arcId: V2ArcId;
  readonly title: string;
  readonly summary?: string;
  readonly expectedRevision: V2Revision;
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2CreateSceneRequest {
  readonly sceneId: V2SceneId;
  readonly arcId?: V2ArcId;
  readonly title: string;
  readonly body?: string;
  readonly isEntry?: boolean;
  readonly expectedRevision: V2Revision;
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2CreateChoiceRequest {
  readonly choiceId: V2ChoiceId;
  readonly sourceSceneId: V2SceneId;
  readonly targetSceneId?: V2SceneId;
  readonly label: string;
  readonly gates?: readonly V2StateGateDto[];
  readonly consequences?: readonly V2StateConsequenceDto[];
  readonly expectedRevision: V2Revision;
  readonly idempotencyKey: V2IdempotencyKey;
}
export interface V2UpdateArcRequest {
  readonly title: string;
  readonly summary?: string;
  readonly expectedRevision: V2Revision;
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2UpdateSceneRequest extends V2UpdateArcRequest {
  readonly arcId?: V2ArcId;
  readonly body?: string;
  readonly isEntry: boolean;
}

export interface V2UpdateChoiceRequest {
  readonly sourceSceneId: V2SceneId;
  readonly targetSceneId?: V2SceneId;
  readonly label: string;
  readonly gates?: readonly V2StateGateDto[];
  readonly consequences?: readonly V2StateConsequenceDto[];
  readonly expectedRevision: V2Revision;
  readonly idempotencyKey: V2IdempotencyKey;
}
