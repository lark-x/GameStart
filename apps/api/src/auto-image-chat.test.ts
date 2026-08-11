import assert from "node:assert/strict";
import test from "node:test";

import type { ChatProvider } from "@living-network/ai";
import {
  CharacterRole,
  ConversationType,
  MessageKind,
  StoryMode,
  createCharacter,
  createComfyUiSettings,
  createConversation,
  createMessage,
  createStoryWorld,
} from "@living-network/domain";
import { createInMemoryRepositories, type DomainRepositories } from "@living-network/database";
import { ApiApplication } from "./app.ts";

const createdAt = "2026-08-09T10:00:00.000Z";

function fixture(settings?: ReturnType<typeof createComfyUiSettings>) {
  const world = createStoryWorld({ id: "auto-image-world", name: "Auto image", timezone: "UTC", storyMode: StoryMode.STATIC, relationshipDynamicsEnabled: false });
  const user = createCharacter({ id: "auto-image-user", displayName: "User", role: CharacterRole.USER, storyWorldId: world.id, timezone: "UTC" });
  const ai = createCharacter({ id: "auto-image-ai", displayName: "Artist", role: CharacterRole.AI, storyWorldId: world.id, timezone: "UTC" });
  const conversation = createConversation({ id: "auto-image-conversation", storyWorld: world, type: ConversationType.PRIVATE, members: [user, ai], createdAt });
  const userMessage = createMessage({
    id: "auto-image-user-message", conversation, author: user, kind: MessageKind.TEXT,
    text: "请画一张雨夜咖啡馆的插画", createdAt: "2026-08-09T10:01:00.000Z", idempotencyKey: "auto-image-user-message",
  });
  const repositories = createInMemoryRepositories({
    worlds: [world], characters: [user, ai], conversations: [conversation], messages: [userMessage],
    ...(settings === undefined ? {} : { comfyUiSettings: settings }),
  });
  const provider: ChatProvider = {
    async complete() { return { id: "unused", model: "test", content: "unused" }; },
    async *stream() { yield { content: "好的，我会生成一张雨夜咖啡馆的场景图。", finishReason: "stop" }; },
  };
  return { world, user, ai, conversation, repositories, provider };
}

async function drainReply(app: ApiApplication, conversationId: string, userId: string): Promise<string> {
  const response = await app.streamConversation(conversationId, userId);
  return response.text();
}

async function allowBestEffortHook(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("enabled explicit chat intent queues one idempotent AI-owned image job using the default workflow", async () => {
  const enabled = createComfyUiSettings({ id: "default", baseUrl: "http://127.0.0.1:8188", timeoutMs: 30_000, defaultWorkflowVersion: "portrait@v1", autoImageIntentEnabled: true, updatedAt: createdAt });
  const { conversation, user, ai, repositories, provider } = fixture(enabled);
  const app = new ApiApplication(repositories, provider);

  assert.match(await drainReply(app, conversation.conversation.id, user.id), /\[DONE\]/);
  await allowBestEffortHook();
  const jobs = await repositories.imageJobs!.listQueued();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]?.ownerCharacterId, ai.id);
  assert.equal(jobs[0]?.workflowVersion, "portrait@v1");
  assert.match(jobs[0]?.prompt ?? "", /雨夜咖啡馆/);

  // Replaying the same assistant reply must not create a second persistent job.
  assert.match(await drainReply(app, conversation.conversation.id, user.id), /\[DONE\]/);
  await allowBestEffortHook();
  assert.equal((await repositories.imageJobs!.listQueued()).length, 1);
});

test("automatic chat images stay disabled without enabled settings and without a default workflow", async () => {
  for (const settings of [
    undefined,
    createComfyUiSettings({ id: "default", baseUrl: "http://127.0.0.1:8188", timeoutMs: 30_000, autoImageIntentEnabled: false, updatedAt: createdAt }),
    createComfyUiSettings({ id: "default", baseUrl: "http://127.0.0.1:8188", timeoutMs: 30_000, autoImageIntentEnabled: true, updatedAt: createdAt }),
  ]) {
    const { conversation, user, repositories, provider } = fixture(settings);
    assert.match(await drainReply(new ApiApplication(repositories, provider), conversation.conversation.id, user.id), /\[DONE\]/);
    await allowBestEffortHook();
    assert.equal((await repositories.imageJobs!.listQueued()).length, 0);
  }
});

test("image persistence failure never changes an already streamed chat reply", async () => {
  const enabled = createComfyUiSettings({ id: "default", baseUrl: "http://127.0.0.1:8188", timeoutMs: 30_000, defaultWorkflowVersion: "portrait@v1", autoImageIntentEnabled: true, updatedAt: createdAt });
  const { conversation, user, repositories, provider } = fixture(enabled);
  const failingRepositories: DomainRepositories = {
    ...repositories,
    imageJobs: { ...repositories.imageJobs!, save: async () => { throw new Error("storage offline"); } },
  };
  const text = await drainReply(new ApiApplication(failingRepositories, provider), conversation.conversation.id, user.id);
  assert.match(text, /好的/);
  assert.match(text, /\[DONE\]/);
  await allowBestEffortHook();
});
