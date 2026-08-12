import {
  createConversation,
  createStoryWorld,
  assertMemoryItem,
  assertWorldLoreEntry,
  type ConversationAggregate,
  type StoryMode as StoryModeValue,
  type ConversationType as ConversationTypeValue,
  type Message,
  type MessageKind as MessageKindValue,
  type MemoryItem,
  type MemorySearchQuery,
  type MemorySearchResult,
  type WorldLoreEntry,
} from "@living-network/domain";
import type {
  ConversationRepository,
  MessageRepository,
  MessageWriteResult,
  MemoryRepository,
  WorldLoreEntryRepository,
} from "../repositories.ts";
import {
  type SqlClient,
  type SqlRow,
  requiredString,
  optionalString,
  requiredBoolean,
  requiredNumber,
  requiredTimestamp,
  optionalTimestamp,
  stringArray,
} from "./utils.ts";
import { mapCharacterRow } from "./core-identity.ts";

function mapConversationRows(rows: readonly SqlRow[]): ConversationAggregate[] {
  const groups = new Map<string, SqlRow[]>();
  for (const row of rows) {
    const id = requiredString(row.conversation_id, "conversations.id");
    const group = groups.get(id);
    if (group) group.push(row);
    else groups.set(id, [row]);
  }

  return [...groups.values()].map((group) => {
    const first = group[0];
    if (!first) throw new TypeError("Database returned an empty conversation group");
    const storyWorld = createStoryWorld({
      id: requiredString(first.world_id, "story_worlds.id"),
      name: requiredString(first.world_name, "story_worlds.name"),
      timezone: requiredString(first.world_timezone, "story_worlds.timezone"),
      storyMode: requiredString(first.world_story_mode, "story_worlds.story_mode") as StoryModeValue,
      relationshipDynamicsEnabled: requiredBoolean(
        first.world_relationship_dynamics_enabled,
        "story_worlds.relationship_dynamics_enabled",
      ),
    });
    const characters = group.map((row) => mapCharacterRow(row, "member_"));
    const title = optionalString(first.conversation_title, "conversations.title");
    const conversationInput = {
      id: requiredString(first.conversation_id, "conversations.id"),
      storyWorld: storyWorld,
      type: requiredString(first.conversation_type, "conversations.type") as ConversationTypeValue,
      createdAt: requiredTimestamp(first.conversation_created_at, "conversations.created_at"),
      members: characters,
    };
    const created = title === undefined
      ? createConversation(conversationInput)
      : createConversation({ ...conversationInput, title });
    return {
      conversation: created.conversation,
      members: group.map((row) => {
        const leftAt = optionalTimestamp(row.member_left_at, "conversation_members.left_at");
        const member = {
          conversationId: created.conversation.id,
          characterId: requiredString(row.member_character_id, "conversation_members.character_id"),
          joinedAt: requiredTimestamp(row.member_joined_at, "conversation_members.joined_at"),
        };
        return leftAt === undefined ? member : { ...member, leftAt };
      }),
    };
  });
}

function mapMessageRow(row: SqlRow): Message {
  const message: Message = {
    id: requiredString(row.id, "messages.id"),
    conversationId: requiredString(row.conversation_id, "messages.conversation_id"),
    kind: requiredString(row.kind, "messages.kind") as MessageKindValue,
    createdAt: requiredTimestamp(row.created_at, "messages.created_at"),
    idempotencyKey: requiredString(row.idempotency_key, "messages.idempotency_key"),
  };
  const authorCharacterId = optionalString(
    row.author_character_id,
    "messages.author_character_id",
  );
  const text = optionalString(row.text, "messages.text");
  const mediaRef = optionalString(row.media_ref, "messages.media_ref");
  const stickerId = optionalString(row.sticker_id, "messages.sticker_id");
  if (authorCharacterId !== undefined) message.authorCharacterId = authorCharacterId;
  if (text !== undefined) message.text = text;
  if (mediaRef !== undefined) message.mediaRef = mediaRef;
  if (stickerId !== undefined) message.stickerId = stickerId;
  return message;
}

function sameMessagePayload(left: Message, right: Message): boolean {
  return (
    left.conversationId === right.conversationId &&
    left.authorCharacterId === right.authorCharacterId &&
    left.kind === right.kind &&
    left.text === right.text &&
    left.mediaRef === right.mediaRef &&
    left.stickerId === right.stickerId &&
    left.createdAt === right.createdAt &&
    left.idempotencyKey === right.idempotencyKey
  );
}

