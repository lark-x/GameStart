import type { DatabaseSync } from "node:sqlite";

import type {
  V2CharacterId,
  V2FactVisibility,
  V2IdempotencyKey,
  V2LocationId,
  V2Revision,
  V2RuleSeverity,
  V2StoryWorldId,
} from "@living-network/contracts";
import type {
  V2CanonCharacter,
  V2CanonFact,
  V2CanonLocation,
  V2CanonRule,
  V2CanonTimelineEvent,
  V2CanonWorld,
} from "@living-network/domain";
import { V2DomainError } from "@living-network/domain";
import type {
  V2CanonMutationRecord,
  V2CanonRepository,
  V2CanonUnitOfWork,
} from "@living-network/ports";

import { withV2SqliteAsyncTransaction } from "../platform/index.ts";

export class V2SqliteCanonUnitOfWork implements V2CanonUnitOfWork {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async withCanonTransaction<T>(fn: (repositories: { readonly canon: V2CanonRepository }) => Promise<T>): Promise<T> {
    return withV2SqliteAsyncTransaction(this.db, () => fn({ canon: new V2SqliteCanonRepository(this.db) }));
  }
}

export class V2SqliteCanonRepository implements V2CanonRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async getWorld(storyWorldId: V2StoryWorldId): Promise<V2CanonWorld | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_worlds WHERE story_world_id = ?").get(storyWorldId);
    return row === undefined ? undefined : mapWorld(row);
  }

  public async listWorlds(): Promise<readonly V2CanonWorld[]> {
    return this.db.prepare("SELECT * FROM v2_worlds ORDER BY created_at, story_world_id").all().map(mapWorld);
  }

  public async createWorld(input: V2CanonWorld): Promise<V2CanonWorld> {
    this.db.prepare(`
      INSERT INTO v2_worlds (story_world_id, name, summary, revision)
      VALUES (?, ?, ?, ?)
    `).run(input.storyWorldId, input.name, input.summary ?? null, input.revision);
    const created = await this.getWorld(input.storyWorldId as V2StoryWorldId);
    if (!created) throw new Error("V2 world insert did not return a row");
    return created;
  }

  public async getLocation(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly locationId: V2LocationId;
  }): Promise<V2CanonLocation | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_locations WHERE story_world_id = ? AND location_id = ?")
      .get(input.storyWorldId, input.locationId);
    return row === undefined ? undefined : mapLocation(row);
  }

  public async listLocations(storyWorldId: V2StoryWorldId): Promise<readonly V2CanonLocation[]> {
    return this.db.prepare("SELECT * FROM v2_locations WHERE story_world_id = ? ORDER BY created_at, location_id")
      .all(storyWorldId)
      .map(mapLocation);
  }

  public async createLocation(input: V2CanonLocation): Promise<V2CanonLocation> {
    this.db.prepare(`
      INSERT INTO v2_locations (location_id, story_world_id, name, summary)
      VALUES (?, ?, ?, ?)
    `).run(input.locationId, input.storyWorldId, input.name, input.summary ?? null);
    const created = await this.getLocation({
      storyWorldId: input.storyWorldId as V2StoryWorldId,
      locationId: input.locationId as V2LocationId,
    });
    if (!created) throw new Error("V2 location insert did not return a row");
    return created;
  }

  public async getCharacter(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly characterId: V2CharacterId;
  }): Promise<V2CanonCharacter | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_characters WHERE story_world_id = ? AND character_id = ?")
      .get(input.storyWorldId, input.characterId);
    return row === undefined ? undefined : mapCharacter(row);
  }

  public async listCharacters(storyWorldId: V2StoryWorldId): Promise<readonly V2CanonCharacter[]> {
    return this.db.prepare("SELECT * FROM v2_characters WHERE story_world_id = ? ORDER BY created_at, character_id")
      .all(storyWorldId)
      .map(mapCharacter);
  }

  public async createCharacter(input: V2CanonCharacter): Promise<V2CanonCharacter> {
    this.db.prepare(`
      INSERT INTO v2_characters (character_id, story_world_id, name, summary, home_location_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(input.characterId, input.storyWorldId, input.name, input.summary ?? null, input.homeLocationId ?? null);
    const created = await this.getCharacter({
      storyWorldId: input.storyWorldId as V2StoryWorldId,
      characterId: input.characterId as V2CharacterId,
    });
    if (!created) throw new Error("V2 character insert did not return a row");
    return created;
  }

  public async listFacts(storyWorldId: V2StoryWorldId): Promise<readonly V2CanonFact[]> {
    return this.db.prepare("SELECT * FROM v2_facts WHERE story_world_id = ? ORDER BY created_at, fact_id")
      .all(storyWorldId)
      .map(mapFact);
  }

  public async createFact(input: V2CanonFact): Promise<V2CanonFact> {
    this.db.prepare(`
      INSERT INTO v2_facts (fact_id, story_world_id, text, visibility)
      VALUES (?, ?, ?, ?)
    `).run(input.factId, input.storyWorldId, input.text, input.visibility);
    return input;
  }

  public async listRules(storyWorldId: V2StoryWorldId): Promise<readonly V2CanonRule[]> {
    return this.db.prepare("SELECT * FROM v2_rules WHERE story_world_id = ? ORDER BY created_at, rule_id")
      .all(storyWorldId)
      .map(mapRule);
  }

  public async createRule(input: V2CanonRule): Promise<V2CanonRule> {
    this.db.prepare(`
      INSERT INTO v2_rules (rule_id, story_world_id, text, severity)
      VALUES (?, ?, ?, ?)
    `).run(input.ruleId, input.storyWorldId, input.text, input.severity);
    return input;
  }

  public async listTimelineEvents(storyWorldId: V2StoryWorldId): Promise<readonly V2CanonTimelineEvent[]> {
    return this.db.prepare("SELECT * FROM v2_timeline_events WHERE story_world_id = ? ORDER BY local_date, created_at, timeline_event_id")
      .all(storyWorldId)
      .map(mapTimelineEvent);
  }

  public async createTimelineEvent(input: V2CanonTimelineEvent): Promise<V2CanonTimelineEvent> {
    this.db.prepare(`
      INSERT INTO v2_timeline_events (timeline_event_id, story_world_id, local_date, title, summary)
      VALUES (?, ?, ?, ?, ?)
    `).run(input.timelineEventId, input.storyWorldId, input.localDate, input.title, input.summary ?? null);
    return input;
  }

  public async advanceRevision(storyWorldId: V2StoryWorldId, expectedRevision: V2Revision): Promise<V2Revision> {
    const result = this.db.prepare(`
      UPDATE v2_worlds
      SET revision = revision + 1,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE story_world_id = ? AND revision = ?
    `).run(storyWorldId, expectedRevision);
    if (result.changes !== 1) {
      const world = await this.getWorld(storyWorldId);
      if (!world) throw new V2DomainError("INVALID_INPUT", "storyWorldId does not exist");
      throw new V2DomainError("STALE_REVISION", `Expected canon revision ${expectedRevision}, got ${world.revision}`);
    }
    const world = await this.getWorld(storyWorldId);
    if (!world) throw new Error("V2 world disappeared after revision update");
    return world.revision as V2Revision;
  }

  public async readMutation<TResult>(input: {
    readonly key: V2IdempotencyKey;
    readonly operation: string;
  }): Promise<V2CanonMutationRecord<TResult> | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_canon_idempotency WHERE key = ? AND operation = ?")
      .get(input.key, input.operation);
    if (row === undefined) return undefined;
    const record = requireRecord(row);
    return {
      key: requireString(record.key, "key") as V2IdempotencyKey,
      operation: requireString(record.operation, "operation"),
      payloadHash: requireString(record.payload_hash, "payload_hash"),
      result: JSON.parse(requireString(record.result_json, "result_json")) as TResult,
    };
  }

  public async saveMutation<TResult>(input: V2CanonMutationRecord<TResult>): Promise<void> {
    this.db.prepare(`
      INSERT INTO v2_canon_idempotency (key, operation, payload_hash, result_json)
      VALUES (?, ?, ?, ?)
    `).run(input.key, input.operation, input.payloadHash, JSON.stringify(input.result));
  }
}

function mapWorld(row: unknown): V2CanonWorld {
  const record = requireRecord(row);
  return {
    storyWorldId: requireString(record.story_world_id, "story_world_id") as V2StoryWorldId,
    name: requireString(record.name, "name"),
    ...(record.summary === null ? {} : { summary: requireString(record.summary, "summary") }),
    revision: requireNumber(record.revision, "revision") as V2Revision,
    createdAt: requireString(record.created_at, "created_at"),
    updatedAt: requireString(record.updated_at, "updated_at"),
  };
}

function mapLocation(row: unknown): V2CanonLocation {
  const record = requireRecord(row);
  return {
    locationId: requireString(record.location_id, "location_id") as V2LocationId,
    storyWorldId: requireString(record.story_world_id, "story_world_id") as V2StoryWorldId,
    name: requireString(record.name, "name"),
    ...(record.summary === null ? {} : { summary: requireString(record.summary, "summary") }),
    createdAt: requireString(record.created_at, "created_at"),
  };
}

function mapCharacter(row: unknown): V2CanonCharacter {
  const record = requireRecord(row);
  return {
    characterId: requireString(record.character_id, "character_id") as V2CharacterId,
    storyWorldId: requireString(record.story_world_id, "story_world_id") as V2StoryWorldId,
    name: requireString(record.name, "name"),
    ...(record.summary === null ? {} : { summary: requireString(record.summary, "summary") }),
    ...(record.home_location_id === null ? {} : { homeLocationId: requireString(record.home_location_id, "home_location_id") as V2LocationId }),
    createdAt: requireString(record.created_at, "created_at"),
  };
}

function mapFact(row: unknown): V2CanonFact {
  const record = requireRecord(row);
  return {
    factId: requireString(record.fact_id, "fact_id"),
    storyWorldId: requireString(record.story_world_id, "story_world_id") as V2StoryWorldId,
    text: requireString(record.text, "text"),
    visibility: requireString(record.visibility, "visibility") as V2FactVisibility,
    createdAt: requireString(record.created_at, "created_at"),
  };
}

function mapRule(row: unknown): V2CanonRule {
  const record = requireRecord(row);
  return {
    ruleId: requireString(record.rule_id, "rule_id"),
    storyWorldId: requireString(record.story_world_id, "story_world_id") as V2StoryWorldId,
    text: requireString(record.text, "text"),
    severity: requireString(record.severity, "severity") as V2RuleSeverity,
    createdAt: requireString(record.created_at, "created_at"),
  };
}

function mapTimelineEvent(row: unknown): V2CanonTimelineEvent {
  const record = requireRecord(row);
  return {
    timelineEventId: requireString(record.timeline_event_id, "timeline_event_id"),
    storyWorldId: requireString(record.story_world_id, "story_world_id") as V2StoryWorldId,
    localDate: requireString(record.local_date, "local_date"),
    title: requireString(record.title, "title"),
    ...(record.summary === null ? {} : { summary: requireString(record.summary, "summary") }),
    createdAt: requireString(record.created_at, "created_at"),
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected database row");
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Expected ${field} to be a string`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number") throw new Error(`Expected ${field} to be a number`);
  return value;
}
