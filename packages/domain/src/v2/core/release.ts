import { createHash } from "node:crypto";

import type { V2CanonWorld } from "./canon.ts";
import type {
  V2GraphArc,
  V2GraphChoice,
  V2GraphScene,
} from "./graph.ts";
import { validateV2Graph } from "./graph.ts";
import type { V2TypedStateVariable } from "./state.ts";
import { V2DomainError } from "../shared/index.ts";

export interface V2ReleaseManifest {
  readonly releaseId: string;
  readonly storyWorldId: string;
  readonly version: string;
  readonly sourceRevision: number;
  readonly contentHash: string;
  readonly canon: unknown;
  readonly graph: {
    readonly arcs: readonly V2GraphArc[];
    readonly scenes: readonly V2GraphScene[];
    readonly choices: readonly V2GraphChoice[];
  };
  readonly stateSchema: readonly V2TypedStateVariable[];
  readonly createdAt?: string;
}

export function buildV2ReleasePreflight(input: {
  readonly world: V2CanonWorld;
  readonly scenes: readonly V2GraphScene[];
  readonly choices: readonly V2GraphChoice[];
}) {
  const diagnostics = [...validateV2Graph({ scenes: input.scenes, choices: input.choices }).diagnostics];
  if (input.world.revision < 1) {
    diagnostics.push({
      code: "INVALID_SOURCE_REVISION",
      severity: "error" as const,
      message: "Release source revision must be positive",
    });
  }
  return {
    valid: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    diagnostics,
  };
}

export function createV2ReleaseManifest(input: {
  readonly releaseId: string;
  readonly storyWorldId: string;
  readonly version: string;
  readonly sourceRevision: number;
  readonly canon: unknown;
  readonly graph: {
    readonly arcs: readonly V2GraphArc[];
    readonly scenes: readonly V2GraphScene[];
    readonly choices: readonly V2GraphChoice[];
  };
  readonly stateSchema: readonly V2TypedStateVariable[];
}): V2ReleaseManifest {
  if (input.releaseId.trim().length === 0 || input.releaseId.length > 128) {
    throw new V2DomainError("INVALID_INPUT", "releaseId must be a non-empty id up to 128 characters");
  }
  if (!/^[0-9]+(?:\.[0-9]+){0,2}(?:-[A-Za-z0-9.-]+)?$/.test(input.version)) {
    throw new V2DomainError("INVALID_INPUT", "release version must be a stable semantic-like version");
  }
  if (!Number.isSafeInteger(input.sourceRevision) || input.sourceRevision < 1) {
    throw new V2DomainError("INVALID_INPUT", "sourceRevision must be a positive integer");
  }

  const content = {
    storyWorldId: input.storyWorldId,
    version: input.version,
    sourceRevision: input.sourceRevision,
    canon: input.canon,
    graph: input.graph,
    stateSchema: input.stateSchema,
  };
  return {
    releaseId: input.releaseId,
    storyWorldId: input.storyWorldId,
    version: input.version,
    sourceRevision: input.sourceRevision,
    contentHash: hashStableJson(content),
    canon: input.canon,
    graph: input.graph,
    stateSchema: input.stateSchema,
  };
}

export function hashStableJson(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
