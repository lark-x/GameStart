import assert from "node:assert/strict";
import test from "node:test";
import { createPinia, setActivePinia } from "pinia";
import { useNarrativeCanonLookupStore } from "./useNarrativeCanonLookupStore.ts";

test("useNarrativeCanonLookupStore manages cached entities and getters", () => {
  setActivePinia(createPinia());
  const store = useNarrativeCanonLookupStore();

  assert.equal(store.characters.length, 0);
  assert.equal(store.locations.length, 0);

  store.setCanonData(
    [
      { characterId: "char-1", name: "荧", role: "旅行者", summary: "寻找亲人的旅行者" },
      { characterId: "char-2", name: "派蒙", role: "向导", summary: "最好的伙伴" },
    ],
    [
      { locationId: "loc-1", name: "蒙德城", summary: "自由之城" },
    ],
  );

  assert.equal(store.characters.length, 2);
  assert.equal(store.locations.length, 1);

  assert.equal(store.characterMap["char-1"]?.name, "荧");
  assert.equal(store.characterMap["char-2"]?.role, "向导");
  assert.equal(store.locationMap["loc-1"]?.name, "蒙德城");
});

test("useNarrativeCanonLookupStore searchCanon queries and caches entities", async () => {
  setActivePinia(createPinia());
  const store = useNarrativeCanonLookupStore();

  // Mock getClient search
  store.getClient = () => ({
    search: async (_worldId: string, query: string) => ({
      query,
      items: [
        {
          kind: "character" as const,
          id: "char-zhongli",
          title: "钟离",
          snippet: "岩王帝君",
        },
        {
          kind: "location" as const,
          id: "loc-liyue",
          title: "璃月港",
          snippet: "契约之港",
        },
        {
          kind: "lore" as const,
          id: "lore-contract",
          title: "岩神契约",
          snippet: "食言者当受食岩之罚",
        },
      ],
    }),
  } as unknown as import("../../story/client.ts").V2NarrativeClient);

  const results = await store.searchCanon("world-1", "钟离", "character");
  assert.equal(results.length, 1);
  assert.equal(results[0]?.title, "钟离");
  assert.equal(results[0]?.type, "character");

  // Verify entity was cached in characters array and map
  assert.ok(store.characters.some((c) => c.characterId === "char-zhongli"));
  assert.equal(store.characterMap["char-zhongli"]?.name, "钟离");

  // Search all types
  const allResults = await store.searchCanon("world-1", "all");
  assert.equal(allResults.length, 3);
  assert.ok(store.locations.some((l) => l.locationId === "loc-liyue"));
});
