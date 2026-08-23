import assert from "node:assert/strict";
import test from "node:test";
import { createPinia, setActivePinia } from "pinia";
import { useNarrativeCandidateStore } from "./useNarrativeCandidateStore.ts";
import { useNarrativeRevisionStore } from "./useNarrativeRevisionStore.ts";
import type { V2SceneCandidateDto } from "@living-network/contracts/v2";

test("useNarrativeCandidateStore manages candidate filtering and selection", () => {
  setActivePinia(createPinia());
  const store = useNarrativeCandidateStore();

  const mockCandidates: V2SceneCandidateDto[] = [
    {
      candidateId: "cand-1",
      storyWorldId: "world-1",
      status: "pending",
      baseCanonRevision: 1,
      createdAt: "2026-08-23T00:00:00Z",
      payload: {
        scene: {
          sceneId: "scene-101",
          title: "黄金屋前哨",
        },
      },
    },
    {
      candidateId: "cand-2",
      storyWorldId: "world-1",
      status: "approved",
      baseCanonRevision: 1,
      createdAt: "2026-08-23T00:00:00Z",
      payload: {
        scene: {
          sceneId: "scene-102",
          title: "群玉阁议事",
        },
      },
    },
  ];

  store.candidates = mockCandidates;
  assert.equal(store.pendingCandidates.length, 1);
  assert.equal(store.filteredCandidates.length, 1); // default filter is "pending"

  store.setStatusFilter("all");
  assert.equal(store.filteredCandidates.length, 2);

  store.selectCandidate("cand-2");
  assert.equal(store.selectedCandidate?.candidateId, "cand-2");
  assert.equal(store.selectedCandidate?.payload.scene.title, "群玉阁议事");
});

test("useNarrativeCandidateStore reviewCandidate advances revision on approve", async () => {
  setActivePinia(createPinia());
  const store = useNarrativeCandidateStore();
  const revisionStore = useNarrativeRevisionStore();
  revisionStore.initialize("world-1", 10);

  const mockCandidate: V2SceneCandidateDto = {
    candidateId: "cand-1",
    storyWorldId: "world-1",
    status: "pending",
    baseCanonRevision: 10,
    createdAt: "2026-08-23T00:00:00Z",
    payload: {
      scene: {
        sceneId: "scene-101",
        title: "黄金屋前哨",
      },
    },
  };
  store.candidates = [mockCandidate];

  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async (url: string | URL | Request) => {
    fetchCalled = true;
    const urlStr = url.toString();
    if (urlStr.includes("/review")) {
      return {
        ok: true,
        json: async () => ({
          worldRevision: 11,
        }),
      } as unknown as Response;
    }
    // candidates fetch reload
    return {
      ok: true,
      json: async () => ([
        { ...mockCandidate, status: "approved" },
      ]),
    } as unknown as Response;
  };

  try {
    const success = await store.reviewCandidate("world-1", "cand-1", "approve");
    assert.equal(success, true);
    assert.equal(fetchCalled, true);
    assert.equal(revisionStore.worldRevision, 11);
    assert.equal(store.candidates[0]?.status, "approved");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
