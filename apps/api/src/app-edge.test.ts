import assert from "node:assert/strict";
import test from "node:test";

import type { ChatProvider } from "@living-network/ai";
import { createDevelopmentRepositories } from "./dev-seed.ts";
import { ApiApplication, ApiError, type ApiStore } from "./index.ts";

async function status(application: ApiApplication, path: string, init?: RequestInit): Promise<number> {
  return (await application.handle(new Request(`http://localhost${path}`, init))).status;
}

function developmentApplication(overrides: Partial<ApiStore> = {}): ApiApplication {
  return new ApiApplication({ ...createDevelopmentRepositories(), ...overrides } as ApiStore);
}

test("covers parser errors for switch, workflow, sticker, conversation, message, and interaction requests", async () => {
  const app = developmentApplication();
  assert.equal(await status(app, "/v1/actor-sessions/switch", { method: "POST", body: "[]" }), 400);
  assert.equal(await status(app, "/v1/actor-sessions/switch", { method: "POST", body: JSON.stringify({ unknown: true }) }), 400);
  assert.equal(await status(app, "/v1/actor-sessions/switch", { method: "POST", body: JSON.stringify({ actorSessionId: "", nextCharacterId: "dev-user" }) }), 400);

  assert.equal(await status(app, "/v1/comfyui/workflows", { method: "POST", body: "[]" }), 400);
  assert.equal(await status(app, "/v1/comfyui/workflows", { method: "POST", body: JSON.stringify({ id: "id", version: "v1", workflow: [] }) }), 400);

  assert.equal(await status(app, "/v1/sticker-packs", { method: "POST", body: "[]" }), 400);
  assert.equal(await status(app, "/v1/sticker-packs", { method: "POST", body: JSON.stringify({ unknown: true }) }), 400);
  assert.equal(await status(app, "/v1/sticker-packs", { method: "POST", body: JSON.stringify({ id: "pack", storyWorldId: "dev-world", name: "pack", createdAt: "2026-08-05T00:00:00.000Z", stickers: [[]] }) }), 400);
  assert.equal(await status(app, "/v1/sticker-packs", { method: "POST", body: JSON.stringify({ id: "", storyWorldId: "dev-world", name: "pack", createdAt: "2026-08-05T00:00:00.000Z", stickers: [] }) }), 400);

  assert.equal(await status(app, "/v1/conversations", { method: "POST", body: "[]" }), 400);
  assert.equal(await status(app, "/v1/conversations", { method: "POST", body: JSON.stringify({ id: "id", storyWorldId: "dev-world", type: "INVALID", createdAt: "2026-08-05T00:00:00.000Z", memberCharacterIds: [] }) }), 400);
  assert.equal(await status(app, "/v1/conversations", { method: "POST", body: JSON.stringify({ id: "id", storyWorldId: "dev-world", type: "PRIVATE", createdAt: "2026-08-05T00:00:00.000Z", memberCharacterIds: "not-array" }) }), 400);

  assert.equal(await status(app, "/v1/conversations/dev-conversation/messages", { method: "POST", body: "[]" }), 400);
  assert.equal(await status(app, "/v1/conversations/dev-conversation/messages", { method: "POST", body: JSON.stringify({ id: "id", kind: "INVALID", createdAt: "2026-08-05T00:00:00.000Z", idempotencyKey: "key" }) }), 400);

  assert.equal(await status(app, "/v1/moments/missing/interactions", { method: "POST", body: "[]" }), 400);
  assert.equal(await status(app, "/v1/moments/missing/interactions", { method: "POST", body: JSON.stringify({ id: "id", actorCharacterId: "dev-user", kind: "INVALID", createdAt: "2026-08-05T00:00:00.000Z", idempotencyKey: "key" }) }), 400);
});

