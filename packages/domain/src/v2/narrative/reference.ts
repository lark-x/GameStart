import { V2DomainError } from "../shared/index.ts";

export type V2NarrativeReferenceSourceType =
  | "arc"
  | "chapter"
  | "quest"
  | "scene"
  | "scene_block";

export type V2NarrativeReferenceTargetType =
  | "character"
  | "location"
  | "lore"
  | "timeline_event"
  | "fact"
  | "rule";

export type V2NarrativeReferenceRole =
  | "participant"
  | "speaker"
  | "location"
  | "mentioned"
  | "subject"
  | "affected"
  | "related"
  | "prerequisite";

const VALID_SOURCE_TYPES = new Set<string>(["arc", "chapter", "quest", "scene", "scene_block"]);
const VALID_TARGET_TYPES = new Set<string>(["character", "location", "lore", "timeline_event", "fact", "rule"]);
const VALID_ROLES = new Set<string>([
  "participant",
  "speaker",
  "location",
  "mentioned",
  "subject",
  "affected",
  "related",
  "prerequisite",
]);

export interface V2NarrativeReference {
  readonly referenceId: string;
  readonly storyWorldId: string;
  readonly sourceType: V2NarrativeReferenceSourceType;
  readonly sourceId: string;
  readonly targetType: V2NarrativeReferenceTargetType;
  readonly targetId: string;
  readonly role: V2NarrativeReferenceRole;
  readonly createdAt?: string;
}

export function createV2NarrativeReference(input: {
  readonly referenceId: string;
  readonly storyWorldId: string;
  readonly sourceType: V2NarrativeReferenceSourceType;
  readonly sourceId: string;
  readonly targetType: V2NarrativeReferenceTargetType;
  readonly targetId: string;
  readonly role: V2NarrativeReferenceRole;
  readonly createdAt?: string;
}): V2NarrativeReference {
  if (!VALID_SOURCE_TYPES.has(input.sourceType)) {
    throw new V2DomainError("INVALID_INPUT", `unsupported reference source type: ${input.sourceType}`);
  }
  if (!VALID_TARGET_TYPES.has(input.targetType)) {
    throw new V2DomainError("INVALID_INPUT", `unsupported reference target type: ${input.targetType}`);
  }
  if (!VALID_ROLES.has(input.role)) {
    throw new V2DomainError("INVALID_INPUT", `unsupported reference role: ${input.role}`);
  }

  return {
    referenceId: assertNonEmptyId(input.referenceId, "referenceId"),
    storyWorldId: assertNonEmptyId(input.storyWorldId, "storyWorldId"),
    sourceType: input.sourceType,
    sourceId: assertNonEmptyId(input.sourceId, "sourceId"),
    targetType: input.targetType,
    targetId: assertNonEmptyId(input.targetId, "targetId"),
    role: input.role,
    ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
  };
}

/**
 * Boundary-friendly variant for structured external input. It validates string
 * discriminants before delegating to the typed constructor, so API callers do
 * not cast untrusted model output into domain unions.
 */
export function createV2NarrativeReferenceFromValues(input: {
  readonly referenceId: string;
  readonly storyWorldId: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly role: string;
  readonly createdAt?: string;
}): V2NarrativeReference {
  if (!VALID_SOURCE_TYPES.has(input.sourceType)) {
    throw new V2DomainError("INVALID_INPUT", `unsupported reference source type: ${input.sourceType}`);
  }
  if (!VALID_TARGET_TYPES.has(input.targetType)) {
    throw new V2DomainError("INVALID_INPUT", `unsupported reference target type: ${input.targetType}`);
  }
  if (!VALID_ROLES.has(input.role)) {
    throw new V2DomainError("INVALID_INPUT", `unsupported reference role: ${input.role}`);
  }
  return createV2NarrativeReference({
    ...input,
    sourceType: input.sourceType as V2NarrativeReferenceSourceType,
    targetType: input.targetType as V2NarrativeReferenceTargetType,
    role: input.role as V2NarrativeReferenceRole,
  });
}
function assertNonEmptyId(value: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 128) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be a non-empty id up to 128 characters`);
  }
  return value.trim();
}
