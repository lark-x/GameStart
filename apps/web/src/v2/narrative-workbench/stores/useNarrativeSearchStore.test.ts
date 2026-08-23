import assert from "node:assert/strict";
import test from "node:test";
import { createPinia, setActivePinia } from "pinia";
import { useNarrativeSearchStore } from "./useNarrativeSearchStore.ts";
import type { V2NarrativeClient } from "../../story/client.ts";

test("useNarrativeSearchStore searches and tracks recent searches", async () => {
  setActivePinia(createPinia());
  const store = useNarrativeSearchStore();

  assert.equal(store.results.length, 0);
  assert.equal(store.query, "");

  // Mock client
  store.getClient = () => ({
    search: async (_worldId: string, query: string) => ({
      query,
      items: [
        {
          kind: "scene" as const,
          id: "scene-101",
          title: "黄金屋决战",
          snippet: "公子挥动双刀向旅行者发起攻击",
        },
        {
          kind: "character" as const,
          id: "char-childe",
          title: "达达利亚",
          snippet: "愚人众执行官第十一席",
        },
      ],
    }),
  } as unknown as V2NarrativeClient);

  const results = await store.search("world-1", "黄金屋");
  assert.equal(results.length, 2);
  assert.equal(store.results.length, 2);
  assert.equal(store.query, "黄金屋");
  assert.deepEqual(store.recentSearches, ["黄金屋"]);

  // Search empty
  const emptyRes = await store.search("world-1", "   ");
  assert.equal(emptyRes.length, 0);
  assert.equal(store.results.length, 0);

  // Clear
  store.clear();
  assert.equal(store.query, "");
  assert.equal(store.results.length, 0);
});
