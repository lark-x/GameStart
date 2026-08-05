export class ApiClient {
  constructor(baseUrl, actorCharacterId = "") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.actorCharacterId = actorCharacterId;
  }

  setActorCharacterId(actorCharacterId) {
    this.actorCharacterId = actorCharacterId;
  }

  async request(path, options = {}) {
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
      throw new Error(message);
    }
    return payload;
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

  sendMessage(conversationId, input) {
    return this.request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST",
      body: JSON.stringify(input),
    });
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

  getStickers(packId) {
    return this.request(`/v1/sticker-packs/${encodeURIComponent(packId)}/stickers`);
  }
}

export function parseSseBlock(block) {
  let event = "message";
  const data = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) return undefined;
  const payload = data.join("\n");
  if (payload === "[DONE]") return { event, done: true };
  try {
    return { event, done: false, data: JSON.parse(payload) };
  } catch {
    return { event: "error", done: false, data: { code: "INVALID_SSE", message: "Invalid SSE payload" } };
  }
}