test("covers method guards and missing optional repository boundaries", async () => {
  const app = developmentApplication();
  assert.equal(await status(app, "/v1/sticker-packs/dev-sticker-pack/stickers", { method: "PUT" }), 405);
  assert.equal(await status(app, "/v1/moments/missing/interactions", { method: "PUT" }), 405);
  assert.equal(await status(app, "/v1/conversations/dev-conversation/messages", { method: "PUT" }), 405);
  assert.equal(await status(app, "/v1/conversations/dev-conversation/stream", { method: "POST" }), 405);

  const base = createDevelopmentRepositories();
  const cases: Array<[string, Partial<ApiStore>]> = [
    ["chat", { conversations: undefined, messages: undefined } as unknown as Partial<ApiStore>],
    ["moments", { moments: undefined, momentInteractions: undefined } as unknown as Partial<ApiStore>],
    ["jobs", { imageJobs: undefined } as unknown as Partial<ApiStore>],
    ["stickers", { stickerPacks: undefined, stickers: undefined } as unknown as Partial<ApiStore>],
    ["calendar", { worldEventDefinitions: undefined, scheduledOccurrences: undefined } as unknown as Partial<ApiStore>],
    ["visual", { characterVisualIdentities: undefined, imageWorkflowTemplates: undefined } as unknown as Partial<ApiStore>],
  ];
  for (const [name, missing] of cases) {
    const application = new ApiApplication({ ...base, ...missing } as ApiStore);
    const operation = name === "chat"
      ? application.listConversations("dev-user")
      : name === "moments"
        ? application.listMoments("dev-world", "dev-user")
        : name === "jobs"
          ? application.getImageJob("missing")
          : name === "stickers"
            ? application.listStickerPacks("dev-world")
            : name === "calendar"
              ? application.getWorldCalendar("dev-world", "2026-08-01", "2026-09-01")
              : application.listImageWorkflowTemplates();
    await assert.rejects(operation, (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.statusCode, 501);
      return true;
    });
  }
});

test("maps non-TypeError repository failures to internal errors and preserves typed errors", async () => {
  const base = createDevelopmentRepositories();
  const failingMoments = new ApiApplication({
    ...base,
    moments: { ...base.moments, listFeed: async () => { throw new Error("moment store failed"); } },
  } as ApiStore);
  const internal = await failingMoments.handle(new Request("http://localhost/v1/moments?storyWorldId=dev-world&readerCharacterId=dev-user"));
  assert.equal(internal.status, 500);
  assert.match(await internal.text(), /Internal server error/);

  const calendar = new ApiApplication({
    ...base,
    worldEventDefinitions: { ...base.worldEventDefinitions, listByStoryWorld: async () => { throw new Error("calendar failed"); } },
  } as ApiStore);
  await assert.rejects(calendar.getWorldCalendar("dev-world", "2026-08-01", "2026-09-01"), /calendar failed/);

  assert.throws(() => new ApiApplication(base).validateImageWorkflow(new Proxy({}, {
    get() { throw new Error("workflow getter failed"); },
  }) as never), /workflow getter failed/);

  const stickers = new ApiApplication({
    ...base,
    stickerPacks: { ...base.stickerPacks, save: async () => { throw new Error("sticker save failed"); } },
  } as ApiStore);
  await assert.rejects(stickers.importStickerPack({
    id: "pack-edge",
    storyWorldId: "dev-world",
    name: "edge",
    createdAt: "2026-08-05T00:00:00.000Z",
    stickers: [],
  }), /sticker save failed/);

  const switched = new ApiApplication({
    ...base,
    actorSessions: { ...base.actorSessions, save: async () => { throw new Error("session save failed"); } },
  } as ApiStore);
  await assert.rejects(switched.switchActorCharacter({ actorSessionId: "dev-session", nextCharacterId: "dev-user-second" }), /session save failed/);

  const conversations = new ApiApplication({
    ...base,
    conversations: { ...base.conversations, save: async () => { throw new Error("conversation save failed"); } },
  } as ApiStore);
  await assert.rejects(conversations.createConversation({
    id: "conversation-edge",
    storyWorldId: "dev-world",
    type: "PRIVATE",
    createdAt: "2026-08-05T00:00:00.000Z",
    memberCharacterIds: ["dev-user", "dev-character"],
  }), /conversation save failed/);
});

