import { StoryMode, type StoryMode as StoryModeValue } from "./story-mode.ts";

export const RelationshipMetric = {
  AFFINITY: "affinity",
  TRUST: "trust",
  CONFLICT: "conflict",
  DEPENDENCY: "dependency",
} as const;

export type RelationshipMetric =
  (typeof RelationshipMetric)[keyof typeof RelationshipMetric];

export interface RelationshipState {
  affinity: number;
  trust: number;
  conflict: number;
  dependency: number;
}

export interface RelationshipDelta {
  affinity: number;
  trust: number;
  conflict: number;
  dependency: number;
}

const RELATIONSHIP_METRICS: readonly RelationshipMetric[] = [
  RelationshipMetric.AFFINITY,
  RelationshipMetric.TRUST,
  RelationshipMetric.CONFLICT,
  RelationshipMetric.DEPENDENCY,
];

export function assertRelationshipState(
  state: RelationshipState,
  field = "relationshipState",
): void {
  for (const metric of RELATIONSHIP_METRICS) {
    const value = state[metric];
    if (!Number.isFinite(value)) {
      throw new TypeError(`${field}.${metric} must be a finite number`);
    }
    if (value < -100 || value > 100) {
      throw new RangeError(`${field}.${metric} must be between -100 and 100`);
    }
  }
}

function assertFiniteMetrics(
  source: "current" | "delta",
  values: RelationshipState | RelationshipDelta,
): void {
  for (const metric of RELATIONSHIP_METRICS) {
    if (!Number.isFinite(values[metric])) {
      throw new TypeError(`${source}.${metric} must be a finite number`);
    }
  }
}

function clampRelationshipMetric(value: number): number {
  return Math.min(100, Math.max(-100, value));
}

export function applyRelationshipDelta(
  mode: StoryModeValue,
  current: RelationshipState,
  delta: RelationshipDelta,
): RelationshipState {
  assertFiniteMetrics("current", current);
  assertFiniteMetrics("delta", delta);

  if (mode === StoryMode.STATIC) {
    return { ...current };
  }

  if (mode === StoryMode.DYNAMIC) {
    return {
      affinity: clampRelationshipMetric(current.affinity + delta.affinity),
      trust: clampRelationshipMetric(current.trust + delta.trust),
      conflict: clampRelationshipMetric(current.conflict + delta.conflict),
      dependency: clampRelationshipMetric(current.dependency + delta.dependency),
    };
  }

  throw new TypeError(`Unsupported story mode: ${String(mode)}`);
}
