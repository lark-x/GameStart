import { assertIsoTimestamp, assertNonEmptyString } from "./validation.ts";

export interface WorldLoreEntry {
  id: string;
  storyWorldId: string;
  category: string;
  title: string;
  content: string;
  tags: readonly string[];
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorldLoreEntryInput {
  id: string;
  storyWorldId: string;
  category: string;
  title: string;
  content: string;
  tags?: readonly string[];
  isEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

function validatedTags(tags: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  for (const tag of tags) {
    assertNonEmptyString(tag, "worldLore.tags");
    if (seen.has(tag)) throw new TypeError("worldLore.tags contains duplicate tag");
    seen.add(tag);
  }
  return [...tags];
}

export function createWorldLoreEntry(input: WorldLoreEntryInput): WorldLoreEntry {
  assertNonEmptyString(input.id, "worldLore.id");
  assertNonEmptyString(input.storyWorldId, "worldLore.storyWorldId");
  assertNonEmptyString(input.category, "worldLore.category");
  assertNonEmptyString(input.title, "worldLore.title");
  assertNonEmptyString(input.content, "worldLore.content");
  assertIsoTimestamp(input.createdAt, "worldLore.createdAt");
  assertIsoTimestamp(input.updatedAt, "worldLore.updatedAt");
  if (typeof input.isEnabled !== "undefined" && typeof input.isEnabled !== "boolean") {
    throw new TypeError("worldLore.isEnabled must be a boolean");
  }
  return {
    id: input.id,
    storyWorldId: input.storyWorldId,
    category: input.category,
    title: input.title,
    content: input.content,
    tags: validatedTags(input.tags ?? []),
    isEnabled: input.isEnabled ?? true,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export function assertWorldLoreEntry(entry: WorldLoreEntry): void {
  createWorldLoreEntry(entry);
}
