import assert from "node:assert/strict";
import test from "node:test";

import {
  StoryMode,
  createStoryWorld,
  createWorldLoreEntry,
} from "../../../packages/domain/src/index.ts";
import { ApiApplication, createApiStore } from "./index.ts";

const world = createStoryWorld({
  id: "lore-world",
  name: "Lore world",
  timezone: "UTC",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});

const entry = createWorldLoreEntry({
  id: "lore-entry",
  storyWorldId: world.id,
  category: "location",
  title: "Moonlit harbor",
  content: "A quiet harbor under a silver moon.",
  tags: ["harbor", "night"],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
});

function createApplication(): ApiApplication {
  return new ApiApplication(createApiStore({ worlds: [world], worldLoreEntries: [entry] }));
}

async function body(response: Response): Promise<{ data?: unknown; error?: { code: string } }> {
  return response.json() as Promise<{ data?: unknown; error?: { code: string } }>;
}

test("lists and full-text searches world lore entries", async () => {
  const app = createApplication();

  const list = await app.handle(new Request(`http://localhost/v1/world-lore?storyWorldId=${world.id}`));
  assert.equal(list.status, 200);
  assert.deepEqual((await body(list)).data, [entry]);

  const search = await app.handle(new Request(`http://localhost/v1/world-lore?storyWorldId=${world.id}&q=moon`));
  assert.equal(search.status, 200);
  assert.deepEqual((await body(search)).data, [entry]);

  const missingWorld = await app.handle(new Request("http://localhost/v1/world-lore?storyWorldId=missing"));
  assert.equal(missingWorld.status, 404);

  const missingWorldId = await app.handle(new Request("http://localhost/v1/world-lore"));
  assert.equal(missingWorldId.status, 400);

  const blankSearch = await app.handle(new Request(`http://localhost/v1/world-lore?storyWorldId=${world.id}&q=%20`));
  assert.equal(blankSearch.status, 400);
});

test("creates, updates, and deletes world lore entries", async () => {
  const app = createApplication();
  const create = await app.handle(new Request("http://localhost/v1/world-lore", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "lore-new",
      storyWorldId: world.id,
      category: "faction",
      title: "Lantern Guild",
      content: "Cartographers who protect the old roads.",
      tags: ["guild", "road"],
      isEnabled: false,
    }),
  }));
  assert.equal(create.status, 201);
  const created = (await body(create)).data as { id: string; isEnabled: boolean; createdAt: string; updatedAt: string };
  assert.equal(created.id, "lore-new");
  assert.equal(created.isEnabled, false);
  assert.ok(Number.isFinite(Date.parse(created.createdAt)));
  assert.ok(Number.isFinite(Date.parse(created.updatedAt)));

  const update = await app.handle(new Request("http://localhost/v1/world-lore/lore-new", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "New Lantern Guild", isEnabled: true, tags: ["guild"] }),
  }));
  assert.equal(update.status, 200);
  const updated = (await body(update)).data as { title: string; isEnabled: boolean; tags: readonly string[] };
  assert.deepEqual(
    { title: updated.title, isEnabled: updated.isEnabled, tags: updated.tags },
    { title: "New Lantern Guild", isEnabled: true, tags: ["guild"] },
  );

  const remove = await app.handle(new Request("http://localhost/v1/world-lore/lore-new", { method: "DELETE" }));
  assert.equal(remove.status, 204);
  assert.equal(await app.store.worldLoreEntries!.getById("lore-new"), undefined);

  const missing = await app.handle(new Request("http://localhost/v1/world-lore/missing", { method: "DELETE" }));
  assert.equal(missing.status, 404);
});

test("validates world lore request bodies", async () => {
  const app = createApplication();
  const invalid = await app.handle(new Request("http://localhost/v1/world-lore", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: "invalid",
      storyWorldId: world.id,
      category: "person",
      title: "Invalid",
      content: "Invalid",
      tags: "not-an-array",
    }),
  }));
  assert.equal(invalid.status, 400);

  const unknown = await app.handle(new Request("http://localhost/v1/world-lore/lore-entry", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ unexpected: true }),
  }));
  assert.equal(unknown.status, 400);
});
