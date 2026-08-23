import type {
  V2ApplyNarrativeTemplateRequest,
  V2ApplyNarrativeTemplateResponse,
  V2CanonLoreEntry,
  V2CreateChapterRequest,
  V2CreateQuestRequest,
  V2CreateLoreEntryRequest,
  V2NarrativeChapter,
  V2NarrativeDiagnosticsReport,
  V2NarrativeGenerationContextRequest,
  V2NarrativeGenerationContextResponse,
  V2NarrativeOutline,
  V2NarrativeQuest,
  V2NarrativeSearchResultItem,
  V2NarrativeTemplate,
  V2ReplaceSceneReferencesRequest,
  V2SceneDocument,
  V2SceneReferencesDto,
  V2SaveSceneDocumentRequest,
  V2UpdateChapterRequest,
  V2UpdateQuestRequest,
  V2UpdateLoreEntryRequest,
} from "@living-network/contracts/v2";

export interface V2NarrativeClientOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

export class V2NarrativeClientError extends Error {
  public readonly code: string;
  public readonly status: number;

  public constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "V2NarrativeClientError";
    this.code = code;
    this.status = status;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    const err = payload && typeof payload === "object" && "error" in payload
      ? (payload as { error?: { code?: string; message?: string } }).error
      : undefined;
    throw new V2NarrativeClientError(
      typeof err?.code === "string" ? err.code : "HTTP_ERROR",
      typeof err?.message === "string" ? err.message : `HTTP ${response.status}`,
      response.status,
    );
  }
  return payload as T;
}

export class V2NarrativeClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  public constructor(options: V2NarrativeClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "").replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  // Outline
  public async getOutline(storyWorldId: string): Promise<V2NarrativeOutline> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/outline`);
    return readJson<V2NarrativeOutline>(res);
  }

  // Chapter
  public async getChapter(storyWorldId: string, chapterId: string): Promise<V2NarrativeChapter> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/chapters/${chapterId}`);
    return readJson<V2NarrativeChapter>(res);
  }

  public async createChapter(storyWorldId: string, request: V2CreateChapterRequest): Promise<V2NarrativeChapter> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/chapters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return readJson<V2NarrativeChapter>(res);
  }

  public async updateChapter(storyWorldId: string, chapterId: string, request: V2UpdateChapterRequest): Promise<V2NarrativeChapter> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/chapters/${chapterId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return readJson<V2NarrativeChapter>(res);
  }

  public async deleteChapter(storyWorldId: string, chapterId: string): Promise<{ success: true }> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/chapters/${chapterId}`, {
      method: "DELETE",
    });
    return readJson<{ success: true }>(res);
  }

  // Quest
  public async getQuest(storyWorldId: string, questId: string): Promise<V2NarrativeQuest> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/quests/${questId}`);
    return readJson<V2NarrativeQuest>(res);
  }

  public async createQuest(storyWorldId: string, request: V2CreateQuestRequest): Promise<V2NarrativeQuest> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/quests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return readJson<V2NarrativeQuest>(res);
  }

  public async updateQuest(storyWorldId: string, questId: string, request: V2UpdateQuestRequest): Promise<V2NarrativeQuest> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/quests/${questId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return readJson<V2NarrativeQuest>(res);
  }

  public async deleteQuest(storyWorldId: string, questId: string): Promise<{ success: true }> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/quests/${questId}`, {
      method: "DELETE",
    });
    return readJson<{ success: true }>(res);
  }

  // Scene Document
  public async getSceneDocument(storyWorldId: string, sceneId: string): Promise<V2SceneDocument> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/scenes/${sceneId}/document`);
    return readJson<V2SceneDocument>(res);
  }

  public async saveSceneDocument(storyWorldId: string, sceneId: string, request: V2SaveSceneDocumentRequest): Promise<V2SceneDocument> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/scenes/${sceneId}/document`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return readJson<V2SceneDocument>(res);
  }

  // Scene References
  public async getSceneReferences(storyWorldId: string, sceneId: string): Promise<V2SceneReferencesDto> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/scenes/${sceneId}/references`);
    return readJson<V2SceneReferencesDto>(res);
  }

  public async replaceSceneReferences(storyWorldId: string, sceneId: string, request: V2ReplaceSceneReferencesRequest): Promise<V2SceneReferencesDto> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/scenes/${sceneId}/references`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return readJson<V2SceneReferencesDto>(res);
  }

  // Lore
  public async listLore(storyWorldId: string, filter?: { type?: string; tag?: string }): Promise<readonly V2CanonLoreEntry[]> {
    const params = new URLSearchParams();
    if (filter?.type) params.set("type", filter.type);
    if (filter?.tag) params.set("tag", filter.tag);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/lore${qs}`);
    return readJson<readonly V2CanonLoreEntry[]>(res);
  }

  public async getLore(storyWorldId: string, loreEntryId: string): Promise<V2CanonLoreEntry> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/lore/${loreEntryId}`);
    return readJson<V2CanonLoreEntry>(res);
  }

  public async createLore(storyWorldId: string, request: V2CreateLoreEntryRequest): Promise<V2CanonLoreEntry> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/lore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return readJson<V2CanonLoreEntry>(res);
  }

  public async updateLore(storyWorldId: string, loreEntryId: string, request: V2UpdateLoreEntryRequest): Promise<V2CanonLoreEntry> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/lore/${loreEntryId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return readJson<V2CanonLoreEntry>(res);
  }

  public async deleteLore(storyWorldId: string, loreEntryId: string): Promise<{ success: true }> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/lore/${loreEntryId}`, {
      method: "DELETE",
    });
    return readJson<{ success: true }>(res);
  }

  // Search
  public async search(storyWorldId: string, query: string, limit?: number): Promise<{ readonly query: string; readonly items: readonly V2NarrativeSearchResultItem[] }> {
    const params = new URLSearchParams({ q: query });
    if (limit) params.set("limit", String(limit));
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/search?${params.toString()}`);
    return readJson<{ readonly query: string; readonly items: readonly V2NarrativeSearchResultItem[] }>(res);
  }

  // Templates
  public async listTemplates(): Promise<{ readonly templates: readonly V2NarrativeTemplate[] }> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/narrative/templates`);
    return readJson<{ readonly templates: readonly V2NarrativeTemplate[] }>(res);
  }

  public async applyTemplate(storyWorldId: string, request: V2ApplyNarrativeTemplateRequest): Promise<V2ApplyNarrativeTemplateResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/templates/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return readJson<V2ApplyNarrativeTemplateResponse>(res);
  }

  // Diagnostics
  public async getDiagnostics(storyWorldId: string): Promise<V2NarrativeDiagnosticsReport> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/diagnostics`);
    return readJson<V2NarrativeDiagnosticsReport>(res);
  }

  // Context Preview
  public async previewContext(storyWorldId: string, request: V2NarrativeGenerationContextRequest): Promise<V2NarrativeGenerationContextResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/v2/worlds/${storyWorldId}/narrative/context/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return readJson<V2NarrativeGenerationContextResponse>(res);
  }
}