function mapMemoryRow(row: SqlRow): MemoryItem {
  const memory: MemoryItem = {
    id: requiredString(row.id, "memory_items.id"),
    storyWorldId: requiredString(row.story_world_id, "memory_items.story_world_id"),
    kind: requiredString(row.kind, "memory_items.kind") as MemoryItem["kind"],
    visibility: requiredString(row.visibility, "memory_items.visibility") as MemoryItem["visibility"],
    source: requiredString(row.source, "memory_items.source") as MemoryItem["source"],
    content: requiredString(row.content, "memory_items.content"),
    confidence: requiredNumber(row.confidence, "memory_items.confidence"),
    createdAt: requiredTimestamp(row.created_at, "memory_items.created_at"),
    audienceCharacterIds: stringArray(
      row.audience_character_ids,
      "memory_items.audience_character_ids",
    ),
  };
  const occurredAt = optionalTimestamp(row.occurred_at, "memory_items.occurred_at");
  const subjectCharacterId = optionalString(
    row.subject_character_id,
    "memory_items.subject_character_id",
  );
  const sourceRef = optionalString(row.source_ref, "memory_items.source_ref");
  if (occurredAt !== undefined) memory.occurredAt = occurredAt;
  if (subjectCharacterId !== undefined) memory.subjectCharacterId = subjectCharacterId;
  if (sourceRef !== undefined) memory.sourceRef = sourceRef;
  assertMemoryItem(memory);
  return memory;
}

function mapWorldLoreEntryRow(row: SqlRow): WorldLoreEntry {
  const entry: WorldLoreEntry = {
    id: requiredString(row.id, "world_lore_entries.id"),
    storyWorldId: requiredString(row.story_world_id, "world_lore_entries.story_world_id"),
    category: requiredString(row.category, "world_lore_entries.category"),
    title: requiredString(row.title, "world_lore_entries.title"),
    content: requiredString(row.content, "world_lore_entries.content"),
    tags: stringArray(row.tags, "world_lore_entries.tags"),
    isEnabled: requiredBoolean(row.is_enabled, "world_lore_entries.is_enabled"),
    createdAt: requiredTimestamp(row.created_at, "world_lore_entries.created_at"),
    updatedAt: requiredTimestamp(row.updated_at, "world_lore_entries.updated_at"),
  };
  assertWorldLoreEntry(entry);
  return entry;
}

const CONVERSATION_SELECT = `
  SELECT
    c.id AS conversation_id,
    c.story_world_id AS conversation_story_world_id,
    c.type AS conversation_type,
    c.title AS conversation_title,
    c.created_at AS conversation_created_at,
    sw.id AS world_id,
    sw.name AS world_name,
    sw.timezone AS world_timezone,
    sw.story_mode AS world_story_mode,
    sw.relationship_dynamics_enabled AS world_relationship_dynamics_enabled,
    cm.character_id AS member_character_id,
    cm.joined_at AS member_joined_at,
    cm.left_at AS member_left_at,
    member_character.id AS member_id,
    member_character.display_name AS member_display_name,
    member_character.role AS member_role,
    member_character.story_world_id AS member_story_world_id,
    member_character.timezone AS member_timezone,
    member_character.birth_date AS member_birth_date,
    member_character.persona_prompt AS member_persona_prompt,
    member_character.persona_prompt_ref AS member_persona_prompt_ref,
    member_character.visual_prompt_ref AS member_visual_prompt_ref
  FROM conversations c
  JOIN story_worlds sw ON sw.id = c.story_world_id
  JOIN conversation_members cm ON cm.conversation_id = c.id
  JOIN characters member_character
    ON member_character.id = cm.character_id
   AND member_character.story_world_id = cm.story_world_id`;

const MESSAGE_SELECT = `
  SELECT id, conversation_id, author_character_id, kind, text, media_ref,
         sticker_id, created_at, idempotency_key
  FROM messages`;

const MEMORY_SELECT = `
  SELECT id, story_world_id, kind, visibility, source, content, confidence,
         created_at, occurred_at, subject_character_id, audience_character_ids, source_ref
  FROM memory_items`;

const WORLD_LORE_ENTRY_SELECT = `
  SELECT id, story_world_id, category, title, content, tags, is_enabled,
         created_at, updated_at
  FROM world_lore_entries`;

