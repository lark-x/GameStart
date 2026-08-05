import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  ConversationType,
  MessageKind,
  StoryMode,
  createCharacter,
  createConversation,
  createMessage,
  createStoryWorld,
} from "../../domain/src/index.ts";
import { createInMemoryRepositories } from "./index.ts";

const world = createStoryWorld({
  id: "world-chat-db",
  name: "Chat DB Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const user = createCharacter({
  id: "chat-db-user",
  displayName: "User",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const ai = createCharacter({
  id: "chat-db-ai",
  displayName: "AI",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const conversation = createConversation({
  id: "conversation-db",
  storyWorld: world,
  type: ConversationType.PRIVATE,
  createdAt: "2026-08-05T13:00:00.000Z",
  members: [user, ai],
});
const message = createMessage({
  id: "message-db",
  conversation,
  author: user,
  kind: MessageKind.TEXT,
  text: "Hello from repository",
  createdAt: "2026-08-05T13:01:00.000Z",
  idempotencyKey: "message-db-key",
});

test("stores and lists conversations and messages with defensive copies", async () => {
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [user, ai],
    conversations: [conversation],
    messages: [message],
  });
  const conversationsRepository = repositories.conversations;
  const messagesRepository = repositories.messages;
  assert.ok(conversationsRepository);
  assert.ok(messagesRepository);

  const conversations = await conversationsRepository.listByCharacter(user.id);
  const messages = await messagesRepository.listByConversation(conversation.conversation.id);
  assert.deepEqual(conversations, [conversation]);
  assert.deepEqual(messages, [message]);

  const firstConversation = conversations[0];
  const firstMessage = messages[0];
  assert.ok(firstConversation);
  assert.ok(firstMessage);
  firstConversation.conversation.title = "mutated";
  firstMessage.text = "mutated";
  assert.equal(
    (await conversationsRepository.getById(conversation.conversation.id))?.conversation.title,
    undefined,
  );
  assert.equal(
    (await messagesRepository.listByConversation(conversation.conversation.id))[0]?.text,
    message.text,
  );
});

test("replays identical idempotency keys and rejects conflicting payloads", async () => {
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [user, ai],
    conversations: [conversation],
  });
  const messagesRepository = repositories.messages;
  assert.ok(messagesRepository);
  const first = await messagesRepository.save(message);
  const replay = await messagesRepository.save({ ...message, id: "different-id" });

  assert.deepEqual(first, { message, inserted: true });
  assert.deepEqual(replay, { message, inserted: false });

  const conflicting = createMessage({
    id: "conflicting-id",
    conversation,
    author: user,
    kind: MessageKind.TEXT,
    text: "different payload",
    createdAt: message.createdAt,
    idempotencyKey: message.idempotencyKey,
  });
  await assert.rejects(
    messagesRepository.save(conflicting),
    { name: "TypeError", message: /idempotency key conflict/ },
  );
});

test("rejects message writes for unknown conversations and inactive authors", async () => {
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [user, ai],
  });
  const messagesRepository = repositories.messages;
  assert.ok(messagesRepository);
  await assert.rejects(
    messagesRepository.save(message),
    { name: "TypeError", message: /unknown conversation/ },
  );
});
