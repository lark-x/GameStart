import { randomUUID } from "node:crypto";
import type {
  V2ApplyNarrativeTemplateRequest,
  V2ApplyNarrativeTemplateResponse,
  V2CanonLoreEntry,
  V2CreateChapterRequest,
  V2CreateQuestRequest,
  V2CreateLoreEntryRequest,
  V2NarrativeChapter,
  V2NarrativeGenerationContextRequest,
  V2NarrativeGenerationContextResponse,
  V2NarrativeOutline,
  V2NarrativeQuest,
  V2NarrativeSearchResultItem,
  V2ReplaceSceneReferencesRequest,
  V2SceneDocument,
  V2SceneReferencesDto,
  V2SaveSceneDocumentRequest,
  V2UpdateChapterRequest,
  V2UpdateQuestRequest,
  V2UpdateLoreEntryRequest,
  V2NarrativeDiagnosticsReport,
  V2NarrativeTemplate,
} from "@living-network/contracts/v2";
import {
  buildV2NarrativeContextFingerprint,
  createV2CanonLoreEntry,
  createV2NarrativeChapter,
  createV2NarrativeQuest,
  createV2NarrativeReference,
  createV2NarrativeScene,
  createV2SceneBlock,
  createV2GraphChoice,
  getV2NarrativeTemplate,
  listV2NarrativeTemplates,
  renderSceneBlocksToPlainText,
  runNarrativeDiagnostics,
} from "@living-network/domain/v2";
import type { V2NarrativeUnitOfWork } from "@living-network/ports/v2";
import { V2HttpError } from "../core/errors.ts";

export interface V2NarrativeUseCases {
  listOutline(storyWorldId: string): Promise<V2NarrativeOutline>;
  getChapter(storyWorldId: string, chapterId: string): Promise<V2NarrativeChapter>;
  createChapter(storyWorldId: string, request: V2CreateChapterRequest): Promise<V2NarrativeChapter>;
  updateChapter(storyWorldId: string, chapterId: string, request: V2UpdateChapterRequest): Promise<V2NarrativeChapter>;
  deleteChapter(storyWorldId: string, chapterId: string): Promise<{ success: true }>;

  getQuest(storyWorldId: string, questId: string): Promise<V2NarrativeQuest>;
  createQuest(storyWorldId: string, request: V2CreateQuestRequest): Promise<V2NarrativeQuest>;
  updateQuest(storyWorldId: string, questId: string, request: V2UpdateQuestRequest): Promise<V2NarrativeQuest>;
  deleteQuest(storyWorldId: string, questId: string): Promise<{ success: true }>;

  getSceneDocument(storyWorldId: string, sceneId: string): Promise<V2SceneDocument>;
  saveSceneDocument(storyWorldId: string, sceneId: string, request: V2SaveSceneDocumentRequest): Promise<V2SceneDocument>;

  getSceneReferences(storyWorldId: string, sceneId: string): Promise<V2SceneReferencesDto>;
  replaceSceneReferences(storyWorldId: string, sceneId: string, request: V2ReplaceSceneReferencesRequest): Promise<V2SceneReferencesDto>;

  getLoreEntry(storyWorldId: string, loreEntryId: string): Promise<V2CanonLoreEntry>;
  listLoreEntries(storyWorldId: string, filter?: { type?: string; tag?: string }): Promise<readonly V2CanonLoreEntry[]>;
  createLoreEntry(storyWorldId: string, request: V2CreateLoreEntryRequest): Promise<V2CanonLoreEntry>;
  updateLoreEntry(storyWorldId: string, loreEntryId: string, request: V2UpdateLoreEntryRequest): Promise<V2CanonLoreEntry>;
  deleteLoreEntry(storyWorldId: string, loreEntryId: string): Promise<{ success: true }>;

  searchNarrative(storyWorldId: string, query: string, limit?: number): Promise<readonly V2NarrativeSearchResultItem[]>;
  listTemplates(): readonly V2NarrativeTemplate[];
  applyTemplate(storyWorldId: string, request: V2ApplyNarrativeTemplateRequest): Promise<V2ApplyNarrativeTemplateResponse>;
  getDiagnostics(storyWorldId: string): Promise<V2NarrativeDiagnosticsReport>;
  buildContext(storyWorldId: string, request: V2NarrativeGenerationContextRequest): Promise<V2NarrativeGenerationContextResponse>;
}