test("serializes image, sticker, and system messages for stream context", async () => {
  const base = createDevelopmentRepositories();
  const messages = [
    { id: "edge-image", conversationId: "dev-conversation", authorCharacterId: "dev-user", kind: "IMAGE", mediaRef: "media://image", createdAt: "2026-08-05T00:02:00.000Z", idempotencyKey: "edge-image" },
    { id: "edge-sticker", conversationId: "dev-conversation", authorCharacterId: "dev-user", kind: "STICKER", stickerId: "dev-sticker-wave", createdAt: "2026-08-05T00:03:00.000Z", idempotencyKey: "edge-sticker" },
    { id: "edge-system", conversationId: "dev-conversation", kind: "SYSTEM", text: "system notice", createdAt: "2026-08-05T00:04:00.000Z", idempotencyKey: "edge-system" },
  ] as const;
  const app = new ApiApplication({
    ...base,
    messages: {
      ...base.messages,
      listByConversation: async () => messages,
      save: async (message) => ({ message, inserted: true }),
    },
  } as ApiStore, {
    async complete() { return { id: "unused", model: "unused", content: "unused" }; },
    async *stream(input) {
      assert.deepEqual(input.messages.map((message) => message.content), [
        "用户发送了一张图片。\n[图片未能传给模型本体。]",
        "用户发送了表情：dev-sticker-wave",
        "system notice",
      ]);
      yield { content: "reply" };
    },
  });
  const response = await app.streamConversation("dev-conversation", "dev-user");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /reply/);
});

