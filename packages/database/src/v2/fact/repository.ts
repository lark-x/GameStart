import type { DatabaseSync } from "node:sqlite";

import type {
  V2ConversationId,
  V2FactEpistemicStatus,
  V2FactExtractorVersion,
  V2MessageId,
} from "@living-network/contracts/v2";
import type {
  V2FactAssertion,
  V2FactAssertionBatch,
  V2FactBatchStatus,
} from "@living-network/domain/v2";
import type { V2FactRepository } from "@living-network/ports/v2";

type FactBatchRow = {
  batch_id: string;
  story_world_id: string;
  conversation_id: string;
  from_message_id: string;
  to_message_id: string;
  source_message_ids_json: string;
  source_hash: string;
  extractor_version: string;
  status: "pending" | "completed" | "failed";
  created_at: string;
  completed_at: string | null;
};

type FactAssertionRow = {
  assertion_id: string;
  batch_id: string;
  story_world_id: string;
  conversation_id: string;
  scope_type: "user" | "world" | "character" | "conversation";
  scope_id: string;
  subject_entity_type: string;
  subject_entity_id: string;
  subject_label: string | null;
  predicate: string;
  object_type: "text" | "number" | "boolean" | "entity";
  object_value_json: string;
  object_entity_id: string | null;
  kind: string;
  text: string;
  change_hint: string;
  epistemic_status: string | null;
  confidence: number;
  importance_hint: number;
  source_message_ids_json: string;
  observed_at: string;
  extractor_version: string;
  created_at: string;
};

type EngineOffsetRow = {
  engine_id: string;
  scope_key: string;
  last_batch_id: string | null;
  updated_at: string;
};

function parseJsonArray(value: string): readonly string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseObjectValue(value: string): string | number | boolean {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed as string | number | boolean;
  } catch {
    return value;
  }
}

function mapFactBatch(row: FactBatchRow): V2FactAssertionBatch {
  return {
    batchId: row.batch_id,
    storyWorldId: row.story_world_id,
    conversationId: row.conversation_id,
    fromMessageId: row.from_message_id,
    toMessageId: row.to_message_id,
    sourceMessageIds: parseJsonArray(row.source_message_ids_json),
    sourceHash: row.source_hash,
    extractorVersion: row.extractor_version,
    status: row.status,
    createdAt: row.created_at,
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at }),
  };
}

function mapFactAssertion(row: FactAssertionRow): V2FactAssertion {
  return {
    assertionId: row.assertion_id,
    batchId: row.batch_id,
    storyWorldId: row.story_world_id,
    conversationId: row.conversation_id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    subject: {
      entityType: row.subject_entity_type as V2FactAssertion["subject"]["entityType"],
      entityId: row.subject_entity_id,
      ...(row.subject_label === null ? {} : { label: row.subject_label }),
    },
    predicate: row.predicate,
    object: {
      type: row.object_type,
      value: parseObjectValue(row.object_value_json),
      ...(row.object_entity_id === null ? {} : { entityId: row.object_entity_id }),
    },
    kind: row.kind as V2FactAssertion["kind"],
    text: row.text,
    changeHint: row.change_hint as V2FactAssertion["changeHint"],
    ...(row.epistemic_status === null ? {} : { epistemicStatus: row.epistemic_status as V2FactEpistemicStatus }),
    confidence: row.confidence,
    importanceHint: row.importance_hint,
    sourceMessageIds: parseJsonArray(row.source_message_ids_json),
    observedAt: row.observed_at,
    extractorVersion: row.extractor_version,
  };
}

