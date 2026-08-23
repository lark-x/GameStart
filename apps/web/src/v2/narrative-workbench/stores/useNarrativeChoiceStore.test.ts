import assert from "node:assert/strict";
import test from "node:test";
import { createPinia, setActivePinia } from "pinia";
import { useNarrativeChoiceStore } from "./useNarrativeChoiceStore.ts";
import { useNarrativeRevisionStore } from "./useNarrativeRevisionStore.ts";

test("useNarrativeChoiceStore indexes choices by sourceSceneId and computes activeChoice", () => {
  setActivePinia(createPinia());
  const choiceStore = useNarrativeChoiceStore();

  choiceStore.choicesBySourceSceneId = {
    "scene-1": [
      {
        choiceId: "choice-101",
        sourceSceneId: "scene-1",
        targetSceneId: "scene-2",
        label: "前往璃月港",
        gates: [],
        consequences: [],
      },
    ],
    "scene-2": [
      {
        choiceId: "choice-102",
        sourceSceneId: "scene-2",
        targetSceneId: "scene-3",
        label: "拜访万民堂",
        gates: [],
        consequences: [],
      },
    ],
  };

  assert.equal(choiceStore.choicesForScene("scene-1").length, 1);
  assert.equal(choiceStore.choicesForScene("scene-1")[0]?.label, "前往璃月港");
  assert.equal(choiceStore.allChoices.length, 2);

  choiceStore.setActiveChoice("choice-102");
  assert.equal(choiceStore.activeChoice?.choiceId, "choice-102");
  assert.equal(choiceStore.activeChoice?.label, "拜访万民堂");
});

test("useNarrativeChoiceStore advances revision on creation", async () => {
  setActivePinia(createPinia());
  const choiceStore = useNarrativeChoiceStore();
  const revisionStore = useNarrativeRevisionStore();
  revisionStore.initialize("world-1", 5);

  // Mock global fetch for choice creation
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      choice: {
        choiceId: "choice-new",
        sourceSceneId: "scene-1",
        targetSceneId: "scene-2",
        label: "调查遗迹",
        gates: [],
        consequences: [],
      },
      worldRevision: 6,
    }),
  } as unknown as Response);

  try {
    const created = await choiceStore.createChoice("world-1", {
      choiceId: "choice-new",
      sourceSceneId: "scene-1",
      targetSceneId: "scene-2",
      label: "调查遗迹",
    });

    assert.ok(created);
    assert.equal(created?.choiceId, "choice-new");
    assert.equal(revisionStore.worldRevision, 6);
    assert.equal(choiceStore.choicesForScene("scene-1").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
