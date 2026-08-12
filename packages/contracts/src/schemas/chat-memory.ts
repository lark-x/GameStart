import { ConversationType, MessageKind } from "../conversation.ts";
import type { CreateConversationRequest, RequestConversationImageRequest, SendMessageRequest } from "../conversation.ts";
import { MemoryKind, MemorySource, MemoryVisibility } from "../memory.ts";
import { type JsonSchema, idSchema, nonEmptyStringSchema, timestampSchema, stringListSchema, workflowObjectSchema } from "./shared.ts";

export const conversationSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:conversation",
  title: "Conversation",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    type: {
      type: "string",
      enum: [ConversationType.PRIVATE, ConversationType.GROUP],
    },
    title: nonEmptyStringSchema,
    createdAt: timestampSchema,
  },
  required: ["id", "storyWorldId", "type", "createdAt"],
} as const satisfies JsonSchema;

export const conversationMemberSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:conversation-member",
  title: "ConversationMember",
  type: "object",
  additionalProperties: false,
  properties: {
    conversationId: idSchema,
    characterId: idSchema,
    joinedAt: timestampSchema,
    leftAt: timestampSchema,
  },
  required: ["conversationId", "characterId", "joinedAt"],
} as const satisfies JsonSchema;

export const messageSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:message",
  title: "Message",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    conversationId: idSchema,
    authorCharacterId: idSchema,
    kind: {
      type: "string",
      enum: [
        MessageKind.TEXT,
        MessageKind.IMAGE,
        MessageKind.STICKER,
        MessageKind.SYSTEM,
      ],
    },
    text: nonEmptyStringSchema,
    mediaRef: nonEmptyStringSchema,
    stickerId: nonEmptyStringSchema,
    suppressAutoReply: { type: "boolean" },
    createdAt: timestampSchema,
    idempotencyKey: idSchema,
  },
  required: ["id", "conversationId", "kind", "createdAt", "idempotencyKey"],
} as const satisfies JsonSchema;

export const createConversationRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:create-conversation-request",
  title: "CreateConversationRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    type: {
      type: "string",
      enum: [ConversationType.PRIVATE, ConversationType.GROUP],
    },
    title: nonEmptyStringSchema,
    createdAt: timestampSchema,
    memberCharacterIds: {
      type: "array",
      items: idSchema,
    },
  },
  required: ["id", "storyWorldId", "type", "createdAt", "memberCharacterIds"],
} as const satisfies JsonSchema;

export const sendMessageRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:send-message-request",
  title: "SendMessageRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    authorCharacterId: idSchema,
    kind: {
      type: "string",
      enum: [
        MessageKind.TEXT,
        MessageKind.IMAGE,
        MessageKind.STICKER,
        MessageKind.SYSTEM,
      ],
    },
    text: nonEmptyStringSchema,
    mediaRef: nonEmptyStringSchema,
    stickerId: nonEmptyStringSchema,
    createdAt: timestampSchema,
    idempotencyKey: idSchema,
  },
  required: ["id", "kind", "createdAt", "idempotencyKey"],
} as const satisfies JsonSchema;

export const requestConversationImageRequestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:request-conversation-image-request",
  title: "RequestConversationImageRequest",
  type: "object",
  additionalProperties: false,
  properties: {
    actorCharacterId: idSchema,
    recipientCharacterId: idSchema,
    prompt: nonEmptyStringSchema,
    workflowVersion: nonEmptyStringSchema,
    negativePrompt: nonEmptyStringSchema,
    seed: { type: "number", minimum: 0 },
    createdAt: timestampSchema,
    idempotencyKey: idSchema,
  },
  required: [
    "actorCharacterId", "recipientCharacterId", "prompt", "workflowVersion",
    "createdAt", "idempotencyKey",
  ],
} as const satisfies JsonSchema;

export const memoryItemSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:living-network:memory-item",
  title: "MemoryItem",
  type: "object",
  additionalProperties: false,
  properties: {
    id: idSchema,
    storyWorldId: idSchema,
    kind: {
      type: "string",
      enum: [
        MemoryKind.EVENT_FACT,
        MemoryKind.CONVERSATION_SUMMARY,
        MemoryKind.CHARACTER_IMPRESSION,
        MemoryKind.USER_PREFERENCE,
      ],
    },
    visibility: {
      type: "string",
      enum: [
        MemoryVisibility.PRIVATE,
        MemoryVisibility.RELATION,
        MemoryVisibility.GROUP,
        MemoryVisibility.PUBLIC,
        MemoryVisibility.SYSTEM,
      ],
    },
    source: {
      type: "string",
      enum: [
        MemorySource.USER_AUTHORED,
        MemorySource.LLM_DERIVED,
        MemorySource.SYSTEM_EVENT,
        MemorySource.IMPORTED,
      ],
    },
    content: nonEmptyStringSchema,
    confidence: { type: "number", minimum: 0, maximum: 1 },
    createdAt: timestampSchema,
    occurredAt: timestampSchema,
    subjectCharacterId: idSchema,
    audienceCharacterIds: { type: "array", items: idSchema },
    sourceRef: nonEmptyStringSchema,
  },
  required: [
    "id",
    "storyWorldId",
    "kind",
    "visibility",
    "source",
    "content",
    "confidence",
    "createdAt",
    "audienceCharacterIds",
  ],
} as const satisfies JsonSchema;
