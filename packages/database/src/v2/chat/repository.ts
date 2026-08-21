import type { DatabaseSync } from "node:sqlite";

import type {
  V2ConversationId,
  V2MediaId,
  V2MemoryId,
  V2MessageId,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
import type {
  V2ChatConversation,
  V2ChatMaintenanceJob,
  V2ChatMedia,
  V2ChatMessage,
  V2ChatSticker,
  V2ChatTrace,
  V2ChatTraceStatus,
  V2ConversationSummary,
  V2Memory,
} from "@living-network/domain/v2";
import type {
  V2CanonRepository,
  V2ChatConversationRepository,
  V2ChatConversationSummary,
  V2ChatMaintenanceJobRepository,
  V2ChatMediaRepository,
  V2ChatMessageRepository,
  V2ChatStickerRepository,
  V2ChatTraceRepository,
  V2ChatUnitOfWork,
  V2ConversationSummaryRepository,
  V2FactRepository,
  V2MemoryRepository,
} from "@living-network/ports/v2";
import { V2SqliteCandidateReviewRepository, V2SqliteCanonRepository } from "../core/index.ts";
import { V2SqliteFactRepository } from "../fact/index.ts";
import { withV2SqliteAsyncTransaction } from "../platform/index.ts";

type ConversationRow = {
  conversation_id: string;
  story_world_id: string;
  primary_character_id: string;
  type: "direct";
  title: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
};

type ConversationSummaryRow = {
  conversation_id: string;
  story_world_id: string;
  primary_character_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  character_name: string;
  world_name: string;
  last_message_text: string | null;
  last_message_attachments: string | null;
  last_message_status: "pending" | "completed" | "failed" | "interrupted" | null;
};

type MessageRow = {
  message_id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  character_id: string | null;
  text: string | null;
  attachments_json: string;
  status: "pending" | "completed" | "failed" | "interrupted";
  created_at: string;
  idempotency_key: string;
  reply_to_message_id: string | null;
};

type MediaRow = {
  media_id: string;
  content_hash: string;
  media_ref: string;
  mime_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  created_at: string;
};

type StickerRow = {
  sticker_id: string;
  media_id: string;
  media_ref: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
};

type MemoryRow = {
  memory_id: string;
  story_world_id: string;
  conversation_id: string | null;
  character_id: string | null;
  engine_id: string | null;
  source_assertion_ids_json: string | null;
  slot_key: string | null;
  kind: "profile" | "preference" | "relationship" | "episodic" | "world_fact";
  content: string;
  importance: number;
  confidence: number;
  source_message_ids_json: string;
  status: "active" | "superseded" | "forgotten";
  supersedes_memory_id: string | null;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
};

type SummaryRow = {
  conversation_id: string;
  summary: string;
  covered_until_message_id: string;
  source_message_count: number;
  version: number;
  updated_at: string;
};

type MaintenanceJobRow = {
  job_id: string;
  conversation_id: string;
  job_type: "memory_extract" | "conversation_summary" | "memory_consolidate" | "story_analyze";
  status: "pending" | "claimed" | "running" | "completed" | "failed";
  payload: string;
  dedupe_key: string | null;
  attempts: number;
  max_attempts: number;
  available_at: string;
  lease_expires_at: string | null;
  claimed_by: string | null;
  last_started_at: string | null;
  created_at: string;
  updated_at: string;
  last_error: string | null;
};

function mapMaintenanceJob(row: MaintenanceJobRow): V2ChatMaintenanceJob {
  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(row.payload);
  } catch {
    parsedPayload = row.payload;
  }
  return {
    jobId: row.job_id,
    conversationId: row.conversation_id,
    jobType: row.job_type,
    status: row.status,
    payload: parsedPayload,
    ...(row.dedupe_key === null ? {} : { dedupeKey: row.dedupe_key }),
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    availableAt: row.available_at,
    ...(row.lease_expires_at === null ? {} : { leaseExpiresAt: row.lease_expires_at }),
    ...(row.claimed_by === null ? {} : { claimedBy: row.claimed_by }),
    ...(row.last_started_at === null ? {} : { lastStartedAt: row.last_started_at }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.last_error === null ? {} : { lastError: row.last_error }),
  };
}

function mapConversation(row: ConversationRow): V2ChatConversation {
  return {
    conversationId: row.conversation_id,
    storyWorldId: row.story_world_id,
    primaryCharacterId: row.primary_character_id,
    type: row.type,
    ...(row.title === null ? {} : { title: row.title }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.last_message_at === null ? {} : { lastMessageAt: row.last_message_at }),
  };
}

function mapConversationSummary(row: ConversationSummaryRow): V2ChatConversationSummary {
  let hasAttachments = false;
  try {
    hasAttachments = Array.isArray(JSON.parse(row.last_message_attachments ?? "[]"));
  } catch {
    hasAttachments = false;
  }
  const text = row.last_message_text?.trim();
  let lastMessagePreview: string | undefined;
  if (text !== undefined && text.length > 0) lastMessagePreview = text;
  else if (hasAttachments) lastMessagePreview = "[图片]";
  return {
    conversationId: row.conversation_id,
    storyWorldId: row.story_world_id,
    primaryCharacterId: row.primary_character_id,
    ...(row.title === null ? {} : { title: row.title }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    characterName: row.character_name,
    storyWorldName: row.world_name,
    ...(lastMessagePreview === undefined ? {} : { lastMessagePreview }),
    ...(row.last_message_at === null ? {} : { lastMessageAt: row.last_message_at }),
    ...(row.last_message_status === null ? {} : { lastMessageStatus: row.last_message_status }),
  };
}

function parseAttachments(value: string): V2ChatMessage["attachments"] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is V2ChatMessage["attachments"][number] => {
    if (typeof item !== "object" || item === null) return false;
    const record = item as Record<string, unknown>;
    return typeof record.attachmentId === "string"
      && record.kind === "image"
      && typeof record.mediaId === "string"
      && typeof record.mediaRef === "string"
      && typeof record.mimeType === "string";
  });
}

function mapMessage(row: MessageRow): V2ChatMessage {
  const text = row.text?.trim();
  return {
    messageId: row.message_id,
    conversationId: row.conversation_id,
    role: row.role,
    ...(row.character_id === null ? {} : { characterId: row.character_id }),
    ...(text === undefined || text.length === 0 ? {} : { text }),
    attachments: parseAttachments(row.attachments_json),
    status: row.status,
    createdAt: row.created_at,
    idempotencyKey: row.idempotency_key,
    ...(row.reply_to_message_id === null ? {} : { replyToMessageId: row.reply_to_message_id }),
  };
}

