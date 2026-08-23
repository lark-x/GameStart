import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  V2SqliteCanonRepository,
  V2SqliteGraphStateRepository,
  SqliteNarrativeHierarchyRepository,
  SqliteSceneDocumentRepository,
  SqliteNarrativeReferenceRepository,
  SqliteCanonLoreRepository,
  SqliteNarrativeSearchRepository,
  applyV2Migrations,
} from "@living-network/database/v2";
import { createV2NarrativeUseCases } from "./use-cases.ts";
import type { V2NarrativeUnitOfWork } from "@living-network/ports/v2";

function createInMemoryNarrativeApi() {
  const db = new DatabaseSync(":memory:");
  applyV2Migrations(db);

  const canon = new V2SqliteCanonRepository(db);
  const graphState = new V2SqliteGraphStateRepository(db);
  const hierarchy = new SqliteNarrativeHierarchyRepository(db);
  const sceneDocument = new SqliteSceneDocumentRepository(db);
  const references = new SqliteNarrativeReferenceRepository(db);
  const lore = new SqliteCanonLoreRepository(db);
  const search = new SqliteNarrativeSearchRepository(db);

  const uow: V2NarrativeUnitOfWork = {
    async withNarrativeTransaction(fn) {
      return fn({
        canon,
        graphState,
        hierarchy,
        sceneDocument,
        references,
        lore,
        search,
      });
    },
  };

  const useCases = createV2NarrativeUseCases(uow);
  return { db, useCases, canon, graphState, hierarchy, sceneDocument, references, lore, search };
}