test("covers API operation validation and typed error mappings", async () => {
  const base = createDevelopmentRepositories();
  const app = new ApiApplication(base as ApiStore);

  await assert.rejects(app.getWorldCalendar("dev-world", "2026-08-01", "2026-09-01", 0), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.statusCode, 400);
    return true;
  });
  await assert.rejects(app.importStickerPack({
    id: "invalid-pack",
    storyWorldId: "dev-world",
    name: "invalid",
    createdAt: "2026-08-05T00:00:00.000Z",
    stickers: [{ id: "duplicate-tags", label: "bad", mediaRef: "media://bad", tags: ["same", "same"] }],
  }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.statusCode, 400);
    return true;
  });
  await assert.rejects(app.switchActorCharacter({ actorSessionId: "missing", nextCharacterId: "dev-user" }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.statusCode, 404);
    return true;
  });
  await assert.rejects(app.switchActorCharacter({ actorSessionId: "dev-session", nextCharacterId: "missing" }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.statusCode, 404);
    return true;
  });
  await assert.rejects(app.listConversations("missing"), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.statusCode, 404);
    return true;
  });
  await assert.rejects(app.sendMessage("dev-conversation", "missing", {
    id: "missing-author-message",
    kind: "TEXT",
    text: "no author",
    createdAt: "2026-08-05T00:00:00.000Z",
    idempotencyKey: "missing-author-message",
  }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.statusCode, 404);
    return true;
  });

  const conversationInput = {
    id: "api-edge-conversation",
    storyWorldId: "dev-world",
    type: "PRIVATE" as const,
    createdAt: "2026-08-05T00:00:00.000Z",
    memberCharacterIds: ["dev-user", "dev-character"],
  };
  await app.createConversation(conversationInput);
  await assert.rejects(app.createConversation(conversationInput), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.statusCode, 409);
    return true;
  });
  await assert.rejects(app.createConversation({ ...conversationInput, id: "api-edge-invalid-group", type: "GROUP", memberCharacterIds: ["dev-user"] }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.statusCode, 400);
    return true;
  });

  const streamProvider: ChatProvider = {
    async complete() { return { id: "unused", model: "unused", content: "unused" }; },
    async *stream() {},
  };
  const streamMissingMessages = new ApiApplication({ ...base, messages: undefined } as unknown as ApiStore, streamProvider);
  await assert.rejects(streamMissingMessages.streamConversation("dev-conversation", "dev-user"), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.statusCode, 400);
    return true;
  });

  const moment = {
    id: "api-edge-moment",
    draftId: "api-edge-draft",
    storyWorldId: "dev-world",
    authorCharacterId: "dev-character",
    visibility: "PUBLIC" as const,
    audienceCharacterIds: [],
    body: "Public edge moment",
    publishedAt: "2026-08-05T00:00:00.000Z",
    createdAt: "2026-08-05T00:00:00.000Z",
  };
  const momentRepositories = {
    ...base,
    moments: {
      getById: async () => moment,
      listFeed: async () => [],
    },
    momentInteractions: {
      listByMoment: async () => [],
      save: async (interaction: never) => ({ interaction, inserted: true }),
    },
  } as unknown as ApiStore;
  const momentApp = new ApiApplication(momentRepositories);
  await assert.rejects(momentApp.listMoments("missing-world", "dev-user"), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.statusCode, 404);
    return true;
  });
  await assert.rejects(momentApp.listMoments("dev-world", "missing-reader"), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.statusCode, 404);
    return true;
  });
  await assert.rejects(momentApp.listMomentInteractions(moment.id, "missing-reader"), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.statusCode, 404);
    return true;
  });
  const badLimitMoments = new ApiApplication({
    ...momentRepositories,
    moments: {
      ...momentRepositories.moments,
      listFeed: async () => { throw new RangeError("invalid feed limit"); },
    },
  } as ApiStore);
  await assert.rejects(badLimitMoments.listMoments("dev-world", "dev-user"), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.statusCode, 400);
    return true;
  });
  const invalidInteraction = new ApiApplication(momentRepositories);
  await assert.rejects(invalidInteraction.createMomentInteraction(moment.id, {
    id: "invalid-interaction",
    actorCharacterId: "dev-user",
    kind: "INVALID" as never,
    createdAt: "2026-08-05T00:00:00.000Z",
    idempotencyKey: "invalid-interaction",
  }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.statusCode, 400);
    return true;
  });
  const conflictInteraction = new ApiApplication({
    ...momentRepositories,
    momentInteractions: {
      ...momentRepositories.momentInteractions,
      save: async () => { throw new TypeError("idempotency key conflict"); },
    },
  } as ApiStore);
  await assert.rejects(conflictInteraction.createMomentInteraction(moment.id, {
    id: "conflict-interaction",
    actorCharacterId: "dev-user",
    kind: "LIKE",
    createdAt: "2026-08-05T00:00:00.000Z",
    idempotencyKey: "conflict-interaction",
  }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.statusCode, 409);
    return true;
  });
  const internalInteraction = new ApiApplication({
    ...momentRepositories,
    momentInteractions: {
      ...momentRepositories.momentInteractions,
      save: async () => { throw new Error("interaction store failed"); },
    },
  } as ApiStore);
  await assert.rejects(internalInteraction.createMomentInteraction(moment.id, {
    id: "internal-interaction",
    actorCharacterId: "dev-user",
    kind: "LIKE",
    createdAt: "2026-08-05T00:00:00.000Z",
    idempotencyKey: "internal-interaction",
  }), /interaction store failed/);

  const cancelProvider: ChatProvider = {
    async complete() { return { id: "unused", model: "unused", content: "unused" }; },
    async *stream() {
      await new Promise((resolve) => setTimeout(resolve, 5));
      yield { content: "late" };
    },
  };
  const cancelResponse = await new ApiApplication(base as ApiStore, cancelProvider).streamConversation("dev-conversation", "dev-user");
  await cancelResponse.body?.cancel();
  await new Promise((resolve) => setTimeout(resolve, 10));
});
