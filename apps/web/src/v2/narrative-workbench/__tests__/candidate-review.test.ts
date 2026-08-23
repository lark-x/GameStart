import assert from "node:assert/strict";
import test from "node:test";
import { createPinia, setActivePinia } from "pinia";
import { useNarrativeCandidateStore } from "../stores/useNarrativeCandidateStore.ts";
import { useNarrativeRevisionStore } from "../stores/useNarrativeRevisionStore.ts";
import type { V2SceneCandidateDto } from "@living-network/contracts/v2";

test("Narrative Candidate Review - Multi-dimensional Diff and Targeted Status Update", async () => {
  setActivePinia(createPinia());
  const candidateStore = useNarrativeCandidateStore();
  const revisionStore = useNarrativeRevisionStore();
  revisionStore.initialize("world-1", 5);

  const candidatePayload: V2SceneCandidateDto = {
    candidateId: "cand-opt-1",
    storyWorldId: "world-1",
    status: "pending",
    baseCanonRevision: 5,
    createdAt: "2026-08-23T12:00:00Z",
    payload: {
      scene: {
        sceneId: "scene-301",
        title: "风魔龙的咆哮",
        locationId: "loc-stormterror-lair",
        participantCharacterIds: ["char-venti", "char-traveler"],
        document: {
          mode: "blocks",
          blocks: [
            {
              blockId: "blk-1",
              kind: "narration",
              text: "狂风在废墟顶端肆虐呼啸。",
            },
            {
              blockId: "blk-2",
              kind: "dialogue",
              speakerCharacterId: "char-venti",
              text: "特瓦林，不要再被深渊的毒血侵蚀了！",
            },
          ],
        },
      },
      references: [
        {
          targetType: "lore",
          targetId: "lore-dvalin-corruption",
          role: "theme",
        },
      ],
      choices: [
        {
          label: "弹奏天空之琴唤醒巨龙",
          targetSceneId: "scene-302",
          consequenceSummary: "净化毒血的第一阶段",
        },
      ],
      validationNotes: ["已校验天空之琴在场状态", "符合蒙德主线正典"],
    },
  };

  candidateStore.candidates = [candidatePayload];
  candidateStore.selectCandidate("cand-opt-1");

  const cand = candidateStore.selectedCandidate;
  assert.ok(cand);
  assert.equal(cand.payload.scene.title, "风魔龙的咆哮");
  assert.equal(cand.payload.scene.document?.blocks?.length, 2);
  assert.equal(cand.payload.scene.participantCharacterIds.length, 2);
  assert.equal(cand.payload.choices.length, 1);

  // Mock review API approve call
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: string | URL | Request) => {
    const urlStr = url.toString();
    if (urlStr.includes("/review")) {
      return {
        ok: true,
        json: async () => ({ worldRevision: 6 }),
      } as unknown as Response;
    }
    return {
      ok: true,
      json: async () => ([{ ...candidatePayload, status: "approved" }]),
    } as unknown as Response;
  };

  try {
    const success = await candidateStore.reviewCandidate("world-1", "cand-opt-1", "approve");
    assert.equal(success, true);
    assert.equal(revisionStore.worldRevision, 6);
    assert.equal(candidateStore.candidates[0]?.status, "approved");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
