import type { DatabaseSync } from "node:sqlite";

import type {
  V2ReleaseId,
  V2RunId,
  V2SaveId,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
import type {
  V2ReleaseManifest,
  V2RuntimeRun,
  V2TypedStateValue,
} from "@living-network/domain/v2";
import type {
  V2CandidateReviewRepository,
  V2CanonRepository,
  V2GraphStateRepository,
  V2ReleaseRuntimeRepository,
  V2ReleaseRuntimeUnitOfWork,
  V2RuntimeSaveRecord,
} from "@living-network/ports/v2";

import {
  V2SqliteCandidateReviewRepository,
  V2SqliteCanonRepository,
  V2SqliteGraphStateRepository,
} from "./canon-repository.ts";
import { withV2SqliteAsyncTransaction } from "../platform/index.ts";

export class V2SqliteReleaseRuntimeUnitOfWork implements V2ReleaseRuntimeUnitOfWork {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async withReleaseRuntimeTransaction<T>(
    fn: (repositories: {
      readonly canon: V2CanonRepository;
      readonly graphState: V2GraphStateRepository;
      readonly candidateReview: V2CandidateReviewRepository;
      readonly releaseRuntime: V2ReleaseRuntimeRepository;
    }) => Promise<T>,
  ): Promise<T> {
    return withV2SqliteAsyncTransaction(this.db, () => fn({
      canon: new V2SqliteCanonRepository(this.db),
      graphState: new V2SqliteGraphStateRepository(this.db),
      candidateReview: new V2SqliteCandidateReviewRepository(this.db),
      releaseRuntime: new V2SqliteReleaseRuntimeRepository(this.db),
    }));
  }
}

export class V2SqliteReleaseRuntimeRepository implements V2ReleaseRuntimeRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async getRelease(releaseId: V2ReleaseId): Promise<V2ReleaseManifest | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_releases WHERE release_id = ?").get(releaseId);
    return row === undefined ? undefined : mapRelease(row);
  }

  public async listReleases(storyWorldId: V2StoryWorldId): Promise<readonly V2ReleaseManifest[]> {
    return this.db.prepare("SELECT * FROM v2_releases WHERE story_world_id = ? ORDER BY created_at, release_id")
      .all(storyWorldId)
      .map(mapRelease);
  }

  public async createRelease(input: V2ReleaseManifest): Promise<V2ReleaseManifest> {
    this.db.prepare(`
      INSERT INTO v2_releases (
        release_id,
        story_world_id,
        version,
        source_revision,
        content_hash,
        manifest_json
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      input.releaseId,
      input.storyWorldId,
      input.version,
      input.sourceRevision,
      input.contentHash,
      JSON.stringify(input),
    );
    const created = await this.getRelease(input.releaseId as V2ReleaseId);
    if (!created) throw new Error("V2 release insert did not return a row");
    return created;
  }

  public async getRun(runId: V2RunId): Promise<V2RuntimeRun | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_runtime_runs WHERE run_id = ?").get(runId);
    return row === undefined ? undefined : mapRun(row);
  }

  public async createRun(input: V2RuntimeRun): Promise<V2RuntimeRun> {
    this.db.prepare(`
      INSERT INTO v2_runtime_runs (
        run_id,
        release_id,
        release_version,
        current_scene_id,
        state_json,
        choice_history_json,
        character_state_json,
        relationship_runtime_json,
        event_instances_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.runId,
      input.releaseId,
      input.releaseVersion,
      input.currentSceneId,
      JSON.stringify(input.stateValues),
      JSON.stringify(input.choiceHistory),
      JSON.stringify(input.characterState ?? {}),
      JSON.stringify(input.relationshipRuntime ?? {}),
      JSON.stringify(input.eventInstances ?? []),
    );
    const created = await this.getRun(input.runId as V2RunId);
    if (!created) throw new Error("V2 runtime run insert did not return a row");
    return created;
  }

  public async updateRun(input: V2RuntimeRun): Promise<V2RuntimeRun> {
    const result = this.db.prepare(`
      UPDATE v2_runtime_runs
      SET current_scene_id = ?,
          state_json = ?,
          choice_history_json = ?,
          character_state_json = ?,
          relationship_runtime_json = ?,
          event_instances_json = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE run_id = ?
    `).run(
      input.currentSceneId,
      JSON.stringify(input.stateValues),
      JSON.stringify(input.choiceHistory),
      JSON.stringify(input.characterState ?? {}),
      JSON.stringify(input.relationshipRuntime ?? {}),
      JSON.stringify(input.eventInstances ?? []),
      input.runId,
    );
    if (result.changes !== 1) throw new Error("V2 runtime run update did not affect one row");
    const updated = await this.getRun(input.runId as V2RunId);
    if (!updated) throw new Error("V2 runtime run disappeared after update");
    return updated;
  }

  public async getSave(saveId: V2SaveId): Promise<V2RuntimeSaveRecord | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_runtime_saves WHERE save_id = ?").get(saveId);
    return row === undefined ? undefined : mapSave(row);
  }

  public async listSavesByStoryWorld(storyWorldId: V2StoryWorldId, limit: number): Promise<readonly V2RuntimeSaveRecord[]> {
    return this.db.prepare(`
      SELECT saves.*
      FROM v2_runtime_saves saves
      INNER JOIN v2_releases releases ON releases.release_id = saves.release_id
      WHERE releases.story_world_id = ?
      ORDER BY saves.created_at DESC, saves.save_id DESC
      LIMIT ?
    `).all(storyWorldId, limit).map(mapSave);
  }

  public async createSave(input: V2RuntimeSaveRecord): Promise<V2RuntimeSaveRecord> {
    this.db.prepare(`
      INSERT INTO v2_runtime_saves (
        save_id,
        run_id,
        release_id,
        release_version,
        current_scene_id,
        state_json,
        choice_history_json,
        label,
        character_state_json,
        relationship_runtime_json,
        event_instances_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.saveId,
      input.runId,
      input.releaseId,
      input.releaseVersion,
      input.currentSceneId,
      JSON.stringify(input.stateValues),
      JSON.stringify(input.choiceHistory),
      input.label ?? null,
      JSON.stringify(input.characterState ?? {}),
      JSON.stringify(input.relationshipRuntime ?? {}),
      JSON.stringify(input.eventInstances ?? []),
    );
    const created = await this.getSave(input.saveId);
    if (!created) throw new Error("V2 runtime save insert did not return a row");
    return created;
  }
}

function mapRelease(row: unknown): V2ReleaseManifest {
  const record = requireRecord(row);
  const manifest = parseJsonObject<V2ReleaseManifest>(record.manifest_json, "manifest_json");
  return {
    ...manifest,
    createdAt: requireString(record.created_at, "created_at"),
  };
}

function mapRun(row: unknown): V2RuntimeRun {
  const record = requireRecord(row);
  return {
    runId: requireString(record.run_id, "run_id") as V2RunId,
    releaseId: requireString(record.release_id, "release_id") as V2ReleaseId,
    releaseVersion: requireString(record.release_version, "release_version"),
    currentSceneId: requireString(record.current_scene_id, "current_scene_id"),
    stateValues: parseStateRecord(record.state_json),
    choiceHistory: parseJsonArray<string>(record.choice_history_json, "choice_history_json"),
    characterState: parseJsonRecord<Record<string, Record<string, V2TypedStateValue>>>(record.character_state_json ?? "{}", "character_state_json"),
    relationshipRuntime: parseJsonRecord<Record<string, number>>(record.relationship_runtime_json ?? "{}", "relationship_runtime_json"),
    eventInstances: parseJsonArray(record.event_instances_json ?? "[]", "event_instances_json"),
    createdAt: requireString(record.created_at, "created_at"),
    updatedAt: requireString(record.updated_at, "updated_at"),
  };
}

function mapSave(row: unknown): V2RuntimeSaveRecord {
  const record = requireRecord(row);
  return {
    saveId: requireString(record.save_id, "save_id") as V2SaveId,
    runId: requireString(record.run_id, "run_id") as V2RunId,
    releaseId: requireString(record.release_id, "release_id") as V2ReleaseId,
    releaseVersion: requireString(record.release_version, "release_version"),
    currentSceneId: requireString(record.current_scene_id, "current_scene_id"),
    stateValues: parseStateRecord(record.state_json),
    choiceHistory: parseJsonArray<string>(record.choice_history_json, "choice_history_json"),
    characterState: parseJsonRecord<Record<string, Record<string, V2TypedStateValue>>>(record.character_state_json ?? "{}", "character_state_json"),
    relationshipRuntime: parseJsonRecord<Record<string, number>>(record.relationship_runtime_json ?? "{}", "relationship_runtime_json"),
    eventInstances: parseJsonArray(record.event_instances_json ?? "[]", "event_instances_json"),
    ...(record.label === null || record.label === undefined ? {} : { label: requireString(record.label, "label") }),
    createdAt: requireString(record.created_at, "created_at"),
  };
}

function parseStateRecord(value: unknown): Record<string, V2TypedStateValue> {
  const parsed = parseJsonObject<Record<string, unknown>>(value, "state_json");
  return Object.fromEntries(Object.entries(parsed).map(([key, item]) => {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") return [key, item];
    throw new Error("Expected runtime state value to be a scalar");
  }));
}

function parseJsonObject<T>(value: unknown, field: string): T {
  const parsed = JSON.parse(requireString(value, field));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Expected ${field} to be a JSON object`);
  }
  return parsed as T;
}

function parseJsonArray<T>(value: unknown, field: string): readonly T[] {
  const parsed = JSON.parse(requireString(value, field));
  if (!Array.isArray(parsed)) throw new Error(`Expected ${field} to be a JSON array`);
  return parsed as readonly T[];
}

function parseJsonRecord<T>(value: unknown, field: string): T {
  const parsed = JSON.parse(requireString(value, field));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(`Expected ${field} to be a JSON object`);
  return parsed as T;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected database row");
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Expected ${field} to be a string`);
  return value;
}
