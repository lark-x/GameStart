import type { FastifyPluginAsync } from "fastify";
import type { V2NarrativeUnitOfWork } from "@living-network/ports/v2";
import {
  parseApplyNarrativeTemplateRequest,
  parseCreateChapterRequest,
  parseCreateQuestRequest,
  parseCreateLoreEntryRequest,
  parseNarrativeGenerationContextRequest,
  parseReplaceSceneReferencesRequest,
  parseSaveSceneDocumentRequest,
  parseUpdateChapterRequest,
  parseUpdateQuestRequest,
  parseUpdateLoreEntryRequest,
} from "./parsers.ts";
import { createV2NarrativeUseCases } from "./use-cases.ts";

export interface V2NarrativePluginOptions {
  readonly narrativeUnitOfWork: V2NarrativeUnitOfWork;
}

export const v2NarrativePlugin: FastifyPluginAsync<V2NarrativePluginOptions> = async (app, options) => {
  const useCases = createV2NarrativeUseCases(options.narrativeUnitOfWork);

  // Bootstrap
  app.get<{ Params: { storyWorldId: string } }>(
    "/worlds/:storyWorldId/narrative/bootstrap",
    async (request) => {
      const outline = await useCases.listOutline(request.params.storyWorldId);
      const diagnostics = await useCases.getDiagnostics(request.params.storyWorldId);
      return {
        storyWorldId: request.params.storyWorldId,
        worldRevision: outline.worldRevision ?? 1,
        outline,
        diagnosticSummary: {
          errorCount: diagnostics.errorCount,
          warningCount: diagnostics.warningCount,
          infoCount: diagnostics.infoCount,
          valid: diagnostics.valid,
        },
      };
    },
  );

  // Outline
  app.get<{ Params: { storyWorldId: string } }>(
    "/worlds/:storyWorldId/narrative/outline",
    async (request) => {
      return useCases.listOutline(request.params.storyWorldId);
    },
  );

  // Chapters
  app.get<{ Params: { storyWorldId: string; chapterId: string } }>(
    "/worlds/:storyWorldId/narrative/chapters/:chapterId",
    async (request) => {
      return useCases.getChapter(request.params.storyWorldId, request.params.chapterId);
    },
  );

  app.post<{ Params: { storyWorldId: string } }>(
    "/worlds/:storyWorldId/narrative/chapters",
    async (request) => {
      const parsed = parseCreateChapterRequest(request.body);
      return useCases.createChapter(request.params.storyWorldId, parsed);
    },
  );

  app.put<{ Params: { storyWorldId: string; chapterId: string } }>(
    "/worlds/:storyWorldId/narrative/chapters/:chapterId",
    async (request) => {
      const parsed = parseUpdateChapterRequest(request.body);
      return useCases.updateChapter(request.params.storyWorldId, request.params.chapterId, parsed);
    },
  );

  app.delete<{ Params: { storyWorldId: string; chapterId: string } }>(
    "/worlds/:storyWorldId/narrative/chapters/:chapterId",
    async (request) => {
      return useCases.deleteChapter(request.params.storyWorldId, request.params.chapterId);
    },
  );

  // Quests
  app.get<{ Params: { storyWorldId: string; questId: string } }>(
    "/worlds/:storyWorldId/narrative/quests/:questId",
    async (request) => {
      return useCases.getQuest(request.params.storyWorldId, request.params.questId);
    },
  );

  app.post<{ Params: { storyWorldId: string } }>(
    "/worlds/:storyWorldId/narrative/quests",
    async (request) => {
      const parsed = parseCreateQuestRequest(request.body);
      return useCases.createQuest(request.params.storyWorldId, parsed);
    },
  );

  app.put<{ Params: { storyWorldId: string; questId: string } }>(
    "/worlds/:storyWorldId/narrative/quests/:questId",
    async (request) => {
      const parsed = parseUpdateQuestRequest(request.body);
      return useCases.updateQuest(request.params.storyWorldId, request.params.questId, parsed);
    },
  );

  app.delete<{ Params: { storyWorldId: string; questId: string } }>(
    "/worlds/:storyWorldId/narrative/quests/:questId",
    async (request) => {
      return useCases.deleteQuest(request.params.storyWorldId, request.params.questId);
    },
  );

  // Scene Document
  app.get<{ Params: { storyWorldId: string; sceneId: string } }>(
    "/worlds/:storyWorldId/narrative/scenes/:sceneId/document",
    async (request) => {
      return useCases.getSceneDocument(request.params.storyWorldId, request.params.sceneId);
    },
  );

  app.put<{ Params: { storyWorldId: string; sceneId: string } }>(
    "/worlds/:storyWorldId/narrative/scenes/:sceneId/document",
    async (request) => {
      const parsed = parseSaveSceneDocumentRequest(request.body);
      return useCases.saveSceneDocument(request.params.storyWorldId, request.params.sceneId, parsed);
    },
  );

  // Scene References
  app.get<{ Params: { storyWorldId: string; sceneId: string } }>(
    "/worlds/:storyWorldId/narrative/scenes/:sceneId/references",
    async (request) => {
      return useCases.getSceneReferences(request.params.storyWorldId, request.params.sceneId);
    },
  );

  app.put<{ Params: { storyWorldId: string; sceneId: string } }>(
    "/worlds/:storyWorldId/narrative/scenes/:sceneId/references",
    async (request) => {
      const parsed = parseReplaceSceneReferencesRequest(request.body);
      return useCases.replaceSceneReferences(request.params.storyWorldId, request.params.sceneId, parsed);
    },
  );

  // Lore
  app.get<{ Params: { storyWorldId: string }; Querystring: { type?: string; tag?: string } }>(
    "/worlds/:storyWorldId/narrative/lore",
    async (request) => {
      return useCases.listLoreEntries(request.params.storyWorldId, {
        ...(request.query.type ? { type: request.query.type } : {}),
        ...(request.query.tag ? { tag: request.query.tag } : {}),
      });
    },
  );

  app.get<{ Params: { storyWorldId: string; loreEntryId: string } }>(
    "/worlds/:storyWorldId/narrative/lore/:loreEntryId",
    async (request) => {
      return useCases.getLoreEntry(request.params.storyWorldId, request.params.loreEntryId);
    },
  );

  app.post<{ Params: { storyWorldId: string } }>(
    "/worlds/:storyWorldId/narrative/lore",
    async (request) => {
      const parsed = parseCreateLoreEntryRequest(request.body);
      return useCases.createLoreEntry(request.params.storyWorldId, parsed);
    },
  );

  app.put<{ Params: { storyWorldId: string; loreEntryId: string } }>(
    "/worlds/:storyWorldId/narrative/lore/:loreEntryId",
    async (request) => {
      const parsed = parseUpdateLoreEntryRequest(request.body);
      return useCases.updateLoreEntry(request.params.storyWorldId, request.params.loreEntryId, parsed);
    },
  );

  app.delete<{ Params: { storyWorldId: string; loreEntryId: string } }>(
    "/worlds/:storyWorldId/narrative/lore/:loreEntryId",
    async (request) => {
      return useCases.deleteLoreEntry(request.params.storyWorldId, request.params.loreEntryId);
    },
  );

  // Search
  app.get<{ Params: { storyWorldId: string }; Querystring: { q?: string; limit?: string } }>(
    "/worlds/:storyWorldId/narrative/search",
    async (request) => {
      const query = request.query.q || "";
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 30;
      return {
        query,
        items: await useCases.searchNarrative(request.params.storyWorldId, query, limit),
      };
    },
  );

  // Templates
  app.get("/narrative/templates", async () => {
    return { templates: useCases.listTemplates() };
  });

  app.post<{ Params: { storyWorldId: string } }>(
    "/worlds/:storyWorldId/narrative/templates/apply",
    async (request) => {
      const parsed = parseApplyNarrativeTemplateRequest(request.body);
      return useCases.applyTemplate(request.params.storyWorldId, parsed);
    },
  );

  // Diagnostics
  app.get<{ Params: { storyWorldId: string } }>(
    "/worlds/:storyWorldId/narrative/diagnostics",
    async (request) => {
      return useCases.getDiagnostics(request.params.storyWorldId);
    },
  );

  // Context Preview
  app.post<{ Params: { storyWorldId: string } }>(
    "/worlds/:storyWorldId/narrative/context/preview",
    async (request) => {
      const parsed = parseNarrativeGenerationContextRequest(request.params.storyWorldId, request.body);
      return useCases.buildContext(request.params.storyWorldId, parsed);
    },
  );
};
