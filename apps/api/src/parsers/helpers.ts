import type {
  CreateStoryArcRequest,
  CreateStoryNodeRequest,
  CreateStoryEdgeRequest,
  CreatePromptTemplateRequest,
} from "@living-network/contracts";
import { ApiError, bodyStringArray } from "../helpers.ts";

export function parseOptionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  return bodyStringArray(value, field);
}

export function parseStoryArcStatus(value: unknown, field: string): NonNullable<CreateStoryArcRequest["status"]> {
  if (value === "DRAFT" || value === "ACTIVE" || value === "ARCHIVED") return value;
  throw new ApiError(400, "BAD_REQUEST", `${field} is invalid`);
}

export function parseStoryNodeType(value: unknown, field: string): CreateStoryNodeRequest["nodeType"] {
  if (
    value === "MILESTONE" ||
    value === "TURNING_POINT" ||
    value === "SCENE_SEED" ||
    value === "CHECKPOINT" ||
    value === "ENDING"
  ) return value;
  throw new ApiError(400, "BAD_REQUEST", `${field} is invalid`);
}

export function parseStoryNodeStatus(value: unknown, field: string): NonNullable<CreateStoryNodeRequest["status"]> {
  if (
    value === "DRAFT" ||
    value === "PLANNED" ||
    value === "READY" ||
    value === "GENERATED" ||
    value === "LOCKED"
  ) return value;
  throw new ApiError(400, "BAD_REQUEST", `${field} is invalid`);
}

export function parseStoryNodeTimeMode(value: unknown, field: string): CreateStoryNodeRequest["timeMode"] {
  if (value === "ABSOLUTE" || value === "RELATIVE" || value === "FLOATING") return value;
  throw new ApiError(400, "BAD_REQUEST", `${field} is invalid`);
}

export function parseStoryEdgeType(value: unknown, field: string): CreateStoryEdgeRequest["edgeType"] {
  if (
    value === "LEADS_TO" ||
    value === "BRANCHES_TO" ||
    value === "BLOCKS" ||
    value === "UNLOCKS" ||
    value === "PARALLEL"
  ) return value;
  throw new ApiError(400, "BAD_REQUEST", `${field} is invalid`);
}

export function parsePromptTemplateType(value: unknown, field: string): CreatePromptTemplateRequest["type"] {
  if (
    value === "WORLD" ||
    value === "CHARACTER" ||
    value === "RELATIONSHIP" ||
    value === "STORY_NODE" ||
    value === "MEMORY_RETRIEVAL" ||
    value === "OUTPUT_FORMAT"
  ) return value;
  throw new ApiError(400, "BAD_REQUEST", `${field} is invalid`);
}