function mapMedia(row: MediaRow): V2ChatMedia {
  return {
    mediaId: row.media_id,
    contentHash: row.content_hash,
    mediaRef: row.media_ref,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    ...(row.width === null ? {} : { width: row.width }),
    ...(row.height === null ? {} : { height: row.height }),
    createdAt: row.created_at,
  };
}

function mapSticker(row: StickerRow): V2ChatSticker {
  return {
    stickerId: row.sticker_id,
    mediaId: row.media_id,
    mediaRef: row.media_ref,
    label: row.label,
    createdAt: row.created_at,
    ...(row.last_used_at === null ? {} : { lastUsedAt: row.last_used_at }),
  };
}

function parseMessageIds(value: string): readonly string[] {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}

function mapMemory(row: MemoryRow): V2Memory {
  return {
    memoryId: row.memory_id,
    storyWorldId: row.story_world_id,
    ...(row.conversation_id === null ? {} : { conversationId: row.conversation_id }),
    ...(row.character_id === null ? {} : { characterId: row.character_id }),
    ...(row.engine_id === null ? {} : { engineId: row.engine_id }),
    ...(row.source_assertion_ids_json === null ? {} : { sourceAssertionIds: parseMessageIds(row.source_assertion_ids_json) }),
    ...(row.slot_key === null ? {} : { slotKey: row.slot_key }),
    kind: row.kind,
    content: row.content,
    importance: row.importance,
    confidence: row.confidence,
    sourceMessageIds: parseMessageIds(row.source_message_ids_json),
    status: row.status,
    ...(row.supersedes_memory_id === null ? {} : { supersedesMemoryId: row.supersedes_memory_id }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.last_accessed_at === null ? {} : { lastAccessedAt: row.last_accessed_at }),
  };
}

