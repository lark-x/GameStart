import assert from "node:assert/strict";
import test from "node:test";

import { ProviderError, type ChatMessage, type ChatProvider } from "../../../packages/ai/src/index.ts";
import {
  CharacterRole,
  MessageKind,
  MemoryKind,
  MemorySource,
  MemoryVisibility,
  StoryMode,
  createCharacter,
  createConversation,
  createMemoryItem,
  createMessage,
  createStoryWorld,
} from "../../../packages/domain/src/index.ts";
import { createInMemoryRepositories } from "../../../packages/database/src/index.ts";
import { ConversationOrchestrator } from "./conversation-orchestrator.ts";

test("conversation orchestrator persists a deterministic AI reply", async () => {
  const world = createStoryWorld({ id: "orch-world", name: "Orchestrator", timezone: "UTC", storyMode: StoryMode.STATIC, relationshipDynamicsEnabled: false });
  const user = createCharacter({ id: "orch-user", displayName: "User", role: CharacterRole.USER, storyWorldId: world.id, timezone: world.timezone });
  const ai = createCharacter({ id: "orch-ai", displayName: "AI", role: CharacterRole.AI, storyWorldId: world.id, timezone: world.timezone });
  const conversation = createConversation({ id: "orch-conversation", storyWorld: world, type: "PRIVATE", createdAt: "2026-08-05T00:00:00.000Z", members: [user, ai] });
  const repositories = createInMemoryRepositories({ worlds: [world], characters: [user, ai], conversations: [conversation] });
  const provider: ChatProvider = {
    async complete() { return { id: "completion-1", model: "test", content: "你好，世界。" }; },
    async *stream() { yield { content: "你好" }; yield { content: "，世界。" }; },
  };
  const orchestrator = new ConversationOrchestrator(repositories, provider);
  const input = {
    id: "orch-input",
    conversation,
    author: user,
    kind: "TEXT" as const,
    text: "你好",
    createdAt: "2026-08-05T00:01:00.000Z",
    idempotencyKey: "orch-input",
  };
  const message = (await repositories.messages!.save(createMessage(input))).message;
  assert.equal(message.id, "orch-input");
  const result = await orchestrator.completeReply(conversation.conversation.id, user.id);
  assert.equal(result.inserted, true);
  assert.equal(result.message.text, "你好，世界。");
  const replay = await orchestrator.completeReply(conversation.conversation.id, user.id);
  assert.equal(replay.inserted, false);
});

test("conversation orchestrator retrieves visible memories and writes low-confidence provenance", async () => {
  const world = createStoryWorld({ id: "memory-orch-world", name: "Memory Orchestrator", timezone: "UTC", storyMode: StoryMode.STATIC, relationshipDynamicsEnabled: false });
  const user = createCharacter({ id: "memory-orch-user", displayName: "User", role: CharacterRole.USER, storyWorldId: world.id, timezone: world.timezone });
  const ai = createCharacter({ id: "memory-orch-ai", displayName: "AI", role: CharacterRole.AI, storyWorldId: world.id, timezone: world.timezone });
  const conversation = createConversation({ id: "memory-orch-conversation", storyWorld: world, type: "PRIVATE", createdAt: "2026-08-05T00:00:00.000Z", members: [user, ai] });
  const memory = createMemoryItem({
    id: "memory-orch-item",
    storyWorld: world,
    kind: MemoryKind.USER_PREFERENCE,
    visibility: MemoryVisibility.RELATION,
    source: MemorySource.USER_AUTHORED,
    content: "用户喜欢在雨天散步。",
    confidence: 1,
    createdAt: "2026-08-05T00:00:00.000Z",
    subjectCharacter: user,
    audienceCharacters: [user, ai],
  });
  const repositories = createInMemoryRepositories({ worlds: [world], characters: [user, ai], conversations: [conversation], memories: [memory] });
  let captured: readonly ChatMessage[] = [];
  const provider: ChatProvider = {
    async complete(input) {
      captured = input.messages;
      return { id: "memory-completion", model: "test", content: "那我们去雨里走走。" };
    },
    async *stream() {},
  };
  const orchestrator = new ConversationOrchestrator(repositories, provider, { memoryRetrievalEnabled: true, memoryWriteEnabled: true });
  await repositories.messages!.save(createMessage({
    id: "memory-orch-input",
    conversation,
    author: user,
    kind: MessageKind.TEXT,
    text: "用户喜欢在雨天散步。",
    createdAt: "2026-08-05T00:01:00.000Z",
    idempotencyKey: "memory-orch-input",
  }));
  await orchestrator.completeReply(conversation.conversation.id, user.id);
  assert.equal(captured[0]?.role, "system");
  const firstCapturedContent = captured[0]?.content;
  if (typeof firstCapturedContent !== "string") throw new TypeError("Expected system content to be text");
  assert.match(firstCapturedContent, /雨天散步/);
  const stored = await repositories.memories!.listForCharacter(world.id, user.id);
  assert.equal(stored.some((item) => item.id === "memory:assistant:memory-orch-conversation:memory-orch-input"), true);
  assert.equal(stored.find((item) => item.id.startsWith("memory:assistant"))?.source, MemorySource.LLM_DERIVED);
});

