import assert from "node:assert/strict";
import test from "node:test";

import {
  StoryMode,
  createSticker,
  createStickerPack,
  createStoryWorld,
} from "./index.ts";

const world = createStoryWorld({
  id: "sticker-world",
  name: "Sticker World",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const pack = createStickerPack({
  id: "sticker-pack",
  storyWorld: world,
  name: "Warm reactions",
  sourceRef: "import://warm-reactions.zip",
  createdAt: "2026-08-05T17:00:00.000Z",
});

test("creates sticker packs and media references with tags", () => {
  const sticker = createSticker({
    id: "sticker-wave",
    pack,
    label: "wave",
    mediaRef: "media://stickers/wave.webp",
    tags: ["greeting", "happy"],
    createdAt: "2026-08-05T17:00:00.000Z",
  });
  assert.equal(sticker.storyWorldId, world.id);
  assert.deepEqual(sticker.tags, ["greeting", "happy"]);
});

test("rejects duplicate tags and blank media references", () => {
  assert.throws(
    () => createSticker({
      id: "bad-tags",
      pack,
      label: "bad",
      mediaRef: "media://bad.webp",
      tags: ["same", "same"],
      createdAt: "2026-08-05T17:00:00.000Z",
    }),
    { name: "TypeError", message: /duplicate/ },
  );
  assert.throws(
    () => createSticker({
      id: "bad-media",
      pack,
      label: "bad",
      mediaRef: "",
      createdAt: "2026-08-05T17:00:00.000Z",
    }),
    { name: "TypeError", message: /mediaRef/ },
  );
});