export function createV2NarrativeUseCases(uow: V2NarrativeUnitOfWork): V2NarrativeUseCases {
  return {
    async listOutline(storyWorldId: string): Promise<V2NarrativeOutline> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const world = await ctx.canon.getWorld(storyWorldId as any);
        if (!world) {
          throw new V2HttpError(404, "NOT_FOUND", `Story world ${storyWorldId} not found`);
        }
        return ctx.hierarchy.listOutline(storyWorldId);
      });
    },

    async getChapter(storyWorldId: string, chapterId: string): Promise<V2NarrativeChapter> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const chapter = await ctx.hierarchy.getChapter({ storyWorldId, chapterId });
        if (!chapter) {
          throw new V2HttpError(404, "NOT_FOUND", `Chapter ${chapterId} not found`);
        }
        return toChapterContract(chapter);
      });
    },

    async createChapter(storyWorldId: string, request: V2CreateChapterRequest): Promise<V2NarrativeChapter> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const world = await ctx.canon.getWorld(storyWorldId as any);
        if (!world) throw new V2HttpError(404, "NOT_FOUND", `Story world ${storyWorldId} not found`);

        const arc = await ctx.graphState.getArc({ storyWorldId: storyWorldId as any, arcId: request.arcId });
        if (!arc) throw new V2HttpError(400, "BAD_REQUEST", `Arc ${request.arcId} not found`);

        const chapterId = request.chapterId || `ch_${randomUUID().slice(0, 8)}`;
        const existing = await ctx.hierarchy.getChapter({ storyWorldId, chapterId });
        if (existing) throw new V2HttpError(409, "CONFLICT", `Chapter ${chapterId} already exists`);

        const entity = createV2NarrativeChapter({
          chapterId,
          storyWorldId,
          arcId: request.arcId,
          title: request.title,
          ...(request.summary ? { summary: request.summary } : {}),
          ordinal: request.ordinal ?? 0,
          revision: 1,
        });

        const created = await ctx.hierarchy.createChapter(entity);
        return toChapterContract(created);
      });
    },

    async updateChapter(storyWorldId: string, chapterId: string, request: V2UpdateChapterRequest): Promise<V2NarrativeChapter> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const existing = await ctx.hierarchy.getChapter({ storyWorldId, chapterId });
        if (!existing) throw new V2HttpError(404, "NOT_FOUND", `Chapter ${chapterId} not found`);

        const arcId = request.arcId ?? existing.arcId;
        if (request.arcId) {
          const arc = await ctx.graphState.getArc({ storyWorldId: storyWorldId as any, arcId: request.arcId });
          if (!arc) throw new V2HttpError(400, "BAD_REQUEST", `Arc ${request.arcId} not found`);
        }

        const summary = request.summary !== undefined ? (request.summary ? request.summary : undefined) : existing.summary;

        const updated = await ctx.hierarchy.updateChapter({
          chapterId,
          storyWorldId,
          arcId,
          title: request.title ?? existing.title,
          ...(summary ? { summary } : {}),
          ordinal: request.ordinal !== undefined ? request.ordinal : existing.ordinal,
          revision: existing.revision + 1,
        });

        return toChapterContract(updated);
      });
    },

    async deleteChapter(storyWorldId: string, chapterId: string): Promise<{ success: true }> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const existing = await ctx.hierarchy.getChapter({ storyWorldId, chapterId });
        if (!existing) throw new V2HttpError(404, "NOT_FOUND", `Chapter ${chapterId} not found`);

        await ctx.hierarchy.deleteChapter({ storyWorldId, chapterId });
        return { success: true };
      });
    },

    async getQuest(storyWorldId: string, questId: string): Promise<V2NarrativeQuest> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const quest = await ctx.hierarchy.getQuest({ storyWorldId, questId });
        if (!quest) throw new V2HttpError(404, "NOT_FOUND", `Quest ${questId} not found`);
        return toQuestContract(quest);
      });
    },

    async createQuest(storyWorldId: string, request: V2CreateQuestRequest): Promise<V2NarrativeQuest> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const world = await ctx.canon.getWorld(storyWorldId as any);
        if (!world) throw new V2HttpError(404, "NOT_FOUND", `Story world ${storyWorldId} not found`);

        if (request.chapterId) {
          const ch = await ctx.hierarchy.getChapter({ storyWorldId, chapterId: request.chapterId });
          if (!ch) throw new V2HttpError(400, "BAD_REQUEST", `Chapter ${request.chapterId} not found`);
        }

        const questId = request.questId || `quest_${randomUUID().slice(0, 8)}`;
        const existing = await ctx.hierarchy.getQuest({ storyWorldId, questId });
        if (existing) throw new V2HttpError(409, "CONFLICT", `Quest ${questId} already exists`);

        const entity = createV2NarrativeQuest({
          questId,
          storyWorldId,
          ...(request.arcId ? { arcId: request.arcId } : {}),
          ...(request.chapterId ? { chapterId: request.chapterId } : {}),
          title: request.title,
          ...(request.summary ? { summary: request.summary } : {}),
          kind: request.kind ?? "main",
          ordinal: request.ordinal ?? 0,
          revision: 1,
        });

        const created = await ctx.hierarchy.createQuest(entity);
        return toQuestContract(created);
      });
    },

    async updateQuest(storyWorldId: string, questId: string, request: V2UpdateQuestRequest): Promise<V2NarrativeQuest> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const existing = await ctx.hierarchy.getQuest({ storyWorldId, questId });
        if (!existing) throw new V2HttpError(404, "NOT_FOUND", `Quest ${questId} not found`);

        if (request.chapterId) {
          const ch = await ctx.hierarchy.getChapter({ storyWorldId, chapterId: request.chapterId });
          if (!ch) throw new V2HttpError(400, "BAD_REQUEST", `Chapter ${request.chapterId} not found`);
        }

        const arcId = request.arcId === null ? undefined : request.arcId !== undefined ? request.arcId : existing.arcId;
        const chapterId = request.chapterId === null ? undefined : request.chapterId !== undefined ? request.chapterId : existing.chapterId;
        const summary = request.summary !== undefined ? (request.summary ? request.summary : undefined) : existing.summary;

        const updated = await ctx.hierarchy.updateQuest({
          questId,
          storyWorldId,
          ...(arcId ? { arcId } : {}),
          ...(chapterId ? { chapterId } : {}),
          title: request.title ?? existing.title,
          ...(summary ? { summary } : {}),
          kind: request.kind ?? existing.kind,
          ordinal: request.ordinal !== undefined ? request.ordinal : existing.ordinal,
          revision: existing.revision + 1,
        });

        return toQuestContract(updated);
      });
    },

    async deleteQuest(storyWorldId: string, questId: string): Promise<{ success: true }> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const existing = await ctx.hierarchy.getQuest({ storyWorldId, questId });
        if (!existing) throw new V2HttpError(404, "NOT_FOUND", `Quest ${questId} not found`);

        await ctx.hierarchy.deleteQuest({ storyWorldId, questId });
        return { success: true };
      });
    },

    async getSceneDocument(storyWorldId: string, sceneId: string): Promise<V2SceneDocument> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const doc = await ctx.sceneDocument.getSceneDocument({ storyWorldId, sceneId });
        if (!doc) throw new V2HttpError(404, "NOT_FOUND", `Scene ${sceneId} not found`);

        return toSceneDocumentContract(doc.scene, doc.blocks);
      });
    },

    async saveSceneDocument(storyWorldId: string, sceneId: string, request: V2SaveSceneDocumentRequest): Promise<V2SceneDocument> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const existingDoc = await ctx.sceneDocument.getSceneDocument({ storyWorldId, sceneId });
        if (!existingDoc) throw new V2HttpError(404, "NOT_FOUND", `Scene ${sceneId} not found`);

        const incomingBlocks = request.blocks ?? [];
        const domainBlocks = incomingBlocks.map((b, idx) =>
          createV2SceneBlock({
            blockId: b.blockId || `b_${randomUUID().slice(0, 8)}`,
            storyWorldId,
            sceneId,
            ordinal: idx,
            kind: b.kind,
            ...(b.speakerCharacterId ? { speakerCharacterId: b.speakerCharacterId } : {}),
            ...(b.text ? { text: b.text } : {}),
            payload: b.payload ?? {},
            revision: 1,
          }),
        );

        const docMode = request.documentMode ?? existingDoc.scene.documentMode;
        const renderedBody = docMode === "blocks"
          ? renderSceneBlocksToPlainText(domainBlocks)
          : (request.body !== undefined ? (request.body ? request.body : undefined) : existingDoc.scene.body);

        const arcId = request.arcId === null ? undefined : request.arcId !== undefined ? request.arcId : existingDoc.scene.arcId;
        const chapterId = request.chapterId === null ? undefined : request.chapterId !== undefined ? request.chapterId : existingDoc.scene.chapterId;
        const questId = request.questId === null ? undefined : request.questId !== undefined ? request.questId : existingDoc.scene.questId;

        const updatedScene = createV2NarrativeScene({
          sceneId,
          storyWorldId,
          ...(arcId ? { arcId } : {}),
          ...(chapterId ? { chapterId } : {}),
          ...(questId ? { questId } : {}),
          title: request.title ?? existingDoc.scene.title,
          ...(renderedBody ? { body: renderedBody } : {}),
          documentMode: docMode,
          isEntry: request.isEntry !== undefined ? request.isEntry : existingDoc.scene.isEntry,
          ordinal: request.ordinal !== undefined ? request.ordinal : existingDoc.scene.ordinal,
          revision: existingDoc.scene.revision + 1,
        });

        const saved = await ctx.sceneDocument.saveSceneDocument({
          scene: updatedScene,
          blocks: domainBlocks,
        });

        return toSceneDocumentContract(saved.scene, saved.blocks);
      });
    },

    async getSceneReferences(storyWorldId: string, sceneId: string): Promise<V2SceneReferencesDto> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const refs = await ctx.references.listReferencesBySource({
          storyWorldId,
          sourceType: "scene",
          sourceId: sceneId,
        });
        const locRef = refs.find((r) => r.role === "location" && r.targetType === "location");
        const pRefs = refs.filter((r) => r.role === "participant" && r.targetType === "character");

        return {
          storyWorldId: storyWorldId as any,
          sceneId: sceneId as any,
          ...(locRef ? { mainLocationId: locRef.targetId as any } : {}),
          participantCharacterIds: pRefs.map((r) => r.targetId as any),
          references: refs.map((r) => ({
            referenceId: r.referenceId,
            storyWorldId: r.storyWorldId as any,
            sourceType: r.sourceType,
            sourceId: r.sourceId,
            targetType: r.targetType,
            targetId: r.targetId,
            role: r.role,
            ...(r.createdAt ? { createdAt: r.createdAt } : {}),
          })),
        };
      });
    },

    async replaceSceneReferences(storyWorldId: string, sceneId: string, request: V2ReplaceSceneReferencesRequest): Promise<V2SceneReferencesDto> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const toSave: any[] = [];

        if (request.mainLocationId) {
          toSave.push(
            createV2NarrativeReference({
              referenceId: `ref_${randomUUID().slice(0, 8)}`,
              storyWorldId,
              sourceType: "scene",
              sourceId: sceneId,
              targetType: "location",
              targetId: request.mainLocationId,
              role: "location",
            }),
          );
        }

        if (request.participantCharacterIds) {
          for (const pId of request.participantCharacterIds) {
            toSave.push(
              createV2NarrativeReference({
                referenceId: `ref_${randomUUID().slice(0, 8)}`,
                storyWorldId,
                sourceType: "scene",
                sourceId: sceneId,
                targetType: "character",
                targetId: pId,
                role: "participant",
              }),
            );
          }
        }

        if (request.references) {
          for (const item of request.references) {
            toSave.push(
              createV2NarrativeReference({
                referenceId: `ref_${randomUUID().slice(0, 8)}`,
                storyWorldId,
                sourceType: "scene",
                sourceId: sceneId,
                targetType: item.targetType,
                targetId: item.targetId,
                role: item.role,
              }),
            );
          }
        }

        const replaced = await ctx.references.replaceReferencesForSource(
          { storyWorldId, sourceType: "scene", sourceId: sceneId },
          toSave,
        );

        const locRef = replaced.find((r) => r.role === "location" && r.targetType === "location");
        const pRefs = replaced.filter((r) => r.role === "participant" && r.targetType === "character");

        return {
          storyWorldId: storyWorldId as any,
          sceneId: sceneId as any,
          ...(locRef ? { mainLocationId: locRef.targetId as any } : {}),
          participantCharacterIds: pRefs.map((r) => r.targetId as any),
          references: replaced.map((r) => ({
            referenceId: r.referenceId,
            storyWorldId: r.storyWorldId as any,
            sourceType: r.sourceType,
            sourceId: r.sourceId,
            targetType: r.targetType,
            targetId: r.targetId,
            role: r.role,
            ...(r.createdAt ? { createdAt: r.createdAt } : {}),
          })),
        };
      });
    },

    async getLoreEntry(storyWorldId: string, loreEntryId: string): Promise<V2CanonLoreEntry> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const entry = await ctx.lore.getLoreEntry({ storyWorldId, loreEntryId });
        if (!entry) throw new V2HttpError(404, "NOT_FOUND", `Lore entry ${loreEntryId} not found`);
        return toLoreContract(entry);
      });
    },

    async listLoreEntries(storyWorldId: string, filter?: { type?: string; tag?: string }): Promise<readonly V2CanonLoreEntry[]> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const entries = await ctx.lore.listLoreEntries(storyWorldId, filter);
        return entries.map(toLoreContract);
      });
    },

    async createLoreEntry(storyWorldId: string, request: V2CreateLoreEntryRequest): Promise<V2CanonLoreEntry> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const world = await ctx.canon.getWorld(storyWorldId as any);
        if (!world) throw new V2HttpError(404, "NOT_FOUND", `Story world ${storyWorldId} not found`);

        const loreEntryId = request.loreEntryId || `lore_${randomUUID().slice(0, 8)}`;
        const existing = await ctx.lore.getLoreEntry({ storyWorldId, loreEntryId });
        if (existing) throw new V2HttpError(409, "CONFLICT", `Lore entry ${loreEntryId} already exists`);

        const entity = createV2CanonLoreEntry({
          loreEntryId,
          storyWorldId,
          type: request.type,
          ...(request.customType ? { customType: request.customType } : {}),
          name: request.name,
          ...(request.summary ? { summary: request.summary } : {}),
          ...(request.body ? { body: request.body } : {}),
          tags: request.tags ?? [],
          revision: 1,
        });

        const created = await ctx.lore.createLoreEntry(entity);
        return toLoreContract(created);
      });
    },

    async updateLoreEntry(storyWorldId: string, loreEntryId: string, request: V2UpdateLoreEntryRequest): Promise<V2CanonLoreEntry> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const existing = await ctx.lore.getLoreEntry({ storyWorldId, loreEntryId });
        if (!existing) throw new V2HttpError(404, "NOT_FOUND", `Lore entry ${loreEntryId} not found`);

        const customType = request.customType !== undefined ? (request.customType ? request.customType : undefined) : existing.customType;
        const summary = request.summary !== undefined ? (request.summary ? request.summary : undefined) : existing.summary;
        const body = request.body !== undefined ? (request.body ? request.body : undefined) : existing.body;

        const entity = createV2CanonLoreEntry({
          loreEntryId,
          storyWorldId,
          type: request.type ?? existing.type,
          ...(customType ? { customType } : {}),
          name: request.name ?? existing.name,
          ...(summary ? { summary } : {}),
          ...(body ? { body } : {}),
          tags: request.tags ?? existing.tags,
          revision: existing.revision + 1,
        });

        const updated = await ctx.lore.updateLoreEntry(entity);
        return toLoreContract(updated);
      });
    },

    async deleteLoreEntry(storyWorldId: string, loreEntryId: string): Promise<{ success: true }> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const existing = await ctx.lore.getLoreEntry({ storyWorldId, loreEntryId });
        if (!existing) throw new V2HttpError(404, "NOT_FOUND", `Lore entry ${loreEntryId} not found`);

        await ctx.lore.deleteLoreEntry({ storyWorldId, loreEntryId });
        return { success: true };
      });
    },

    async searchNarrative(storyWorldId: string, query: string, limit?: number): Promise<readonly V2NarrativeSearchResultItem[]> {
      return uow.withNarrativeTransaction(async (ctx) => {
        return ctx.search.searchNarrative(storyWorldId, query, limit);
      });
    },

    listTemplates(): readonly V2NarrativeTemplate[] {
      return listV2NarrativeTemplates() as readonly V2NarrativeTemplate[];
    },

    async applyTemplate(storyWorldId: string, request: V2ApplyNarrativeTemplateRequest): Promise<V2ApplyNarrativeTemplateResponse> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const world = await ctx.canon.getWorld(storyWorldId as any);
        if (!world) throw new V2HttpError(404, "NOT_FOUND", `Story world ${storyWorldId} not found`);

        const template = getV2NarrativeTemplate(request.templateId);
        const createdArcIds: string[] = [];
        const createdChapterIds: string[] = [];
        const createdQuestIds: string[] = [];
        const createdSceneIds: string[] = [];
        const createdChoiceIds: string[] = [];

        // Key to ID mappings for template choice wiring
        const sceneKeyToIdMap = new Map<string, string>();

        for (let arcIdx = 0; arcIdx < template.structure.arcs.length; arcIdx++) {
          const arcDef = template.structure.arcs[arcIdx]!;
          const arcId = `arc_${randomUUID().slice(0, 8)}`;
          await ctx.graphState.createArc({
            storyWorldId: storyWorldId as any,
            arcId: arcId as any,
            title: arcDef.title,
            ...(arcDef.summary ? { summary: arcDef.summary } : {}),
          });
          createdArcIds.push(arcId);

          for (let chIdx = 0; chIdx < arcDef.chapters.length; chIdx++) {
            const chDef = arcDef.chapters[chIdx]!;
            const chapterId = `ch_${randomUUID().slice(0, 8)}`;
            await ctx.hierarchy.createChapter({
              chapterId,
              storyWorldId,
              arcId,
              title: chDef.title,
              ...(chDef.summary ? { summary: chDef.summary } : {}),
              ordinal: chIdx,
              revision: 1,
            });
            createdChapterIds.push(chapterId);

            for (let qIdx = 0; qIdx < chDef.quests.length; qIdx++) {
              const qDef = chDef.quests[qIdx]!;
              const questId = `quest_${randomUUID().slice(0, 8)}`;
              await ctx.hierarchy.createQuest({
                questId,
                storyWorldId,
                arcId,
                chapterId,
                title: qDef.title,
                ...(qDef.summary ? { summary: qDef.summary } : {}),
                kind: qDef.kind,
                ordinal: qIdx,
                revision: 1,
              });
              createdQuestIds.push(questId);

              for (let sIdx = 0; sIdx < qDef.scenes.length; sIdx++) {
                const sDef = qDef.scenes[sIdx]!;
                const sceneId = `scene_${randomUUID().slice(0, 8)}`;
                sceneKeyToIdMap.set(sDef.key, sceneId);

                const domainBlocks = (sDef.blocks ?? []).map((b, bIdx) =>
                  createV2SceneBlock({
                    blockId: `b_${randomUUID().slice(0, 8)}`,
                    storyWorldId,
                    sceneId,
                    ordinal: bIdx,
                    kind: b.kind,
                    ...(b.text ? { text: b.text } : {}),
                    payload: b.payload ?? {},
                    revision: 1,
                  }),
                );

                const renderedText = renderSceneBlocksToPlainText(domainBlocks);

                await ctx.graphState.createScene({
                  sceneId: sceneId as any,
                  storyWorldId: storyWorldId as any,
                  arcId: arcId as any,
                  title: sDef.title,
                  body: renderedText,
                  isEntry: Boolean(sDef.isEntry),
                });

                await ctx.sceneDocument.saveSceneDocument({
                  scene: {
                    sceneId,
                    storyWorldId,
                    arcId,
                    chapterId,
                    questId,
                    title: sDef.title,
                    body: renderedText,
                    documentMode: "blocks",
                    isEntry: Boolean(sDef.isEntry),
                    ordinal: sIdx,
                    revision: 1,
                  },
                  blocks: domainBlocks,
                });
                createdSceneIds.push(sceneId);
              }
            }
          }
        }

        // Wire template choices
        for (const arcDef of template.structure.arcs) {
          for (const chDef of arcDef.chapters) {
            for (const qDef of chDef.quests) {
              for (const sDef of qDef.scenes) {
                const sourceSceneId = sceneKeyToIdMap.get(sDef.key);
                if (!sourceSceneId || !sDef.choices) continue;

                const sourceScene = await ctx.graphState.getScene({
                  storyWorldId: storyWorldId as any,
                  sceneId: sourceSceneId as any,
                });
                if (!sourceScene) continue;

                for (const choiceDef of sDef.choices) {
                  const targetSceneId = choiceDef.targetSceneKey ? sceneKeyToIdMap.get(choiceDef.targetSceneKey) : undefined;
                  const targetScene = targetSceneId ? await ctx.graphState.getScene({
                    storyWorldId: storyWorldId as any,
                    sceneId: targetSceneId as any,
                  }) : undefined;

                  const choiceId = `choice_${randomUUID().slice(0, 8)}`;
                  const choiceEntity = createV2GraphChoice({
                    choiceId: choiceId as any,
                    storyWorldId: storyWorldId as any,
                    sourceScene,
                    ...(targetScene ? { targetScene } : {}),
                    label: choiceDef.label,
                  });
                  await ctx.graphState.createChoice(choiceEntity);
                  createdChoiceIds.push(choiceId);
                }
              }
            }
          }
        }

        const nextRevision = (await ctx.canon.advanceRevision(storyWorldId as any, request.expectedRevision)) as any;

        return {
          createdArcsCount: createdArcIds.length,
          createdChaptersCount: createdChapterIds.length,
          createdQuestsCount: createdQuestIds.length,
          createdScenesCount: createdSceneIds.length,
          createdChoicesCount: createdChoiceIds.length,
          revision: nextRevision,
        };
      });
    },

    async getDiagnostics(storyWorldId: string): Promise<V2NarrativeDiagnosticsReport> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const arcs = await ctx.graphState.listArcs(storyWorldId as any);
        const chapters = await ctx.hierarchy.listChapters(storyWorldId);
        const quests = await ctx.hierarchy.listQuests(storyWorldId);
        const scenes = await ctx.graphState.listScenes(storyWorldId as any);
        const choices = await ctx.graphState.listChoices(storyWorldId as any);
        const refs = await ctx.references.listAllReferences(storyWorldId);
        const chars = await ctx.canon.listCharacters(storyWorldId as any);
        const locs = await ctx.canon.listLocations(storyWorldId as any);

        const allBlocks = [];
        for (const s of scenes) {
          const blocks = await ctx.sceneDocument.listSceneBlocks({ storyWorldId, sceneId: s.sceneId });
          allBlocks.push(...blocks);
        }

        return runNarrativeDiagnostics({
          storyWorldId,
          arcs: arcs.map((a) => ({ arcId: a.arcId, title: a.title })),
          chapters: chapters.map((c) => ({
            chapterId: c.chapterId,
            storyWorldId: c.storyWorldId,
            arcId: c.arcId,
            title: c.title,
            ordinal: c.ordinal,
            revision: c.revision,
          })),
          quests: quests.map((q) => ({
            questId: q.questId,
            storyWorldId: q.storyWorldId,
            ...(q.arcId ? { arcId: q.arcId } : {}),
            ...(q.chapterId ? { chapterId: q.chapterId } : {}),
            title: q.title,
            kind: q.kind,
            ordinal: q.ordinal,
            revision: q.revision,
          })),
          scenes: scenes.map((s) => ({
            sceneId: s.sceneId,
            storyWorldId: s.storyWorldId,
            ...(s.arcId ? { arcId: s.arcId } : {}),
            title: s.title,
            ...(s.body ? { body: s.body } : {}),
            documentMode: "blocks",
            isEntry: s.isEntry,
            ordinal: 0,
            revision: 1,
          })),
          blocks: allBlocks,
          choices: choices.map((c) => ({
            choiceId: c.choiceId,
            storyWorldId: c.storyWorldId,
            sourceSceneId: c.sourceSceneId,
            ...(c.targetSceneId ? { targetSceneId: c.targetSceneId } : {}),
            label: c.label,
          })),
          references: refs,
          characters: chars.map((ch) => ({ characterId: ch.characterId, name: ch.name })),
          locations: locs.map((loc) => ({ locationId: loc.locationId, name: loc.name })),
        });
      });
    },

    async buildContext(storyWorldId: string, request: V2NarrativeGenerationContextRequest): Promise<V2NarrativeGenerationContextResponse> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const world = await ctx.canon.getWorld(storyWorldId as any);
        if (!world) throw new V2HttpError(404, "NOT_FOUND", `Story world ${storyWorldId} not found`);

        const promptSections = [];
        const sources = [];

        // World section
        promptSections.push({
          title: "世界观背景",
          content: `世界名称：${world.name}`,
          tokenEstimate: Math.ceil(world.name.length / 2),
        });

        // Current outline / hierarchy context
        if (request.targetQuestId) {
          const quest = await ctx.hierarchy.getQuest({ storyWorldId, questId: request.targetQuestId });
          if (quest) {
            const content = quest.summary || "无任务简介";
            promptSections.push({
              title: `当前任务：${quest.title} (${quest.kind})`,
              content,
              tokenEstimate: Math.ceil(content.length / 2),
            });
            sources.push({ kind: "quest" as const, id: quest.questId, revision: quest.revision });
          }
        }

        if (request.targetSceneId) {
          const scene = await ctx.sceneDocument.getSceneDocument({ storyWorldId, sceneId: request.targetSceneId });
          if (scene) {
            const content = scene.scene.body || "无场景内容";
            promptSections.push({
              title: `当前场景：${scene.scene.title}`,
              content,
              tokenEstimate: Math.ceil(content.length / 2),
            });
            sources.push({ kind: "scene" as const, id: scene.scene.sceneId, revision: scene.scene.revision });
          }
        }

        if (request.prompt) {
          promptSections.push({
            title: "创作要求与创作指令",
            content: request.prompt,
            tokenEstimate: Math.ceil(request.prompt.length / 2),
          });
        }

        const fingerprint = buildV2NarrativeContextFingerprint({
          storyWorldId,
          worldRevision: world.revision,
          sources,
        });

        return {
          contextHash: fingerprint.hash,
          fingerprint: {
            storyWorldId: storyWorldId as any,
            worldRevision: fingerprint.worldRevision,
            sources: fingerprint.sources,
            hash: fingerprint.hash,
          },
          sections: promptSections,
          totalTokensEstimate: promptSections.reduce((sum, sec) => sum + sec.tokenEstimate, 0),
          selectedSources: sources.map((s) => `${s.kind}:${s.id}`),
          omittedSources: [],
        };
      });
    },
  };
}