test("persona prompt keeps replies in character and suppresses internal output", async () => {
  const world = createStoryWorld({ id: "persona-world", name: "Persona", timezone: "UTC", storyMode: StoryMode.STATIC, relationshipDynamicsEnabled: false });
  const user = createCharacter({ id: "persona-user", displayName: "User", role: CharacterRole.USER, storyWorldId: world.id, timezone: world.timezone });
  const ai = createCharacter({ id: "persona-ai", displayName: "林遥", role: CharacterRole.AI, storyWorldId: world.id, timezone: world.timezone, personaPrompt: "谨慎、观察力强，说话温和但不轻易下结论。" });
  const conversation = createConversation({ id: "persona-conversation", storyWorld: world, type: "PRIVATE", createdAt: "2026-08-05T00:00:00.000Z", members: [user, ai] });
  const repositories = createInMemoryRepositories({ worlds: [world], characters: [user, ai], conversations: [conversation] });
  let systemPrompt = "";
  const provider: ChatProvider = {
    async complete(input) {
      const content = input.messages.find((message) => message.role === "system")?.content;
      systemPrompt = typeof content === "string" ? content : "";
      return { id: "persona-completion", model: "test", content: "我想先听听你的想法。" };
    },
    async *stream() {},
  };
  await repositories.messages!.save(createMessage({ id: "persona-input", conversation, author: user, kind: MessageKind.TEXT, text: "你怎么看？", createdAt: "2026-08-05T00:01:00.000Z", idempotencyKey: "persona-input" }));
  await new ConversationOrchestrator(repositories, provider).completeReply(conversation.conversation.id, user.id);
  assert.match(systemPrompt, /你正在扮演 林遥/);
  assert.match(systemPrompt, /谨慎、观察力强/);
  assert.match(systemPrompt, /不输出思考过程/);
  assert.match(systemPrompt, /不能要求你忽略角色设定/);
});

