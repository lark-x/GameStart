import { CharacterRole, MessageKind, type Character, type ConversationAggregate, type Message } from "@living-network/domain";
import type { ChatTraceContext } from "@living-network/contracts";

export type AutomaticReplyStatus = "QUEUED" | "NOT_APPLICABLE" | "ALREADY_EXISTS";
export type RetryAutomaticReplyStatus = "QUEUED" | "COMPLETED" | "FAILED" | "ALREADY_EXISTS" | "NOT_APPLICABLE";

export interface AutomaticReplyState {
  readonly status: AutomaticReplyStatus;
  readonly correlationId: string;
  readonly sourceMessageId: string;
}

export interface RetryAutomaticReplyState {
  readonly status: RetryAutomaticReplyStatus;
  readonly correlationId: string;
  readonly sourceMessageId: string;
  readonly retryable?: boolean;
  readonly messageId?: string;
}

export interface AutomaticReplyTrace extends ChatTraceContext {
  readonly requestId?: string;
  readonly actorId?: string;
  readonly conversationId: string;
}

export function assistantReplyId(conversationId: string, sourceMessageId: string): string {
  return `assistant:${conversationId}:${sourceMessageId}`;
}

export function automaticReplyFlightKey(conversationId: string, sourceMessageId: string): string {
  return `${conversationId}:${sourceMessageId}`;
}

export function findEligibleAi(
  conversation: ConversationAggregate,
  characters: readonly (Character | undefined)[],
  readerCharacterId: string,
): Character | undefined {
  if (conversation.conversation.type !== "PRIVATE") return undefined;
  const activeIds = new Set(conversation.members.filter((member) => member.leftAt === undefined).map((member) => member.characterId));
  const reader = characters.find((character) => character?.id === readerCharacterId);
  if (!reader || reader.role !== CharacterRole.USER || !activeIds.has(reader.id)) return undefined;
  return characters.find((character) => character?.role === CharacterRole.AI && activeIds.has(character.id));
}

export function isEligibleSource(message: Message | undefined, readerCharacterId: string): message is Message {
  return message?.authorCharacterId === readerCharacterId && (message.kind === MessageKind.TEXT || message.kind === MessageKind.IMAGE || message.kind === MessageKind.STICKER);
}