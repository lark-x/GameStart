import { V2DomainError } from "../shared/index.ts";

export interface V2AssetCandidateInput {
  readonly mediaRef: string;
  readonly prompt: string;
  readonly workflowVersion: string;
  readonly seed?: number;
}

function nonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new V2DomainError("INVALID_INPUT", `${field} must not be empty`);
  return trimmed;
}

export function assertV2AssetMediaRef(value: string): string {
  const mediaRef = nonEmpty(value, "mediaRef");
  if (!mediaRef.startsWith("media://local/") && !mediaRef.startsWith("media://fake-comfy/")) {
    throw new V2DomainError("INVALID_INPUT", "asset mediaRef must use a controlled media:// reference");
  }
  if (mediaRef.includes("..") || mediaRef.includes("\\") || mediaRef.includes("//local//")) {
    throw new V2DomainError("INVALID_INPUT", "asset mediaRef must not contain unsafe path segments");
  }
  return mediaRef;
}

export function assertV2AssetCandidateInput(input: V2AssetCandidateInput): V2AssetCandidateInput {
  const result: {
    mediaRef: string;
    prompt: string;
    workflowVersion: string;
    seed?: number;
  } = {
    mediaRef: assertV2AssetMediaRef(input.mediaRef),
    prompt: nonEmpty(input.prompt, "prompt"),
    workflowVersion: nonEmpty(input.workflowVersion, "workflowVersion"),
  };
  if (input.seed !== undefined) {
    if (!Number.isSafeInteger(input.seed) || input.seed < 0) {
      throw new V2DomainError("INVALID_INPUT", "seed must be a non-negative integer");
    }
    result.seed = input.seed;
  }
  return result;
}
