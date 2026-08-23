import type {
  V2ChoiceId,
  V2IdempotencyKey,
  V2ReleaseId,
  V2RunId,
  V2SaveId,
  V2SceneId,
} from "../shared/index.ts";
import type { V2StateValue } from "./graph.ts";
import type { V2SceneBlock } from "../narrative/scene-document.ts";

export type V2CharacterRuntimeState = Record<string, Record<string, V2StateValue>>;
export type V2RelationshipRuntimeOverlay = Record<string, number>;
export type V2CharacterEventInstance = { readonly eventInstanceId: string; readonly eventDefinitionId: string; readonly state: Record<string, V2StateValue> };

export interface V2RuntimeRunDto {
  readonly runId: V2RunId;
  readonly releaseId: V2ReleaseId;
  readonly releaseVersion: string;
  readonly currentSceneId: V2SceneId;
  readonly stateValues: Record<string, V2StateValue>;
  readonly choiceHistory: readonly V2ChoiceId[];
  readonly characterState: V2CharacterRuntimeState;
  readonly relationshipRuntime: V2RelationshipRuntimeOverlay;
  readonly eventInstances: readonly V2CharacterEventInstance[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface V2RuntimeSceneDto {
  readonly run: V2RuntimeRunDto;
  readonly scene: {
    readonly sceneId: V2SceneId;
    readonly title: string;
    readonly body?: string;
    /** Structured narrative content takes precedence over legacy body text. */
    readonly blocks?: readonly V2SceneBlock[];
  };
  readonly availableChoices: readonly {
    readonly choiceId: V2ChoiceId;
    readonly label: string;
    readonly targetSceneId?: V2SceneId;
  }[];
}

export interface V2RuntimeSaveDto {
  readonly saveId: V2SaveId;
  readonly runId: V2RunId;
  readonly releaseId: V2ReleaseId;
  readonly releaseVersion: string;
  readonly currentSceneId: V2SceneId;
  readonly stateValues: Record<string, V2StateValue>;
  readonly choiceHistory: readonly V2ChoiceId[];
  readonly characterState: V2CharacterRuntimeState;
  readonly relationshipRuntime: V2RelationshipRuntimeOverlay;
  readonly eventInstances: readonly V2CharacterEventInstance[];
  readonly label?: string;
  readonly createdAt: string;
}

export interface V2StartRuntimeRunRequest {
  readonly runId: V2RunId;
  readonly releaseId: V2ReleaseId;
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2SubmitRuntimeChoiceRequest {
  readonly choiceId: V2ChoiceId;
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2CreateRuntimeSaveRequest {
  readonly saveId: V2SaveId;
  readonly label?: string;
  readonly idempotencyKey: V2IdempotencyKey;
}

export interface V2LoadRuntimeSaveRequest {
  readonly runId: V2RunId;
  readonly idempotencyKey: V2IdempotencyKey;
}
