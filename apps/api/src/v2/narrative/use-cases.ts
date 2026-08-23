import { createHash, randomUUID } from "node:crypto";
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
  validateChapterHierarchy,
  validateQuestHierarchy,
  validateSceneHierarchy,
  validateReferenceTargets,
  validateBlockSpeakers,
  V2DomainError,
} from "@living-network/domain/v2";
import type { V2CanonRepository, V2NarrativeUnitOfWork } from "@living-network/ports/v2";
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

function hashPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

async function withIdempotency<TResult>(
  canon: V2CanonRepository,
  operation: string,
  key: string | undefined,
  payload: unknown,
  run: () => Promise<TResult>,
): Promise<TResult> {
  if (!key) return run();
  const payloadHash = hashPayload(payload);
  const existing = await canon.readMutation<TResult>({ key: key as any, operation });
  if (existing) {
    if (existing.payloadHash !== payloadHash) {
      throw new V2HttpError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used with a different payload");
    }
    return existing.result;
  }
  const result = await run();
  await canon.saveMutation({ key: key as any, operation, payloadHash, result });
  return result;
}

async function advanceWorldRevision(
  canon: V2CanonRepository,
  storyWorldId: string,
  expectedRevision?: number,
): Promise<number> {
  try {
    if (expectedRevision !== undefined) {
      return (await canon.advanceRevision(storyWorldId as any, expectedRevision as any)) as number;
    }
    const world = await canon.getWorld(storyWorldId as any);
    if (!world) throw new V2HttpError(404, "NOT_FOUND", `Story world ${storyWorldId} not found`);
    return (await canon.advanceRevision(storyWorldId as any, world.revision as any)) as number;
  } catch (err: unknown) {
    if (err instanceof V2DomainError) {
      if (err.code === "STALE_REVISION") {
        throw new V2HttpError(409, "STALE_REVISION", err.message);
      }
      throw new V2HttpError(400, err.code, err.message);
    }
    throw err;
  }
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
        return withIdempotency(
          ctx.canon,
          "createChapter",
          request.idempotencyKey,
          { storyWorldId, ...request },
          async () => {
            const world = await ctx.canon.getWorld(storyWorldId as any);
            if (!world) throw new V2HttpError(404, "NOT_FOUND", `Story world ${storyWorldId} not found`);

            const arc = await ctx.graphState.getArc({ storyWorldId: storyWorldId as any, arcId: request.arcId });
            try {
              validateChapterHierarchy({ arcId: request.arcId }, arc ? { arcId: arc.arcId } : undefined);
            } catch (err: unknown) {
              if (err instanceof V2DomainError) throw new V2HttpError(400, err.code, err.message);
              throw err;
            }

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
            await advanceWorldRevision(ctx.canon, storyWorldId, request.expectedRevision);
            return toChapterContract(created);
          },
        );
      });
    },

    async updateChapter(storyWorldId: string, chapterId: string, request: V2UpdateChapterRequest): Promise<V2NarrativeChapter> {
      return uow.withNarrativeTransaction(async (ctx) => {
        return withIdempotency(
          ctx.canon,
          "updateChapter",
          request.idempotencyKey,
          { storyWorldId, chapterId, ...request },
          async () => {
            const existing = await ctx.hierarchy.getChapter({ storyWorldId, chapterId });
            if (!existing) throw new V2HttpError(404, "NOT_FOUND", `Chapter ${chapterId} not found`);

            const arcId = request.arcId ?? existing.arcId;
            if (request.arcId) {
              const arc = await ctx.graphState.getArc({ storyWorldId: storyWorldId as any, arcId: request.arcId });
              try {
                validateChapterHierarchy({ arcId: request.arcId }, arc ? { arcId: arc.arcId } : undefined);
              } catch (err: unknown) {
                if (err instanceof V2DomainError) throw new V2HttpError(400, err.code, err.message);
                throw err;
              }
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

            await advanceWorldRevision(ctx.canon, storyWorldId, request.expectedRevision);
            return toChapterContract(updated);
          },
        );
      });
    },

    async deleteChapter(storyWorldId: string, chapterId: string): Promise<{ success: true }> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const existing = await ctx.hierarchy.getChapter({ storyWorldId, chapterId });
        if (!existing) throw new V2HttpError(404, "NOT_FOUND", `Chapter ${chapterId} not found`);

        const questCount = await ctx.hierarchy.countQuestsByChapter({ storyWorldId, chapterId });
        const sceneCount = await ctx.hierarchy.countScenesByChapter({ storyWorldId, chapterId });
        if (questCount > 0 || sceneCount > 0) {
          throw new V2HttpError(409, "HAS_CHILDREN", "Cannot delete chapter that contains quests or scenes");
        }

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
        return withIdempotency(
          ctx.canon,
          "createQuest",
          request.idempotencyKey,
          { storyWorldId, ...request },
          async () => {
            const world = await ctx.canon.getWorld(storyWorldId as any);
            if (!world) throw new V2HttpError(404, "NOT_FOUND", `Story world ${storyWorldId} not found`);

            const chapter = request.chapterId
              ? await ctx.hierarchy.getChapter({ storyWorldId, chapterId: request.chapterId })
              : undefined;
            const arc = request.arcId
              ? await ctx.graphState.getArc({ storyWorldId: storyWorldId as any, arcId: request.arcId })
              : undefined;

            let validatedHierarchy: { arcId: string; chapterId?: string };
            try {
              validatedHierarchy = validateQuestHierarchy(
                {
                  ...(request.arcId ? { arcId: request.arcId } : {}),
                  ...(request.chapterId ? { chapterId: request.chapterId } : {}),
                },
                chapter ? { chapterId: chapter.chapterId, arcId: chapter.arcId } : undefined,
                arc ? { arcId: arc.arcId } : undefined,
              );
            } catch (err: unknown) {
              if (err instanceof V2DomainError) throw new V2HttpError(400, err.code, err.message);
              throw err;
            }

            const questId = request.questId || `quest_${randomUUID().slice(0, 8)}`;
            const existing = await ctx.hierarchy.getQuest({ storyWorldId, questId });
            if (existing) throw new V2HttpError(409, "CONFLICT", `Quest ${questId} already exists`);

            const entity = createV2NarrativeQuest({
              questId,
              storyWorldId,
              arcId: validatedHierarchy.arcId,
              ...(validatedHierarchy.chapterId ? { chapterId: validatedHierarchy.chapterId } : {}),
              title: request.title,
              ...(request.summary ? { summary: request.summary } : {}),
              kind: request.kind ?? "main",
              ordinal: request.ordinal ?? 0,
              revision: 1,
            });

            const created = await ctx.hierarchy.createQuest(entity);
            await advanceWorldRevision(ctx.canon, storyWorldId, request.expectedRevision);
            return toQuestContract(created);
          },
        );
      });
    },

    async updateQuest(storyWorldId: string, questId: string, request: V2UpdateQuestRequest): Promise<V2NarrativeQuest> {
      return uow.withNarrativeTransaction(async (ctx) => {
        return withIdempotency(
          ctx.canon,
          "updateQuest",
          request.idempotencyKey,
          { storyWorldId, questId, ...request },
          async () => {
            const existing = await ctx.hierarchy.getQuest({ storyWorldId, questId });
            if (!existing) throw new V2HttpError(404, "NOT_FOUND", `Quest ${questId} not found`);

            const chapterId = request.chapterId === null ? undefined : request.chapterId !== undefined ? request.chapterId : existing.chapterId;
            const arcId = request.arcId === null ? undefined : request.arcId !== undefined ? request.arcId : existing.arcId;

            const chapter = chapterId
              ? await ctx.hierarchy.getChapter({ storyWorldId, chapterId })
              : undefined;
            const arc = arcId
              ? await ctx.graphState.getArc({ storyWorldId: storyWorldId as any, arcId: arcId as any })
              : undefined;

            let validatedHierarchy: { arcId: string; chapterId?: string };
            try {
              validatedHierarchy = validateQuestHierarchy(
                {
                  ...(arcId ? { arcId } : {}),
                  ...(chapterId ? { chapterId } : {}),
                },
                chapter ? { chapterId: chapter.chapterId, arcId: chapter.arcId } : undefined,
                arc ? { arcId: arc.arcId } : undefined,
              );
            } catch (err: unknown) {
              if (err instanceof V2DomainError) throw new V2HttpError(400, err.code, err.message);
              throw err;
            }

            const summary = request.summary !== undefined ? (request.summary ? request.summary : undefined) : existing.summary;

            const updated = await ctx.hierarchy.updateQuest({
              questId,
              storyWorldId,
              arcId: validatedHierarchy.arcId,
              ...(validatedHierarchy.chapterId ? { chapterId: validatedHierarchy.chapterId } : {}),
              title: request.title ?? existing.title,
              ...(summary ? { summary } : {}),
              kind: request.kind ?? existing.kind,
              ordinal: request.ordinal !== undefined ? request.ordinal : existing.ordinal,
              revision: existing.revision + 1,
            });

            await advanceWorldRevision(ctx.canon, storyWorldId, request.expectedRevision);
            return toQuestContract(updated);
          },
        );
      });
    },

    async deleteQuest(storyWorldId: string, questId: string): Promise<{ success: true }> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const existing = await ctx.hierarchy.getQuest({ storyWorldId, questId });
        if (!existing) throw new V2HttpError(404, "NOT_FOUND", `Quest ${questId} not found`);

        const sceneCount = await ctx.hierarchy.countScenesByQuest({ storyWorldId, questId });
        if (sceneCount > 0) {
          throw new V2HttpError(409, "HAS_CHILDREN", "Cannot delete quest that contains scenes");
        }

        await ctx.hierarchy.deleteQuest({ storyWorldId, questId });
        return { success: true };
      });
    },

    async getSceneDocument(storyWorldId: string, sceneId: string): Promise<V2SceneDocument> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const doc = await ctx.sceneDocument.getSceneDocument({ storyWorldId, sceneId });
        if (!doc) {
          throw new V2HttpError(404, "NOT_FOUND", `Scene ${sceneId} not found`);
        }
        return toSceneDocumentContract(doc.scene, doc.blocks);
      });
    },

    async saveSceneDocument(storyWorldId: string, sceneId: string, request: V2SaveSceneDocumentRequest): Promise<V2SceneDocument> {
      return uow.withNarrativeTransaction(async (ctx) => {
        return withIdempotency(
          ctx.canon,
          "saveSceneDocument",
          request.idempotencyKey,
          { storyWorldId, sceneId, ...request },
          async () => {
            const existingDoc = await ctx.sceneDocument.getSceneDocument({ storyWorldId, sceneId });
            if (!existingDoc) throw new V2HttpError(404, "NOT_FOUND", `Scene ${sceneId} not found`);

            // Check Scene Revision CAS
            if (
              request.expectedSceneRevision !== undefined &&
              request.expectedSceneRevision !== existingDoc.scene.revision
            ) {
              throw new V2HttpError(
                409,
                "STALE_REVISION",
                `Expected scene revision ${request.expectedSceneRevision}, got ${existingDoc.scene.revision}`,
              );
            }

            // Hierarchy validation
            const targetQuestId = request.questId !== undefined ? (request.questId ?? undefined) : existingDoc.scene.questId;
            const targetChapterId = request.chapterId !== undefined ? (request.chapterId ?? undefined) : existingDoc.scene.chapterId;
            const targetArcId = request.arcId !== undefined ? (request.arcId ?? undefined) : existingDoc.scene.arcId;

            const quest = targetQuestId
              ? await ctx.hierarchy.getQuest({ storyWorldId, questId: targetQuestId })
              : undefined;
            const chapter = targetChapterId
              ? await ctx.hierarchy.getChapter({ storyWorldId, chapterId: targetChapterId })
              : undefined;
            const arc = targetArcId
              ? await ctx.graphState.getArc({ storyWorldId: storyWorldId as any, arcId: targetArcId as any })
              : undefined;

            try {
              validateSceneHierarchy(
                {
                  ...(targetArcId ? { arcId: targetArcId } : {}),
                  ...(targetChapterId ? { chapterId: targetChapterId } : {}),
                  ...(targetQuestId ? { questId: targetQuestId } : {}),
                },
                quest ? { questId: quest.questId, ...(quest.chapterId ? { chapterId: quest.chapterId } : {}), arcId: quest.arcId! } : undefined,
                chapter ? { chapterId: chapter.chapterId, arcId: chapter.arcId } : undefined,
                arc ? { arcId: arc.arcId } : undefined,
              );
            } catch (err: unknown) {
              if (err instanceof V2DomainError) throw new V2HttpError(400, err.code, err.message);
              throw err;
            }

            // Validate speakers
            const worldChars = await ctx.canon.listCharacters(storyWorldId as any);
            const charIdSet = new Set(worldChars.map((c) => c.characterId));
            const incomingBlocks = request.blocks ?? [];

            try {
              validateBlockSpeakers(
                incomingBlocks.map((b) => ({
                  kind: b.kind,
                  ...(b.speakerCharacterId ? { speakerCharacterId: b.speakerCharacterId } : {}),
                })),
                charIdSet,
              );
            } catch (err: unknown) {
              if (err instanceof V2DomainError) throw new V2HttpError(400, err.code, err.message);
              throw err;
            }

            // Block revision & identity stability
            const existingBlockMap = new Map(existingDoc.blocks.map((b) => [b.blockId, b]));
            const domainBlocks = incomingBlocks.map((b, idx) => {
              const bId = b.blockId || `b_${randomUUID().slice(0, 8)}`;
              const existingBlock = existingBlockMap.get(bId);
              let blockRevision = 1;
              if (existingBlock) {
                const isUnchanged =
                  existingBlock.kind === b.kind &&
                  existingBlock.text === b.text &&
                  existingBlock.speakerCharacterId === b.speakerCharacterId;
                blockRevision = isUnchanged ? existingBlock.revision : existingBlock.revision + 1;
              }

              return createV2SceneBlock({
                blockId: bId,
                storyWorldId,
                sceneId,
                ordinal: idx,
                kind: b.kind,
                ...(b.speakerCharacterId ? { speakerCharacterId: b.speakerCharacterId } : {}),
                ...(b.text ? { text: b.text } : {}),
                payload: b.payload ?? {},
                revision: blockRevision,
              });
            });

            const docMode = request.documentMode ?? existingDoc.scene.documentMode;
            const renderedBody =
              docMode === "blocks"
                ? renderSceneBlocksToPlainText(domainBlocks)
                : request.body !== undefined
                  ? request.body
                    ? request.body
                    : undefined
                  : existingDoc.scene.body;

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

            await advanceWorldRevision(ctx.canon, storyWorldId, request.expectedRevision);
            return toSceneDocumentContract(saved.scene, saved.blocks);
          },
        );
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
        return withIdempotency(
          ctx.canon,
          "replaceSceneReferences",
          request.idempotencyKey,
          { storyWorldId, sceneId, ...request },
          async () => {
            const scene = await ctx.graphState.getScene({ storyWorldId: storyWorldId as any, sceneId: sceneId as any });
            if (!scene) throw new V2HttpError(404, "NOT_FOUND", `Scene ${sceneId} not found`);

            const toSave: any[] = [];

            if (request.mainLocationId) {
              toSave.push({
                referenceId: `ref_${randomUUID().slice(0, 8)}`,
                storyWorldId,
                sourceType: "scene",
                sourceId: sceneId,
                targetType: "location",
                targetId: request.mainLocationId,
                role: "location",
              });
            }

            if (request.participantCharacterIds) {
              const uniquePIds = Array.from(new Set(request.participantCharacterIds));
              for (const pId of uniquePIds) {
                toSave.push({
                  referenceId: `ref_${randomUUID().slice(0, 8)}`,
                  storyWorldId,
                  sourceType: "scene",
                  sourceId: sceneId,
                  targetType: "character",
                  targetId: pId,
                  role: "participant",
                });
              }
            }

            if (request.references) {
              for (const ref of request.references) {
                toSave.push({
                  referenceId: `ref_${randomUUID().slice(0, 8)}`,
                  storyWorldId,
                  sourceType: "scene",
                  sourceId: sceneId,
                  targetType: ref.targetType,
                  targetId: ref.targetId,
                  role: ref.role,
                });
              }
            }

            // Entity existence validation
            const [chars, locs, lores, timelineEvents, facts, rules] = await Promise.all([
              ctx.canon.listCharacters(storyWorldId as any),
              ctx.canon.listLocations(storyWorldId as any),
              ctx.lore.listLoreEntries(storyWorldId),
              ctx.canon.listTimelineEvents(storyWorldId as any),
              ctx.canon.listFacts(storyWorldId as any),
              ctx.canon.listRules(storyWorldId as any),
            ]);

            try {
              validateReferenceTargets(toSave, {
                characterIds: new Set(chars.map((c) => c.characterId)),
                locationIds: new Set(locs.map((l) => l.locationId)),
                loreEntryIds: new Set(lores.map((l) => l.loreEntryId)),
                timelineEventIds: new Set(timelineEvents.map((t) => t.timelineEventId)),
                factIds: new Set(facts.map((f) => f.factId)),
                ruleIds: new Set(rules.map((r) => r.ruleId)),
              });
            } catch (err: unknown) {
              if (err instanceof V2DomainError) throw new V2HttpError(400, err.code, err.message);
              throw err;
            }

            const domainRefs = toSave.map((r) => createV2NarrativeReference(r));
            await ctx.references.replaceReferencesForSource(
              {
                storyWorldId,
                sourceType: "scene",
                sourceId: sceneId,
              },
              domainRefs,
            );

            await advanceWorldRevision(ctx.canon, storyWorldId, request.expectedRevision);

            const updatedRefs = await ctx.references.listReferencesBySource({
              storyWorldId,
              sourceType: "scene",
              sourceId: sceneId,
            });
            const locRef = updatedRefs.find((r) => r.role === "location" && r.targetType === "location");
            const pRefs = updatedRefs.filter((r) => r.role === "participant" && r.targetType === "character");

            return {
              storyWorldId: storyWorldId as any,
              sceneId: sceneId as any,
              ...(locRef ? { mainLocationId: locRef.targetId as any } : {}),
              participantCharacterIds: pRefs.map((r) => r.targetId as any),
              references: updatedRefs.map((r) => ({
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
          },
        );
      });
    },

    async getLoreEntry(storyWorldId: string, loreEntryId: string): Promise<V2CanonLoreEntry> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const lore = await ctx.lore.getLoreEntry({ storyWorldId, loreEntryId });
        if (!lore) throw new V2HttpError(404, "NOT_FOUND", `Lore entry ${loreEntryId} not found`);
        return toLoreContract(lore);
      });
    },

    async listLoreEntries(storyWorldId: string, filter?: { type?: string; tag?: string }): Promise<readonly V2CanonLoreEntry[]> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const lores = await ctx.lore.listLoreEntries(storyWorldId, filter);
        return lores.map(toLoreContract);
      });
    },

    async createLoreEntry(storyWorldId: string, request: V2CreateLoreEntryRequest): Promise<V2CanonLoreEntry> {
      return uow.withNarrativeTransaction(async (ctx) => {
        return withIdempotency(
          ctx.canon,
          "createLoreEntry",
          request.idempotencyKey,
          { storyWorldId, ...request },
          async () => {
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
            await advanceWorldRevision(ctx.canon, storyWorldId, request.expectedRevision);
            return toLoreContract(created);
          },
        );
      });
    },

    async updateLoreEntry(storyWorldId: string, loreEntryId: string, request: V2UpdateLoreEntryRequest): Promise<V2CanonLoreEntry> {
      return uow.withNarrativeTransaction(async (ctx) => {
        return withIdempotency(
          ctx.canon,
          "updateLoreEntry",
          request.idempotencyKey,
          { storyWorldId, loreEntryId, ...request },
          async () => {
            const existing = await ctx.lore.getLoreEntry({ storyWorldId, loreEntryId });
            if (!existing) throw new V2HttpError(404, "NOT_FOUND", `Lore entry ${loreEntryId} not found`);

            const customType = request.customType !== undefined ? (request.customType ? request.customType : undefined) : existing.customType;
            const summary = request.summary !== undefined ? (request.summary ? request.summary : undefined) : existing.summary;
            const body = request.body !== undefined ? (request.body ? request.body : undefined) : existing.body;

            const updated = await ctx.lore.updateLoreEntry({
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

            await advanceWorldRevision(ctx.canon, storyWorldId, request.expectedRevision);
            return toLoreContract(updated);
          },
        );
      });
    },

    async deleteLoreEntry(storyWorldId: string, loreEntryId: string): Promise<{ success: true }> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const existing = await ctx.lore.getLoreEntry({ storyWorldId, loreEntryId });
        if (!existing) throw new V2HttpError(404, "NOT_FOUND", `Lore entry ${loreEntryId} not found`);

        const refs = await ctx.references.listReferencesByTarget({
          storyWorldId,
          targetType: "lore",
          targetId: loreEntryId,
        });
        if (refs.length > 0) {
          throw new V2HttpError(409, "REFERENCED_ENTITY", `Cannot delete lore entry ${loreEntryId} referenced in narrative`);
        }

        await ctx.lore.deleteLoreEntry({ storyWorldId, loreEntryId });
        return { success: true };
      });
    },

    async searchNarrative(storyWorldId: string, query: string, limit: number = 20): Promise<readonly V2NarrativeSearchResultItem[]> {
      return uow.withNarrativeTransaction(async (ctx) => {
        return ctx.search.searchNarrative(storyWorldId, query, limit);
      });
    },

    listTemplates(): readonly V2NarrativeTemplate[] {
      return listV2NarrativeTemplates();
    },

    async applyTemplate(storyWorldId: string, request: V2ApplyNarrativeTemplateRequest): Promise<V2ApplyNarrativeTemplateResponse> {
      return uow.withNarrativeTransaction(async (ctx) => {
        return withIdempotency(
          ctx.canon,
          "applyTemplate",
          request.idempotencyKey,
          { storyWorldId, ...request },
          async () => {
            const world = await ctx.canon.getWorld(storyWorldId as any);
            if (!world) throw new V2HttpError(404, "NOT_FOUND", `Story world ${storyWorldId} not found`);

            if (request.mode === "replace_empty") {
              const outline = await ctx.hierarchy.listOutline(storyWorldId);
              const hasContent = outline.arcs.length > 0 || outline.unassignedScenes.length > 0;
              if (hasContent) {
                throw new V2HttpError(409, "CONFLICT", "Story world is not empty for replace_empty mode");
              }
            }

            const template = getV2NarrativeTemplate(request.templateId);
            if (!template) {
              throw new V2HttpError(400, "BAD_REQUEST", `Template ${request.templateId} not found`);
            }

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
                      const targetScene = targetSceneId
                        ? await ctx.graphState.getScene({
                            storyWorldId: storyWorldId as any,
                            sceneId: targetSceneId as any,
                          })
                        : undefined;

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

            const nextRevision = await advanceWorldRevision(ctx.canon, storyWorldId, request.expectedRevision);

            return {
              createdArcsCount: createdArcIds.length,
              createdChaptersCount: createdChapterIds.length,
              createdQuestsCount: createdQuestIds.length,
              createdScenesCount: createdSceneIds.length,
              createdChoicesCount: createdChoiceIds.length,
              revision: nextRevision as any,
            };
          },
        );
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
          characters: chars.map((c) => ({ characterId: c.characterId, name: c.name })),
          locations: locs.map((l) => ({ locationId: l.locationId, name: l.name })),
        });
      });
    },

    async buildContext(storyWorldId: string, request: V2NarrativeGenerationContextRequest): Promise<V2NarrativeGenerationContextResponse> {
      return uow.withNarrativeTransaction(async (ctx) => {
        const world = await ctx.canon.getWorld(storyWorldId as any);
        if (!world) throw new V2HttpError(404, "NOT_FOUND", `Story world ${storyWorldId} not found`);

        let targetScene = undefined;
        let targetBlocks: any[] = [];
        let sceneRefs: any[] = [];

        if (request.targetSceneId) {
          const doc = await ctx.sceneDocument.getSceneDocument({ storyWorldId, sceneId: request.targetSceneId });
          if (doc) {
            targetScene = doc.scene;
            targetBlocks = [...doc.blocks];
            sceneRefs = [...(await ctx.references.listReferencesBySource({
              storyWorldId,
              sourceType: "scene",
              sourceId: request.targetSceneId,
            }))];
          }
        }

        let targetQuest = undefined;
        const questIdToLoad = request.targetQuestId || targetScene?.questId;
        if (questIdToLoad) {
          targetQuest = await ctx.hierarchy.getQuest({ storyWorldId, questId: questIdToLoad });
        }

        const characters = await ctx.canon.listCharacters(storyWorldId as any);
        const locations = await ctx.canon.listLocations(storyWorldId as any);
        const lores = await ctx.lore.listLoreEntries(storyWorldId);

        const participantCharIds = new Set<string>();
        for (const ref of sceneRefs) {
          if (ref.role === "participant" && ref.targetType === "character") {
            participantCharIds.add(ref.targetId);
          }
        }
        for (const b of targetBlocks) {
          if (b.speakerCharacterId) {
            participantCharIds.add(b.speakerCharacterId);
          }
        }

        const relevantChars = characters.filter((c) => participantCharIds.has(c.characterId));
        const locRef = sceneRefs.find((r) => r.role === "location" && r.targetType === "location");
        const mainLoc = locRef ? locations.find((l) => l.locationId === locRef.targetId) : undefined;

        const sources = [
          { kind: "world", id: world.storyWorldId, revision: world.revision },
          ...(targetQuest ? [{ kind: "quest", id: targetQuest.questId, revision: targetQuest.revision }] : []),
          ...(targetScene ? [{ kind: "scene", id: targetScene.sceneId, revision: targetScene.revision }] : []),
          ...relevantChars.map((c) => ({ kind: "character", id: c.characterId, revision: 1 })),
          ...(mainLoc ? [{ kind: "location", id: mainLoc.locationId, revision: 1 }] : []),
          ...lores.slice(0, 3).map((l) => ({ kind: "lore", id: l.loreEntryId, revision: l.revision })),
        ];

        const fingerprint = buildV2NarrativeContextFingerprint({
          storyWorldId,
          worldRevision: world.revision,
          sources,
        });

        const sectionList = [
          {
            title: "世界设定",
            content: `# 世界设定：${world.name}\n${world.summary ?? "无额外世界摘要"}`,
            tokenEstimate: Math.ceil((world.name.length + (world.summary?.length ?? 0)) / 2),
          },
          ...(targetQuest
            ? [
                {
                  title: "当前任务",
                  content: `## 当前任务：${targetQuest.title}\n${targetQuest.summary ?? "无任务描述"}`,
                  tokenEstimate: Math.ceil((targetQuest.title.length + (targetQuest.summary?.length ?? 0)) / 2),
                },
              ]
            : []),
          ...(mainLoc
            ? [
                {
                  title: "发生地点",
                  content: `### 发生地点：${mainLoc.name}\n${mainLoc.summary ?? "无地点描述"}`,
                  tokenEstimate: Math.ceil((mainLoc.name.length + (mainLoc.summary?.length ?? 0)) / 2),
                },
              ]
            : []),
          ...(relevantChars.length > 0
            ? [
                {
                  title: "登场人物",
                  content:
                    `### 登场人物：\n` +
                    relevantChars
                      .map((c) => `- **${c.name}**：${c.summary ?? "无人物简介"}`)
                      .join("\n"),
                  tokenEstimate: Math.ceil(
                    relevantChars.reduce((sum, c) => sum + c.name.length + (c.summary?.length ?? 0), 0) / 2,
                  ),
                },
              ]
            : []),
          ...(targetScene
            ? [
                {
                  title: "当前场景内容",
                  content:
                    `### 当前场景内容（${targetScene.title}）：\n` +
                    (targetBlocks.length > 0
                      ? renderSceneBlocksToPlainText(targetBlocks)
                      : targetScene.body ?? "（空白场景）"),
                  tokenEstimate: Math.ceil((targetScene.title.length + (targetScene.body?.length ?? 0)) / 2),
                },
              ]
            : []),
          {
            title: "创作提示",
            content: `### 创作提示 / 指令：\n${request.prompt ?? ""}`,
            tokenEstimate: Math.ceil((request.prompt?.length ?? 0) / 2),
          },
        ];

        const totalTokens = sectionList.reduce((sum, s) => sum + s.tokenEstimate, 0);

        return {
          contextHash: fingerprint.hash,
          fingerprint: fingerprint as any,
          sections: sectionList,
          totalTokensEstimate: totalTokens,
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

function toSceneDocumentContract(s: any, blocks: readonly any[]): V2SceneDocument {
  return {
    sceneId: s.sceneId,
    storyWorldId: s.storyWorldId,
    ...(s.arcId ? { arcId: s.arcId } : {}),
    ...(s.chapterId ? { chapterId: s.chapterId } : {}),
    ...(s.questId ? { questId: s.questId } : {}),
    title: s.title,
    ...(s.body ? { body: s.body } : {}),
    documentMode: s.documentMode,
    isEntry: s.isEntry,
    ordinal: s.ordinal,
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
      ...(b.createdAt ? { createdAt: b.createdAt } : {}),
      ...(b.updatedAt ? { updatedAt: b.updatedAt } : {}),
    })),
    revision: s.revision,
    ...(s.createdAt ? { createdAt: s.createdAt } : {}),
    ...(s.updatedAt ? { updatedAt: s.updatedAt } : {}),
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
