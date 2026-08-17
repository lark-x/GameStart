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
  V2ConversationSummary,
  V2Memory,
} from "@living-network/domain/v2";
import type {
  V2CanonRepository,
  V2ChatConversationRepository,
  V2ChatMaintenanceJobRepository,
  V2ChatMediaRepository,
  V2ChatMessageRepository,
  V2ChatUnitOfWork,
  V2ConversationSummaryRepository,
  V2MemoryRepository,
} from "@living-network/ports/v2";
import { V2SqliteCanonRepository } from "../core/index.ts";
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

type MemoryRow = {
  memory_id: string;
  story_world_id: string;
  conversation_id: string | null;
  character_id: string | null;
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

type MaintenanceRow = {
  job_id: string;
  conversation_id: string;
  job_type: "memory_extract" | "conversation_summary" | "memory_consolidate" | "story_analyze";
  status: "pending" | "claimed" | "running" | "succeeded" | "failed" | "cancelled";
  payload_json: string;
  attempts: number;
  available_at: string;
  created_at: string;
  updated_at: string;
  last_error: string | null;
  dedupe_key: string;
};

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

function mapMaintenance(row: MaintenanceRow): V2ChatMaintenanceJob {
  return {
    jobId: row.job_id,
    conversationId: row.conversation_id,
    jobType: row.job_type,
    status: row.status,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    attempts: row.attempts,
    availableAt: row.available_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.last_error === null ? {} : { lastError: row.last_error }),
    dedupeKey: row.dedupe_key,
  };
}

