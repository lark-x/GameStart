import { V2DomainError } from "../shared/index.ts";

export type V2SceneDocumentMode = "legacy_body" | "blocks";

export interface V2NarrativeScene {
  readonly sceneId: string;
  readonly storyWorldId: string;
  readonly arcId?: string;
  readonly chapterId?: string;
  readonly questId?: string;
  readonly title: string;
  readonly body?: string;
  readonly documentMode: V2SceneDocumentMode;
  readonly isEntry: boolean;
  readonly ordinal: number;
  readonly revision: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export function createV2NarrativeScene(input: {
  readonly sceneId: string;
  readonly storyWorldId: string;
  readonly arcId?: string;
  readonly chapterId?: string;
  readonly questId?: string;
  readonly title: string;
  readonly body?: string;
  readonly documentMode?: V2SceneDocumentMode;
  readonly isEntry?: boolean;
  readonly ordinal?: number;
  readonly revision?: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}): V2NarrativeScene {
  const ordinal = input.ordinal ?? 0;
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new V2DomainError("INVALID_INPUT", "scene ordinal must be a non-negative integer");
  }
  const revision = input.revision ?? 1;
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new V2DomainError("INVALID_INPUT", "scene revision must be a positive integer");
  }
  const documentMode = input.documentMode ?? (input.body !== undefined && input.body !== null ? "legacy_body" : "blocks");
  if (documentMode !== "legacy_body" && documentMode !== "blocks") {
    throw new V2DomainError("INVALID_INPUT", `unsupported document mode: ${documentMode}`);
  }

  return {
    sceneId: assertNonEmptyId(input.sceneId, "sceneId"),
    storyWorldId: assertNonEmptyId(input.storyWorldId, "storyWorldId"),
    ...(input.arcId === undefined || input.arcId === null || input.arcId.trim() === ""
      ? {}
      : { arcId: assertNonEmptyId(input.arcId, "arcId") }),
    ...(input.chapterId === undefined || input.chapterId === null || input.chapterId.trim() === ""
      ? {}
      : { chapterId: assertNonEmptyId(input.chapterId, "chapterId") }),
    ...(input.questId === undefined || input.questId === null || input.questId.trim() === ""
      ? {}
      : { questId: assertNonEmptyId(input.questId, "questId") }),
    title: assertNonEmptyText(input.title, "title", 160),
    ...(input.body === undefined || input.body === null ? {} : { body: assertOptionalText(input.body, "body", 8000) }),
    documentMode,
    isEntry: input.isEntry ?? false,
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
