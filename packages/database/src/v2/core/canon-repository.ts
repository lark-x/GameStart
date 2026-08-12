import type { DatabaseSync } from "node:sqlite";

import type {
  V2CharacterId,
  V2ArcId,
  V2FactVisibility,
  V2IdempotencyKey,
  V2LocationId,
  V2Revision,
  V2RuleSeverity,
  V2ChoiceId,
  V2SceneId,
  V2StoryWorldId,
} from "@living-network/contracts";
import type {
  V2CanonCharacter,
  V2CanonFact,
  V2CanonLocation,
  V2CanonRule,
  V2CanonTimelineEvent,
  V2CanonWorld,
  V2GraphArc,
  V2GraphChoice,
  V2GraphScene,
  V2GraphStateConsequence,
  V2GraphStateGate,
  V2TypedStateValue,
  V2TypedStateValueType,
  V2TypedStateVariable,
} from "@living-network/domain";
import { V2DomainError } from "@living-network/domain";
import type {
  V2CanonMutationRecord,
  V2CanonRepository,
  V2CanonUnitOfWork,
  V2GraphStateRepository,
  V2GraphStateUnitOfWork,
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

export class V2SqliteGraphStateUnitOfWork implements V2GraphStateUnitOfWork {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async withGraphStateTransaction<T>(
    fn: (repositories: {
      readonly canon: V2CanonRepository;
      readonly graphState: V2GraphStateRepository;
    }) => Promise<T>,
  ): Promise<T> {
    return withV2SqliteAsyncTransaction(this.db, () => fn({
      canon: new V2SqliteCanonRepository(this.db),
      graphState: new V2SqliteGraphStateRepository(this.db),
    }));
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

export class V2SqliteGraphStateRepository implements V2GraphStateRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async getArc(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly arcId: V2ArcId;
  }): Promise<V2GraphArc | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_arcs WHERE story_world_id = ? AND arc_id = ?")
      .get(input.storyWorldId, input.arcId);
    return row === undefined ? undefined : mapArc(row);
  }

  public async listArcs(storyWorldId: V2StoryWorldId): Promise<readonly V2GraphArc[]> {
    return this.db.prepare("SELECT * FROM v2_arcs WHERE story_world_id = ? ORDER BY created_at, arc_id")
      .all(storyWorldId)
      .map(mapArc);
  }

  public async createArc(input: V2GraphArc): Promise<V2GraphArc> {
    this.db.prepare(`
      INSERT INTO v2_arcs (arc_id, story_world_id, title, summary)
      VALUES (?, ?, ?, ?)
    `).run(input.arcId, input.storyWorldId, input.title, input.summary ?? null);
    const created = await this.getArc({
      storyWorldId: input.storyWorldId as V2StoryWorldId,
      arcId: input.arcId as V2ArcId,
    });
    if (!created) throw new Error("V2 arc insert did not return a row");
    return created;
  }

  public async getScene(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly sceneId: V2SceneId;
  }): Promise<V2GraphScene | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_scenes WHERE story_world_id = ? AND scene_id = ?")
      .get(input.storyWorldId, input.sceneId);
    return row === undefined ? undefined : mapScene(row);
  }

  public async listScenes(storyWorldId: V2StoryWorldId): Promise<readonly V2GraphScene[]> {
    return this.db.prepare("SELECT * FROM v2_scenes WHERE story_world_id = ? ORDER BY created_at, scene_id")
      .all(storyWorldId)
      .map(mapScene);
  }

  public async createScene(input: V2GraphScene): Promise<V2GraphScene> {
    this.db.prepare(`
      INSERT INTO v2_scenes (scene_id, story_world_id, arc_id, title, body, is_entry)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(input.sceneId, input.storyWorldId, input.arcId ?? null, input.title, input.body ?? null, input.isEntry ? 1 : 0);
    const created = await this.getScene({
      storyWorldId: input.storyWorldId as V2StoryWorldId,
      sceneId: input.sceneId as V2SceneId,
    });
    if (!created) throw new Error("V2 scene insert did not return a row");
    return created;
  }

  public async getChoice(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly choiceId: V2ChoiceId;
  }): Promise<V2GraphChoice | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_choices WHERE story_world_id = ? AND choice_id = ?")
      .get(input.storyWorldId, input.choiceId);
    return row === undefined ? undefined : mapChoice(row);
  }

  public async listChoices(storyWorldId: V2StoryWorldId): Promise<readonly V2GraphChoice[]> {
    return this.db.prepare("SELECT * FROM v2_choices WHERE story_world_id = ? ORDER BY created_at, choice_id")
      .all(storyWorldId)
      .map(mapChoice);
  }

  public async createChoice(input: V2GraphChoice): Promise<V2GraphChoice> {
    this.db.prepare(`
      INSERT INTO v2_choices (choice_id, story_world_id, source_scene_id, target_scene_id, label, gates_json, consequences_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.choiceId,
      input.storyWorldId,
      input.sourceSceneId,
      input.targetSceneId ?? null,
      input.label,
      JSON.stringify(input.gates),
      JSON.stringify(input.consequences),
    );
    const created = await this.getChoice({
      storyWorldId: input.storyWorldId as V2StoryWorldId,
      choiceId: input.choiceId as V2ChoiceId,
    });
    if (!created) throw new Error("V2 choice insert did not return a row");
    return created;
  }

  public async getStateVariable(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly key: string;
  }): Promise<V2TypedStateVariable | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_state_variables WHERE story_world_id = ? AND key = ?")
      .get(input.storyWorldId, input.key);
    return row === undefined ? undefined : mapStateVariable(row);
  }

  public async listStateVariables(storyWorldId: V2StoryWorldId): Promise<readonly V2TypedStateVariable[]> {
    return this.db.prepare("SELECT * FROM v2_state_variables WHERE story_world_id = ? ORDER BY created_at, key")
      .all(storyWorldId)
      .map(mapStateVariable);
  }

  public async createStateVariable(input: V2TypedStateVariable): Promise<V2TypedStateVariable> {
    this.db.prepare(`
      INSERT INTO v2_state_variables (story_world_id, key, value_type, default_json)
      VALUES (?, ?, ?, ?)
    `).run(input.storyWorldId, input.key, input.valueType, JSON.stringify(input.defaultValue));
    const created = await this.getStateVariable({
      storyWorldId: input.storyWorldId as V2StoryWorldId,
      key: input.key,
    });
    if (!created) throw new Error("V2 state variable insert did not return a row");
    return created;
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

function mapArc(row: unknown): V2GraphArc {
  const record = requireRecord(row);
  return {
    arcId: requireString(record.arc_id, "arc_id") as V2ArcId,
    storyWorldId: requireString(record.story_world_id, "story_world_id") as V2StoryWorldId,
    title: requireString(record.title, "title"),
    ...(record.summary === null ? {} : { summary: requireString(record.summary, "summary") }),
    createdAt: requireString(record.created_at, "created_at"),
  };
}

function mapScene(row: unknown): V2GraphScene {
  const record = requireRecord(row);
  return {
    sceneId: requireString(record.scene_id, "scene_id") as V2SceneId,
    storyWorldId: requireString(record.story_world_id, "story_world_id") as V2StoryWorldId,
    ...(record.arc_id === null ? {} : { arcId: requireString(record.arc_id, "arc_id") as V2ArcId }),
    title: requireString(record.title, "title"),
    ...(record.body === null ? {} : { body: requireString(record.body, "body") }),
    isEntry: requireNumber(record.is_entry, "is_entry") === 1,
    createdAt: requireString(record.created_at, "created_at"),
  };
}

function mapChoice(row: unknown): V2GraphChoice {
  const record = requireRecord(row);
  return {
    choiceId: requireString(record.choice_id, "choice_id") as V2ChoiceId,
    storyWorldId: requireString(record.story_world_id, "story_world_id") as V2StoryWorldId,
    sourceSceneId: requireString(record.source_scene_id, "source_scene_id") as V2SceneId,
    ...(record.target_scene_id === null ? {} : { targetSceneId: requireString(record.target_scene_id, "target_scene_id") as V2SceneId }),
    label: requireString(record.label, "label"),
    gates: parseJsonArray<V2GraphStateGate>(record.gates_json, "gates_json"),
    consequences: parseJsonArray<V2GraphStateConsequence>(record.consequences_json, "consequences_json"),
    createdAt: requireString(record.created_at, "created_at"),
  };
}

function mapStateVariable(row: unknown): V2TypedStateVariable {
  const record = requireRecord(row);
  return {
    storyWorldId: requireString(record.story_world_id, "story_world_id") as V2StoryWorldId,
    key: requireString(record.key, "key"),
    valueType: requireString(record.value_type, "value_type") as V2TypedStateValueType,
    defaultValue: parseStateValue(record.default_json),
    createdAt: requireString(record.created_at, "created_at"),
  };
}

function parseJsonArray<T>(value: unknown, field: string): readonly T[] {
  const parsed = JSON.parse(requireString(value, field));
  if (!Array.isArray(parsed)) throw new Error(`Expected ${field} to be a JSON array`);
  return parsed as readonly T[];
}

function parseStateValue(value: unknown): V2TypedStateValue {
  const parsed = JSON.parse(requireString(value, "default_json")) as unknown;
  if (typeof parsed === "string" || typeof parsed === "number" || typeof parsed === "boolean") return parsed;
  throw new Error("Expected default_json to contain a typed state scalar");
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
