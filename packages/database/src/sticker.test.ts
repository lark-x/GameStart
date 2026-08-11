import assert from "node:assert/strict";
import test from "node:test";

import {
  StoryMode,
  createSticker,
  createStickerPack,
  createStoryWorld,
} from "@living-network/domain";
import { createInMemoryRepositories } from "./index.ts";

const world = createStoryWorld({
  id: "sticker-db-world",
  name: "Sticker DB World",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const pack = createStickerPack({
  id: "sticker-db-pack",
  storyWorld: world,
  name: "DB pack",
  createdAt: "2026-08-05T17:10:00.000Z",
});
const sticker = createSticker({
  id: "sticker-db-wave",
  pack,
  label: "wave",
  mediaRef: "media://sticker-db/wave.webp",
  tags: ["hello"],
  createdAt: "2026-08-05T17:10:00.000Z",
});

test("stores sticker packs and stickers with pack/world integrity", async () => {
  const repositories = createInMemoryRepositories({
    worlds: [world],
    stickerPacks: [pack],
    stickers: [sticker],
  });
  assert.ok(repositories.stickerPacks);
  assert.ok(repositories.stickers);
  assert.deepEqual(await repositories.stickerPacks.listByStoryWorld(world.id), [pack]);
  assert.deepEqual(await repositories.stickers.listByPack(pack.id), [sticker]);
  const loaded = await repositories.stickers.getById(sticker.id);
  assert.ok(loaded);
  loaded.tags = ["mutated"];
  assert.deepEqual((await repositories.stickers.getById(sticker.id))?.tags, ["hello"]);
});

test("rejects stickers that reference a missing pack", async () => {
  const repositories = createInMemoryRepositories({ worlds: [world] });
  assert.ok(repositories.stickers);
  await assert.rejects(repositories.stickers.save(sticker), {
    name: "TypeError",
    message: /invalid pack/,
  });
});
