import type { SocialFeedEvent } from "@living-network/domain";
import { SocialFeedEventType } from "@living-network/domain";
import type { SocialFeedEventRepository } from "@living-network/ports";
import type { SqlClient, SqlRow } from "./index.ts";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new TypeError(`${field} must be a string`);
  return value;
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number") throw new TypeError(`${field} must be a number`);
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") throw new TypeError(`${field} must be a string or null`);
  return value;
}

function requiredTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string") throw new TypeError(`${field} must be a string`);
  return value;
}

function mapSocialFeedEventRow(row: SqlRow): SocialFeedEvent {
  const event: SocialFeedEvent = {
    id: requiredString(row.id, "social_feed_events.id"),
    storyWorldId: requiredString(row.story_world_id, "social_feed_events.story_world_id"),
    eventType: requiredString(row.event_type, "social_feed_events.event_type") as SocialFeedEvent["eventType"],
    cursorValue: requiredNumber(row.cursor_value, "social_feed_events.cursor_value"),
    createdAt: requiredTimestamp(row.created_at, "social_feed_events.created_at"),
  };
  const momentId = optionalString(row.moment_id, "social_feed_events.moment_id");
  if (momentId !== undefined) (event as { momentId?: string }).momentId = momentId;
  const interactionId = optionalString(row.interaction_id, "social_feed_events.interaction_id");
  if (interactionId !== undefined) (event as { interactionId?: string }).interactionId = interactionId;
  const actorCharacterId = optionalString(row.actor_character_id, "social_feed_events.actor_character_id");
  if (actorCharacterId !== undefined) (event as { actorCharacterId?: string }).actorCharacterId = actorCharacterId;
  return event;
}

const FEED_EVENT_SELECT = `
  SELECT id, story_world_id, event_type, moment_id, interaction_id,
         actor_character_id, cursor_value, payload, created_at
  FROM social_feed_events`;

export function createSocialFeedEventRepositories(client: SqlClient): {
  socialFeedEvents: SocialFeedEventRepository;
} {
  const socialFeedEvents: SocialFeedEventRepository = {
    getById: async (id) => {
      const result = await client.query(`${FEED_EVENT_SELECT} WHERE id = $1`, [id]);
      const row = result.rows[0];
      return row ? mapSocialFeedEventRow(row) : undefined;
    },
    listByStoryWorld: async (storyWorldId, cursor, limit = 50) => {
      const query = cursor
        ? `${FEED_EVENT_SELECT} WHERE story_world_id = $1 AND cursor_value > $2 ORDER BY cursor_value ASC LIMIT $3`
        : `${FEED_EVENT_SELECT} WHERE story_world_id = $1 ORDER BY cursor_value ASC LIMIT $2`;
      const params = cursor ? [storyWorldId, cursor, limit] : [storyWorldId, limit];
      const result = await client.query(query, params);
      return result.rows.map(mapSocialFeedEventRow);
    },
    save: async (event) => {
      await client.query(
        `INSERT INTO social_feed_events (
           id, story_world_id, event_type, moment_id, interaction_id,
           actor_character_id, payload, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           payload = EXCLUDED.payload`,
        [
          event.id,
          event.storyWorldId,
          event.eventType,
          event.momentId ?? null,
          event.interactionId ?? null,
          event.actorCharacterId ?? null,
          event.payload ? JSON.stringify(event.payload) : null,
          event.createdAt,
        ],
      );
    },
  };

  return { socialFeedEvents };
}