function mapSummary(row: SummaryRow): V2ConversationSummary {
  return {
    conversationId: row.conversation_id,
    summary: row.summary,
    coveredUntilMessageId: row.covered_until_message_id,
    sourceMessageCount: row.source_message_count,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

export class V2SqliteChatUnitOfWork implements V2ChatUnitOfWork {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async withChatTransaction<T>(fn: (repositories: {
    readonly canon: V2CanonRepository;
    readonly candidateReviews: V2SqliteCandidateReviewRepository;
    readonly conversations: V2ChatConversationRepository;
    readonly messages: V2ChatMessageRepository;
    readonly media: V2ChatMediaRepository;
    readonly stickers: V2ChatStickerRepository;
    readonly memories: V2MemoryRepository;
    readonly summaries: V2ConversationSummaryRepository;
    readonly traces: V2ChatTraceRepository;
    readonly maintenanceJobs: V2ChatMaintenanceJobRepository;
    readonly facts: V2FactRepository;
  }) => Promise<T>): Promise<T> {
    return withV2SqliteAsyncTransaction(this.db, () => fn({
      canon: new V2SqliteCanonRepository(this.db),
      candidateReviews: new V2SqliteCandidateReviewRepository(this.db),
      conversations: new V2SqliteChatConversationRepository(this.db),
      messages: new V2SqliteChatMessageRepository(this.db),
      media: new V2SqliteChatMediaRepository(this.db),
      stickers: new V2SqliteChatStickerRepository(this.db),
      memories: new V2SqliteMemoryRepository(this.db),
      summaries: new V2SqliteConversationSummaryRepository(this.db),
      traces: new V2SqliteChatTraceRepository(this.db),
      maintenanceJobs: new V2SqliteChatMaintenanceJobRepository(this.db),
      facts: new V2SqliteFactRepository(this.db),
    }));
  }
}

export class V2SqliteChatStickerRepository implements V2ChatStickerRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async create(input: V2ChatSticker): Promise<V2ChatSticker> {
    this.db.prepare(`
      INSERT INTO v2_chat_stickers (sticker_id, media_id, media_ref, label, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(input.stickerId, input.mediaId, input.mediaRef, input.label, input.createdAt ?? new Date().toISOString());
    const row = this.db.prepare("SELECT * FROM v2_chat_stickers WHERE sticker_id = ?").get(input.stickerId) as StickerRow | undefined;
    if (row === undefined) throw new Error("V2 chat sticker insert did not return a row");
    return mapSticker(row);
  }

  public async list(): Promise<readonly V2ChatSticker[]> {
    const rows = this.db.prepare(`
      SELECT * FROM v2_chat_stickers
      ORDER BY COALESCE(last_used_at, created_at) DESC, sticker_id DESC
    `).all() as StickerRow[];
    return rows.map(mapSticker);
  }

  public async touchLastUsed(input: { readonly stickerId: string; readonly lastUsedAt: string }): Promise<void> {
    this.db.prepare("UPDATE v2_chat_stickers SET last_used_at = ? WHERE sticker_id = ?").run(input.lastUsedAt, input.stickerId);
  }
}

export class V2SqliteChatConversationRepository implements V2ChatConversationRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async create(input: V2ChatConversation): Promise<V2ChatConversation> {
    this.db.prepare(`
      INSERT INTO v2_conversations (
        conversation_id, story_world_id, primary_character_id, type, title, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.conversationId,
      input.storyWorldId,
      input.primaryCharacterId,
      input.type,
      input.title ?? null,
      input.createdAt ?? new Date().toISOString(),
      input.updatedAt ?? new Date().toISOString(),
    );
    const created = await this.get(input.conversationId as V2ConversationId);
    if (created === undefined) throw new Error("V2 conversation insert did not return a row");
    return created;
  }

  public async get(conversationId: V2ConversationId): Promise<V2ChatConversation | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_conversations WHERE conversation_id = ?").get(conversationId) as ConversationRow | undefined;
    return row === undefined ? undefined : mapConversation(row);
  }

  public async list(): Promise<readonly V2ChatConversation[]> {
    return (this.db.prepare("SELECT * FROM v2_conversations ORDER BY COALESCE(last_message_at, updated_at) DESC, conversation_id DESC").all() as ConversationRow[]).map(mapConversation);
  }

  public async listSummaries(): Promise<readonly V2ChatConversationSummary[]> {
    const rows = this.db.prepare(`
      SELECT
        c.conversation_id, c.story_world_id, c.primary_character_id, c.title, c.created_at, c.updated_at, c.last_message_at,
        ch.name AS character_name,
        w.name AS world_name,
        m.text AS last_message_text,
        m.attachments_json AS last_message_attachments,
        m.status AS last_message_status
      FROM v2_conversations c
      JOIN v2_characters ch ON ch.story_world_id = c.story_world_id AND ch.character_id = c.primary_character_id
      JOIN v2_worlds w ON w.story_world_id = c.story_world_id
      LEFT JOIN v2_chat_messages m ON m.conversation_id = c.conversation_id
        AND m.message_id = (
          SELECT message_id FROM v2_chat_messages
          WHERE conversation_id = c.conversation_id
          ORDER BY created_at DESC, message_id DESC
          LIMIT 1
        )
      ORDER BY COALESCE(c.last_message_at, c.updated_at) DESC, c.conversation_id DESC
    `).all() as ConversationSummaryRow[];
    return rows.map(mapConversationSummary);
  }

  public async touchLastMessage(input: {
    readonly conversationId: V2ConversationId;
    readonly lastMessageAt: string;
  }): Promise<void> {
    this.db.prepare(`
      UPDATE v2_conversations
      SET last_message_at = ?, updated_at = ?
      WHERE conversation_id = ?
    `).run(input.lastMessageAt, input.lastMessageAt, input.conversationId);
  }
}

export class V2SqliteChatMessageRepository implements V2ChatMessageRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async create(input: V2ChatMessage): Promise<V2ChatMessage> {
    this.db.prepare(`
      INSERT INTO v2_chat_messages (
        message_id, conversation_id, role, character_id, text, attachments_json, status,
        created_at, idempotency_key, reply_to_message_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.messageId,
      input.conversationId,
      input.role,
      input.characterId ?? null,
      input.text ?? null,
      JSON.stringify(input.attachments),
      input.status,
      input.createdAt ?? new Date().toISOString(),
      input.idempotencyKey,
      input.replyToMessageId ?? null,
    );
    const created = await this.get(input.messageId as V2MessageId);
    if (created === undefined) throw new Error("V2 chat message insert did not return a row");
    return created;
  }

  public async get(messageId: V2MessageId): Promise<V2ChatMessage | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_chat_messages WHERE message_id = ?").get(messageId) as MessageRow | undefined;
    return row === undefined ? undefined : mapMessage(row);
  }

  public async listByConversation(conversationId: V2ConversationId, limit = 100): Promise<readonly V2ChatMessage[]> {
    const rows = this.db.prepare(`
      SELECT * FROM v2_chat_messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC, message_id ASC
      LIMIT ?
    `).all(conversationId, limit) as MessageRow[];
    return rows.map(mapMessage);
  }

  public async listRecentByConversation(conversationId: V2ConversationId, limit = 40): Promise<readonly V2ChatMessage[]> {
    const rows = this.db.prepare(`
      SELECT * FROM (
        SELECT *
        FROM v2_chat_messages
        WHERE conversation_id = ?
        ORDER BY created_at DESC, message_id DESC
        LIMIT ?
      )
      ORDER BY created_at ASC, message_id ASC
    `).all(conversationId, limit) as MessageRow[];
    return rows.map(mapMessage);
  }

  public async listBefore(conversationId: V2ConversationId, beforeMessageId: V2MessageId, limit = 40): Promise<readonly V2ChatMessage[]> {
    const before = this.db.prepare("SELECT created_at FROM v2_chat_messages WHERE conversation_id = ? AND message_id = ?").get(conversationId, beforeMessageId) as { readonly created_at: string } | undefined;
    if (before === undefined) return [];
    const rows = this.db.prepare(`
      SELECT * FROM (
        SELECT *
        FROM v2_chat_messages
        WHERE conversation_id = ? AND (created_at < ? OR (created_at = ? AND message_id < ?))
        ORDER BY created_at DESC, message_id DESC
        LIMIT ?
      )
      ORDER BY created_at ASC, message_id ASC
    `).all(conversationId, before.created_at, before.created_at, beforeMessageId, limit) as MessageRow[];
    return rows.map(mapMessage);
  }

  public async listByIds(conversationId: V2ConversationId, messageIds: readonly V2MessageId[]): Promise<readonly V2ChatMessage[]> {
    if (messageIds.length === 0) return [];
    const uniqueIds = [...new Set(messageIds)];
    const placeholders = uniqueIds.map(() => "?").join(", ");
    const rows = this.db.prepare(`
      SELECT * FROM v2_chat_messages
      WHERE conversation_id = ? AND message_id IN (${placeholders})
    `).all(conversationId, ...uniqueIds) as MessageRow[];
    const byId = new Map(rows.map((row) => [row.message_id, mapMessage(row)]));
    return messageIds.flatMap((id) => {
      const message = byId.get(id);
      return message === undefined ? [] : [message];
    });
  }

  public async listAfter(conversationId: V2ConversationId, afterMessageId: V2MessageId | undefined, limit: number): Promise<readonly V2ChatMessage[]> {
    const safeLimit = Math.min(Math.max(1, limit), 500);
    if (afterMessageId === undefined) {
      return (this.db.prepare(`
        SELECT * FROM v2_chat_messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC, message_id ASC
        LIMIT ?
      `).all(conversationId, safeLimit) as MessageRow[]).map(mapMessage);
    }
    const after = this.db.prepare("SELECT created_at FROM v2_chat_messages WHERE conversation_id = ? AND message_id = ?").get(conversationId, afterMessageId) as { readonly created_at: string } | undefined;
    if (after === undefined) return [];
    return (this.db.prepare(`
      SELECT * FROM v2_chat_messages
      WHERE conversation_id = ? AND (created_at > ? OR (created_at = ? AND message_id > ?))
      ORDER BY created_at ASC, message_id ASC
      LIMIT ?
    `).all(conversationId, after.created_at, after.created_at, afterMessageId, safeLimit) as MessageRow[]).map(mapMessage);
  }

  public async countAfter(conversationId: V2ConversationId, afterMessageId: V2MessageId | undefined): Promise<number> {
    if (afterMessageId === undefined) {
      const row = this.db.prepare("SELECT COUNT(*) AS count FROM v2_chat_messages WHERE conversation_id = ?").get(conversationId) as { readonly count: number };
      return row.count;
    }
    const after = this.db.prepare("SELECT created_at FROM v2_chat_messages WHERE conversation_id = ? AND message_id = ?").get(conversationId, afterMessageId) as { readonly created_at: string } | undefined;
    if (after === undefined) return 0;
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count FROM v2_chat_messages
      WHERE conversation_id = ? AND (created_at > ? OR (created_at = ? AND message_id > ?))
    `).get(conversationId, after.created_at, after.created_at, afterMessageId) as { readonly count: number };
    return row.count;
  }

  public async findByIdempotencyKey(conversationId: V2ConversationId, idempotencyKey: string): Promise<V2ChatMessage | undefined> {
    const row = this.db.prepare(`
      SELECT * FROM v2_chat_messages
      WHERE conversation_id = ? AND idempotency_key = ?
      LIMIT 1
    `).get(conversationId, idempotencyKey) as MessageRow | undefined;
    return row === undefined ? undefined : mapMessage(row);
  }
}

