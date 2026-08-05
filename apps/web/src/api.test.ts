import assert from "node:assert/strict";
import test from "node:test";

import { ApiClient, parseSseBlock } from "./api.js";

test("parses chat delta, error, and DONE SSE blocks", () => {
  assert.deepEqual(parseSseBlock('data: {"content":"hello"}'), {
    event: "message",
    done: false,
    data: { content: "hello" },
  });
  assert.deepEqual(parseSseBlock('event: error\ndata: {"code":"HTTP_ERROR","message":"offline"}'), {
    event: "error",
    done: false,
    data: { code: "HTTP_ERROR", message: "offline" },
  });
  assert.deepEqual(parseSseBlock("data: [DONE]"), { event: "message", done: true });
});

test("turns invalid SSE JSON into a bounded client error", () => {
  assert.deepEqual(parseSseBlock("data: not-json"), {
    event: "error",
    done: false,
    data: { code: "INVALID_SSE", message: "Invalid SSE payload" },
  });
});

test("ApiClient builds every JSON endpoint request with the actor context", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const client = new ApiClient("https://api.example.test/", "actor-1");
    client.setActorCharacterId("actor-2");
    await client.getWorlds();
    await client.getCharacters("world one");
    await client.getRelationships("world one");
    await client.getWorldCalendar("world one", "2026-01-01", "2026-02-01", 12);
    await client.getCharacterVisualIdentity("char one");
    await client.getWorkflows();
    await client.validateWorkflow({ id: "workflow" });
    await client.switchCharacter("session", "char");
    await client.getMoments("world", "reader", 4);
    await client.getMomentInteractions("moment", "reader");
    await client.createMomentInteraction("moment", { kind: "LIKE" });
    await client.getStickerPacks("world");
    await client.getConversations("reader");
    await client.getMessages("conversation", "reader");
    await client.sendMessage("conversation", { text: "hello" });
    await client.getStickers("pack");
    await client.request("/custom", {
      method: "PATCH",
      body: JSON.stringify({ value: 1 }),
      headers: { "x-custom": "yes" },
    });

    assert.equal(calls.length, 17);
    assert.equal(calls[0].url, "https://api.example.test/v1/worlds");
    assert.equal(calls[1].url, "https://api.example.test/v1/characters?storyWorldId=world%20one");
    assert.equal(calls[2].url, "https://api.example.test/v1/relationships?storyWorldId=world%20one");
    assert.equal(
      calls[3].url,
      "https://api.example.test/v1/worlds/world%20one/calendar?startsAt=2026-01-01&endsAt=2026-02-01&limit=12",
    );
    assert.equal(calls[4].url, "https://api.example.test/v1/characters/char%20one/visual-identity");
    assert.deepEqual(calls[6].init, {
      method: "POST",
      body: JSON.stringify({ id: "workflow" }),
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-actor-character-id": "actor-2",
      },
    });
    assert.deepEqual(calls[16].init, {
      method: "PATCH",
      body: JSON.stringify({ value: 1 }),
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-actor-character-id": "actor-2",
        "x-custom": "yes",
      },
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("ApiClient streams deltas, errors, and completion events", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  const encoder = new TextEncoder();
  const chunks = [
    "event: message\ndata: {\"content\":\"hello\"}\n\n",
    "event: error\ndata: {\"code\":\"MODEL_ERROR\"}\n\n",
    "data: [DONE]\n\n",
  ];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    let index = 0;
    return {
      ok: true,
      body: {
        getReader() {
          return {
            async read() {
              if (index < chunks.length) return { value: encoder.encode(chunks[index++]), done: false };
              return { value: undefined, done: true };
            },
          };
        },
      },
    };
  };

  try {
    const client = new ApiClient("https://api.example.test", "actor");
    const deltas = [];
    const errors = [];
    let completed = 0;
    await client.streamConversation("conversation one", "reader one", {
      onDelta: (value) => deltas.push(value),
      onError: (value) => errors.push(value),
      onDone: () => { completed += 1; },
    });
    assert.deepEqual(deltas, [{ content: "hello" }]);
    assert.deepEqual(errors, [{ code: "MODEL_ERROR" }]);
    assert.equal(completed, 1);
    assert.equal(
      calls[0].url,
      "https://api.example.test/v1/conversations/conversation%20one/stream?characterId=reader+one",
    );
    assert.deepEqual(calls[0].init.headers, {
      accept: "text/event-stream",
      "x-actor-character-id": "actor",
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("ApiClient reports JSON and stream failures with bounded messages", async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => { throw new Error("not json"); } });
    await assert.rejects(
      () => new ApiClient("https://api.example.test").getWorlds(),
      /API request failed \(503\)/,
    );

    globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "unauthorized" } }) });
    await assert.rejects(
      () => new ApiClient("https://api.example.test").streamConversation("conversation", "reader"),
      /unauthorized/,
    );

    globalThis.fetch = async () => ({ ok: true, body: null });
    await assert.rejects(
      () => new ApiClient("https://api.example.test").streamConversation("conversation", "reader"),
      /has no body/,
    );

    const client = new ApiClient("https://api.example.test");
    assert.deepEqual(parseSseBlock("event: ping\ncomment only"), undefined);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
    await client.request("/empty", { headers: { accept: "text/plain" } });
  } finally {
    globalThis.fetch = previousFetch;
  }
});
