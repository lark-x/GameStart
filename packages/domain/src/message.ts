import type { Character } from "./character.ts";
import {
  type ConversationAggregate,
} from "./conversation.ts";
import { assertIsoTimestamp, assertNonEmptyString } from "./validation.ts";

export const MessageKind = {
  TEXT: "TEXT",
  IMAGE: "IMAGE",
  STICKER: "STICKER",
  SYSTEM: "SYSTEM",
} as const;

export type MessageKind = (typeof MessageKind)[keyof typeof MessageKind];

export interface Message {
  id: string;
  conversationId: string;
  authorCharacterId?: string;
  kind: MessageKind;
  text?: string;
  mediaRef?: string;
  stickerId?: string;
  createdAt: string;
  idempotencyKey: string;
}

export interface MessageInput {
  id: string;
  conversation: ConversationAggregate;
  author?: Character;
  kind: MessageKind;
  text?: string;
  mediaRef?: string;
  stickerId?: string;
  createdAt: string;
  idempotencyKey: string;
}

function assertMessageKind(value: MessageKind): void {
  if (
    value !== MessageKind.TEXT &&
    value !== MessageKind.IMAGE &&
    value !== MessageKind.STICKER &&
    value !== MessageKind.SYSTEM
  ) {
    throw new TypeError("message.kind must be TEXT, IMAGE, STICKER, or SYSTEM");
  }
}

function optionalContent(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  assertNonEmptyString(value, field);
  return value;
}

function assertAuthorMembership(
  conversation: ConversationAggregate,
  author: Character,
): void {
  if (author.storyWorldId !== conversation.conversation.storyWorldId) {
    throw new TypeError("message.author must belong to conversation storyWorld");
  }
  const member = conversation.members.find(
    (candidate) => candidate.characterId === author.id && candidate.leftAt === undefined,
  );
  if (!member) {
    throw new TypeError("message.author must be an active conversation member");
  }
}

function assertPayload(input: MessageInput): void {
  const text = optionalContent(input.text, "message.text");
  const mediaRef = optionalContent(input.mediaRef, "message.mediaRef");
  const stickerId = optionalContent(input.stickerId, "message.stickerId");

  if (input.kind === MessageKind.TEXT || input.kind === MessageKind.SYSTEM) {
    if (text === undefined) {
      throw new TypeError(`${input.kind} message requires text`);
    }
    if (mediaRef !== undefined || stickerId !== undefined) {
      throw new TypeError(`${input.kind} message cannot include media or sticker payloads`);
    }
  }
  if (input.kind === MessageKind.IMAGE) {
    if (mediaRef === undefined) {
      throw new TypeError("IMAGE message requires mediaRef");
    }
    if (stickerId !== undefined) {
      throw new TypeError("IMAGE message cannot include stickerId");
    }
  }
  if (input.kind === MessageKind.STICKER) {
    if (stickerId === undefined) {
      throw new TypeError("STICKER message requires stickerId");
    }
    if (mediaRef !== undefined) {
      throw new TypeError("STICKER message cannot include mediaRef");
    }
  }
}

export function createMessage(input: MessageInput): Message {
  assertNonEmptyString(input.id, "message.id");
  assertIsoTimestamp(input.createdAt, "message.createdAt");
  assertNonEmptyString(input.idempotencyKey, "message.idempotencyKey");
  assertMessageKind(input.kind);

  if (input.kind === MessageKind.SYSTEM) {
    if (input.author !== undefined) {
      throw new TypeError("SYSTEM message cannot have an author");
    }
  } else {
    if (input.author === undefined) {
      throw new TypeError(`${input.kind} message requires an author`);
    }
    assertAuthorMembership(input.conversation, input.author);
  }
  assertPayload(input);

  const message: Message = {
    id: input.id,
    conversationId: input.conversation.conversation.id,
    kind: input.kind,
    createdAt: input.createdAt,
    idempotencyKey: input.idempotencyKey,
  };
  if (input.author !== undefined) message.authorCharacterId = input.author.id;
  if (input.text !== undefined) message.text = input.text;
  if (input.mediaRef !== undefined) message.mediaRef = input.mediaRef;
  if (input.stickerId !== undefined) message.stickerId = input.stickerId;
  return message;
}