export class V2SqliteChatMediaRepository implements V2ChatMediaRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async create(input: V2ChatMedia): Promise<V2ChatMedia> {
    this.db.prepare(`
      INSERT INTO v2_chat_media (
        media_id, content_hash, media_ref, mime_type, byte_size, width, height, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.mediaId,
      input.contentHash,
      input.mediaRef,
      input.mimeType,
      input.byteSize,
      input.width ?? null,
      input.height ?? null,
      input.createdAt ?? new Date().toISOString(),
    );
    const created = await this.get(input.mediaId as V2MediaId);
    if (created === undefined) throw new Error("V2 chat media insert did not return a row");
    return created;
  }

  public async get(mediaId: V2MediaId): Promise<V2ChatMedia | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_chat_media WHERE media_id = ?").get(mediaId) as MediaRow | undefined;
    return row === undefined ? undefined : mapMedia(row);
  }

  public async listByIds(mediaIds: readonly V2MediaId[]): Promise<readonly V2ChatMedia[]> {
    if (mediaIds.length === 0) return [];
    const placeholders = mediaIds.map(() => "?").join(", ");
    const rows = this.db.prepare(`SELECT * FROM v2_chat_media WHERE media_id IN (${placeholders})`).all(...mediaIds) as MediaRow[];
    return rows.map(mapMedia);
  }
}

export class V2SqliteMemoryRepository implements V2MemoryRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async create(input: V2Memory): Promise<V2Memory> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO v2_memories (
        memory_id, story_world_id, conversation_id, character_id, engine_id, source_assertion_ids_json, slot_key,
        kind, content, importance, confidence, source_message_ids_json, status, supersedes_memory_id,
        created_at, updated_at, last_accessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.memoryId,
      input.storyWorldId,
      input.conversationId ?? null,
      input.characterId ?? null,
      input.engineId ?? "builtin_structured",
      input.sourceAssertionIds === undefined ? "[]" : JSON.stringify(input.sourceAssertionIds),
      input.slotKey ?? null,
      input.kind,
      input.content,
      input.importance,
      input.confidence,
      JSON.stringify(input.sourceMessageIds),
      input.status,
      input.supersedesMemoryId ?? null,
      input.createdAt ?? now,
      input.updatedAt ?? now,
      input.lastAccessedAt ?? null,
    );
    const created = await this.get(input.memoryId as V2MemoryId);
    if (created === undefined) throw new Error("V2 memory insert did not return a row");
    return created;
  }

  public async get(memoryId: V2MemoryId): Promise<V2Memory | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_memories WHERE memory_id = ?").get(memoryId) as MemoryRow | undefined;
    return row === undefined ? undefined : mapMemory(row);
  }

  public async listByConversation(conversationId: V2ConversationId): Promise<readonly V2Memory[]> {
    const rows = this.db.prepare(`
      SELECT * FROM v2_memories
      WHERE conversation_id = ?
      ORDER BY updated_at DESC
    `).all(conversationId) as MemoryRow[];
    return rows.map(mapMemory);
  }

  public async listActiveByStoryWorld(storyWorldId: V2StoryWorldId): Promise<readonly V2Memory[]> {
    const rows = this.db.prepare(`
      SELECT * FROM v2_memories
      WHERE story_world_id = ? AND status = 'active'
      ORDER BY importance DESC, updated_at DESC
    `).all(storyWorldId) as MemoryRow[];
    return rows.map(mapMemory);
  }

  public async listActiveByCharacter(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly characterId: string;
    readonly limit?: number;
  }): Promise<readonly V2Memory[]> {
    const limit = Math.min(Math.max(1, input.limit ?? 10), 20);
    const rows = this.db.prepare(`
      SELECT * FROM v2_memories
      WHERE story_world_id = ? AND status = 'active' AND character_id = ?
      ORDER BY importance DESC, updated_at DESC
      LIMIT ?
    `).all(input.storyWorldId, input.characterId, limit) as MemoryRow[];
    return rows.map(mapMemory);
  }

  public async countActiveByCharacter(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly characterId: string;
  }): Promise<number> {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count FROM v2_memories
      WHERE story_world_id = ? AND status = 'active' AND character_id = ?
    `).get(input.storyWorldId, input.characterId) as { readonly count: number };
    return row.count;
  }

  public async countActiveGroupedByCharacter(storyWorldId: V2StoryWorldId): Promise<ReadonlyMap<string, number>> {
    const rows = this.db.prepare(`
      SELECT character_id AS characterId, COUNT(*) AS count FROM v2_memories
      WHERE story_world_id = ? AND status = 'active' AND character_id IS NOT NULL
      GROUP BY character_id
    `).all(storyWorldId) as { readonly characterId: string; readonly count: number }[];
    return new Map(rows.map((row) => [row.characterId, row.count]));
  }

  public async searchActive(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly query: string;
    readonly limit?: number;
  }): Promise<readonly V2Memory[]> {
    const limit = Math.min(input.limit ?? 10, 20);
    const rawTokens = input.query.trim().split(/\s+/).filter(Boolean);
    const cjkWords = input.query.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z0-9]{2,}/g) ?? [];
    const allTokens = Array.from(new Set([...rawTokens, ...cjkWords])).slice(0, 10);
    if (allTokens.length === 0) {
      return (await this.listActiveByStoryWorld(input.storyWorldId)).slice(0, limit);
    }
    const match = allTokens.map((token) => `"${token.replace(/"/g, "")}"`).join(" OR ");
    let rows: MemoryRow[];
    try {
      rows = this.db.prepare(`
        SELECT m.*
        FROM v2_memories m
        JOIN v2_memories_fts f ON f.rowid = m.rowid AND f.memory_id = m.memory_id
        WHERE m.story_world_id = ? AND m.status = 'active' AND v2_memories_fts MATCH ?
        ORDER BY bm25(v2_memories_fts), m.importance DESC, m.updated_at DESC
        LIMIT ?
      `).all(input.storyWorldId, match, limit) as MemoryRow[];
    } catch {
      rows = [];
    }
    if (rows.length === 0) {
      const likeClauses = allTokens.map(() => "content LIKE '%' || ? || '%'").join(" OR ");
      rows = this.db.prepare(`
        SELECT * FROM v2_memories
        WHERE story_world_id = ? AND status = 'active'
          AND (${likeClauses})
        ORDER BY importance DESC, updated_at DESC
        LIMIT ?
      `).all(input.storyWorldId, ...allTokens, limit) as MemoryRow[];
    }
    if (rows.length === 0) {
      return (await this.listActiveByStoryWorld(input.storyWorldId)).slice(0, limit);
    }
    return rows.map(mapMemory);
  }

  public async searchActiveByCharacter(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly characterId: string;
    readonly query: string;
    readonly limit?: number;
  }): Promise<readonly V2Memory[]> {
    const limit = Math.min(input.limit ?? 10, 20);
    const rawTokens = input.query.trim().split(/\s+/).filter(Boolean);
    const cjkWords = input.query.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z0-9]{2,}/g) ?? [];
    const allTokens = Array.from(new Set([...rawTokens, ...cjkWords])).slice(0, 10);
    if (allTokens.length === 0) {
      return (await this.listActiveByCharacter({
        storyWorldId: input.storyWorldId,
        characterId: input.characterId,
        limit,
      })).slice(0, limit);
    }
    const match = allTokens.map((token) => `"${token.replace(/"/g, "")}"`).join(" OR ");
    let rows: MemoryRow[];
    try {
      rows = this.db.prepare(`
        SELECT m.*
        FROM v2_memories m
        JOIN v2_memories_fts f ON f.rowid = m.rowid AND f.memory_id = m.memory_id
        WHERE m.story_world_id = ? AND m.character_id = ? AND m.status = 'active' AND v2_memories_fts MATCH ?
        ORDER BY bm25(v2_memories_fts), m.importance DESC, m.updated_at DESC
        LIMIT ?
      `).all(input.storyWorldId, input.characterId, match, limit) as MemoryRow[];
    } catch {
      rows = [];
    }
    if (rows.length === 0) {
      const likeClauses = allTokens.map(() => "content LIKE '%' || ? || '%'").join(" OR ");
      rows = this.db.prepare(`
        SELECT * FROM v2_memories
        WHERE story_world_id = ? AND character_id = ? AND status = 'active'
          AND (${likeClauses})
        ORDER BY importance DESC, updated_at DESC
        LIMIT ?
      `).all(input.storyWorldId, input.characterId, ...allTokens, limit) as MemoryRow[];
    }
    if (rows.length === 0) {
      return (await this.listActiveByCharacter({
        storyWorldId: input.storyWorldId,
        characterId: input.characterId,
        limit,
      })).slice(0, limit);
    }
    return rows.map(mapMemory);
  }

  public async supersede(input: {
    readonly memoryId: V2MemoryId;
    readonly supersededByMemoryId?: V2MemoryId;
    readonly updatedAt: string;
  }): Promise<V2Memory> {
    this.db.prepare(`
      UPDATE v2_memories
      SET status = 'superseded', supersedes_memory_id = ?, updated_at = ?
      WHERE memory_id = ?
    `).run(input.supersededByMemoryId ?? null, input.updatedAt, input.memoryId);
    const updated = await this.get(input.memoryId);
    if (updated === undefined) throw new Error("V2 memory supersede did not find a row");
    return updated;
  }

  /** Aggregate active memory facts for the operational dashboard. */
  public getMemoryFactStats(): {
    readonly total: number;
    readonly averageImportance: number;
    readonly averageConfidence: number;
    readonly typeDistribution: readonly { readonly kind: string; readonly count: number }[];
  } {
    const summary = this.db.prepare(`
      SELECT
        COUNT(*) AS total,
        AVG(importance) AS average_importance,
        AVG(confidence) AS average_confidence
      FROM v2_memories
      WHERE status = 'active'
    `).get() as {
      readonly total: number;
      readonly average_importance: number | null;
      readonly average_confidence: number | null;
    };

    const kindRows = this.db.prepare(`
      SELECT kind, COUNT(*) AS count
      FROM v2_memories
      WHERE status = 'active'
      GROUP BY kind
      ORDER BY count DESC, kind ASC
    `).all() as unknown as readonly { readonly kind: string; readonly count: number }[];

    return {
      total: summary.total,
      averageImportance: summary.average_importance ?? 0,
      averageConfidence: summary.average_confidence ?? 0,
      typeDistribution: kindRows,
    };
  }
}

