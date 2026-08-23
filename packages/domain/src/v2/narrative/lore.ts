import { V2DomainError } from "../shared/index.ts";

export type V2LoreEntryType =
  | "faction"
  | "item"
  | "organization"
  | "species"
  | "culture"
  | "religion"
  | "technology"
  | "concept"
  | "historical_event"
  | "custom";

const VALID_LORE_TYPES = new Set<string>([
  "faction",
  "item",
  "organization",
  "species",
  "culture",
  "religion",
  "technology",
  "concept",
  "historical_event",
  "custom",
]);

export interface V2CanonLoreEntry {
  readonly loreEntryId: string;
  readonly storyWorldId: string;
  readonly type: V2LoreEntryType;
  readonly customType?: string;
  readonly name: string;
  readonly summary?: string;
  readonly body?: string;
  readonly tags: readonly string[];
  readonly revision: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export function createV2CanonLoreEntry(input: {
  readonly loreEntryId: string;
  readonly storyWorldId: string;
  readonly type: V2LoreEntryType;
  readonly customType?: string | null;
  readonly name: string;
  readonly summary?: string | null;
  readonly body?: string | null;
  readonly tags?: readonly string[] | null;
  readonly revision?: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}): V2CanonLoreEntry {
  if (!VALID_LORE_TYPES.has(input.type)) {
    throw new V2DomainError("INVALID_INPUT", `unsupported lore entry type: ${input.type}`);
  }
  if (input.type === "custom") {
    if (!input.customType || input.customType.trim().length === 0) {
      throw new V2DomainError("INVALID_INPUT", "customType is required when type is custom");
    }
  }

  const revision = input.revision ?? 1;
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new V2DomainError("INVALID_INPUT", "lore entry revision must be a positive integer");
  }

  const tags = input.tags ?? [];
  if (tags.length > 30) {
    throw new V2DomainError("INVALID_INPUT", "lore entry tags cannot exceed 30");
  }

  return {
    loreEntryId: assertNonEmptyId(input.loreEntryId, "loreEntryId"),
    storyWorldId: assertNonEmptyId(input.storyWorldId, "storyWorldId"),
    type: input.type,
    ...(input.type === "custom" && input.customType ? { customType: assertNonEmptyText(input.customType, "customType", 80) } : {}),
    name: assertNonEmptyText(input.name, "name", 160),
    ...(input.summary === undefined || input.summary === null || input.summary.trim() === ""
      ? {}
      : { summary: assertOptionalText(input.summary, "summary", 1200) }),
    ...(input.body === undefined || input.body === null || input.body.trim() === ""
      ? {}
      : { body: assertOptionalText(input.body, "body", 16000) }),
    tags: tags.map((tag, idx) => assertNonEmptyText(tag, `tags[${idx}]`, 60)),
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
