import { V2DomainError } from "../shared/index.ts";

export type V2GraphStoryWorldId = string;
export type V2GraphArcId = string;
export type V2GraphSceneId = string;
export type V2GraphChoiceId = string;
export type V2GraphStateValue = string | number | boolean;
export type V2GraphStateComparisonOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
export type V2GraphStateConsequenceOperation = "set" | "increment";
export type V2GraphDiagnosticSeverity = "error" | "warning";

export interface V2GraphStateGate {
  readonly stateKey: string;
  readonly operator: V2GraphStateComparisonOperator;
  readonly value: V2GraphStateValue;
}

export interface V2GraphStateConsequence {
  readonly stateKey: string;
  readonly operation: V2GraphStateConsequenceOperation;
  readonly value: V2GraphStateValue;
}

export interface V2GraphArc {
  readonly arcId: V2GraphArcId;
  readonly storyWorldId: V2GraphStoryWorldId;
  readonly title: string;
  readonly summary?: string;
  readonly createdAt?: string;
}

export interface V2GraphScene {
  readonly sceneId: V2GraphSceneId;
  readonly storyWorldId: V2GraphStoryWorldId;
  readonly arcId?: V2GraphArcId;
  readonly title: string;
  readonly body?: string;
  readonly isEntry: boolean;
  readonly createdAt?: string;
}

export interface V2GraphChoice {
  readonly choiceId: V2GraphChoiceId;
  readonly storyWorldId: V2GraphStoryWorldId;
  readonly sourceSceneId: V2GraphSceneId;
  readonly targetSceneId?: V2GraphSceneId;
  readonly label: string;
  readonly gates: readonly V2GraphStateGate[];
  readonly consequences: readonly V2GraphStateConsequence[];
  readonly createdAt?: string;
}

export interface V2GraphDiagnostic {
  readonly code: string;
  readonly severity: V2GraphDiagnosticSeverity;
  readonly message: string;
  readonly sceneId?: V2GraphSceneId;
  readonly choiceId?: V2GraphChoiceId;
}

export interface V2GraphValidation {
  readonly valid: boolean;
  readonly diagnostics: readonly V2GraphDiagnostic[];
}

export function createV2GraphArc(input: {
  readonly storyWorldId: V2GraphStoryWorldId;
  readonly arcId: V2GraphArcId;
  readonly title: string;
  readonly summary?: string;
}): V2GraphArc {
  return {
    storyWorldId: assertNonEmptyId(input.storyWorldId, "storyWorldId"),
    arcId: assertNonEmptyId(input.arcId, "arcId"),
    title: assertNonEmptyText(input.title, "title", 160),
    ...(input.summary === undefined ? {} : { summary: assertOptionalText(input.summary, "summary", 1200) }),
  };
}

export function createV2GraphScene(input: {
  readonly storyWorldId: V2GraphStoryWorldId;
  readonly sceneId: V2GraphSceneId;
  readonly arc?: V2GraphArc;
  readonly arcId?: V2GraphArcId;
  readonly title: string;
  readonly body?: string;
  readonly isEntry?: boolean;
}): V2GraphScene {
  if (input.arc && input.arc.storyWorldId !== input.storyWorldId) {
    throw new V2DomainError("CROSS_WORLD_REFERENCE", "arcId must belong to the same story world");
  }
  const arcId = input.arc?.arcId ?? input.arcId;
  return {
    storyWorldId: assertNonEmptyId(input.storyWorldId, "storyWorldId"),
    sceneId: assertNonEmptyId(input.sceneId, "sceneId"),
    ...(arcId === undefined ? {} : { arcId: assertNonEmptyId(arcId, "arcId") }),
    title: assertNonEmptyText(input.title, "title", 160),
    ...(input.body === undefined ? {} : { body: assertOptionalText(input.body, "body", 8000) }),
    isEntry: input.isEntry ?? false,
  };
}

export function createV2GraphChoice(input: {
  readonly storyWorldId: V2GraphStoryWorldId;
  readonly choiceId: V2GraphChoiceId;
  readonly sourceScene: V2GraphScene;
  readonly targetScene?: V2GraphScene;
  readonly targetSceneId?: V2GraphSceneId;
  readonly label: string;
  readonly gates?: readonly V2GraphStateGate[];
  readonly consequences?: readonly V2GraphStateConsequence[];
}): V2GraphChoice {
  if (input.sourceScene.storyWorldId !== input.storyWorldId) {
    throw new V2DomainError("CROSS_WORLD_REFERENCE", "sourceSceneId must belong to the same story world");
  }
  if (input.targetScene && input.targetScene.storyWorldId !== input.storyWorldId) {
    throw new V2DomainError("CROSS_WORLD_REFERENCE", "targetSceneId must belong to the same story world");
  }
  const targetSceneId = input.targetScene?.sceneId ?? input.targetSceneId;
  return {
    storyWorldId: assertNonEmptyId(input.storyWorldId, "storyWorldId"),
    choiceId: assertNonEmptyId(input.choiceId, "choiceId"),
    sourceSceneId: assertNonEmptyId(input.sourceScene.sceneId, "sourceSceneId"),
    ...(targetSceneId === undefined ? {} : { targetSceneId: assertNonEmptyId(targetSceneId, "targetSceneId") }),
    label: assertNonEmptyText(input.label, "label", 200),
    gates: (input.gates ?? []).map(assertGate),
    consequences: (input.consequences ?? []).map(assertConsequence),
  };
}