export class V2SqliteConversationSummaryRepository implements V2ConversationSummaryRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async get(conversationId: V2ConversationId): Promise<V2ConversationSummary | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_conversation_summaries WHERE conversation_id = ?").get(conversationId) as SummaryRow | undefined;
    return row === undefined ? undefined : mapSummary(row);
  }

  public async save(input: V2ConversationSummary): Promise<V2ConversationSummary> {
    this.db.prepare(`
      INSERT INTO v2_conversation_summaries (
        conversation_id, summary, covered_until_message_id, source_message_count, version, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(conversation_id) DO UPDATE SET
        summary = excluded.summary,
        covered_until_message_id = excluded.covered_until_message_id,
        source_message_count = excluded.source_message_count,
        version = excluded.version,
        updated_at = excluded.updated_at
    `).run(
      input.conversationId,
      input.summary,
      input.coveredUntilMessageId,
      input.sourceMessageCount,
      input.version,
      input.updatedAt ?? new Date().toISOString(),
    );
    const saved = await this.get(input.conversationId as V2ConversationId);
    if (saved === undefined) throw new Error("V2 conversation summary save did not return a row");
    return saved;
  }
}

type TraceRow = {
  trace_id: string;
  conversation_id: string;
  message_id: string | null;
  task: string | null;
  template_id: string | null;
  template_version: string | null;
  context_hash: string | null;
  profile_id: string | null;
  model: string | null;
  context_window: number | null;
  input_budget: number | null;
  estimated_tokens: number | null;
  recent_message_count: number | null;
  memory_ids_json: string | null;
  canon_ids_json: string | null;
  summary_version: number | null;
  image_count: number | null;
  started_at: string;
  first_token_latency_ms: number | null;
  total_latency_ms: number | null;
  status: "pending" | "streaming" | "completed" | "failed";
  error_code: string | null;
};

