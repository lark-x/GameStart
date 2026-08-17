import { V2DomainError } from "../shared/index.ts";

export type V2ChatConversationType = "direct";
export type V2ChatMessageRole = "user" | "assistant" | "system";
export type V2ChatMessageStatus = "pending" | "completed" | "failed" | "interrupted";
export type V2MemoryKind = "profile" | "preference" | "relationship" | "episodic" | "world_fact";
export type V2MemoryStatus = "active" | "superseded" | "forgotten";

export interface V2ChatConversation {
  readonly conversationId: string;
  readonly storyWorldId: string;
  readonly primaryCharacterId: string;
  readonly type: V2ChatConversationType;
  readonly title?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly lastMessageAt?: string;
}

export interface V2ChatMessageAttachment {
  readonly attachmentId: string;
  readonly kind: "image";
  readonly mediaId: string;
  readonly mediaRef: string;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
}

export interface V2ChatMessage {
  readonly messageId: string;
  readonly conversationId: string;
  readonly role: V2ChatMessageRole;
  readonly characterId?: string;
  readonly text?: string;
  readonly attachments: readonly V2ChatMessageAttachment[];
  readonly status: V2ChatMessageStatus;
  readonly createdAt?: string;
  readonly idempotencyKey: string;
  readonly replyToMessageId?: string;
}

export interface V2ChatMedia {
  readonly mediaId: string;
  readonly contentHash: string;
  readonly mediaRef: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly width?: number;
  readonly height?: number;
  readonly createdAt?: string;
}

export interface V2Memory {
  readonly memoryId: string;
  readonly storyWorldId: string;
  readonly conversationId?: string;
  readonly characterId?: string;
  readonly kind: V2MemoryKind;
  readonly content: string;
  readonly importance: number;
  readonly confidence: number;
  readonly sourceMessageIds: readonly string[];
  readonly status: V2MemoryStatus;
  readonly supersedesMemoryId?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly lastAccessedAt?: string;
}

export interface V2ConversationSummary {
  readonly conversationId: string;
  readonly summary: string;
  readonly coveredUntilMessageId: string;
  readonly sourceMessageCount: number;
  readonly updatedAt?: string;
  readonly version: number;
}

export function createV2ChatConversation(input: {
  readonly conversationId: string;
  readonly storyWorldId: string;
  readonly primaryCharacterId: string;
  readonly title?: string;
}): V2ChatConversation {
  return {
    conversationId: assertNonEmptyId(input.conversationId, "conversationId"),
    storyWorldId: assertNonEmptyId(input.storyWorldId, "storyWorldId"),
    primaryCharacterId: assertNonEmptyId(input.primaryCharacterId, "primaryCharacterId"),
    type: "direct",
    ...(input.title === undefined ? {} : { title: assertOptionalText(input.title, "title", 160) }),
  };
}

export function createV2ChatMessage(input: {
  readonly messageId: string;
  readonly conversationId: string;
  readonly role: V2ChatMessageRole;
  readonly characterId?: string;
  readonly text?: string;
  readonly attachments?: readonly V2ChatMessageAttachment[];
  readonly status?: V2ChatMessageStatus;
  readonly createdAt?: string;
  readonly idempotencyKey: string;
  readonly replyToMessageId?: string;
}): V2ChatMessage {
  if (input.role !== "user" && input.role !== "assistant" && input.role !== "system") {
    throw new V2DomainError("INVALID_INPUT", "role must be user, assistant, or system");
  }
  const status = input.status ?? "completed";
  if (status !== "pending" && status !== "completed" && status !== "failed" && status !== "interrupted") {
    throw new V2DomainError("INVALID_INPUT", "status must be pending, completed, failed, or interrupted");
  }
  const attachments = input.attachments ?? [];
  const text = input.text?.trim();
  if ((text === undefined || text.length === 0) && attachments.length === 0) {
    throw new V2DomainError("INVALID_INPUT", "message must have text or at least one attachment");
  }
  if (text !== undefined && text.length > 8000) {
    throw new V2DomainError("INVALID_INPUT", "text must be 8000 characters or shorter");
  }
  return {
    messageId: assertNonEmptyId(input.messageId, "messageId"),
    conversationId: assertNonEmptyId(input.conversationId, "conversationId"),
    role: input.role,
    ...(input.characterId === undefined ? {} : { characterId: assertNonEmptyId(input.characterId, "characterId") }),
    ...(text === undefined || text.length === 0 ? {} : { text }),
    attachments: attachments.map((attachment) => ({
      attachmentId: assertNonEmptyId(attachment.attachmentId, "attachmentId"),
      kind: "image",
      mediaId: assertNonEmptyId(attachment.mediaId, "mediaId"),
      mediaRef: assertNonEmptyId(attachment.mediaRef, "mediaRef"),
      mimeType: assertNonEmptyId(attachment.mimeType, "mimeType"),
      ...(attachment.width === undefined ? {} : { width: assertOptionalDimension(attachment.width, "width") }),
      ...(attachment.height === undefined ? {} : { height: assertOptionalDimension(attachment.height, "height") }),
    })),
    status,
    ...(input.createdAt === undefined ? {} : { createdAt: assertIsoTime(input.createdAt, "createdAt") }),
    idempotencyKey: assertNonEmptyId(input.idempotencyKey, "idempotencyKey"),
    ...(input.replyToMessageId === undefined ? {} : { replyToMessageId: assertNonEmptyId(input.replyToMessageId, "replyToMessageId") }),
  };
}