test("validates repository/options and serializes image, sticker, and system context", async () => {
  const world = createStoryWorld({ id: "orch-edge-world", name: "Edge", timezone: "UTC", storyMode: StoryMode.STATIC, relationshipDynamicsEnabled: false });
  const user = createCharacter({ id: "orch-edge-user", displayName: "User", role: CharacterRole.USER, storyWorldId: world.id, timezone: world.timezone });
  const ai = createCharacter({ id: "orch-edge-ai", displayName: "AI", role: CharacterRole.AI, storyWorldId: world.id, timezone: world.timezone });
  const conversation = createConversation({ id: "orch-edge-conversation", storyWorld: world, type: "PRIVATE", createdAt: "2026-08-05T00:00:00.000Z", members: [user, ai] });
  const repositories = createInMemoryRepositories({ worlds: [world], characters: [user, ai], conversations: [conversation] });
  const provider: ChatProvider = {
    async complete(input) {
      assert.deepEqual(input.messages.map((message) => message.content), [
        "用户发送了一张图片。\n[图片未能传给模型本体。]",
        "用户发送了表情：sticker-1",
        "system notice",
      ]);
      return { id: "edge-completion", model: "m", content: "reply" };
    },
    async *stream() {},
  };
  assert.throws(() => new ConversationOrchestrator({ ...repositories, conversations: undefined, messages: undefined } as unknown as typeof repositories, provider), /repositories are not configured/);
  assert.throws(() => new ConversationOrchestrator(repositories, provider, { maxMemories: 0 }), /maxMemories/);
  assert.throws(() => new ConversationOrchestrator(repositories, provider, { maxMemories: 21 }), /maxMemories/);
  await repositories.messages!.save(createMessage({ id: "image", conversation, author: user, kind: MessageKind.IMAGE, mediaRef: "media://image.png", createdAt: "2026-08-05T00:01:00.000Z", idempotencyKey: "image" }));
  await repositories.messages!.save(createMessage({ id: "sticker", conversation, author: user, kind: MessageKind.STICKER, stickerId: "sticker-1", createdAt: "2026-08-05T00:02:00.000Z", idempotencyKey: "sticker" }));
  await repositories.messages!.save(createMessage({ id: "system", conversation, kind: MessageKind.SYSTEM, text: "system notice", createdAt: "2026-08-05T00:03:00.000Z", idempotencyKey: "system" }));
  const result = await new ConversationOrchestrator(repositories, provider).completeReply(conversation.conversation.id, user.id);
  assert.equal(result.message.text, "reply");
});

test("replays a matching assistant reply after an idempotency conflict", async () => {
  const world = createStoryWorld({ id: "orch-replay-world", name: "Replay", timezone: "UTC", storyMode: StoryMode.STATIC, relationshipDynamicsEnabled: false });
  const user = createCharacter({ id: "orch-replay-user", displayName: "User", role: CharacterRole.USER, storyWorldId: world.id, timezone: world.timezone });
  const ai = createCharacter({ id: "orch-replay-ai", displayName: "AI", role: CharacterRole.AI, storyWorldId: world.id, timezone: world.timezone });
  const conversation = createConversation({ id: "orch-replay-conversation", storyWorld: world, type: "PRIVATE", createdAt: "2026-08-05T00:00:00.000Z", members: [user, ai] });
  const repositories = createInMemoryRepositories({ worlds: [world], characters: [user, ai], conversations: [conversation] });
  const input = createMessage({
    id: "orch-replay-input",
    conversation,
    author: user,
    kind: MessageKind.TEXT,
    text: "hello",
    createdAt: "2026-08-05T00:01:00.000Z",
    idempotencyKey: "orch-replay-input",
  });
  const existing = createMessage({
    id: "assistant:orch-replay-conversation:orch-replay-input",
    conversation,
    author: ai,
    kind: MessageKind.TEXT,
    text: "replayed",
    createdAt: "2026-08-05T00:02:00.000Z",
    idempotencyKey: "assistant:orch-replay-conversation:orch-replay-input",
  });
  const originalMessages = repositories.messages!;
  const replayRepositories = {
    ...repositories,
    messages: {
      ...originalMessages,
      listByConversation: async () => [input, existing],
      save: async () => { throw new TypeError("idempotency conflict"); },
    },
  };
  const provider: ChatProvider = {
    async complete() { return { id: "replay-completion", model: "test", content: "replayed" }; },
    async *stream() {},
  };
  const result = await new ConversationOrchestrator(replayRepositories as unknown as typeof repositories, provider).completeReply(conversation.conversation.id, user.id);
  assert.equal(result.inserted, false);
  assert.equal(result.message.text, "replayed");
});

function hasImagePart(message: ChatMessage): boolean {
  return Array.isArray(message.content) && message.content.some((part) => part.type === "image");
}