export class V2SqliteFactRepository implements V2FactRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async createBatch(input: V2FactAssertionBatch): Promise<V2FactAssertionBatch> {
    this.db.prepare(`
      INSERT INTO v2_fact_batches (
        batch_id, story_world_id, conversation_id, from_message_id, to_message_id,
        source_message_ids_json, source_hash, extractor_version, status, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.batchId,
      input.storyWorldId,
      input.conversationId,
      input.fromMessageId,
      input.toMessageId,
      JSON.stringify(input.sourceMessageIds),
      input.sourceHash,
      input.extractorVersion,
      input.status,
      input.createdAt,
      input.completedAt ?? null,
    );
    const created = await this.getBatch(input.batchId);
    if (created === undefined) throw new Error("V2 fact batch insert did not return a row");
    return created;
  }

  public async getBatch(batchId: string): Promise<V2FactAssertionBatch | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_fact_batches WHERE batch_id = ?").get(batchId) as FactBatchRow | undefined;
    return row === undefined ? undefined : mapFactBatch(row);
  }

  public async findBatchByRange(input: {
    readonly conversationId: V2ConversationId;
    readonly fromMessageId: V2MessageId;
    readonly toMessageId: V2MessageId;
    readonly extractorVersion: V2FactExtractorVersion;
  }): Promise<V2FactAssertionBatch | undefined> {
    const row = this.db.prepare(`
      SELECT * FROM v2_fact_batches
      WHERE conversation_id = ? AND from_message_id = ? AND to_message_id = ? AND extractor_version = ?
      LIMIT 1
    `).get(input.conversationId, input.fromMessageId, input.toMessageId, input.extractorVersion) as FactBatchRow | undefined;
    return row === undefined ? undefined : mapFactBatch(row);
  }

  public async listBatchesByConversation(
    conversationId: V2ConversationId,
    options: { readonly limit?: number; readonly afterBatchId?: string } = {},
  ): Promise<readonly V2FactAssertionBatch[]> {
    const limit = Math.min(Math.max(1, options.limit ?? 100), 500);
    if (options.afterBatchId === undefined) {
      return (this.db.prepare(`
        SELECT * FROM v2_fact_batches
        WHERE conversation_id = ?
        ORDER BY created_at ASC, batch_id ASC
        LIMIT ?
      `).all(conversationId, limit) as FactBatchRow[]).map(mapFactBatch);
    }
    const after = this.db.prepare("SELECT created_at FROM v2_fact_batches WHERE batch_id = ?").get(options.afterBatchId) as { readonly created_at: string } | undefined;
    if (after === undefined) return [];
    return (this.db.prepare(`
      SELECT * FROM v2_fact_batches
      WHERE conversation_id = ? AND (created_at > ? OR (created_at = ? AND batch_id > ?))
      ORDER BY created_at ASC, batch_id ASC
      LIMIT ?
    `).all(conversationId, after.created_at, after.created_at, options.afterBatchId, limit) as FactBatchRow[]).map(mapFactBatch);
  }

  public async updateBatchStatus(input: {
    readonly batchId: string;
    readonly status: V2FactBatchStatus;
    readonly completedAt?: string;
  }): Promise<V2FactAssertionBatch | undefined> {
    this.db.prepare(`
      UPDATE v2_fact_batches
      SET status = ?, completed_at = COALESCE(?, completed_at)
      WHERE batch_id = ?
    `).run(input.status, input.completedAt ?? null, input.batchId);
    return this.getBatch(input.batchId);
  }

  public async createAssertions(input: readonly V2FactAssertion[]): Promise<readonly V2FactAssertion[]> {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO v2_fact_assertions (
        assertion_id, batch_id, story_world_id, conversation_id, scope_type, scope_id,
        subject_entity_type, subject_entity_id, subject_label, predicate, object_type, object_value_json,
        object_entity_id, kind, text, change_hint, epistemic_status, confidence, importance_hint,
        source_message_ids_json, observed_at, extractor_version, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();
    for (const assertion of input) {
      insert.run(
        assertion.assertionId,
        assertion.batchId,
        assertion.storyWorldId,
        assertion.conversationId,
        assertion.scopeType,
        assertion.scopeId,
        assertion.subject.entityType,
        assertion.subject.entityId,
        assertion.subject.label ?? null,
        assertion.predicate,
        assertion.object.type,
        JSON.stringify(assertion.object.value),
        assertion.object.entityId ?? null,
        assertion.kind,
        assertion.text,
        assertion.changeHint,
        assertion.epistemicStatus ?? null,
        assertion.confidence,
        assertion.importanceHint,
        JSON.stringify(assertion.sourceMessageIds),
        assertion.observedAt,
        assertion.extractorVersion,
        now,
      );
    }
    return input;
  }

  public async listAssertionsByBatch(batchId: string): Promise<readonly V2FactAssertion[]> {
    return (this.db.prepare(`
      SELECT * FROM v2_fact_assertions
      WHERE batch_id = ?
      ORDER BY assertion_id ASC
    `).all(batchId) as FactAssertionRow[]).map(mapFactAssertion);
  }

  public async listAssertionsByConversation(
    conversationId: V2ConversationId,
    options: { readonly limit?: number; readonly extractorVersion?: V2FactExtractorVersion } = {},
  ): Promise<readonly V2FactAssertion[]> {
    const limit = Math.min(Math.max(1, options.limit ?? 200), 1000);
    if (options.extractorVersion === undefined) {
      return (this.db.prepare(`
        SELECT * FROM v2_fact_assertions
        WHERE conversation_id = ?
        ORDER BY observed_at ASC, assertion_id ASC
        LIMIT ?
      `).all(conversationId, limit) as FactAssertionRow[]).map(mapFactAssertion);
    }
    return (this.db.prepare(`
      SELECT * FROM v2_fact_assertions
      WHERE conversation_id = ? AND extractor_version = ?
      ORDER BY observed_at ASC, assertion_id ASC
      LIMIT ?
    `).all(conversationId, options.extractorVersion, limit) as FactAssertionRow[]).map(mapFactAssertion);
  }

  public async getAssertion(assertionId: string): Promise<V2FactAssertion | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_fact_assertions WHERE assertion_id = ?").get(assertionId) as FactAssertionRow | undefined;
    return row === undefined ? undefined : mapFactAssertion(row);
  }

  public async getEngineOffset(engineId: string, scopeKey: string): Promise<string | undefined> {
    const row = this.db.prepare(`
      SELECT last_batch_id FROM v2_memory_engine_offsets
      WHERE engine_id = ? AND scope_key = ?
    `).get(engineId, scopeKey) as { readonly last_batch_id: string | null } | undefined;
    return row?.last_batch_id === undefined || row.last_batch_id === null ? undefined : row.last_batch_id;
  }

  public async setEngineOffset(engineId: string, scopeKey: string, lastBatchId: string): Promise<void> {
    this.db.prepare(`
      INSERT INTO v2_memory_engine_offsets (engine_id, scope_key, last_batch_id, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(engine_id, scope_key) DO UPDATE SET
        last_batch_id = excluded.last_batch_id,
        updated_at = excluded.updated_at
    `).run(engineId, scopeKey, lastBatchId, new Date().toISOString());
  }
}