export function createV2ChatMedia(input: {
  readonly mediaId: string;
  readonly contentHash: string;
  readonly mediaRef: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly width?: number;
  readonly height?: number;
  readonly createdAt?: string;
}): V2ChatMedia {
  if (!/^[a-f0-9]{64}$/.test(input.contentHash)) {
    throw new V2DomainError("INVALID_INPUT", "contentHash must be a sha256 hex digest");
  }
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 0) {
    throw new V2DomainError("INVALID_INPUT", "byteSize must be a non-negative integer");
  }
  return {
    mediaId: assertNonEmptyId(input.mediaId, "mediaId"),
    contentHash: input.contentHash,
    mediaRef: assertNonEmptyId(input.mediaRef, "mediaRef"),
    mimeType: assertNonEmptyId(input.mimeType, "mimeType"),
    byteSize: input.byteSize,
    ...(input.width === undefined ? {} : { width: assertOptionalDimension(input.width, "width") }),
    ...(input.height === undefined ? {} : { height: assertOptionalDimension(input.height, "height") }),
    ...(input.createdAt === undefined ? {} : { createdAt: assertIsoTime(input.createdAt, "createdAt") }),
  };
}

export function createV2Memory(input: {
  readonly memoryId: string;
  readonly storyWorldId: string;
  readonly conversationId?: string;
  readonly characterId?: string;
  readonly kind: V2MemoryKind;
  readonly content: string;
  readonly importance: number;
  readonly confidence: number;
  readonly sourceMessageIds: readonly string[];
  readonly status?: V2MemoryStatus;
  readonly supersedesMemoryId?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly lastAccessedAt?: string;
}): V2Memory {
  const kinds = new Set<V2MemoryKind>(["profile", "preference", "relationship", "episodic", "world_fact"]);
  if (!kinds.has(input.kind)) {
    throw new V2DomainError("INVALID_INPUT", "unsupported memory kind");
  }
  if (!Number.isFinite(input.importance) || input.importance < 0 || input.importance > 1) {
    throw new V2DomainError("INVALID_INPUT", "importance must be between 0 and 1");
  }
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    throw new V2DomainError("INVALID_INPUT", "confidence must be between 0 and 1");
  }
  const status = input.status ?? "active";
  if (status !== "active" && status !== "superseded" && status !== "forgotten") {
    throw new V2DomainError("INVALID_INPUT", "status must be active, superseded, or forgotten");
  }
  const content = input.content.trim();
  if (content.length === 0 || content.length > 2000) {
    throw new V2DomainError("INVALID_INPUT", "content must be between 1 and 2000 characters");
  }
  return {
    memoryId: assertNonEmptyId(input.memoryId, "memoryId"),
    storyWorldId: assertNonEmptyId(input.storyWorldId, "storyWorldId"),
    ...(input.conversationId === undefined ? {} : { conversationId: assertNonEmptyId(input.conversationId, "conversationId") }),
    ...(input.characterId === undefined ? {} : { characterId: assertNonEmptyId(input.characterId, "characterId") }),
    kind: input.kind,
    content,
    importance: input.importance,
    confidence: input.confidence,
    sourceMessageIds: input.sourceMessageIds.map((id) => assertNonEmptyId(id, "sourceMessageId")),
    status,
    ...(input.supersedesMemoryId === undefined ? {} : { supersedesMemoryId: assertNonEmptyId(input.supersedesMemoryId, "supersedesMemoryId") }),
    ...(input.createdAt === undefined ? {} : { createdAt: assertIsoTime(input.createdAt, "createdAt") }),
    ...(input.updatedAt === undefined ? {} : { updatedAt: assertIsoTime(input.updatedAt, "updatedAt") }),
    ...(input.lastAccessedAt === undefined ? {} : { lastAccessedAt: assertIsoTime(input.lastAccessedAt, "lastAccessedAt") }),
  };
}

export function createV2ConversationSummary(input: {
  readonly conversationId: string;
  readonly summary: string;
  readonly coveredUntilMessageId: string;
  readonly sourceMessageCount: number;
  readonly updatedAt?: string;
  readonly version: number;
}): V2ConversationSummary {
  const summary = input.summary.trim();
  if (summary.length === 0 || summary.length > 4000) {
    throw new V2DomainError("INVALID_INPUT", "summary must be between 1 and 4000 characters");
  }
  if (!Number.isSafeInteger(input.sourceMessageCount) || input.sourceMessageCount < 0) {
    throw new V2DomainError("INVALID_INPUT", "sourceMessageCount must be a non-negative integer");
  }
  if (!Number.isSafeInteger(input.version) || input.version < 1) {
    throw new V2DomainError("INVALID_INPUT", "version must be a positive integer");
  }
  return {
    conversationId: assertNonEmptyId(input.conversationId, "conversationId"),
    summary,
    coveredUntilMessageId: assertNonEmptyId(input.coveredUntilMessageId, "coveredUntilMessageId"),
    sourceMessageCount: input.sourceMessageCount,
    ...(input.updatedAt === undefined ? {} : { updatedAt: assertIsoTime(input.updatedAt, "updatedAt") }),
    version: input.version,
  };
}

export function assertV2PersonaText(persona: string): string {
  const value = persona.trim();
  if (value.length === 0) {
    throw new V2DomainError("INVALID_INPUT", "persona must be a non-empty string");
  }
  if (value.length > 4000) {
    throw new V2DomainError("INVALID_INPUT", "persona must be 4000 characters or shorter");
  }
  return value;
}

function assertNonEmptyId<T extends string>(value: T, field: string): T {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 160) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be a non-empty id up to 160 characters`);
  }
  return value;
}

function assertOptionalText(value: string, field: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be ${maxLength} characters or shorter`);
  }
  return trimmed;
}

function assertOptionalDimension(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be a positive integer`);
  }
  return value;
}

function assertIsoTime(value: string, field: string): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be an ISO date time`);
  }
  return value;
}
