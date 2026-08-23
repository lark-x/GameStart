import { V2DomainError } from "../shared/index.ts";

export type V2QuestKind =
  | "main"
  | "story"
  | "character"
  | "side"
  | "world"
  | "event"
  | "custom";

const VALID_QUEST_KINDS = new Set<string>([
  "main",
  "story",
  "character",
  "side",
  "world",
  "event",
  "custom",
]);

export interface V2NarrativeQuest {
  readonly questId: string;
  readonly storyWorldId: string;
  readonly arcId?: string;
  readonly chapterId?: string;
  readonly title: string;
  readonly summary?: string;
  readonly kind: V2QuestKind;
  readonly ordinal: number;
  readonly revision: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export function createV2NarrativeQuest(input: {
  readonly questId: string;
  readonly storyWorldId: string;
  readonly arcId?: string;
  readonly chapterId?: string;
  readonly title: string;
  readonly summary?: string;
  readonly kind?: V2QuestKind;
  readonly ordinal?: number;
  readonly revision?: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}): V2NarrativeQuest {
  const ordinal = input.ordinal ?? 0;
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new V2DomainError("INVALID_INPUT", "quest ordinal must be a non-negative integer");
  }
  const revision = input.revision ?? 1;
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new V2DomainError("INVALID_INPUT", "quest revision must be a positive integer");
  }
  const kind = input.kind ?? "main";
  if (!VALID_QUEST_KINDS.has(kind)) {
    throw new V2DomainError("INVALID_INPUT", `unsupported quest kind: ${kind}`);
  }

  return {
    questId: assertNonEmptyId(input.questId, "questId"),
    storyWorldId: assertNonEmptyId(input.storyWorldId, "storyWorldId"),
    ...(input.arcId === undefined || input.arcId === null || input.arcId.trim() === ""
      ? {}
      : { arcId: assertNonEmptyId(input.arcId, "arcId") }),
    ...(input.chapterId === undefined || input.chapterId === null || input.chapterId.trim() === ""
      ? {}
      : { chapterId: assertNonEmptyId(input.chapterId, "chapterId") }),
    title: assertNonEmptyText(input.title, "title", 160),
    ...(input.summary === undefined || input.summary === null || input.summary.trim() === ""
      ? {}
      : { summary: assertOptionalText(input.summary, "summary", 1200) }),
    kind,
    ordinal,
    revision,
    ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
    ...(input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt }),
  };
}

function assertNonEmptyId(value: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 128) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be a non-empty id up to 128 characters`);
  }
  return value.trim();
}

function assertNonEmptyText(value: string, field: string, maxLength: number): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be between 1 and ${maxLength} characters`);
  }
  return trimmed;
}

function assertOptionalText(value: string, field: string, maxLength: number): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length > maxLength) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be ${maxLength} characters or shorter`);
  }
  return trimmed;
}