function toChapterContract(c: any): V2NarrativeChapter {
  return {
    chapterId: c.chapterId,
    storyWorldId: c.storyWorldId,
    arcId: c.arcId,
    title: c.title,
    ...(c.summary ? { summary: c.summary } : {}),
    ordinal: c.ordinal,
    revision: c.revision,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function toQuestContract(q: any): V2NarrativeQuest {
  return {
    questId: q.questId,
    storyWorldId: q.storyWorldId,
    ...(q.arcId ? { arcId: q.arcId } : {}),
    ...(q.chapterId ? { chapterId: q.chapterId } : {}),
    title: q.title,
    ...(q.summary ? { summary: q.summary } : {}),
    kind: q.kind,
    ordinal: q.ordinal,
    revision: q.revision,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}

function toLoreContract(l: any): V2CanonLoreEntry {
  return {
    loreEntryId: l.loreEntryId,
    storyWorldId: l.storyWorldId,
    type: l.type,
    ...(l.customType ? { customType: l.customType } : {}),
    name: l.name,
    ...(l.summary ? { summary: l.summary } : {}),
    ...(l.body ? { body: l.body } : {}),
    tags: l.tags ?? [],
    revision: l.revision,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

function toSceneDocumentContract(scene: any, blocks: readonly any[]): V2SceneDocument {
  return {
    storyWorldId: scene.storyWorldId,
    sceneId: scene.sceneId,
    ...(scene.arcId ? { arcId: scene.arcId } : {}),
    ...(scene.chapterId ? { chapterId: scene.chapterId } : {}),
    ...(scene.questId ? { questId: scene.questId } : {}),
    title: scene.title,
    ...(scene.body ? { body: scene.body } : {}),
    documentMode: scene.documentMode,
    isEntry: scene.isEntry,
    ordinal: scene.ordinal,
    revision: scene.revision,
    blocks: blocks.map((b) => ({
      blockId: b.blockId,
      storyWorldId: b.storyWorldId,
      sceneId: b.sceneId,
      ordinal: b.ordinal,
      kind: b.kind,
      ...(b.speakerCharacterId ? { speakerCharacterId: b.speakerCharacterId } : {}),
      ...(b.text ? { text: b.text } : {}),
      payload: b.payload ?? {},
      revision: b.revision,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    })),
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
  };
}
