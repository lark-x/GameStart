import type { StoryWorld } from "./story-world.ts";
import {
  assertIsoTimestamp,
  assertNonEmptyString,
} from "./validation.ts";

export interface StickerPack {
  id: string;
  storyWorldId: string;
  name: string;
  sourceRef?: string;
  createdAt: string;
}

export interface StickerPackInput {
  id: string;
  storyWorld: StoryWorld;
  name: string;
  sourceRef?: string;
  createdAt: string;
}

export interface Sticker {
  id: string;
  packId: string;
  storyWorldId: string;
  label: string;
  mediaRef: string;
  tags: readonly string[];
  createdAt: string;
}

export interface StickerInput {
  id: string;
  pack: StickerPack;
  label: string;
  mediaRef: string;
  tags?: readonly string[];
  createdAt: string;
}

function assertTags(tags: readonly string[], field: string): void {
  const seen = new Set<string>();
  for (const tag of tags) {
    assertNonEmptyString(tag, field);
    if (seen.has(tag)) throw new TypeError(`${field} contains duplicate values`);
    seen.add(tag);
  }
}

export function createStickerPack(input: StickerPackInput): StickerPack {
  assertNonEmptyString(input.id, "stickerPack.id");
  assertNonEmptyString(input.storyWorld.id, "stickerPack.storyWorld.id");
  assertNonEmptyString(input.name, "stickerPack.name");
  if (input.sourceRef !== undefined) assertNonEmptyString(input.sourceRef, "stickerPack.sourceRef");
  assertIsoTimestamp(input.createdAt, "stickerPack.createdAt");
  const pack: StickerPack = {
    id: input.id,
    storyWorldId: input.storyWorld.id,
    name: input.name,
    createdAt: input.createdAt,
  };
  if (input.sourceRef !== undefined) pack.sourceRef = input.sourceRef;
  assertStickerPack(pack);
  return pack;
}

export function assertStickerPack(pack: StickerPack): void {
  assertNonEmptyString(pack.id, "stickerPack.id");
  assertNonEmptyString(pack.storyWorldId, "stickerPack.storyWorldId");
  assertNonEmptyString(pack.name, "stickerPack.name");
  if (pack.sourceRef !== undefined) assertNonEmptyString(pack.sourceRef, "stickerPack.sourceRef");
  assertIsoTimestamp(pack.createdAt, "stickerPack.createdAt");
}

export function createSticker(input: StickerInput): Sticker {
  assertNonEmptyString(input.id, "sticker.id");
  assertStickerPack(input.pack);
  assertNonEmptyString(input.label, "sticker.label");
  assertNonEmptyString(input.mediaRef, "sticker.mediaRef");
  const tags = [...(input.tags ?? [])];
  assertTags(tags, "sticker.tags");
  assertIsoTimestamp(input.createdAt, "sticker.createdAt");
  const sticker: Sticker = {
    id: input.id,
    packId: input.pack.id,
    storyWorldId: input.pack.storyWorldId,
    label: input.label,
    mediaRef: input.mediaRef,
    tags,
    createdAt: input.createdAt,
  };
  assertSticker(sticker);
  return sticker;
}

export function assertSticker(sticker: Sticker): void {
  assertNonEmptyString(sticker.id, "sticker.id");
  assertNonEmptyString(sticker.packId, "sticker.packId");
  assertNonEmptyString(sticker.storyWorldId, "sticker.storyWorldId");
  assertNonEmptyString(sticker.label, "sticker.label");
  assertNonEmptyString(sticker.mediaRef, "sticker.mediaRef");
  assertTags(sticker.tags, "sticker.tags");
  assertIsoTimestamp(sticker.createdAt, "sticker.createdAt");
}
