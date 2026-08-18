import type {
  V2CreateInstantStoryRequest,
  V2GenerateChatReplyRequest,
  V2IdempotencyKey,
  V2MediaId,
  V2MessageId,
  V2SendChatMessageRequest,
} from "@living-network/contracts/v2";

import { V2HttpError } from "../core/errors.ts";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new V2HttpError(422, "VALIDATION_FAILED", `${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new V2HttpError(422, "VALIDATION_FAILED", `${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalMessageId(value: unknown, field: string): V2MessageId | undefined {
  const parsed = optionalString(value, field);
  return parsed === undefined ? undefined : parsed as V2MessageId;
}

export function parseCreateInstantStoryRequest(value: unknown): V2CreateInstantStoryRequest {
  if (!isRecord(value)) throw new V2HttpError(422, "VALIDATION_FAILED", "request body must be an object");
  const displayName = value.displayName === undefined ? undefined : optionalString(value.displayName, "displayName");
  return {
    persona: nonEmptyString(value.persona, "persona"),
    ...(displayName === undefined ? {} : { displayName }),
    idempotencyKey: nonEmptyString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseSendChatMessageRequest(value: unknown): V2SendChatMessageRequest {
  if (!isRecord(value)) throw new V2HttpError(422, "VALIDATION_FAILED", "request body must be an object");
  const text = value.text === undefined ? undefined : optionalString(value.text, "text");
  const attachmentIds = value.attachmentIds === undefined
    ? undefined
    : Array.isArray(value.attachmentIds)
      ? value.attachmentIds.map((item) => nonEmptyString(item, "attachmentIds[]") as V2MediaId)
      : (() => { throw new V2HttpError(422, "VALIDATION_FAILED", "attachmentIds must be an array"); })();
  if ((text === undefined || text.length === 0) && (attachmentIds === undefined || attachmentIds.length === 0)) {
    throw new V2HttpError(422, "VALIDATION_FAILED", "Message must have text or at least one attachment");
  }
  const replyToMessageId = value.replyToMessageId === undefined ? undefined : optionalMessageId(value.replyToMessageId, "replyToMessageId");
  return {
    idempotencyKey: nonEmptyString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
    ...(text === undefined ? {} : { text }),
    ...(attachmentIds === undefined ? {} : { attachmentIds }),
    ...(replyToMessageId === undefined ? {} : { replyToMessageId }),
  };
}

export function parseGenerateChatReplyRequest(value: unknown): V2GenerateChatReplyRequest {
  if (!isRecord(value)) throw new V2HttpError(422, "VALIDATION_FAILED", "request body must be an object");
  return {
    idempotencyKey: nonEmptyString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}

export function parseTriggerStoryAnalyzeRequest(value: unknown): { readonly idempotencyKey: V2IdempotencyKey } {
  if (!isRecord(value)) throw new V2HttpError(422, "VALIDATION_FAILED", "request body must be an object");
  return {
    idempotencyKey: nonEmptyString(value.idempotencyKey, "idempotencyKey") as V2IdempotencyKey,
  };
}