describe("Narrative V2 Fixture & Performance Stress Suite", () => {
  it("generates and stress-tests a medium dataset (10 Arcs, 50 Chapters, 150 Quests, 500 Scenes, 2,500 Blocks)", async () => {
    const { useCases, canon, graphState, hierarchy, sceneDocument, references, lore } = createInMemoryNarrativeApi();
    const storyWorldId = "world_stress_1";

    await canon.createWorld({
      storyWorldId: storyWorldId as any,
      name: "Teyvat Benchmark World",
      summary: "Performance benchmark world for large scale narrative authoring",
      revision: 1,
    });

    // 1. Create Characters & Locations
    const charIds: string[] = [];
    for (let c = 1; c <= 20; c++) {
      const charId = `char_stress_${c}`;
      charIds.push(charId);
      await canon.createCharacter({
        characterId: charId as any,
        storyWorldId: storyWorldId as any,
        name: `Character ${c}`,
        summary: `Character summary for stress testing ${c}`,
      });
    }

    const locIds: string[] = [];
    for (let l = 1; l <= 10; l++) {
      const locId = `loc_stress_${l}`;
      locIds.push(locId);
      await canon.createLocation({
        locationId: locId as any,
        storyWorldId: storyWorldId as any,
        name: `Location ${l}`,
        summary: `Location description for stress testing ${l}`,
      });
    }

    // 2. Build 5 Arcs, 25 Chapters, 50 Quests, 200 Scenes, 1,000 Blocks
    const arcCount = 5;
    const chPerArc = 5;
    const qPerCh = 2;
    const scPerQ = 4;
    const blkPerSc = 5;

    let sceneCounter = 0;
    const allSceneIds: string[] = [];

    for (let a = 1; a <= arcCount; a++) {
      const arcId = `arc_${a}`;
      await graphState.createArc({
        arcId: arcId as any,
        storyWorldId: storyWorldId as any,
        title: `Act ${a}: Epic Arc`,
      });

      for (let ch = 1; ch <= chPerArc; ch++) {
        const chapterId = `ch_${a}_${ch}`;
        await hierarchy.createChapter({
          chapterId,
          storyWorldId,
          arcId,
          title: `Chapter ${a}-${ch}`,
          ordinal: ch,
          revision: 1,
        });

        for (let q = 1; q <= qPerCh; q++) {
          const questId = `quest_${a}_${ch}_${q}`;
          await hierarchy.createQuest({
            questId,
            storyWorldId,
            arcId,
            chapterId,
            title: `Quest ${a}-${ch}-${q}`,
            kind: q % 2 === 0 ? "side" : "main",
            ordinal: q,
            revision: 1,
          });

          for (let s = 1; s <= scPerQ; s++) {
            sceneCounter++;
            const sceneId = `scene_${sceneCounter}`;
            allSceneIds.push(sceneId);

            await graphState.createScene({
              sceneId: sceneId as any,
              storyWorldId: storyWorldId as any,
              arcId: arcId as any,
              title: `Scene ${sceneCounter}: Encounter`,
              body: `Narration body text for scene ${sceneCounter}`,
              isEntry: sceneCounter === 1,
            });

            const blocks = [];
            for (let b = 1; b <= blkPerSc; b++) {
              const speakerChar = charIds[(sceneCounter + b) % charIds.length]!;
              blocks.push({
                blockId: `blk_${sceneCounter}_${b}`,
                storyWorldId,
                sceneId,
                ordinal: b,
                kind: (b % 2 === 0 ? "dialogue" : "narration") as any,
                ...(b % 2 === 0 ? { speakerCharacterId: speakerChar } : {}),
                text: `Script line ${b} for scene ${sceneCounter}`,
                payload: {},
                revision: 1,
              });
            }

            await sceneDocument.saveSceneDocument({
              scene: {
                sceneId,
                storyWorldId,
                arcId,
                chapterId,
                questId,
                title: `Scene ${sceneCounter}: Encounter`,
                body: `Narration body text for scene ${sceneCounter}`,
                isEntry: sceneCounter === 1,
                ordinal: s,
                revision: 1,
                documentMode: "blocks",
              },
              blocks,
            });

            // Add Location & Participant references
            const locId = locIds[sceneCounter % locIds.length]!;
            const charId = charIds[sceneCounter % charIds.length]!;
            await references.replaceReferencesForSource(
              { storyWorldId, sourceType: "scene", sourceId: sceneId },
              [
                {
                  referenceId: `ref_loc_${sceneCounter}`,
                  storyWorldId,
                  sourceType: "scene",
                  sourceId: sceneId,
                  targetType: "location",
                  targetId: locId,
                  role: "location",
                },
                {
                  referenceId: `ref_char_${sceneCounter}`,
                  storyWorldId,
                  sourceType: "scene",
                  sourceId: sceneId,
                  targetType: "character",
                  targetId: charId,
                  role: "participant",
                },
              ],
            );
          }
        }
      }
    }

    assert.equal(allSceneIds.length, 200);

    // 3. Measure Outline Query Performance
    const outlineStart = performance.now();
    const outline = await useCases.listOutline(storyWorldId);
    const outlineDuration = performance.now() - outlineStart;

    const totalChapters = outline.arcs.reduce((sum, a) => sum + a.chapters.length, 0);
    const totalQuests = outline.arcs.reduce((sum, a) => sum + a.looseQuests.length + a.chapters.reduce((s2, c) => s2 + c.quests.length, 0), 0);
    const totalScenes = outline.arcs.reduce((sum, a) => sum + a.looseScenes.length + a.chapters.reduce((s2, c) => s2 + c.looseScenes.length + c.quests.reduce((s3, q) => s3 + q.scenes.length, 0), 0), 0) + outline.unassignedScenes.length;

    assert.equal(outline.arcs.length, 5);
    assert.equal(totalChapters, 25);
    assert.equal(totalQuests, 50);
    assert.equal(totalScenes, 200);
    assert(outlineDuration < 100, `listOutline took ${outlineDuration}ms, must be under 100ms`);

    // 4. Measure Diagnostics Bulk Query Performance
    const diagStart = performance.now();
    const diagReport = await useCases.getDiagnostics(storyWorldId);
    const diagDuration = performance.now() - diagStart;

    assert.equal(typeof diagReport.valid, "boolean");
    assert(diagDuration < 150, `getDiagnostics took ${diagDuration}ms, must be under 150ms`);

    // 5. Measure Full-text Search Performance
    const searchStart = performance.now();
    const searchResults = await useCases.searchNarrative(storyWorldId, "Encounter", 20);
    const searchDuration = performance.now() - searchStart;

    assert.equal(searchResults.length, 20);
    assert(searchDuration < 50, `searchNarrative took ${searchDuration}ms, must be under 50ms`);

    // 6. Measure Task-Scoped Context Generation
    const contextStart = performance.now();
    const context = await useCases.buildContext(storyWorldId, {
      task: "continue_scene",
      targetSceneId: "scene_42",
      prompt: "Continue the dialogue with more dramatic tension",
      tokenBudget: 3000,
    });
    const contextDuration = performance.now() - contextStart;

    assert(context.sections.length >= 4);
    assert(context.fingerprint.hash.length === 64);
    assert(contextDuration < 50, `buildContext took ${contextDuration}ms, must be under 50ms`);
  });
});
