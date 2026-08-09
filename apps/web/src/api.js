export class ApiClient {
  constructor(baseUrl, actorCharacterId = "") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.actorCharacterId = actorCharacterId;
  }

  setActorCharacterId(actorCharacterId) {
    this.actorCharacterId = actorCharacterId;
  }

  async request(path, options = {}) {
    const correlationId = options.correlationId || crypto.randomUUID();
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        accept: "application/json",
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        ...(this.actorCharacterId ? { "x-actor-character-id": this.actorCharacterId } : {}),

        ...(options.headers ?? {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.error?.message ?? `API request failed (${response.status})`;
      const error = new Error(message);
      error.correlationId = response.headers?.get("x-correlation-id") || correlationId;
      error.code = payload?.error?.code;
      error.status = response.status;
      throw error;
    }
    return { ...payload, correlationId: response.headers?.get("x-correlation-id") || correlationId };
  }

  getWorlds() {
    return this.request("/v1/worlds");
  }

  getCharacters(storyWorldId) {
    return this.request(`/v1/characters?storyWorldId=${encodeURIComponent(storyWorldId)}`);
  }

  getRelationships(storyWorldId) {
    return this.request(`/v1/relationships?storyWorldId=${encodeURIComponent(storyWorldId)}`);
  }

  createRelationship(input) {
    return this.request("/v1/relationships", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateRelationship(id, input) {
    return this.request(`/v1/relationships/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  createWorldEvent(input) {
    return this.request("/v1/world-events", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  getWorldEvents(storyWorldId) {
    return this.request(`/v1/world-events?storyWorldId=${encodeURIComponent(storyWorldId)}`);
  }

  getWorldLore(storyWorldId, query = "") {
    const params = new URLSearchParams({ storyWorldId });
    if (query.trim()) params.set("q", query.trim());
    return this.request(`/v1/world-lore?${params}`);
  }

  createWorldLore(input) {
    return this.request("/v1/world-lore", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateWorldLore(id, input) {
    return this.request(`/v1/world-lore/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  deleteWorldLore(id) {
    return this.request(`/v1/world-lore/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  updateWorldEvent(id, input) {
    return this.request(`/v1/world-events/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  getWorldCalendar(storyWorldId, startsAt, endsAt, limit = 200) {
    const query = new URLSearchParams({ startsAt, endsAt, limit: String(limit) });
    return this.request(`/v1/worlds/${encodeURIComponent(storyWorldId)}/calendar?${query}`);
  }

  getCharacterVisualIdentity(characterId) {
    return this.request(`/v1/characters/${encodeURIComponent(characterId)}/visual-identity`);
  }

  getWorkflows() {
    return this.request("/v1/comfyui/workflows");
  }

  validateWorkflow(workflow) {
    return this.request("/v1/comfyui/workflows", {
      method: "POST",
      body: JSON.stringify(workflow),
    });
  }

  switchCharacter(actorSessionId, nextCharacterId) {
    return this.request("/v1/actor-sessions/switch", {
      method: "POST",
      body: JSON.stringify({ actorSessionId, nextCharacterId }),
    });
  }

  getMoments(storyWorldId, readerCharacterId, limit = 30) {
    const query = new URLSearchParams({ storyWorldId, readerCharacterId, limit: String(limit) });
    return this.request(`/v1/moments?${query}`);
  }

  getMomentInteractions(momentId, readerCharacterId) {
    const query = new URLSearchParams({ readerCharacterId });
    return this.request(`/v1/moments/${encodeURIComponent(momentId)}/interactions?${query}`);
  }

  createMomentInteraction(momentId, input) {
    return this.request(`/v1/moments/${encodeURIComponent(momentId)}/interactions`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  getStickerPacks(storyWorldId) {
    return this.request(`/v1/sticker-packs?storyWorldId=${encodeURIComponent(storyWorldId)}`);
  }

  getConversations(characterId) {
    return this.request(`/v1/conversations?characterId=${encodeURIComponent(characterId)}`);
  }

  getMessages(conversationId, characterId) {
    return this.request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages?characterId=${encodeURIComponent(characterId)}`);
  }

  requestConversationImage(conversationId, input) {
    return this.request(`/v1/conversations/${encodeURIComponent(conversationId)}/image-jobs`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  getImageJob(jobId) {
    return this.request(`/v1/image-jobs/${encodeURIComponent(jobId)}`);
  }

  sendMessage(conversationId, input) {
    return this.request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  retryAutoReply(conversationId, input) { return this.request(`/v1/conversations/${encodeURIComponent(conversationId)}/auto-reply/retry`, { method: "POST", body: JSON.stringify(input) }); }
  getInteractionLogs(query = {}) { const params = new URLSearchParams(); for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") params.set(key, String(value)); return this.request(`/v1/interaction-logs?${params}`); }
  subscribeInteractionLogs(handlers = {}, options = {}) {
    const controller = new AbortController();
    const cursor = options.lastEventId || options.cursor;
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const run = async () => {
      const response = await fetch(`${this.baseUrl}/v1/interaction-logs/stream${query}`, { signal: controller.signal, headers: { accept: "text/event-stream", ...(this.actorCharacterId ? { "x-actor-character-id": this.actorCharacterId } : {}) } });
      if (!response.ok || !response.body) throw new Error(`Log stream failed (${response.status})`);
      handlers.onOpen?.();
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (!controller.signal.aborted) { const { value, done } = await reader.read(); buffer += decoder.decode(value || new Uint8Array(), { stream: !done }); const blocks = buffer.split(/\r?\n\r?\n/); buffer = blocks.pop() || ""; for (const block of blocks) { const event = parseSseBlock(block); if (event) handlers.onEvent?.(event); } if (done) break; }
      if (!controller.signal.aborted) throw new Error("Log stream disconnected");
    };
    void run().catch((error) => { if (!controller.signal.aborted) handlers.onError?.(error); }).finally(() => handlers.onClose?.());
    return () => controller.abort();
  }
  async streamConversation(conversationId, characterId, handlers = {}) {
    const query = new URLSearchParams({ characterId });
    const response = await fetch(
      `${this.baseUrl}/v1/conversations/${encodeURIComponent(conversationId)}/stream?${query}`,
      { headers: {
        accept: "text/event-stream",
        ...(this.actorCharacterId ? { "x-actor-character-id": this.actorCharacterId } : {}),

      } },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error?.message ?? `Chat stream failed (${response.status})`);
    }
    if (!response.body) throw new Error("Chat stream response has no body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const event = parseSseBlock(block);
        if (!event) continue;
        if (event.done) handlers.onDone?.();
        else if (event.event === "error") handlers.onError?.(event.data);
        else handlers.onDelta?.(event.data);
      }
      if (done) break;
    }
  }

  createStoryWorld(input) {
    return this.request("/v1/worlds", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateStoryWorld(id, input) {
    return this.request("/v1/worlds/" + encodeURIComponent(id), {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  createCharacter(input) {
    return this.request("/v1/characters", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updateCharacter(id, input) {
    return this.request("/v1/characters/" + encodeURIComponent(id), {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  getStickers(packId) {
    return this.request(`/v1/sticker-packs/${encodeURIComponent(packId)}/stickers`);
  }

  getAppearanceSettings(ownerKey = "local-user") {
    return this.request(`/v1/appearance-settings?ownerKey=${encodeURIComponent(ownerKey)}`);
  }

  updateAppearanceSettings(input, ownerKey = "local-user") {
    return this.request(`/v1/appearance-settings?ownerKey=${encodeURIComponent(ownerKey)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  getLlmProviderProfiles() {
    return this.request("/v1/llm-provider-profiles");
  }

  saveLlmProviderProfile(input) {
    return this.request("/v1/llm-provider-profiles", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  testLlmProfile(id) { return this.request(`/v1/llm-provider-profiles/${encodeURIComponent(id)}/test`, { method: "POST", body: JSON.stringify({}) }); }

  deleteLlmProviderProfile(id) {
    return this.request(`/v1/llm-provider-profiles/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  getComfyUiSettings() {
    return this.request("/v1/comfyui/settings");
  }

  updateComfyUiSettings(input) {
    return this.request("/v1/comfyui/settings", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }
  getCreatorEventCandidates(worldId, horizonDays = 7) { return this.request('/v1/creator/worlds/' + encodeURIComponent(worldId) + '/event-candidates?horizonDays=' + encodeURIComponent(horizonDays)); }
  previewCreatorDispatch(worldId, input) { return this.request('/v1/creator/worlds/' + encodeURIComponent(worldId) + '/event-dispatches/preview', { method: 'POST', body: JSON.stringify(input) }); }
  createCreatorDispatch(worldId, input) { return this.request('/v1/creator/worlds/' + encodeURIComponent(worldId) + '/event-dispatches', { method: 'POST', body: JSON.stringify(input) }); }
  getCreatorDispatch(batchId) { return this.request('/v1/creator/event-dispatches/' + encodeURIComponent(batchId)); }

}

export function parseSseBlock(block) {
  let event = "message"; let id; const data = [];
  for (const line of block.split(/\r?\n/)) { if (line.startsWith("event:")) event = line.slice(6).trim(); else if (line.startsWith("id:")) id = line.slice(3).trim(); else if (line.startsWith("data:")) data.push(line.slice(5).trimStart()); }
  if (data.length === 0) return undefined; const payload = data.join("\n"); if (payload === "[DONE]") return { event, ...(id ? { id } : {}), done: true };
  try { return { event, ...(id ? { id } : {}), done: false, data: JSON.parse(payload) }; } catch { return { event: "error", ...(id ? { id } : {}), done: false, data: { code: "INVALID_SSE", message: "Invalid SSE payload" } }; }
}
