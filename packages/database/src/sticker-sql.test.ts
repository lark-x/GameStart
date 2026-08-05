import assert from "node:assert/strict";
import test from "node:test";

import {
  StoryMode,
  createSticker,
  createStickerPack,
  createStoryWorld,
} from "../../domain/src/index.ts";
import {
  createSqlRepositories,
  type SqlClient,
  type SqlQueryResult,
  type SqlRow,
} from "./index.ts";

class RecordingClient implements SqlClient {
  public readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];
  private readonly responses: SqlRow[][];

  public constructor(responses: SqlRow[][] = []) {
    this.responses = responses;
  }

  public async query<Row extends SqlRow = SqlRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    this.calls.push({ text, values: [...values] });
    return { rows: (this.responses.shift() ?? []) as readonly Row[] };
  }
}

const world = createStoryWorld({
  id: "sticker-sql-world",
  name: "Sticker SQL World",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const pack = createStickerPack({
  id: "sticker-sql-pack",
  storyWorld: world,
  name: "SQL pack",
  sourceRef: "import://sql.zip",
  createdAt: "2026-08-05T17:20:00.000Z",
});
const sticker = createSticker({
  id: "sticker-sql-wave",
  pack,
  label: "wave",
  mediaRef: "media://sql/wave.webp",
  tags: ["hello", "warm"],
  createdAt: pack.createdAt,
});

function packRow() {
  return {
    id: pack.id,
    story_world_id: pack.storyWorldId,
    name: pack.name,
    source_ref: pack.sourceRef,
    created_at: pack.createdAt,
  };
}

function stickerRow() {
  return {
    id: sticker.id,
    pack_id: sticker.packId,
    story_world_id: sticker.storyWorldId,
    label: sticker.label,
    media_ref: sticker.mediaRef,
    tags: [...sticker.tags],
    created_at: sticker.createdAt,
  };
}

test("maps and upserts sticker packs and stickers with parameterized values", async () => {
  const readClient = new RecordingClient([[packRow()], [stickerRow()], [stickerRow()]]);
  const repositories = createSqlRepositories(readClient);
  assert.ok(repositories.stickerPacks);
  assert.ok(repositories.stickers);
  assert.deepEqual(await repositories.stickerPacks.listByStoryWorld(world.id), [pack]);
  assert.deepEqual(await repositories.stickers.getById(sticker.id), sticker);
  assert.deepEqual(await repositories.stickers.listByPack(pack.id), [sticker]);
  assert.deepEqual(readClient.calls[0]?.values, [world.id]);
  assert.deepEqual(readClient.calls[1]?.values, [sticker.id]);
  assert.deepEqual(readClient.calls[2]?.values, [pack.id]);

  const writeClient = new RecordingClient();
  const writeRepositories = createSqlRepositories(writeClient);
  assert.ok(writeRepositories.stickerPacks);
  assert.ok(writeRepositories.stickers);
  await writeRepositories.stickerPacks.save(pack);
  await writeRepositories.stickers.save(sticker);
  assert.match(writeClient.calls[0]?.text ?? "", /INSERT INTO sticker_packs/);
  assert.deepEqual(writeClient.calls[0]?.values, [
    pack.id,
    pack.storyWorldId,
    pack.name,
    pack.sourceRef,
    pack.createdAt,
  ]);
  assert.match(writeClient.calls[1]?.text ?? "", /INSERT INTO stickers/);
  assert.deepEqual(writeClient.calls[1]?.values, [
    sticker.id,
    sticker.packId,
    sticker.storyWorldId,
    sticker.label,
    sticker.mediaRef,
    [...sticker.tags],
    sticker.createdAt,
  ]);
});
