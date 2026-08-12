import {
  createMessage,
  isMemoryVisibleTo,
  scoreMemory,
  assertMemoryItem,
  type StoryWorld,
  type Character,
  type ConversationAggregate,
  type Message,
  type MessageInput,
  type MemoryItem,
  type MemorySearchQuery,
  type MemorySearchResult,
} from "@living-network/domain";
import type {
  ConversationRepository,
  MessageRepository,
  MessageWriteResult,
  MemoryRepository,
} from "../repositories.ts";

// ── Copy helpers ──

function copyConversation(aggregate: ConversationAggregate): ConversationAggregate {
  return {
    conversation: { ...aggregate.conversation },
    members: aggregate.members.map((m) => ({ ...m })),
  };
}

function copyMessage(message: Message): Message {
  return { ...message };
}

function copyMemory(memory: MemoryItem): MemoryItem {
  return {
    ...memory,
    audienceCharacterIds: [...memory.audienceCharacterIds],
  };
}

// ── Assertion helpers ──

function assertConversationRefs(
  aggregate: ConversationAggregate,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  if (!worlds.has(aggregate.conversation.storyWorldId)) {
    throw new TypeError(
      `Conversation ${aggregate.conversation.id} references an unknown story world`,
    );
  }
  const ids = new Set<string>();
  for (const member of aggregate.members) {
    if (member.conversationId !== aggregate.conversation.id || ids.has(member.characterId)) {
      throw new TypeError(`Conversation ${aggregate.conversation.id} has invalid members`);
    }
    const character = characters.get(member.characterId);
    if (!character || character.storyWorldId !== aggregate.conversation.storyWorldId) {
      throw new TypeError(`Conversation ${aggregate.conversation.id} has an invalid member`);
    }
    ids.add(member.characterId);
  }
}

function assertMemoryRefs(
  memory: MemoryItem,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  assertMemoryItem(memory);
  if (!worlds.has(memory.storyWorldId)) {
    throw new TypeError(`Memory ${memory.id} references an unknown story world`);
  }
  const ids = [
    ...(memory.subjectCharacterId === undefined ? [] : [memory.subjectCharacterId]),
    ...memory.audienceCharacterIds,
  ];
  for (const id of ids) {
    const character = characters.get(id);
    if (!character || character.storyWorldId !== memory.storyWorldId) {
      throw new TypeError(`Memory ${memory.id} references an invalid character`);
    }
  }
}

function messagePayloadInput(
  message: Message,
  conversation: ConversationAggregate,
  author: Character | undefined,
): MessageInput {
  const input: MessageInput = {
    id: message.id,
    conversation,
    kind: message.kind,
    createdAt: message.createdAt,
    idempotencyKey: message.idempotencyKey,
  };
  if (author !== undefined) input.author = author;
  if (message.text !== undefined) input.text = message.text;
  if (message.mediaRef !== undefined) input.mediaRef = message.mediaRef;
  if (message.stickerId !== undefined) input.stickerId = message.stickerId;
  return input;
}

function sameMessage(left: Message, right: Message): boolean {
  return (
    left.conversationId === right.conversationId &&
    left.authorCharacterId === right.authorCharacterId &&
    left.kind === right.kind &&
    left.text === right.text &&
    left.mediaRef === right.mediaRef &&
    left.stickerId === right.stickerId &&
    left.createdAt === right.createdAt &&
    left.idempotencyKey === right.idempotencyKey
  );
}

// ── Repository factories ──

export function createConversationRepo(
  map: Map<string, ConversationAggregate>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
): ConversationRepository {
  return {
    listByCharacter: async (characterId) =>
      [...map.values()]
        .filter((aggregate) =>
          aggregate.members.some(
            (member) => member.characterId === characterId && member.leftAt === undefined,
          ),
        )
        .map(copyConversation),
    getById: async (id) => {
      const aggregate = map.get(id);
      return aggregate ? copyConversation(aggregate) : undefined;
    },
    save: async (conversation) => {
      assertConversationRefs(conversation, worldMap, characterMap);
      if (map.has(conversation.conversation.id)) {
        throw new TypeError(`Duplicate conversation id: ${conversation.conversation.id}`);
      }
      map.set(
        conversation.conversation.id,
        copyConversation(conversation),
      );
    },
  };
}

