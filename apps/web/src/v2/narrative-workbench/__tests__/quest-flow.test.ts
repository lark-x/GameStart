import assert from "node:assert/strict";
import test from "node:test";
import { createPinia, setActivePinia } from "pinia";
import { useNarrativeChoiceStore } from "../stores/useNarrativeChoiceStore.ts";
import { useNarrativeOutlineStore } from "../../story/stores/useNarrativeOutlineStore.ts";

test("Narrative Quest Flow - Quest-Local subgraphs and Choice connectivity", () => {
  setActivePinia(createPinia());
  const choiceStore = useNarrativeChoiceStore();
  const outlineStore = useNarrativeOutlineStore();

  outlineStore.outline = {
    arcs: [
      {
        arcId: "arc-1",
        title: "第一幕：捕风的异乡人",
        ordinal: 1,
        chapters: [
          {
            chapterId: "ch-1",
            title: "第一章",
            ordinal: 1,
            quests: [
              {
                questId: "quest-1",
                title: "起程的誓约",
                ordinal: 1,
                scenes: [
                  { sceneId: "scene-101", title: "低语森林初遇", ordinal: 1, isEntry: true },
                  { sceneId: "scene-102", title: "与安柏同行", ordinal: 2, isEntry: false },
                ],
              },
              {
                questId: "quest-2",
                title: "西风骑士团",
                ordinal: 2,
                scenes: [
                  { sceneId: "scene-201", title: "骑士团总部", ordinal: 1, isEntry: false },
                ],
              },
            ],
            looseScenes: [],
          },
        ],
        looseQuests: [],
        looseScenes: [],
      },
    ],
    unassignedScenes: [],
  };

  choiceStore.choicesBySourceSceneId = {
    "scene-101": [
      {
        choiceId: "choice-1",
        sourceSceneId: "scene-101",
        targetSceneId: "scene-102",
        label: "跟随红色少女",
        gates: [],
        consequences: [],
      },
    ],
    "scene-102": [
      {
        choiceId: "choice-2",
        sourceSceneId: "scene-102",
        targetSceneId: "scene-201",
        label: "前往蒙德城",
        gates: [],
        consequences: [],
      },
    ],
  };

  // 1. Quest 1 Local scenes
  const quest1Scenes = outlineStore.outline.arcs[0]?.chapters[0]?.quests[0]?.scenes ?? [];
  assert.equal(quest1Scenes.length, 2);

  // 2. Choices from quest 1 scenes
  const outgoingChoicesQ1 = quest1Scenes.flatMap((s) => choiceStore.choicesForScene(s.sceneId));
  assert.equal(outgoingChoicesQ1.length, 2);

  // 3. Intra-quest link: scene-101 -> scene-102 (within quest-1)
  assert.equal(outgoingChoicesQ1[0]?.targetSceneId, "scene-102");

  // 4. Inter-quest link: scene-102 -> scene-201 (connecting to quest-2)
  assert.equal(outgoingChoicesQ1[1]?.targetSceneId, "scene-201");
});
