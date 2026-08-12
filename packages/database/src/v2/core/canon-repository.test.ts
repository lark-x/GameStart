import assert from "node:assert/strict";
import test from "node:test";

import {
  applyV2Migrations,
  openV2SqliteConnection,
  openV2TempSqliteConnection,
  revertV2Migrations,
  V2SqliteCanonRepository,
  V2SqliteCanonUnitOfWork,
  createV2TempSqliteDatabase,
} from "../index.ts";
import {
  createV2CanonCharacter,
  createV2CanonFact,
  createV2CanonLocation,
  createV2CanonWorld,
  V2DomainError,
} from "@living-network/domain";

test("V2 canon SQLite migration applies, indexes FTS facts, and rolls back", async () => {
  const { path, cleanup } = createV2TempSqliteDatabase();
  const db = openV2SqliteConnection({ path });
  try {
    applyV2Migrations(db);
    const repository = new V2SqliteCanonRepository(db);
    const world = createV2CanonWorld({ storyWorldId: "world_a" as never, name: "World A" });
    db.exec("BEGIN IMMEDIATE");
    try {
      await repository.createWorld(world);
      await repository.createFact(createV2CanonFact({
        storyWorldId: "world_a" as never,
        factId: "fact_a",
        text: "The lighthouse is haunted",
        visibility: "player_visible",
      }));
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    const fts = db.prepare("SELECT fact_id FROM v2_facts_fts WHERE v2_facts_fts MATCH 'lighthouse'").get();
    assert.equal((fts as { readonly fact_id?: string } | undefined)?.fact_id, "fact_a");
    revertV2Migrations(db);
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'v2_worlds'").get(), undefined);
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 canon SQLite repository enforces revision, idempotency, and recovery after reopen", async () => {
  const { path, cleanup } = createV2TempSqliteDatabase();
  let db = openV2SqliteConnection({ path });
  try {
    applyV2Migrations(db);
    const unit = new V2SqliteCanonUnitOfWork(db);
    await unit.withCanonTransaction(async ({ canon }) => {
      const world = await canon.createWorld(createV2CanonWorld({ storyWorldId: "world_a" as never, name: "World A" }));
      assert.equal(world.revision, 1);
      await canon.saveMutation({
        key: "key_create_world" as never,
        operation: "createWorld",
        payloadHash: "same",
        result: { revision: world.revision },
      });
    });
    db.close();

    db = openV2SqliteConnection({ path });
    const reopened = new V2SqliteCanonRepository(db);
    assert.equal((await reopened.getWorld("world_a" as never))?.name, "World A");
    const existing = await reopened.readMutation<{ readonly revision: number }>({
      key: "key_create_world" as never,
      operation: "createWorld",
    });
    assert.deepEqual(existing?.result, { revision: 1 });

    await assert.rejects(
      () => reopened.advanceRevision("world_a" as never, 5 as never),
      (error) => error instanceof V2DomainError && error.code === "STALE_REVISION",
    );
  } finally {
    db.close();
    cleanup();
  }
});

test("V2 canon SQLite repository rejects cross-world character location references", async () => {
  const { db, cleanup } = openV2TempSqliteConnection();
  try {
    applyV2Migrations(db);
    const unit = new V2SqliteCanonUnitOfWork(db);
    await assert.rejects(
      () => unit.withCanonTransaction(async ({ canon }) => {
        await canon.createWorld(createV2CanonWorld({ storyWorldId: "world_a" as never, name: "World A" }));
        await canon.createWorld(createV2CanonWorld({ storyWorldId: "world_b" as never, name: "World B" }));
        await canon.createLocation(createV2CanonLocation({
          storyWorldId: "world_a" as never,
          locationId: "loc_a" as never,
          name: "A",
        }));
        await canon.createCharacter(createV2CanonCharacter({
          storyWorldId: "world_b" as never,
          characterId: "char_b" as never,
          name: "B",
          homeLocationId: "loc_a" as never,
        }));
      }),
      /constraint/i,
    );
  } finally {
    db.close();
    cleanup();
  }
});
