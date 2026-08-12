import type {
  V2GraphChoice,
  V2GraphScene,
  V2GraphStateGate,
} from "./graph.ts";
import type {
  V2TypedStateValue,
  V2TypedStateVariable,
} from "./state.ts";
import {
  applyV2TypedStateDelta,
  buildV2InitialTypedState,
} from "./state.ts";
import { V2DomainError } from "../shared/index.ts";

export interface V2RuntimeRun {
  readonly runId: string;
  readonly releaseId: string;
  readonly releaseVersion: string;
  readonly currentSceneId: string;
  readonly stateValues: Record<string, V2TypedStateValue>;
  readonly choiceHistory: readonly string[];
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export function startV2RuntimeRun(input: {
  readonly runId: string;
  readonly releaseId: string;
  readonly releaseVersion: string;
  readonly scenes: readonly V2GraphScene[];
  readonly stateSchema: readonly V2TypedStateVariable[];
}): V2RuntimeRun {
  const entryScene = input.scenes.find((scene) => scene.isEntry);
  if (!entryScene) throw new V2DomainError("RELEASE_INVARIANT_FAILED", "Release has no entry scene");
  return {
    runId: assertNonEmptyId(input.runId, "runId"),
    releaseId: assertNonEmptyId(input.releaseId, "releaseId"),
    releaseVersion: input.releaseVersion,
    currentSceneId: entryScene.sceneId,
    stateValues: buildV2InitialTypedState(input.stateSchema),
    choiceHistory: [],
  };
}

export function loadV2RuntimeSave(input: {
  readonly runId: string;
  readonly releaseId: string;
  readonly releaseVersion: string;
  readonly currentSceneId: string;
  readonly stateValues: Record<string, V2TypedStateValue>;
  readonly choiceHistory: readonly string[];
}): V2RuntimeRun {
  return {
    runId: assertNonEmptyId(input.runId, "runId"),
    releaseId: assertNonEmptyId(input.releaseId, "releaseId"),
    releaseVersion: input.releaseVersion,
    currentSceneId: assertNonEmptyId(input.currentSceneId, "currentSceneId"),
    stateValues: input.stateValues,
    choiceHistory: input.choiceHistory,
  };
}

export function getV2RuntimeScene(input: {
  readonly run: V2RuntimeRun;
  readonly scenes: readonly V2GraphScene[];
  readonly choices: readonly V2GraphChoice[];
}): {
  readonly scene: V2GraphScene;
  readonly availableChoices: readonly V2GraphChoice[];
} {
  const scene = input.scenes.find((candidate) => candidate.sceneId === input.run.currentSceneId);
  if (!scene) throw new V2DomainError("RELEASE_INVARIANT_FAILED", "Runtime current scene is missing from release");
  return {
    scene,
    availableChoices: input.choices.filter((choice) =>
      choice.sourceSceneId === scene.sceneId && choice.gates.every((gate) => evaluateGate(input.run.stateValues, gate))
    ),
  };
}

export function submitV2RuntimeChoice(input: {
  readonly run: V2RuntimeRun;
  readonly choice: V2GraphChoice;
  readonly scenes: readonly V2GraphScene[];
  readonly stateSchema: readonly V2TypedStateVariable[];
}): V2RuntimeRun {
  if (input.choice.sourceSceneId !== input.run.currentSceneId) {
    throw new V2DomainError("INVALID_INPUT", "choiceId is not available from the current scene");
  }
  if (!input.choice.gates.every((gate) => evaluateGate(input.run.stateValues, gate))) {
    throw new V2DomainError("INVALID_INPUT", "choice gates are not satisfied");
  }
  const targetSceneId = input.choice.targetSceneId ?? input.run.currentSceneId;
  if (!input.scenes.some((scene) => scene.sceneId === targetSceneId)) {
    throw new V2DomainError("RELEASE_INVARIANT_FAILED", "choice target scene is missing from release");
  }
  return {
    ...input.run,
    currentSceneId: targetSceneId,
    stateValues: applyV2TypedStateDelta({
      schema: input.stateSchema,
      currentValues: input.run.stateValues,
      deltas: input.choice.consequences.map((consequence) => ({
        stateKey: consequence.stateKey,
        operation: consequence.operation,
        value: consequence.value,
      })),
    }),
    choiceHistory: [...input.run.choiceHistory, input.choice.choiceId],
  };
}

function evaluateGate(values: Record<string, V2TypedStateValue>, gate: V2GraphStateGate): boolean {
  const current = values[gate.stateKey];
  if (gate.operator === "eq") return current === gate.value;
  if (gate.operator === "neq") return current !== gate.value;
  if (typeof current !== "number" || typeof gate.value !== "number") return false;
  if (gate.operator === "gt") return current > gate.value;
  if (gate.operator === "gte") return current >= gate.value;
  if (gate.operator === "lt") return current < gate.value;
  return current <= gate.value;
}

function assertNonEmptyId<T extends string>(value: T, field: string): T {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 128) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be a non-empty id up to 128 characters`);
  }
  return value;
}