export class V2SqliteChatUnitOfWork implements V2ChatUnitOfWork {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async withChatTransaction<T>(fn: (repositories: {
    readonly canon: V2CanonRepository;
    readonly conversations: V2ChatConversationRepository;
    readonly messages: V2ChatMessageRepository;
    readonly media: V2ChatMediaRepository;
    readonly memories: V2MemoryRepository;
    readonly summaries: V2ConversationSummaryRepository;
    readonly maintenanceJobs: V2ChatMaintenanceJobRepository;
  }) => Promise<T>): Promise<T> {
    return withV2SqliteAsyncTransaction(this.db, () => fn({
      canon: new V2SqliteCanonRepository(this.db),
      conversations: new V2SqliteChatConversationRepository(this.db),
      messages: new V2SqliteChatMessageRepository(this.db),
      media: new V2SqliteChatMediaRepository(this.db),
      memories: new V2SqliteMemoryRepository(this.db),
      summaries: new V2SqliteConversationSummaryRepository(this.db),
      maintenanceJobs: new V2SqliteChatMaintenanceJobRepository(this.db),
    }));
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

  public async findByIdempotencyKey(conversationId: V2ConversationId, idempotencyKey: string): Promise<V2ChatMessage | undefined> {
    const row = this.db.prepare(`
      SELECT * FROM v2_chat_messages
      WHERE conversation_id = ? AND idempotency_key = ?
      LIMIT 1
    `).get(conversationId, idempotencyKey) as MessageRow | undefined;
    return row === undefined ? undefined : mapMessage(row);
  }

  public async countByConversation(conversationId: V2ConversationId): Promise<number> {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM v2_chat_messages WHERE conversation_id = ?").get(conversationId) as { readonly count: number };
    return row.count;
  }

  public async countUserMessagesByConversation(conversationId: V2ConversationId): Promise<number> {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM v2_chat_messages WHERE conversation_id = ? AND role = 'user'").get(conversationId) as { readonly count: number };
    return row.count;
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
        memory_id, story_world_id, conversation_id, character_id, kind, content, importance,
        confidence, source_message_ids_json, status, supersedes_memory_id, created_at, updated_at, last_accessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.memoryId,
      input.storyWorldId,
      input.conversationId ?? null,
      input.characterId ?? null,
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

  public async listActiveByStoryWorld(storyWorldId: V2StoryWorldId): Promise<readonly V2Memory[]> {
    const rows = this.db.prepare(`
      SELECT * FROM v2_memories
      WHERE story_world_id = ? AND status = 'active'
      ORDER BY importance DESC, updated_at DESC
    `).all(storyWorldId) as MemoryRow[];
    return rows.map(mapMemory);
  }

  public async searchActive(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly query: string;
    readonly limit?: number;
  }): Promise<readonly V2Memory[]> {
    const limit = Math.min(input.limit ?? 10, 20);
    const tokens = input.query.trim().split(/\s+/).filter(Boolean).slice(0, 8);
    if (tokens.length === 0) {
      return (await this.listActiveByStoryWorld(input.storyWorldId)).slice(0, limit);
    }
    const match = tokens.map((token) => `"${token.replace(/"/g, "")}"`).join(" OR ");
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
      rows = this.db.prepare(`
        SELECT * FROM v2_memories
        WHERE story_world_id = ? AND status = 'active'
          AND (content LIKE '%' || ? || '%')
        ORDER BY importance DESC, updated_at DESC
        LIMIT ?
      `).all(input.storyWorldId, input.query, limit) as MemoryRow[];
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

export class V2SqliteChatMaintenanceJobRepository implements V2ChatMaintenanceJobRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async create(input: V2ChatMaintenanceJob): Promise<V2ChatMaintenanceJob> {
    this.db.prepare(`
      INSERT INTO v2_chat_maintenance_jobs (
        job_id, conversation_id, job_type, status, payload_json, attempts, available_at,
        created_at, updated_at, last_error, dedupe_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(conversation_id, job_type, dedupe_key) DO NOTHING
    `).run(
      input.jobId,
      input.conversationId,
      input.jobType,
      input.status,
      JSON.stringify(input.payload),
      input.attempts,
      input.availableAt,
      input.createdAt,
      input.updatedAt,
      input.lastError ?? null,
      input.dedupeKey,
    );
    const existing = await this.findByDedupeKey({
      conversationId: input.conversationId as V2ConversationId,
      jobType: input.jobType,
      dedupeKey: input.dedupeKey,
    });
    if (existing === undefined) throw new Error("V2 chat maintenance job insert did not return a row");
    return existing;
  }

  public async findByDedupeKey(input: {
    readonly conversationId: V2ConversationId;
    readonly jobType: V2ChatMaintenanceJob["jobType"];
    readonly dedupeKey: string;
  }): Promise<V2ChatMaintenanceJob | undefined> {
    const row = this.db.prepare(`
      SELECT * FROM v2_chat_maintenance_jobs
      WHERE conversation_id = ? AND job_type = ? AND dedupe_key = ?
      LIMIT 1
    `).get(input.conversationId, input.jobType, input.dedupeKey) as MaintenanceRow | undefined;
    return row === undefined ? undefined : mapMaintenance(row);
  }

  public async listPending(limit = 50): Promise<readonly V2ChatMaintenanceJob[]> {
    const rows = this.db.prepare(`
      SELECT * FROM v2_chat_maintenance_jobs
      WHERE status = 'pending' AND available_at <= ?
      ORDER BY created_at ASC
      LIMIT ?
    `).all(new Date().toISOString(), limit) as MaintenanceRow[];
    return rows.map(mapMaintenance);
  }

  public async markClaimed(input: {
    readonly jobId: string;
    readonly claimedAt: string;
    readonly leaseExpiresAt: string;
  }): Promise<V2ChatMaintenanceJob> {
    this.db.prepare(`
      UPDATE v2_chat_maintenance_jobs
      SET status = 'claimed', updated_at = ?
      WHERE job_id = ? AND status = 'pending'
    `).run(input.claimedAt, input.jobId);
    return this.requireJob(input.jobId);
  }

  public async complete(input: { readonly jobId: string; readonly completedAt: string }): Promise<V2ChatMaintenanceJob> {
    this.db.prepare(`
      UPDATE v2_chat_maintenance_jobs
      SET status = 'succeeded', updated_at = ?, last_error = NULL
      WHERE job_id = ?
    `).run(input.completedAt, input.jobId);
    return this.requireJob(input.jobId);
  }

  public async fail(input: { readonly jobId: string; readonly error: string; readonly updatedAt: string }): Promise<V2ChatMaintenanceJob> {
    this.db.prepare(`
      UPDATE v2_chat_maintenance_jobs
      SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = ?
      WHERE job_id = ?
    `).run(input.error, input.updatedAt, input.jobId);
    return this.requireJob(input.jobId);
  }

  private requireJob(jobId: string): V2ChatMaintenanceJob {
    const row = this.db.prepare("SELECT * FROM v2_chat_maintenance_jobs WHERE job_id = ?").get(jobId) as MaintenanceRow | undefined;
    if (row === undefined) throw new Error(`V2 chat maintenance job not found: ${jobId}`);
    return mapMaintenance(row);
  }
}