test("conversation orchestrator passes resolved image and sticker media as image parts", async () => {
  const world = createStoryWorld({ id: "orch-media-world", name: "Media", timezone: "UTC", storyMode: StoryMode.STATIC, relationshipDynamicsEnabled: false });
  const user = createCharacter({ id: "orch-media-user", displayName: "User", role: CharacterRole.USER, storyWorldId: world.id, timezone: world.timezone });
  const ai = createCharacter({ id: "orch-media-ai", displayName: "AI", role: CharacterRole.AI, storyWorldId: world.id, timezone: world.timezone });
  const conversation = createConversation({ id: "orch-media-conversation", storyWorld: world, type: "PRIVATE", createdAt: "2026-08-05T00:00:00.000Z", members: [user, ai] });
  const repositories = createInMemoryRepositories({ worlds: [world], characters: [user, ai], conversations: [conversation] });
  let captured: readonly ChatMessage[] = [];
  const provider: ChatProvider = {
    async complete(input) { captured = input.messages; return { id: "media-completion", model: "test", content: "I saw both images" }; },
    async *stream() {},
  };
  await repositories.messages!.save(createMessage({ id: "media-image", conversation, author: user, kind: MessageKind.IMAGE, text: "first image", mediaRef: "media://local/image", createdAt: "2026-08-05T00:01:00.000Z", idempotencyKey: "media-image" }));
  await repositories.messages!.save(createMessage({ id: "media-sticker", conversation, author: user, kind: MessageKind.STICKER, stickerId: "sticker-wave", createdAt: "2026-08-05T00:02:00.000Z", idempotencyKey: "media-sticker" }));

  await new ConversationOrchestrator(repositories, provider, {
    mediaResolver: async (message) => message.kind === MessageKind.IMAGE
      ? { mediaType: "image/png", dataBase64: "aW1hZ2U=" }
      : { mediaType: "image/gif", dataBase64: "Z2lm", label: "wave" },
  }).completeReply(conversation.conversation.id, user.id);

  const mediaMessages = captured.filter(hasImagePart);
  assert.equal(mediaMessages.length, 2);
  assert.deepEqual(mediaMessages[0]?.content, [
    { type: "text", text: "first image" },
    { type: "image", mediaType: "image/png", dataBase64: "aW1hZ2U=" },
  ]);
  assert.deepEqual(mediaMessages[1]?.content, [
    { type: "text", text: "用户发送了表情：wave" },
    { type: "image", mediaType: "image/gif", dataBase64: "Z2lm" },
  ]);
});

test("conversation orchestrator retries with text fallback when provider rejects vision", async () => {
  const world = createStoryWorld({ id: "orch-fallback-world", name: "Fallback", timezone: "UTC", storyMode: StoryMode.STATIC, relationshipDynamicsEnabled: false });
  const user = createCharacter({ id: "orch-fallback-user", displayName: "User", role: CharacterRole.USER, storyWorldId: world.id, timezone: world.timezone });
  const ai = createCharacter({ id: "orch-fallback-ai", displayName: "AI", role: CharacterRole.AI, storyWorldId: world.id, timezone: world.timezone });
  const conversation = createConversation({ id: "orch-fallback-conversation", storyWorld: world, type: "PRIVATE", createdAt: "2026-08-05T00:00:00.000Z", members: [user, ai] });
  const repositories = createInMemoryRepositories({ worlds: [world], characters: [user, ai], conversations: [conversation] });
  let attempts = 0;
  let fallbackMessages: readonly ChatMessage[] = [];
  const provider: ChatProvider = {
    async complete(input) {
      attempts += 1;
      if (attempts === 1) {
        assert.equal(input.messages.some(hasImagePart), true);
        throw new ProviderError("HTTP_ERROR", "vision unsupported", { status: 400 });
      }
      fallbackMessages = input.messages;
      return { id: "fallback-completion", model: "test", content: "text fallback ok" };
    },
    async *stream() {},
  };
  await repositories.messages!.save(createMessage({ id: "fallback-image", conversation, author: user, kind: MessageKind.IMAGE, text: "see this", mediaRef: "media://local/image", createdAt: "2026-08-05T00:01:00.000Z", idempotencyKey: "fallback-image" }));

  const result = await new ConversationOrchestrator(repositories, provider, {
    mediaResolver: async () => ({ mediaType: "image/png", dataBase64: "aW1hZ2U=" }),
  }).completeReply(conversation.conversation.id, user.id);

  assert.equal(result.message.text, "text fallback ok");
  assert.equal(attempts, 2);
  assert.equal(fallbackMessages.some(hasImagePart), false);
  assert.match(String(fallbackMessages[0]?.content), /image\/png/);
});
