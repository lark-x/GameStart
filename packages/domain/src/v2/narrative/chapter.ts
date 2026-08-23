import { V2DomainError } from "../shared/index.ts";

export interface V2NarrativeChapter {
  readonly chapterId: string;
  readonly storyWorldId: string;
  readonly arcId: string;
  readonly title: string;
  readonly summary?: string;
  readonly ordinal: number;
  readonly revision: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export function createV2NarrativeChapter(input: {
  readonly chapterId: string;
  readonly storyWorldId: string;
  readonly arcId: string;
  readonly title: string;
  readonly summary?: string;
  readonly ordinal?: number;
  readonly revision?: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}): V2NarrativeChapter {
  const ordinal = input.ordinal ?? 0;
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new V2DomainError("INVALID_INPUT", "chapter ordinal must be a non-negative integer");
  }
  const revision = input.revision ?? 1;
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new V2DomainError("INVALID_INPUT", "chapter revision must be a positive integer");
  }

  return {
    chapterId: assertNonEmptyId(input.chapterId, "chapterId"),
    storyWorldId: assertNonEmptyId(input.storyWorldId, "storyWorldId"),
    arcId: assertNonEmptyId(input.arcId, "arcId"),
    title: assertNonEmptyText(input.title, "title", 160),
    ...(input.summary === undefined || input.summary === null || input.summary.trim() === ""
      ? {}
      : { summary: assertOptionalText(input.summary, "summary", 1200) }),
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
