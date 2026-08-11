import type { CharacterId, ConversationId, MessageId, StoryWorldId } from "./ids.ts";


export const ConversationType = {
  PRIVATE: "PRIVATE",
  GROUP: "GROUP",
} as const;

export type ConversationType =
  (typeof ConversationType)[keyof typeof ConversationType];

export const MessageKind = {
  TEXT: "TEXT",
  IMAGE: "IMAGE",
  STICKER: "STICKER",
  SYSTEM: "SYSTEM",
} as const;

export type MessageKind = (typeof MessageKind)[keyof typeof MessageKind];

export interface ConversationDto {
  id: ConversationId;
  storyWorldId: StoryWorldId;
  type: ConversationType;
  title?: string;
  createdAt: string;
}

export interface CreateConversationRequest {
  id: ConversationId;
  storyWorldId: StoryWorldId;
  type: ConversationType;
  title?: string;
  createdAt: string;
  memberCharacterIds: readonly CharacterId[];
}

export interface ConversationMemberDto {
  conversationId: ConversationId;
  characterId: CharacterId;
  joinedAt: string;
  leftAt?: string;
}

export interface ConversationDetailDto {
  conversation: ConversationDto;
  members: readonly ConversationMemberDto[];
}

export interface MessageDto {
  id: MessageId;
  conversationId: ConversationId;
  authorCharacterId?: CharacterId;
  kind: MessageKind;
  text?: string;
  mediaRef?: string;
  stickerId?: string;
  createdAt: string;
  idempotencyKey: string;
}

export interface SendMessageRequest {
  id: MessageId;
  authorCharacterId?: CharacterId;
  kind: MessageKind;
  text?: string;
  mediaRef?: string;
  stickerId?: string;
  suppressAutoReply?: boolean;
  createdAt: string;
  idempotencyKey: string;
}

export interface SendMessageResultDto {
  message: MessageDto;
  inserted: boolean;
}

/** A user-initiated image request bound to a private conversation. */
export interface RequestConversationImageRequest {
  actorCharacterId: CharacterId;
  recipientCharacterId: CharacterId;
  prompt: string;
  workflowVersion: string;
  negativePrompt?: string;
  seed?: number;
  createdAt: string;
  /** Stable per-request key. Repeating it returns the same queued job. */
  idempotencyKey: string;
}
