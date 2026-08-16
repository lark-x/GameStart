import type {
  V2IdempotencyKey,
  V2Revision,
  V2StoryWorldId,
} from "../shared/index.ts";
import type {
  V2StateConsequenceOperation,
  V2StateValue,
} from "./graph.ts";

export type V2StateValueType = "string" | "number" | "boolean";

export interface V2StateVariableDto {
  readonly storyWorldId: V2StoryWorldId;
  readonly key: string;
  readonly valueType: V2StateValueType;
  readonly defaultValue: V2StateValue;
  readonly createdAt: string;
}

export interface V2StateSnapshotDto {
  readonly values: Record<string, V2StateValue>;
}

export interface V2StateDeltaDto {
  readonly stateKey: string;
  readonly operation: V2StateConsequenceOperation;
  readonly value: V2StateValue;
}

export interface V2StateDeltaDiagnosticDto {
  readonly code: string;
  readonly message: string;
  readonly stateKey?: string;
  readonly deltaIndex?: number;
}

export interface V2StateDeltaPreviewDto {
  readonly valid: boolean;
  readonly values: Record<string, V2StateValue>;
  readonly diagnostics: readonly V2StateDeltaDiagnosticDto[];
}

export interface V2CreateStateVariableRequest {
  readonly key: string;
  readonly valueType: V2StateValueType;
  readonly defaultValue: V2StateValue;
  readonly expectedRevision: V2Revision;
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2PreviewStateDeltaRequest {
  readonly currentValues?: Record<string, V2StateValue>;
  readonly deltas: readonly V2StateDeltaDto[];
}

export interface V2UpdateStateVariableRequest {
  readonly defaultValue: V2StateValue;
  readonly expectedRevision: V2Revision;
  readonly idempotencyKey: V2IdempotencyKey;
}
