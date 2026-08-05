import assert from "node:assert/strict";
import test from "node:test";

import type { ChatProvider } from "../../../packages/ai/src/index.ts";
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
  let captured: readonly { role: string; content: string }[] = [];
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
  assert.match(captured[0]?.content ?? "", /雨天散步/);
  const stored = await repositories.memories!.listForCharacter(world.id, user.id);
  assert.equal(stored.some((item) => item.id === "memory:assistant:memory-orch-conversation:memory-orch-input"), true);
  assert.equal(stored.find((item) => item.id.startsWith("memory:assistant"))?.source, MemorySource.LLM_DERIVED);
});