export function createMessageRepo(
  messageMap: Map<string, Message>,
  conversationMap: Map<string, ConversationAggregate>,
  characterMap: Map<string, Character>,
): MessageRepository {
  return {
    listByConversation: async (conversationId) =>
      [...messageMap.values()]
        .filter((message) => message.conversationId === conversationId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(copyMessage),
    save: async (message): Promise<MessageWriteResult> => {
      const conversation = conversationMap.get(message.conversationId);
      if (!conversation) {
        throw new TypeError(`Message ${message.id} references an unknown conversation`);
      }
      const author = message.authorCharacterId === undefined
        ? undefined
        : characterMap.get(message.authorCharacterId);
      const validated = createMessage(messagePayloadInput(message, conversation, author));
      const existing = [...messageMap.values()].find(
        (candidate) =>
          candidate.conversationId === message.conversationId &&
          candidate.idempotencyKey === message.idempotencyKey,
      );
      if (existing) {
        if (!sameMessage(existing, validated)) {
          throw new TypeError(
            `Message idempotency key conflict: ${message.idempotencyKey}`,
          );
        }
        return { message: copyMessage(existing), inserted: false };
      }
      if (messageMap.has(message.id)) {
        throw new TypeError(`Duplicate message id: ${message.id}`);
      }
      messageMap.set(message.id, copyMessage(validated));
      return { message: copyMessage(validated), inserted: true };
    },
  };
}

export function createMemoryRepo(
  map: Map<string, MemoryItem>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
): MemoryRepository {
  return {
    getById: async (id) => {
      const memory = map.get(id);
      return memory ? copyMemory(memory) : undefined;
    },
    listForCharacter: async (storyWorldId, readerCharacterId) =>
      [...map.values()]
        .filter(
          (memory) =>
            memory.storyWorldId === storyWorldId &&
            isMemoryVisibleTo(memory, readerCharacterId),
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map(copyMemory),
    search: async (query: MemorySearchQuery): Promise<readonly MemorySearchResult[]> => {
      if (!Number.isSafeInteger(query.limit ?? 20) || (query.limit ?? 20) < 1) {
        throw new TypeError("memory search limit must be a positive integer");
      }
      if (query.queryText.trim().length === 0) {
        throw new TypeError("memory search queryText must be non-empty");
      }
      return [...map.values()]
        .filter(
          (memory) =>
            memory.storyWorldId === query.storyWorldId &&
            isMemoryVisibleTo(memory, query.readerCharacterId),
        )
        .map((memory) => ({ memory, score: scoreMemory(memory, query.queryText) }))
        .filter((result) => result.score > 0)
        .sort(
          (left, right) =>
            right.score - left.score ||
            right.memory.createdAt.localeCompare(left.memory.createdAt) ||
            left.memory.id.localeCompare(right.memory.id),
        )
        .slice(0, query.limit ?? 20)
        .map((result) => ({ memory: copyMemory(result.memory), score: result.score }));
    },
    save: async (memory) => {
      assertMemoryRefs(memory, worldMap, characterMap);
      const id = memory.id;
      if (map.has(id)) {
        throw new TypeError(`Duplicate memory id: ${id}`);
      }
      map.set(id, copyMemory(memory));
    },
  };
}

export function saveMessageSeed(
  message: Message,
  messageMap: Map<string, Message>,
  conversationMap: Map<string, ConversationAggregate>,
  characterMap: Map<string, Character>,
): void {
  const conversation = conversationMap.get(message.conversationId);
  if (!conversation) {
    throw new TypeError(`Message ${message.id} references an unknown conversation`);
  }
  const author = message.authorCharacterId === undefined
    ? undefined
    : characterMap.get(message.authorCharacterId);
  const validated = createMessage(messagePayloadInput(message, conversation, author));
  const existing = [...messageMap.values()].find(
    (candidate) =>
      candidate.conversationId === message.conversationId &&
      candidate.idempotencyKey === message.idempotencyKey,
  );
  if (existing) {
    if (!sameMessage(existing, validated)) {
      throw new TypeError(
        `Message idempotency key conflict: ${message.idempotencyKey}`,
      );
    }
    return;
  }
  if (messageMap.has(message.id)) {
    throw new TypeError(`Duplicate message id: ${message.id}`);
  }
  messageMap.set(message.id, copyMessage(validated));
}
