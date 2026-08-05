import type { Character } from "./character.ts";
import type { StoryWorld } from "./story-world.ts";
import {
  assertIsoTimestamp,
  assertNonEmptyString,
} from "./validation.ts";

export const ConversationType = {
  PRIVATE: "PRIVATE",
  GROUP: "GROUP",
} as const;

export type ConversationType = (typeof ConversationType)[keyof typeof ConversationType];

export interface Conversation {
  id: string;
  storyWorldId: string;
  type: ConversationType;
  title?: string;
  createdAt: string;
}

export interface ConversationMember {
  conversationId: string;
  characterId: string;
  joinedAt: string;
  leftAt?: string;
}

export interface ConversationAggregate {
  conversation: Conversation;
  members: readonly ConversationMember[];
}

export interface ConversationInput {
  id: string;
  storyWorld: StoryWorld;
  type: ConversationType;
  title?: string;
  createdAt: string;
  members: readonly Character[];
}

function assertConversationType(value: ConversationType): void {
  if (value !== ConversationType.PRIVATE && value !== ConversationType.GROUP) {
    throw new TypeError("conversation.type must be PRIVATE or GROUP");
  }
}

function assertMemberWorld(
  members: readonly Character[],
  storyWorldId: string,
): void {
  const ids = new Set<string>();
  for (const member of members) {
    if (ids.has(member.id)) {
      throw new TypeError(`conversation.members contains duplicate character ${member.id}`);
    }
    ids.add(member.id);
    if (member.storyWorldId !== storyWorldId) {
      throw new TypeError("conversation.members must belong to storyWorld");
    }
  }
}

export function createConversation(input: ConversationInput): ConversationAggregate {
  assertNonEmptyString(input.id, "conversation.id");
  assertIsoTimestamp(input.createdAt, "conversation.createdAt");
  assertConversationType(input.type);
  if (input.title !== undefined) {
    assertNonEmptyString(input.title, "conversation.title");
  }

  if (input.type === ConversationType.PRIVATE && input.members.length !== 2) {
    throw new RangeError("PRIVATE conversation must have exactly two members");
  }
  if (input.type === ConversationType.GROUP && input.members.length < 2) {
    throw new RangeError("GROUP conversation must have at least two members");
  }
  assertMemberWorld(input.members, input.storyWorld.id);

  const conversation: Conversation = {
    id: input.id,
    storyWorldId: input.storyWorld.id,
    type: input.type,
    createdAt: input.createdAt,
  };
  if (input.title !== undefined) conversation.title = input.title;

  return {
    conversation,
    members: input.members.map((member) => ({
      conversationId: input.id,
      characterId: member.id,
      joinedAt: input.createdAt,
    })),
  };
}
