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
} from "./index.ts";

const world = createStoryWorld({
  id: "world-chat",
  name: "Chat Story",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const user = createCharacter({
  id: "chat-user",
  displayName: "User",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const ai = createCharacter({
  id: "chat-ai",
  displayName: "AI",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const outsider = createCharacter({
  id: "chat-outsider",
  displayName: "Outsider",
  role: CharacterRole.AI,
  storyWorldId: "other-world",
  timezone: world.timezone,
});
const createdAt = "2026-08-05T12:00:00.000Z";

test("creates private and group conversations with immutable member snapshots", () => {
  const privateConversation = createConversation({
    id: "private-chat",
    storyWorld: world,
    type: ConversationType.PRIVATE,
    createdAt,
    members: [user, ai],
  });
  const groupConversation = createConversation({
    id: "group-chat",
    storyWorld: world,
    type: ConversationType.GROUP,
    title: "Party",
    createdAt,
    members: [user, ai, createCharacter({
      id: "chat-third",
      displayName: "Third",
      role: CharacterRole.AI,
      storyWorldId: world.id,
      timezone: world.timezone,
    })],
  });

  assert.equal(privateConversation.conversation.type, ConversationType.PRIVATE);
  assert.equal(privateConversation.members.length, 2);
  assert.equal(groupConversation.conversation.title, "Party");
  assert.deepEqual(privateConversation.members[0], {
    conversationId: "private-chat",
    characterId: user.id,
    joinedAt: createdAt,
  });
});

test("rejects invalid conversation cardinality, duplicates, and cross-world members", () => {
  assert.throws(
    () => createConversation({
      id: "private-one",
      storyWorld: world,
      type: ConversationType.PRIVATE,
      createdAt,
      members: [user],
    }),
    { name: "RangeError", message: /exactly two/ },
  );
  assert.throws(
    () => createConversation({
      id: "group-one",
      storyWorld: world,
      type: ConversationType.GROUP,
      createdAt,
      members: [user],
    }),
    { name: "RangeError", message: /at least two/ },
  );
  assert.throws(
    () => createConversation({
      id: "duplicate-members",
      storyWorld: world,
      type: ConversationType.PRIVATE,
      createdAt,
      members: [user, user],
    }),
    { name: "TypeError", message: /duplicate/ },
  );
  assert.throws(
    () => createConversation({
      id: "cross-world-members",
      storyWorld: world,
      type: ConversationType.PRIVATE,
      createdAt,
      members: [user, outsider],
    }),
    { name: "TypeError", message: /belong to storyWorld/ },
  );
});

test("creates text, image, sticker, and system messages with idempotency", () => {
  const conversation = createConversation({
    id: "message-chat",
    storyWorld: world,
    type: ConversationType.PRIVATE,
    createdAt,
    members: [user, ai],
  });

  const text = createMessage({
    id: "message-text",
    conversation,
    author: user,
    kind: MessageKind.TEXT,
    text: "Hello",
    createdAt,
    idempotencyKey: "idem-text",
  });
  const image = createMessage({
    id: "message-image",
    conversation,
    author: ai,
    kind: MessageKind.IMAGE,
    mediaRef: "media/image-1.png",
    text: "A scene",
    createdAt,
    idempotencyKey: "idem-image",
  });
  const sticker = createMessage({
    id: "message-sticker",
    conversation,
    author: user,
    kind: MessageKind.STICKER,
    stickerId: "sticker:wave",
    createdAt,
    idempotencyKey: "idem-sticker",
  });
  const system = createMessage({
    id: "message-system",
    conversation,
    kind: MessageKind.SYSTEM,
    text: "Conversation created",
    createdAt,
    idempotencyKey: "idem-system",
  });

  assert.equal(text.authorCharacterId, user.id);
  assert.equal(image.mediaRef, "media/image-1.png");
  assert.equal(sticker.stickerId, "sticker:wave");
  assert.equal(system.authorCharacterId, undefined);
  assert.equal(text.idempotencyKey, "idem-text");
});

test("rejects messages without active authors or valid kind payloads", () => {
  const conversation = createConversation({
    id: "invalid-message-chat",
    storyWorld: world,
    type: ConversationType.PRIVATE,
    createdAt,
    members: [user, ai],
  });

  assert.throws(
    () => createMessage({
      id: "no-author",
      conversation,
      kind: MessageKind.TEXT,
      text: "missing author",
      createdAt,
      idempotencyKey: "idem-no-author",
    }),
    { name: "TypeError", message: /requires an author/ },
  );
  assert.throws(
    () => createMessage({
      id: "no-media",
      conversation,
      author: user,
      kind: MessageKind.IMAGE,
      createdAt,
      idempotencyKey: "idem-no-media",
    }),
    { name: "TypeError", message: /requires mediaRef/ },
  );
  assert.throws(
    () => createMessage({
      id: "wrong-system-author",
      conversation,
      author: user,
      kind: MessageKind.SYSTEM,
      text: "invalid",
      createdAt,
      idempotencyKey: "idem-system-author",
    }),
    { name: "TypeError", message: /cannot have an author/ },
  );
  assert.throws(
    () => createMessage({
      id: "outsider-author",
      conversation,
      author: outsider,
      kind: MessageKind.TEXT,
      text: "invalid",
      createdAt,
      idempotencyKey: "idem-outsider",
    }),
    { name: "TypeError", message: /storyWorld/ },
  );
});
