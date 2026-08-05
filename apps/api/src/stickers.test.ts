import assert from "node:assert/strict";
import test from "node:test";

import {
  StoryMode,
  createSticker,
  createStickerPack,
  createStoryWorld,
} from "../../../packages/domain/src/index.ts";
import { ApiApplication, createApiStore } from "./index.ts";

const world = createStoryWorld({
  id: "sticker-api-world",
  name: "Sticker API World",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const pack = createStickerPack({
  id: "sticker-api-pack",
  storyWorld: world,
  name: "API stickers",
  createdAt: "2026-08-05T17:30:00.000Z",
});
const sticker = createSticker({
  id: "sticker-api-wave",
  pack,
  label: "wave",
  mediaRef: "media://api/wave.webp",
  tags: ["hello"],
  createdAt: pack.createdAt,
});

function application() {
  return new ApiApplication(createApiStore({
    worlds: [world],
    stickerPacks: [pack],
    stickers: [sticker],
  }));
}

async function json(response: Response): Promise<unknown> {
  return response.json();
}

test("lists sticker packs and imported stickers", async () => {
  const app = application();
  const packs = await app.handle(
    new Request(`http://localhost/v1/sticker-packs?storyWorldId=${world.id}`),
  );
  assert.equal(packs.status, 200);
  assert.deepEqual(await json(packs), { data: [pack] });
  const stickers = await app.handle(
    new Request(`http://localhost/v1/sticker-packs/${pack.id}/stickers`),
  );
  assert.equal(stickers.status, 200);
  assert.deepEqual(await json(stickers), { data: [sticker] });
});

test("imports validated sticker pack metadata and exposes it to clients", async () => {
  const app = new ApiApplication(createApiStore({ worlds: [world] }));
  const response = await app.handle(
    new Request("http://localhost/v1/sticker-packs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "sticker-imported-pack",
        storyWorldId: world.id,
        name: "Imported pack",
        sourceRef: "import://uploaded.zip",
        createdAt: "2026-08-05T17:31:00.000Z",
        stickers: [
          {
            id: "sticker-imported-one",
            label: "sparkle",
            mediaRef: "media://imported/sparkle.webp",
            tags: ["happy"],
          },
        ],
      }),
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await json(response), {
    data: {
      pack: {
        id: "sticker-imported-pack",
        storyWorldId: world.id,
        name: "Imported pack",
        sourceRef: "import://uploaded.zip",
        createdAt: "2026-08-05T17:31:00.000Z",
      },
      stickers: [{
        id: "sticker-imported-one",
        packId: "sticker-imported-pack",
        storyWorldId: world.id,
        label: "sparkle",
        mediaRef: "media://imported/sparkle.webp",
        tags: ["happy"],
        createdAt: "2026-08-05T17:31:00.000Z",
      }],
    },
  });
  const malformed = await app.handle(
    new Request("http://localhost/v1/sticker-packs", {
      method: "POST",
      body: JSON.stringify({ id: "bad", storyWorldId: world.id, name: "bad", createdAt: pack.createdAt, stickers: "no" }),
    }),
  );
  assert.equal(malformed.status, 400);
});

test("bounds missing story world/pack and missing query", async () => {
  const app = application();
  const missingQuery = await app.handle(new Request("http://localhost/v1/sticker-packs"));
  assert.equal(missingQuery.status, 400);
  const missingWorld = await app.handle(
    new Request("http://localhost/v1/sticker-packs?storyWorldId=missing"),
  );
  assert.equal(missingWorld.status, 404);
  const missingPack = await app.handle(
    new Request("http://localhost/v1/sticker-packs/missing/stickers"),
  );
  assert.equal(missingPack.status, 404);
});