export function createChatMemoryRepositories(client: SqlClient): {
  conversations: ConversationRepository;
  messages: MessageRepository;
  memories: MemoryRepository;
  worldLoreEntries: WorldLoreEntryRepository;
} {
  const conversations: ConversationRepository = {
      listByCharacter: async (characterId) => {
        const result = await client.query(
          `${CONVERSATION_SELECT}
           JOIN conversation_members selected_member
             ON selected_member.conversation_id = c.id
            AND selected_member.character_id = $1
            AND selected_member.left_at IS NULL
           ORDER BY c.created_at, c.id, cm.character_id`,
          [characterId],
        );
        return mapConversationRows(result.rows);
      },
      getById: async (id) => {
        const result = await client.query(
          `${CONVERSATION_SELECT} WHERE c.id = $1 ORDER BY cm.character_id`,
          [id],
        );
        return mapConversationRows(result.rows)[0];
      },
      save: async (conversation) => {
        const members = conversation.members;
        if (members.length === 0) {
          throw new TypeError("Conversation must have at least one member");
        }
        const values: unknown[] = [
          conversation.conversation.id,
          conversation.conversation.storyWorldId,
          conversation.conversation.type,
          conversation.conversation.title ?? null,
          conversation.conversation.createdAt,
        ];
        const tuples = members.map((member, index) => {
          const offset = 6 + index * 4;
          values.push(
            member.characterId,
            conversation.conversation.storyWorldId,
            member.joinedAt,
            member.leftAt ?? null,
          );
          return `($${offset}, $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
        });
        await client.query(
          `WITH upserted AS (
             INSERT INTO conversations (id, story_world_id, type, title, created_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET
               story_world_id = EXCLUDED.story_world_id,
               type = EXCLUDED.type,
               title = EXCLUDED.title,
               created_at = EXCLUDED.created_at
             RETURNING id
           )
           INSERT INTO conversation_members (
             conversation_id, character_id, story_world_id, joined_at, left_at
           )
           SELECT upserted.id, member_values.character_id, member_values.story_world_id,
                  member_values.joined_at, member_values.left_at
           FROM upserted
           CROSS JOIN (VALUES ${tuples.join(", ")}) AS member_values(
             character_id, story_world_id, joined_at, left_at
           )
           ON CONFLICT (conversation_id, character_id) DO UPDATE SET
             story_world_id = EXCLUDED.story_world_id,
             joined_at = EXCLUDED.joined_at,
             left_at = EXCLUDED.left_at`,
          values,
        );
      },
    };

  const messages: MessageRepository = {
      listByConversation: async (conversationId) => {
        const result = await client.query(
          `${MESSAGE_SELECT}
           WHERE conversation_id = $1
           ORDER BY created_at, id`,
          [conversationId],
        );
        return result.rows.map(mapMessageRow);
      },
      save: async (message): Promise<MessageWriteResult> => {
        const values = [
          message.id,
          message.conversationId,
          message.authorCharacterId ?? null,
          message.kind,
          message.text ?? null,
          message.mediaRef ?? null,
          message.stickerId ?? null,
          message.createdAt,
          message.idempotencyKey,
        ];
        const inserted = await client.query(
          `INSERT INTO messages (
             id, conversation_id, author_character_id, kind, text, media_ref,
             sticker_id, created_at, idempotency_key
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (conversation_id, idempotency_key) DO NOTHING
           RETURNING id, conversation_id, author_character_id, kind, text,
                     media_ref, sticker_id, created_at, idempotency_key`,
          values,
        );
        const insertedRow = inserted.rows[0];
        if (insertedRow) {
          return { message: mapMessageRow(insertedRow), inserted: true };
        }

        const existingResult = await client.query(
          `${MESSAGE_SELECT} WHERE conversation_id = $1 AND idempotency_key = $2`,
          [message.conversationId, message.idempotencyKey],
        );
        const existingRow = existingResult.rows[0];
        if (!existingRow) {
          throw new TypeError("Message idempotency lookup returned no row");
        }
        const existing = mapMessageRow(existingRow);
        if (!sameMessagePayload(existing, message)) {
          throw new TypeError(`Message idempotency key conflict: ${message.idempotencyKey}`);
        }
        return { message: existing, inserted: false };
      },
    };

  const memories: MemoryRepository = {
      getById: async (id) => {
        const result = await client.query(`${MEMORY_SELECT} WHERE id = $1`, [id]);
        const row = result.rows[0];
        return row ? mapMemoryRow(row) : undefined;
      },
      listForCharacter: async (storyWorldId, readerCharacterId) => {
        const result = await client.query(
          `${MEMORY_SELECT}
           WHERE story_world_id = $1
             AND (
               visibility = 'PUBLIC'
               OR (visibility = 'PRIVATE' AND subject_character_id = $2)
               OR (visibility IN ('RELATION', 'GROUP') AND $2 = ANY(audience_character_ids))
             )
           ORDER BY created_at DESC, id`,
          [storyWorldId, readerCharacterId],
        );
        return result.rows.map(mapMemoryRow);
      },
      search: async (query: MemorySearchQuery) => {
        const limit = query.limit ?? 20;
        if (!Number.isSafeInteger(limit) || limit < 1) {
          throw new TypeError("memory search limit must be a positive integer");
        }
        if (query.queryText.trim().length === 0) {
          throw new TypeError("memory search queryText must be non-empty");
        }
        const result = await client.query(
          `SELECT id, story_world_id, kind, visibility, source, content, confidence,
                  created_at, occurred_at, subject_character_id, audience_character_ids,
                  source_ref,
                  ts_rank_cd(search_vector, websearch_to_tsquery('simple', $3))
                    + confidence * 0.25 AS score
           FROM memory_items
           WHERE story_world_id = $1
             AND search_vector @@ websearch_to_tsquery('simple', $3)
             AND (
               visibility = 'PUBLIC'
               OR (visibility = 'PRIVATE' AND subject_character_id = $2)
               OR (visibility IN ('RELATION', 'GROUP') AND $2 = ANY(audience_character_ids))
             )
           ORDER BY score DESC, created_at DESC, id
           LIMIT $4`,
          [query.storyWorldId, query.readerCharacterId, query.queryText, limit],
        );
        return result.rows.map((row) => ({
          memory: mapMemoryRow(row),
          score: requiredNumber(row.score, "memory_items.score"),
        })) as readonly MemorySearchResult[];
      },
      save: async (memory) => {
        assertMemoryItem(memory);
        await client.query(
          `INSERT INTO memory_items (
             id, story_world_id, kind, visibility, source, content, confidence,
             created_at, occurred_at, subject_character_id, audience_character_ids, source_ref
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO UPDATE SET
             story_world_id = EXCLUDED.story_world_id,
             kind = EXCLUDED.kind,
             visibility = EXCLUDED.visibility,
             source = EXCLUDED.source,
             content = EXCLUDED.content,
             confidence = EXCLUDED.confidence,
             created_at = EXCLUDED.created_at,
             occurred_at = EXCLUDED.occurred_at,
             subject_character_id = EXCLUDED.subject_character_id,
             audience_character_ids = EXCLUDED.audience_character_ids,
             source_ref = EXCLUDED.source_ref`,
          [
            memory.id,
            memory.storyWorldId,
            memory.kind,
            memory.visibility,
            memory.source,
            memory.content,
            memory.confidence,
            memory.createdAt,
            memory.occurredAt ?? null,
            memory.subjectCharacterId ?? null,
            [...memory.audienceCharacterIds],
            memory.sourceRef ?? null,
          ],
        );
      },
    };

  const worldLoreEntries: WorldLoreEntryRepository = {
      listByStoryWorld: async (storyWorldId) => {
        const result = await client.query(
          `${WORLD_LORE_ENTRY_SELECT}
           WHERE story_world_id = $1
           ORDER BY updated_at DESC, id`,
          [storyWorldId],
        );
        return result.rows.map(mapWorldLoreEntryRow);
      },
      getById: async (id) => {
        const result = await client.query(
          `${WORLD_LORE_ENTRY_SELECT} WHERE id = $1`,
          [id],
        );
        const row = result.rows[0];
        return row ? mapWorldLoreEntryRow(row) : undefined;
      },
      search: async (storyWorldId, queryText) => {
        if (queryText.trim().length === 0) {
          throw new TypeError("world lore search queryText must be non-empty");
        }
        const document = "to_tsvector('simple'::regconfig, title || ' ' || content) || array_to_tsvector(tags)";
        const result = await client.query(
          `${WORLD_LORE_ENTRY_SELECT}
           WHERE story_world_id = $1
             AND is_enabled = true
             AND ${document} @@ websearch_to_tsquery('simple', $2)
           ORDER BY ts_rank_cd(${document}, websearch_to_tsquery('simple', $2)) DESC,
                    updated_at DESC, id`,
          [storyWorldId, queryText],
        );
        return result.rows.map(mapWorldLoreEntryRow);
      },
      save: async (entry) => {
        assertWorldLoreEntry(entry);
        await client.query(
          `INSERT INTO world_lore_entries (
             id, story_world_id, category, title, content, tags, is_enabled, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET
             story_world_id = EXCLUDED.story_world_id,
             category = EXCLUDED.category,
             title = EXCLUDED.title,
             content = EXCLUDED.content,
             tags = EXCLUDED.tags,
             is_enabled = EXCLUDED.is_enabled,
             updated_at = EXCLUDED.updated_at`,
          [
            entry.id,
            entry.storyWorldId,
            entry.category,
            entry.title,
            entry.content,
            [...entry.tags],
            entry.isEnabled,
            entry.createdAt,
            entry.updatedAt,
          ],
        );
      },
      delete: async (id) => {
        await client.query(`DELETE FROM world_lore_entries WHERE id = $1`, [id]);
      },
    };

  return { conversations, messages, memories, worldLoreEntries };
}