function mapTrace(row: TraceRow): V2ChatTrace {
  const parseJsonArray = (value: string | null): readonly string[] | undefined => {
    if (value === null) return undefined;
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : undefined;
    } catch {
      return undefined;
    }
  };
  const memoryIds = parseJsonArray(row.memory_ids_json);
  const canonIds = parseJsonArray(row.canon_ids_json);
  return {
    traceId: row.trace_id,
    conversationId: row.conversation_id,
    status: row.status,
    startedAt: row.started_at,
    ...(row.message_id === null ? {} : { messageId: row.message_id }),
    ...(row.task === null ? {} : { task: row.task }),
    ...(row.template_id === null ? {} : { templateId: row.template_id }),
    ...(row.template_version === null ? {} : { templateVersion: row.template_version }),
    ...(row.context_hash === null ? {} : { contextHash: row.context_hash }),
    ...(row.profile_id === null ? {} : { profileId: row.profile_id }),
    ...(row.model === null ? {} : { model: row.model }),
    ...(row.context_window === null ? {} : { contextWindow: row.context_window }),
    ...(row.input_budget === null ? {} : { inputBudget: row.input_budget }),
    ...(row.estimated_tokens === null ? {} : { estimatedTokens: row.estimated_tokens }),
    ...(row.recent_message_count === null ? {} : { recentMessageCount: row.recent_message_count }),
    ...(memoryIds === undefined ? {} : { memoryIds }),
    ...(canonIds === undefined ? {} : { canonIds }),
    ...(row.summary_version === null ? {} : { summaryVersion: row.summary_version }),
    ...(row.image_count === null ? {} : { imageCount: row.image_count }),
    ...(row.first_token_latency_ms === null ? {} : { firstTokenLatencyMs: row.first_token_latency_ms }),
    ...(row.total_latency_ms === null ? {} : { totalLatencyMs: row.total_latency_ms }),
    ...(row.error_code === null ? {} : { errorCode: row.error_code }),
  };
}

export class V2SqliteChatTraceRepository implements V2ChatTraceRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async create(input: V2ChatTrace): Promise<V2ChatTrace> {
    this.db.prepare(`
      INSERT INTO v2_chat_traces (
        trace_id, conversation_id, message_id, task, template_id, template_version, context_hash,
        profile_id, model, context_window, input_budget, estimated_tokens, recent_message_count,
        memory_ids_json, canon_ids_json, summary_version, image_count, started_at,
        first_token_latency_ms, total_latency_ms, status, error_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.traceId,
      input.conversationId,
      input.messageId ?? null,
      input.task ?? null,
      input.templateId ?? null,
      input.templateVersion ?? null,
      input.contextHash ?? null,
      input.profileId ?? null,
      input.model ?? null,
      input.contextWindow ?? null,
      input.inputBudget ?? null,
      input.estimatedTokens ?? null,
      input.recentMessageCount ?? null,
      input.memoryIds === undefined ? null : JSON.stringify(input.memoryIds),
      input.canonIds === undefined ? null : JSON.stringify(input.canonIds),
      input.summaryVersion ?? null,
      input.imageCount ?? null,
      input.startedAt,
      input.firstTokenLatencyMs ?? null,
      input.totalLatencyMs ?? null,
      input.status,
      input.errorCode ?? null,
    );
    return input;
  }

  public async update(input: {
    readonly traceId: string;
    readonly patch: {
      readonly status?: V2ChatTraceStatus;
      readonly messageId?: string;
      readonly firstTokenLatencyMs?: number;
      readonly totalLatencyMs?: number;
      readonly errorCode?: string;
    };
  }): Promise<void> {
    const fields: string[] = [];
    const values: (string | number)[] = [];
    if (input.patch.status !== undefined) {
      fields.push("status = ?");
      values.push(input.patch.status);
    }
    if (input.patch.messageId !== undefined) {
      fields.push("message_id = ?");
      values.push(input.patch.messageId);
    }
    if (input.patch.firstTokenLatencyMs !== undefined) {
      fields.push("first_token_latency_ms = ?");
      values.push(input.patch.firstTokenLatencyMs);
    }
    if (input.patch.totalLatencyMs !== undefined) {
      fields.push("total_latency_ms = ?");
      values.push(input.patch.totalLatencyMs);
    }
    if (input.patch.errorCode !== undefined) {
      fields.push("error_code = ?");
      values.push(input.patch.errorCode);
    }
    if (fields.length === 0) return;
    this.db.prepare(`UPDATE v2_chat_traces SET ${fields.join(", ")} WHERE trace_id = ?`).run(...values, input.traceId);
  }

  public async getLatest(conversationId: V2ConversationId): Promise<V2ChatTrace | undefined> {
    const row = this.db.prepare(`
      SELECT * FROM v2_chat_traces
      WHERE conversation_id = ?
      ORDER BY started_at DESC, trace_id DESC
      LIMIT 1
    `).get(conversationId) as TraceRow | undefined;
    return row === undefined ? undefined : mapTrace(row);
  }
}

export class V2SqliteChatMaintenanceJobRepository implements V2ChatMaintenanceJobRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async enqueue(input: V2ChatMaintenanceJob): Promise<V2ChatMaintenanceJob> {
    const now = new Date().toISOString();
    const payloadStr = typeof input.payload === "string" ? input.payload : JSON.stringify(input.payload);
    this.db.prepare(`
      INSERT INTO v2_chat_maintenance_jobs (
        job_id, conversation_id, job_type, status, payload, attempts, max_attempts,
        available_at, lease_expires_at, claimed_by, last_started_at, created_at, updated_at, last_error, dedupe_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.jobId,
      input.conversationId,
      input.jobType,
      input.status,
      payloadStr,
      input.attempts,
      input.maxAttempts,
      input.availableAt,
      input.leaseExpiresAt ?? null,
      input.claimedBy ?? null,
      input.lastStartedAt ?? null,
      input.createdAt ?? now,
      input.updatedAt ?? now,
      input.lastError ?? null,
      input.dedupeKey ?? null,
    );
    const created = await this.get(input.jobId);
    if (created === undefined) throw new Error("V2 maintenance job enqueue did not return a row");
    return created;
  }