export function validateV2Graph(input: {
  readonly scenes: readonly V2GraphScene[];
  readonly choices: readonly V2GraphChoice[];
}): V2GraphValidation {
  const diagnostics: V2GraphDiagnostic[] = [];
  const sceneIds = new Set(input.scenes.map((scene) => scene.sceneId));
  const entryScenes = input.scenes.filter((scene) => scene.isEntry);

  if (entryScenes.length === 0) {
    diagnostics.push({
      code: "MISSING_ENTRY_SCENE",
      severity: "error",
      message: "Graph must contain exactly one entry scene",
    });
  } else if (entryScenes.length > 1) {
    for (const scene of entryScenes) {
      diagnostics.push({
        code: "MULTIPLE_ENTRY_SCENES",
        severity: "error",
        message: "Graph must contain exactly one entry scene",
        sceneId: scene.sceneId,
      });
    }
  }

  for (const choice of input.choices) {
    if (!sceneIds.has(choice.sourceSceneId)) {
      diagnostics.push({
        code: "MISSING_SOURCE_SCENE",
        severity: "error",
        message: "Choice sourceSceneId must reference an existing scene",
        choiceId: choice.choiceId,
        sceneId: choice.sourceSceneId,
      });
    }
    if (choice.targetSceneId !== undefined && !sceneIds.has(choice.targetSceneId)) {
      diagnostics.push({
        code: "MISSING_TARGET_SCENE",
        severity: "error",
        message: "Choice targetSceneId must reference an existing scene when provided",
        choiceId: choice.choiceId,
        sceneId: choice.targetSceneId,
      });
    }
  }

  if (entryScenes.length === 1) {
    const reachable = collectReachableSceneIds(entryScenes[0]!.sceneId, input.choices);
    for (const scene of input.scenes) {
      if (!reachable.has(scene.sceneId)) {
        diagnostics.push({
          code: "UNREACHABLE_SCENE",
          severity: "warning",
          message: "Scene is not reachable from the entry scene",
          sceneId: scene.sceneId,
        });
      }
    }
  }

  return {
    valid: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    diagnostics,
  };
}

function collectReachableSceneIds(entrySceneId: V2GraphSceneId, choices: readonly V2GraphChoice[]): Set<V2GraphSceneId> {
  const outgoing = new Map<V2GraphSceneId, V2GraphSceneId[]>();
  for (const choice of choices) {
    if (choice.targetSceneId === undefined) continue;
    const existing = outgoing.get(choice.sourceSceneId) ?? [];
    existing.push(choice.targetSceneId);
    outgoing.set(choice.sourceSceneId, existing);
  }

  const reachable = new Set<V2GraphSceneId>();
  const queue = [entrySceneId];
  for (let index = 0; index < queue.length; index += 1) {
    const sceneId = queue[index]!;
    if (reachable.has(sceneId)) continue;
    reachable.add(sceneId);
    for (const next of outgoing.get(sceneId) ?? []) queue.push(next);
  }
  return reachable;
}

function assertGate(input: V2GraphStateGate): V2GraphStateGate {
  if (!["eq", "neq", "gt", "gte", "lt", "lte"].includes(input.operator)) {
    throw new V2DomainError("INVALID_INPUT", "gate operator is not supported");
  }
  return {
    stateKey: assertStateKey(input.stateKey),
    operator: input.operator,
    value: assertStateValue(input.value, "gate value"),
  };
}

function assertConsequence(input: V2GraphStateConsequence): V2GraphStateConsequence {
  if (input.operation !== "set" && input.operation !== "increment") {
    throw new V2DomainError("INVALID_INPUT", "consequence operation is not supported");
  }
  return {
    stateKey: assertStateKey(input.stateKey),
    operation: input.operation,
    value: assertStateValue(input.value, "consequence value"),
  };
}

function assertStateKey(value: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value)) {
    throw new V2DomainError("INVALID_INPUT", "stateKey must start with a letter and contain only letters, numbers, and underscores");
  }
  return value;
}

function assertStateValue(value: unknown, field: string): V2GraphStateValue {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  throw new V2DomainError("INVALID_INPUT", `${field} must be a string, number, or boolean`);
}

function assertNonEmptyId<T extends string>(value: T, field: string): T {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 128) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be a non-empty id up to 128 characters`);
  }
  return value;
}

function assertNonEmptyText(value: string, field: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be between 1 and ${maxLength} characters`);
  }
  return trimmed;
}

function assertOptionalText(value: string, field: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be ${maxLength} characters or shorter`);
  }
  return trimmed;
}
