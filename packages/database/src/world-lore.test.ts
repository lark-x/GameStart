import assert from "node:assert/strict";
import test from "node:test";

import { StoryMode, createStoryWorld, createWorldLoreEntry } from "../../domain/src/index.ts";
import { createInMemoryRepositories } from "./index.ts";

const world = createStoryWorld({
  id: "world-lore-test",
  name: "Lore test world",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});

function lore(id: string, overrides: Partial<ReturnType<typeof createWorldLoreEntry>> = {}) {
  return createWorldLoreEntry({
    id,
    storyWorldId: world.id,
    category: "location",
    title: "Moon Harbor",
    content: "A quiet harbor under the silver moon.",
    tags: ["harbor", "moon"],
    isEnabled: true,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    ...overrides,
  });
}

test("in-memory world lore supports CRUD, isolation, and enabled full-text search", async () => {
  const repositories = createInMemoryRepositories({ worlds: [world] });
  const store = repositories.worldLoreEntries;
  assert.ok(store);
  const enabled = lore("lore-enabled");
  const disabled = lore("lore-disabled", {
    title: "Moon Observatory",
    isEnabled: false,
    updatedAt: "2026-08-09T01:00:00.000Z",
  });
  await store.save(enabled);
  await store.save(disabled);

  assert.deepEqual((await store.listByStoryWorld(world.id)).map((entry) => entry.id), [
    "lore-disabled",
    "lore-enabled",
  ]);
  assert.deepEqual((await store.search(world.id, "moon")).map((entry) => entry.id), [
    "lore-enabled",
  ]);

  const read = await store.getById(enabled.id);
  assert.ok(read);
  (read.tags as string[]).push("mutated");
  assert.deepEqual((await store.getById(enabled.id))?.tags, ["harbor", "moon"]);
  await store.delete(enabled.id);
  assert.equal(await store.getById(enabled.id), undefined);
  await assert.rejects(store.search(world.id, " "), /queryText/);
  assert.throws(
    () => createInMemoryRepositories({
      worlds: [world],
      worldLoreEntries: [lore("bad", { storyWorldId: "missing" })],
    }),
    /unknown story world/,
  );
});

test("createWorldLoreEntry rejects non-boolean isEnabled", () => {
  assert.throws(
    () => createWorldLoreEntry({
      id: "lore-bad",
      storyWorldId: world.id,
      category: "location",
      title: "Test",
      content: "Content",
      isEnabled: "yes" as unknown as boolean,
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
    }),
    { name: "TypeError", message: /isEnabled must be a boolean/ },
  );
});

test("in-memory world lore search sorts by updatedAt and id when match counts are equal", async () => {
  const repositories = createInMemoryRepositories({ worlds: [world] });
  const store = repositories.worldLoreEntries!;
  const entry1 = lore("lore-sort-a", {
    title: "Moon Harbor Alpha",
    content: "A harbor with moonlight",
    updatedAt: "2026-08-09T02:00:00.000Z",
  });
  const entry2 = lore("lore-sort-b", {
    title: "Moon Harbor Beta",
    content: "A harbor with moonlight",
    updatedAt: "2026-08-09T01:00:00.000Z",
  });
  const entry3 = lore("lore-sort-c", {
    title: "Moon Harbor Gamma",
    content: "A harbor with moonlight",
    updatedAt: "2026-08-09T01:00:00.000Z",
  });
  await store.save(entry1);
  await store.save(entry2);
  await store.save(entry3);
  const results = await store.search(world.id, "moon harbor");
  assert.deepEqual(results.map((r) => r.id), ["lore-sort-a", "lore-sort-b", "lore-sort-c"]);
});