  public async get(jobId: string): Promise<V2ChatMaintenanceJob | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_chat_maintenance_jobs WHERE job_id = ?").get(jobId) as MaintenanceJobRow | undefined;
    return row === undefined ? undefined : mapMaintenanceJob(row);
  }

  public async hasActiveJob(conversationId: V2ConversationId, jobType: string): Promise<boolean> {
    const row = this.db.prepare(`
      SELECT 1 FROM v2_chat_maintenance_jobs
      WHERE conversation_id = ? AND job_type = ? AND status IN ('pending', 'claimed', 'running')
      LIMIT 1
    `).get(conversationId, jobType);
    return row !== undefined;
  }

  public async getMemoryExtractCursor(conversationId: V2ConversationId): Promise<V2MessageId | undefined> {
    const row = this.db.prepare(`
      SELECT memory_extracted_until_message_id AS cursor_message_id
      FROM v2_chat_maintenance_cursors
      WHERE conversation_id = ?
    `).get(conversationId) as { readonly cursor_message_id: string | null } | undefined;
    return row?.cursor_message_id === undefined || row.cursor_message_id === null
      ? undefined
      : (row.cursor_message_id as V2MessageId);
  }

  public async setMemoryExtractCursor(conversationId: V2ConversationId, messageId: V2MessageId): Promise<void> {
    this.db.prepare(`
      INSERT INTO v2_chat_maintenance_cursors (conversation_id, memory_extracted_until_message_id, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(conversation_id) DO UPDATE SET
        memory_extracted_until_message_id = excluded.memory_extracted_until_message_id,
        updated_at = excluded.updated_at
    `).run(conversationId, messageId, new Date().toISOString());
  }

  public async getStoryAnalyzeCursor(conversationId: V2ConversationId): Promise<V2MessageId | undefined> {
    const row = this.db.prepare(`
      SELECT story_analyzed_until_message_id AS cursor_message_id
      FROM v2_chat_maintenance_cursors
      WHERE conversation_id = ?
    `).get(conversationId) as { readonly cursor_message_id: string | null } | undefined;
    return row?.cursor_message_id === undefined || row.cursor_message_id === null
      ? undefined
      : (row.cursor_message_id as V2MessageId);
  }

  public async setStoryAnalyzeCursor(conversationId: V2ConversationId, messageId: V2MessageId): Promise<void> {
    this.db.prepare(`
      INSERT INTO v2_chat_maintenance_cursors (conversation_id, memory_extracted_until_message_id, story_analyzed_until_message_id, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(conversation_id) DO UPDATE SET
        memory_extracted_until_message_id = COALESCE(excluded.memory_extracted_until_message_id, v2_chat_maintenance_cursors.memory_extracted_until_message_id),
        story_analyzed_until_message_id = excluded.story_analyzed_until_message_id,
        updated_at = excluded.updated_at
    `).run(conversationId, null, messageId, new Date().toISOString());
  }

  public async claimNext(input: {
    readonly workerId: string;
    readonly leaseDurationMs: number;
    readonly now: string;
  }): Promise<V2ChatMaintenanceJob | undefined> {
    const leaseExpiresAt = new Date(new Date(input.now).getTime() + input.leaseDurationMs).toISOString();

    // Find candidate job: status is pending or (status is claimed/running with expired lease),
    // and available_at <= now, and attempts < max_attempts
    const candidate = this.db.prepare(`
      SELECT job_id FROM v2_chat_maintenance_jobs
      WHERE (
        status = 'pending'
        OR (status IN ('claimed', 'running') AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
      )
      AND available_at <= ?
      AND attempts < max_attempts
      ORDER BY available_at ASC, job_id ASC
      LIMIT 1
    `).get(input.now, input.now) as { job_id: string } | undefined;

    if (!candidate) {
      return undefined;
    }

    this.db.prepare(`
      UPDATE v2_chat_maintenance_jobs
      SET
        status = 'claimed',
        claimed_by = ?,
        lease_expires_at = ?,
        attempts = attempts + 1,
        last_started_at = ?,
        updated_at = ?
      WHERE job_id = ?
    `).run(
      input.workerId,
      leaseExpiresAt,
      input.now,
      input.now,
      candidate.job_id,
    );

    const row = this.db.prepare("SELECT * FROM v2_chat_maintenance_jobs WHERE job_id = ?").get(candidate.job_id) as MaintenanceJobRow | undefined;
    return row === undefined ? undefined : mapMaintenanceJob(row);
  }

  public async renewLease(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly leaseExpiresAt: string;
    readonly now: string;
  }): Promise<boolean> {
    const result = this.db.prepare(`
      UPDATE v2_chat_maintenance_jobs
      SET lease_expires_at = ?, updated_at = ?
      WHERE job_id = ? AND claimed_by = ? AND status IN ('claimed', 'running')
    `).run(input.leaseExpiresAt, input.now, input.jobId, input.workerId);
    return Number(result.changes) > 0;
  }

  public async markCompleted(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly now: string;
  }): Promise<boolean> {
    const result = this.db.prepare(`
      UPDATE v2_chat_maintenance_jobs
      SET
        status = 'completed',
        lease_expires_at = NULL,
        updated_at = ?,
        last_error = NULL
      WHERE job_id = ? AND claimed_by = ? AND status IN ('claimed', 'running')
    `).run(input.now, input.jobId, input.workerId);
    return Number(result.changes) > 0;
  }

  public async markFailed(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly error: string;
    readonly retryAvailableAt?: string;
    readonly isTerminal: boolean;
    readonly now: string;
  }): Promise<boolean> {
    const nextStatus = input.isTerminal ? "failed" : "pending";
    const availableAt = input.retryAvailableAt ?? input.now;

    const result = this.db.prepare(`
      UPDATE v2_chat_maintenance_jobs
      SET
        status = ?,
        available_at = ?,
        lease_expires_at = NULL,
        claimed_by = NULL,
        updated_at = ?,
        last_error = ?
      WHERE job_id = ? AND claimed_by = ? AND status IN ('claimed', 'running')
    `).run(nextStatus, availableAt, input.now, input.error, input.jobId, input.workerId);
    return Number(result.changes) > 0;
  }

  public async findJobByDedupeKey(jobType: string, dedupeKey: string): Promise<V2ChatMaintenanceJob | undefined> {
    const row = this.db.prepare(`
      SELECT * FROM v2_chat_maintenance_jobs
      WHERE job_type = ? AND dedupe_key = ?
      LIMIT 1
    `).get(jobType, dedupeKey) as MaintenanceJobRow | undefined;
    return row === undefined ? undefined : mapMaintenanceJob(row);
  }

  public async isLeaseOwner(input: {
    readonly jobId: string;
    readonly workerId: string;
    readonly now: string;
  }): Promise<boolean> {
    const row = this.db.prepare(`
      SELECT 1 FROM v2_chat_maintenance_jobs
      WHERE job_id = ? AND claimed_by = ?
        AND status IN ('claimed', 'running')
        AND lease_expires_at IS NOT NULL AND lease_expires_at > ?
      LIMIT 1
    `).get(input.jobId, input.workerId, input.now);
    return row !== undefined;
  }

  /** Cursor-paginated job listing with status/type filters (no full-history dump). */
  public listJobs(input: {
    readonly status?: string;
    readonly type?: string;
    readonly limit: number;
    readonly cursor?: { readonly createdAt: string; readonly jobId: string };
  }): { readonly items: readonly V2ChatMaintenanceJob[]; readonly nextCursor?: { readonly createdAt: string; readonly jobId: string } } {
    const limit = Math.min(Math.max(input.limit, 1), 100);
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    if (input.status !== undefined) {
      conditions.push("status = ?");
      values.push(input.status);
    }
    if (input.type !== undefined) {
      conditions.push("job_type = ?");
      values.push(input.type);
    }
    if (input.cursor !== undefined) {
      conditions.push("(created_at, job_id) < (?, ?)");
      values.push(input.cursor.createdAt, input.cursor.jobId);
    }
    values.push(limit + 1);
    const rows = this.db.prepare(`
      SELECT * FROM v2_chat_maintenance_jobs
      ${conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`}
      ORDER BY created_at DESC, job_id DESC
      LIMIT ?
    `).all(...values) as MaintenanceJobRow[];
    const hasMore = rows.length > limit;
    const visible = rows.slice(0, limit);
    const last = visible[visible.length - 1];
    return {
      items: visible.map(mapMaintenanceJob),
      ...(hasMore && last !== undefined ? { nextCursor: { createdAt: last.created_at, jobId: last.job_id } } : {}),
    };
  }

  /** Global maintenance job counts by status for the Automation overview. */
  public getJobOverview(): {
    readonly pending: number;
    readonly claimed: number;
    readonly running: number;
    readonly completed: number;
    readonly failed: number;
  } {
    const rows = this.db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM v2_chat_maintenance_jobs
      GROUP BY status
    `).all() as Array<{ readonly status: string; readonly count: number }>;
    const counts = {
      pending: 0,
      claimed: 0,
      running: 0,
      completed: 0,
      failed: 0,
    };
    for (const row of rows) {
      if (row.status === "pending" || row.status === "claimed" || row.status === "running" || row.status === "completed" || row.status === "failed") {
        counts[row.status] = row.count;
      }
    }
    return counts;
  }

  /** Windowed memory runtime counts for Diagnostics. */
  public getMemoryDiagnosticsJobCounts(since: string): {
    readonly extraction: { readonly completed: number; readonly failed: number };
    readonly consolidation: { readonly completed: number; readonly failed: number };
    readonly engineConsume: { readonly completed: number; readonly failed: number };
    readonly currentFailedJobs: number;
  } {
    const count = (jobType: string, status: string): number => {
      const row = this.db.prepare(`
        SELECT COUNT(*) AS count
        FROM v2_chat_maintenance_jobs
        WHERE job_type = ? AND status = ? AND updated_at >= ?
      `).get(jobType, status, since) as { readonly count: number };
      return row.count;
    };
    const currentFailed = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM v2_chat_maintenance_jobs
      WHERE job_type IN ('memory_extract', 'memory_consolidate', 'memory_engine_consume')
        AND status = 'failed'
    `).get() as { readonly count: number };
    return {
      extraction: {
        completed: count("memory_extract", "completed"),
        failed: count("memory_extract", "failed"),
      },
      consolidation: {
        completed: count("memory_consolidate", "completed"),
        failed: count("memory_consolidate", "failed"),
      },
      engineConsume: {
        completed: count("memory_engine_consume", "completed"),
        failed: count("memory_engine_consume", "failed"),
      },
      currentFailedJobs: currentFailed.count,
    };
  }

  /** Requeue a terminal failed job so the worker picks it up again. */
  public retryFailed(input: { readonly jobId: string; readonly now: string }): V2ChatMaintenanceJob | undefined {
    // A manual retry grants one additional execution opportunity while
    // preserving the original attempt history. A terminal failed job has
    // attempts >= max_attempts, so simply resetting status to 'pending'
    // would make it unclaimable (claimNext requires attempts < max_attempts).
    const result = this.db.prepare(`
      UPDATE v2_chat_maintenance_jobs
      SET
        status = 'pending',
        available_at = ?,
        lease_expires_at = NULL,
        claimed_by = NULL,
        last_error = NULL,
        max_attempts = CASE WHEN max_attempts <= attempts THEN attempts + 1 ELSE max_attempts END,
        updated_at = ?
      WHERE job_id = ? AND status = 'failed'
    `).run(input.now, input.now, input.jobId);
    if (Number(result.changes) === 0) return undefined;
    const row = this.db.prepare("SELECT * FROM v2_chat_maintenance_jobs WHERE job_id = ?").get(input.jobId) as MaintenanceJobRow | undefined;
    return row === undefined ? undefined : mapMaintenanceJob(row);
  }

  /** Latest run (any terminal status) of a given job type. */
  public getLatestRun(jobType: string): V2ChatMaintenanceJob | undefined {
    const row = this.db.prepare(`
      SELECT * FROM v2_chat_maintenance_jobs
      WHERE job_type = ? AND status IN ('completed', 'failed')
      ORDER BY updated_at DESC, job_id DESC
      LIMIT 1
    `).get(jobType) as MaintenanceJobRow | undefined;
    return row === undefined ? undefined : mapMaintenanceJob(row);
  }

  /** Latest failed run of a given job type. */
  public getLatestFailure(jobType: string): V2ChatMaintenanceJob | undefined {
    const row = this.db.prepare(`
      SELECT * FROM v2_chat_maintenance_jobs
      WHERE job_type = ? AND status = 'failed'
      ORDER BY updated_at DESC, job_id DESC
      LIMIT 1
    `).get(jobType) as MaintenanceJobRow | undefined;
    return row === undefined ? undefined : mapMaintenanceJob(row);
  }

  /** Most recent failed memory-related jobs (extraction/consolidation). */
  public getRecentMemoryFailures(limit: number): readonly V2ChatMaintenanceJob[] {
    const rows = this.db.prepare(`
      SELECT * FROM v2_chat_maintenance_jobs
      WHERE job_type IN ('memory_extract', 'memory_consolidate', 'memory_engine_consume')
        AND status = 'failed'
      ORDER BY updated_at DESC, job_id DESC
      LIMIT ?
    `).all(limit) as MaintenanceJobRow[];
    return rows.map(mapMaintenanceJob);
  }
}
