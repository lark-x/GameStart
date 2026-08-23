import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type {
  V2CharacterId,
  V2ArcId,
  V2CandidateEnvelope,
  V2CandidateId,
  V2CandidateStatus,
  V2FactVisibility,
  V2IdempotencyKey,
  V2LocationId,
  V2CharacterContextTraceId,
  V2CharacterCandidateDto,
  V2CharacterCandidateStatus,
  V2CharacterProactivePolicyDto,
  V2Revision,
  V2RuleSeverity,
  V2SceneCandidatePayload,
  V2ChoiceId,
  V2SceneId,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
import type {
  V2CanonCharacter,
  V2CanonCharacterProfile,
  V2CanonCharacterRelationship,
  V2CanonCharacterStateDefinition,
  V2CanonCharacterVisualVariant,
  V2CanonCharacterEventDefinition,
  V2CanonFact,
  V2CanonLocation,
  V2CanonRule,
  V2CanonTimelineEvent,
  V2CanonWorld,
  V2CoreCandidateProvenance,
  V2CoreSceneCandidate,
  V2CoreSceneCandidatePayload,
  V2GraphArc,
  V2GraphChoice,
  V2GraphScene,
  V2GraphStateConsequence,
  V2GraphStateGate,
  V2ReviewAction,
  V2TypedStateValue,
  V2TypedStateValueType,
  V2TypedStateVariable,
} from "@living-network/domain/v2";
import { createV2SceneCandidate, V2DomainError } from "@living-network/domain/v2";
import type {
  CanonSnapshotReaderPort,
  V2CanonMutationRecord,
  V2CanonRepository,
  V2CanonUnitOfWork,
  V2CandidateReviewAuditRecord,
  V2CandidateReviewRepository,
  V2CandidateReviewUnitOfWork,
  V2GraphStateRepository,
  V2GraphStateUnitOfWork,
} from "@living-network/ports/v2";
import type { CandidateSubmissionPort } from "@living-network/ports/v2";

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

import {
  SqliteNarrativeReferenceRepository,
  SqliteSceneDocumentRepository,
} from "../narrative/index.ts";

export class V2SqliteCandidateReviewUnitOfWork implements V2CandidateReviewUnitOfWork {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async withCandidateReviewTransaction<T>(
    fn: (repositories: {
      readonly canon: V2CanonRepository;
      readonly graphState: V2GraphStateRepository;
      readonly candidateReview: V2CandidateReviewRepository;
      readonly references?: SqliteNarrativeReferenceRepository;
      readonly sceneDocument?: SqliteSceneDocumentRepository;
    }) => Promise<T>,
  ): Promise<T> {
    return withV2SqliteAsyncTransaction(this.db, () => fn({
      canon: new V2SqliteCanonRepository(this.db),
      graphState: new V2SqliteGraphStateRepository(this.db),
      candidateReview: new V2SqliteCandidateReviewRepository(this.db),
      references: new SqliteNarrativeReferenceRepository(this.db),
      sceneDocument: new SqliteSceneDocumentRepository(this.db),
    }));
  }
}

export class V2SqliteCandidateSubmissionPort implements CandidateSubmissionPort {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async submitSceneCandidate(input: {
    readonly candidate: V2CandidateEnvelope<V2SceneCandidatePayload>;
    readonly idempotencyKey: V2IdempotencyKey;
  }): Promise<{
    readonly candidateId: V2CandidateId;
    readonly status: V2CandidateStatus;
  }> {
    const unit = new V2SqliteCandidateReviewUnitOfWork(this.db);
    return unit.withCandidateReviewTransaction(async ({ canon, candidateReview }) => {
      if (input.candidate.kind !== "scene" || input.candidate.status !== "pending") {
        throw new V2DomainError("INVALID_INPUT", "Scene candidate submissions must be pending scene candidates");
      }
      const payload = { candidate: input.candidate };
      const operation = "submitSceneCandidate";
      const existing = await canon.readMutation<{
        readonly candidateId: V2CandidateId;
        readonly status: V2CandidateStatus;
      }>({ key: input.idempotencyKey, operation });
      const payloadHash = hashV2SqliteCandidatePayload(payload);
      if (existing) {
        if (existing.payloadHash !== payloadHash) {
          throw new V2DomainError("INVALID_INPUT", "Idempotency key was already used with a different candidate payload");
        }
        return existing.result;
      }
      const world = await canon.getWorld(input.candidate.storyWorldId);
      if (!world) throw new V2DomainError("INVALID_INPUT", "Scene candidate story world does not exist");
      if (world.revision !== input.candidate.baseCanonRevision) {
        throw new V2DomainError(
          "STALE_REVISION",
          `Candidate is based on revision ${input.candidate.baseCanonRevision}, current revision is ${world.revision}`,
        );
      }
      await candidateReview.createSceneCandidate(createV2SceneCandidate({
        candidateId: input.candidate.candidateId,
        storyWorldId: input.candidate.storyWorldId,
        baseCanonRevision: input.candidate.baseCanonRevision,
        payload: input.candidate.payload,
        provenance: input.candidate.provenance,
      }));
      const result = {
        candidateId: input.candidate.candidateId,
        status: input.candidate.status,
      };
      await canon.saveMutation({ key: input.idempotencyKey, operation, payloadHash, result });
      return result;
    });
  }
}

export class V2SqliteCanonSnapshotReader implements CanonSnapshotReaderPort {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async getCanonSnapshot(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly revision: V2Revision;
  }) {
    const canon = new V2SqliteCanonRepository(this.db);
    const graph = new V2SqliteGraphStateRepository(this.db);
    const world = await canon.getWorld(input.storyWorldId);
    if (!world) throw new V2DomainError("INVALID_INPUT", "Canon snapshot story world does not exist");
    if (world.revision !== input.revision) {
      throw new V2DomainError(
        "STALE_REVISION",
        `Requested canon revision ${input.revision}, current revision is ${world.revision}`,
      );
    }
    return {
      storyWorldId: input.storyWorldId,
      revision: input.revision,
      facts: (await canon.listFacts(input.storyWorldId)).map((fact) => ({
        id: fact.factId,
        text: fact.text,
        visibility: fact.visibility,
      })),
      characters: (await canon.listCharacters(input.storyWorldId)).map((character) => ({
        characterId: character.characterId as V2CharacterId,
        name: character.name,
        ...(character.profile === undefined ? {} : { profile: character.profile }),
      })),
      scenes: (await graph.listScenes(input.storyWorldId)).map((scene) => ({
        sceneId: scene.sceneId,
        title: scene.title,
      })),
    };
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
    const row = this.db.prepare("SELECT c.*, p.aliases_json, p.identity, p.tags_json, p.persona_json FROM v2_characters c LEFT JOIN v2_character_profiles p ON p.story_world_id = c.story_world_id AND p.character_id = c.character_id WHERE c.story_world_id = ? AND c.character_id = ?")
      .get(input.storyWorldId, input.characterId);
    return row === undefined ? undefined : mapCharacter(row);
  }

  public async listCharacters(storyWorldId: V2StoryWorldId): Promise<readonly V2CanonCharacter[]> {
    return this.db.prepare("SELECT c.*, p.aliases_json, p.identity, p.tags_json, p.persona_json FROM v2_characters c LEFT JOIN v2_character_profiles p ON p.story_world_id = c.story_world_id AND p.character_id = c.character_id WHERE c.story_world_id = ? ORDER BY c.created_at, c.character_id")
      .all(storyWorldId)
      .map(mapCharacter);
  }

  public async createCharacter(input: V2CanonCharacter): Promise<V2CanonCharacter> {
    this.db.prepare(`
      INSERT INTO v2_characters (character_id, story_world_id, name, summary, persona_text, home_location_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(input.characterId, input.storyWorldId, input.name, input.summary ?? null, input.personaText ?? null, input.homeLocationId ?? null);
    this.db.prepare(`INSERT INTO v2_character_profiles (story_world_id, character_id, aliases_json, identity, tags_json, persona_json) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(input.storyWorldId, input.characterId, JSON.stringify(input.profile?.aliases ?? []), input.profile?.identity ?? null, JSON.stringify(input.profile?.tags ?? []), JSON.stringify(input.profile?.persona ?? {}));
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

  public async updateWorld(input: V2CanonWorld): Promise<V2CanonWorld> {
    const result = this.db.prepare("UPDATE v2_worlds SET name = ?, summary = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE story_world_id = ?").run(input.name, input.summary ?? null, input.storyWorldId);
    if (result.changes !== 1) throw new Error("V2 world update did not find a row");
    return (await this.getWorld(input.storyWorldId as V2StoryWorldId))!;
  }

  public async updateLocation(input: V2CanonLocation): Promise<V2CanonLocation> {
    const result = this.db.prepare("UPDATE v2_locations SET name = ?, summary = ? WHERE story_world_id = ? AND location_id = ?").run(input.name, input.summary ?? null, input.storyWorldId, input.locationId);
    if (result.changes !== 1) throw new Error("V2 location update did not find a row");
    return (await this.getLocation({ storyWorldId: input.storyWorldId as V2StoryWorldId, locationId: input.locationId as V2LocationId }))!;
  }

  public async updateCharacter(input: V2CanonCharacter): Promise<V2CanonCharacter> {
    const result = this.db.prepare("UPDATE v2_characters SET name = ?, summary = ?, persona_text = ?, home_location_id = ? WHERE story_world_id = ? AND character_id = ?").run(input.name, input.summary ?? null, input.personaText ?? null, input.homeLocationId ?? null, input.storyWorldId, input.characterId);
    if (result.changes !== 1) throw new Error("V2 character update did not find a row");
    this.db.prepare(`UPDATE v2_character_profiles SET aliases_json = ?, identity = ?, tags_json = ?, persona_json = ? WHERE story_world_id = ? AND character_id = ?`)
      .run(JSON.stringify(input.profile?.aliases ?? []), input.profile?.identity ?? null, JSON.stringify(input.profile?.tags ?? []), JSON.stringify(input.profile?.persona ?? {}), input.storyWorldId, input.characterId);
    return (await this.getCharacter({ storyWorldId: input.storyWorldId as V2StoryWorldId, characterId: input.characterId as V2CharacterId }))!;
  }

  public async listCharacterRelationships(storyWorldId: V2StoryWorldId, characterId?: V2CharacterId): Promise<readonly V2CanonCharacterRelationship[]> {
    const rows = characterId
      ? this.db.prepare("SELECT * FROM v2_character_relationships WHERE story_world_id = ? AND (from_character_id = ? OR to_character_id = ?) AND archived_at IS NULL ORDER BY relationship_id").all(storyWorldId, characterId, characterId)
      : this.db.prepare("SELECT * FROM v2_character_relationships WHERE story_world_id = ? AND archived_at IS NULL ORDER BY relationship_id").all(storyWorldId);
    return rows.map(mapCharacterRelationship);
  }

  public async upsertCharacterRelationship(input: V2CanonCharacterRelationship): Promise<V2CanonCharacterRelationship> {
    this.db.prepare(`INSERT INTO v2_character_relationships (relationship_id, story_world_id, from_character_id, to_character_id, type, custom_label, description, strength, visibility, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(story_world_id, from_character_id, to_character_id) DO UPDATE SET relationship_id=excluded.relationship_id, type=excluded.type, custom_label=excluded.custom_label, description=excluded.description, strength=excluded.strength, visibility=excluded.visibility, archived_at=excluded.archived_at`)
      .run(input.relationshipId, input.storyWorldId, input.fromCharacterId, input.toCharacterId, input.type, input.customLabel ?? null, input.description ?? null, input.strength, input.visibility, input.archivedAt ?? null);
    return mapCharacterRelationship(this.db.prepare("SELECT * FROM v2_character_relationships WHERE story_world_id = ? AND relationship_id = ?").get(input.storyWorldId, input.relationshipId));
  }

  public async recordCharacterContextTrace(input: {
    readonly traceId: V2CharacterContextTraceId;
    readonly storyWorldId: V2StoryWorldId;
    readonly task: string;
    readonly contextHash: string;
    readonly canonRevision: V2Revision;
    readonly sources: unknown;
    readonly omittedSources: unknown;
    readonly budget: unknown;
  }): Promise<void> {
    this.db.prepare(`INSERT INTO v2_character_context_traces (trace_id, story_world_id, task, context_hash, canon_revision, selected_sources_json, omitted_sources_json, budget_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(input.traceId, input.storyWorldId, input.task, input.contextHash, input.canonRevision, JSON.stringify(input.sources), JSON.stringify(input.omittedSources), JSON.stringify(input.budget));
  }

  public async listCharacterContextTraces(storyWorldId: V2StoryWorldId, limit = 100): Promise<readonly import("@living-network/contracts/v2").V2CharacterContextTraceDto[]> {
    return this.db.prepare("SELECT * FROM v2_character_context_traces WHERE story_world_id = ? ORDER BY created_at DESC, trace_id DESC LIMIT ?").all(storyWorldId, Math.min(Math.max(limit, 1), 500)).map((row) => {
      const record = requireRecord(row);
      return {
        traceId: requireString(record.trace_id, "trace_id") as never,
        storyWorldId: requireString(record.story_world_id, "story_world_id") as never,
        task: requireString(record.task, "task") as never,
        contextHash: requireString(record.context_hash, "context_hash"),
        canonRevision: Number(record.canon_revision) as never,
        sources: normalizeTraceSources(parseJsonValue(record.selected_sources_json, "selected_sources_json")),
        omittedSources: normalizeTraceSources(parseJsonValue(record.omitted_sources_json, "omitted_sources_json")),
      };
    });
  }

  public async listCharacterStateDefinitions(storyWorldId: V2StoryWorldId, characterId?: V2CharacterId): Promise<readonly V2CanonCharacterStateDefinition[]> {
    const rows = characterId
      ? this.db.prepare("SELECT * FROM v2_character_state_definitions WHERE story_world_id = ? AND character_id = ? AND archived_at IS NULL ORDER BY key").all(storyWorldId, characterId)
      : this.db.prepare("SELECT * FROM v2_character_state_definitions WHERE story_world_id = ? AND archived_at IS NULL ORDER BY character_id, key").all(storyWorldId);
    return rows.map(mapCharacterStateDefinition);
  }

  public async createCharacterStateDefinition(input: V2CanonCharacterStateDefinition): Promise<V2CanonCharacterStateDefinition> {
    this.db.prepare("INSERT INTO v2_character_state_definitions (state_definition_id, story_world_id, character_id, key, value_type, default_json, constraints_json) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(input.stateDefinitionId, input.storyWorldId, input.characterId, input.key, input.valueType, JSON.stringify(input.defaultValue), JSON.stringify(input.constraints));
    return (await this.listCharacterStateDefinitions(input.storyWorldId as V2StoryWorldId, input.characterId as V2CharacterId)).find((item) => item.stateDefinitionId === input.stateDefinitionId)!;
  }

  public async updateCharacterStateDefinition(input: V2CanonCharacterStateDefinition): Promise<V2CanonCharacterStateDefinition> {
    const result = this.db.prepare("UPDATE v2_character_state_definitions SET default_json = ?, constraints_json = ?, archived_at = ? WHERE story_world_id = ? AND state_definition_id = ?")
      .run(JSON.stringify(input.defaultValue), JSON.stringify(input.constraints), input.archivedAt ?? null, input.storyWorldId, input.stateDefinitionId);
    if (result.changes !== 1) throw new Error("V2 character state definition update did not affect one row");
    return (await this.listCharacterStateDefinitions(input.storyWorldId as V2StoryWorldId, input.characterId as V2CharacterId)).find((item) => item.stateDefinitionId === input.stateDefinitionId) ?? input;
  }

  public async listCharacterVisualVariants(storyWorldId: V2StoryWorldId, characterId?: V2CharacterId): Promise<readonly V2CanonCharacterVisualVariant[]> {
    const rows = characterId
      ? this.db.prepare("SELECT * FROM v2_character_visual_variants WHERE story_world_id = ? AND character_id = ? AND archived_at IS NULL ORDER BY name").all(storyWorldId, characterId)
      : this.db.prepare("SELECT * FROM v2_character_visual_variants WHERE story_world_id = ? AND archived_at IS NULL ORDER BY character_id, name").all(storyWorldId);
    return rows.map((row) => mapCharacterVisualVariant(row, this.db));
  }

  public async upsertCharacterVisualVariant(input: V2CanonCharacterVisualVariant): Promise<V2CanonCharacterVisualVariant> {
    for (const assetId of input.referenceAssetIds) {
      const approved = this.db.prepare("SELECT asset_id FROM v2_approved_assets WHERE asset_id = ? AND story_world_id = ?").get(assetId, input.storyWorldId);
      if (approved === undefined) throw new V2DomainError("INVALID_INPUT", `Reference asset ${assetId} must be an approved formal asset in this world`);
    }
    if (input.isDefault) this.db.prepare("UPDATE v2_character_visual_variants SET is_default = 0 WHERE story_world_id = ? AND character_id = ?").run(input.storyWorldId, input.characterId);
    this.db.prepare(`INSERT INTO v2_character_visual_variants (visual_variant_id, story_world_id, character_id, name, appearance_json, loras_json, trigger_words_json, negative_prompt, workflow_preset, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(visual_variant_id) DO UPDATE SET name=excluded.name, appearance_json=excluded.appearance_json, loras_json=excluded.loras_json, trigger_words_json=excluded.trigger_words_json, negative_prompt=excluded.negative_prompt, workflow_preset=excluded.workflow_preset, is_default=excluded.is_default, archived_at=NULL`)
      .run(input.visualVariantId, input.storyWorldId, input.characterId, input.name, JSON.stringify(input.appearance), JSON.stringify(input.loras), JSON.stringify(input.triggerWords), input.negativePrompt ?? null, input.workflowPreset ?? null, input.isDefault ? 1 : 0);
    this.db.prepare("DELETE FROM v2_character_reference_assets WHERE visual_variant_id = ?").run(input.visualVariantId);
    for (const assetId of input.referenceAssetIds) this.db.prepare("INSERT INTO v2_character_reference_assets (visual_variant_id, asset_id) VALUES (?, ?)").run(input.visualVariantId, assetId);
    return mapCharacterVisualVariant(this.db.prepare("SELECT * FROM v2_character_visual_variants WHERE visual_variant_id = ?").get(input.visualVariantId), this.db);
  }

  public async listCharacterEventDefinitions(storyWorldId: V2StoryWorldId): Promise<readonly V2CanonCharacterEventDefinition[]> {
    return this.db.prepare("SELECT * FROM v2_character_event_definitions WHERE story_world_id = ? AND archived_at IS NULL ORDER BY name").all(storyWorldId).map(mapCharacterEventDefinition);
  }

  public async upsertCharacterEventDefinition(input: V2CanonCharacterEventDefinition): Promise<V2CanonCharacterEventDefinition> {
    this.db.prepare(`INSERT INTO v2_character_event_definitions (event_definition_id, story_world_id, name, description, participant_ids_json, initial_state_json) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_definition_id) DO UPDATE SET name=excluded.name, description=excluded.description, participant_ids_json=excluded.participant_ids_json, initial_state_json=excluded.initial_state_json, archived_at=NULL`)
      .run(input.eventDefinitionId, input.storyWorldId, input.name, input.description ?? null, JSON.stringify(input.participantCharacterIds), JSON.stringify(input.initialState));
    return (await this.listCharacterEventDefinitions(input.storyWorldId as V2StoryWorldId)).find((item) => item.eventDefinitionId === input.eventDefinitionId)!;
  }

  public async getCharacterProactivePolicy(storyWorldId: V2StoryWorldId, characterId: V2CharacterId): Promise<V2CharacterProactivePolicyDto | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_character_proactive_policy WHERE story_world_id = ? AND character_id = ?").get(storyWorldId, characterId);
    if (row === undefined) return undefined;
    const record = requireRecord(row);
    return {
      storyWorldId,
      characterId,
      enabled: Number(record.enabled) === 1,
      cooldownMinutes: Number(record.cooldown_minutes),
      dailyLimit: Number(record.daily_limit),
      quietStart: requireString(record.quiet_start, "quiet_start"),
      quietEnd: requireString(record.quiet_end, "quiet_end"),
      ...(record.last_executed_at === null ? {} : { lastExecutedAt: requireString(record.last_executed_at, "last_executed_at") }),
    };
  }

  public async updateCharacterProactivePolicy(input: V2CharacterProactivePolicyDto): Promise<V2CharacterProactivePolicyDto> {
    this.db.prepare(`INSERT INTO v2_character_proactive_policy (story_world_id, character_id, enabled, cooldown_minutes, daily_limit, quiet_start, quiet_end, last_executed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(story_world_id, character_id) DO UPDATE SET enabled=excluded.enabled, cooldown_minutes=excluded.cooldown_minutes, daily_limit=excluded.daily_limit, quiet_start=excluded.quiet_start, quiet_end=excluded.quiet_end, last_executed_at=excluded.last_executed_at`)
      .run(input.storyWorldId, input.characterId, input.enabled ? 1 : 0, input.cooldownMinutes, input.dailyLimit, input.quietStart, input.quietEnd, input.lastExecutedAt ?? null);
    return (await this.getCharacterProactivePolicy(input.storyWorldId, input.characterId))!;
  }

  public async createCharacterCandidate(input: Omit<V2CharacterCandidateDto, "createdAt"> & { readonly createdAt?: string }): Promise<V2CharacterCandidateDto> {
    this.db.prepare("INSERT INTO v2_character_candidates (candidate_id, story_world_id, kind, target_scope, base_revision, status, payload_json, provenance_json, context_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(input.candidateId, input.storyWorldId, input.kind, input.targetScope, input.baseRevision, input.status, JSON.stringify(input.payload), JSON.stringify(input.provenance), input.contextHash ?? null);
    const created = await this.getCharacterCandidate(input.storyWorldId, input.candidateId);
    if (!created) throw new Error("Character candidate insert did not return a row");
    return created;
  }

  public async getCharacterCandidate(storyWorldId: V2StoryWorldId, candidateId: string): Promise<V2CharacterCandidateDto | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_character_candidates WHERE story_world_id = ? AND candidate_id = ?").get(storyWorldId, candidateId);
    return row === undefined ? undefined : mapCharacterCandidate(row);
  }

  public async listCharacterCandidates(storyWorldId: V2StoryWorldId, status?: V2CharacterCandidateStatus): Promise<readonly V2CharacterCandidateDto[]> {
    const rows = status === undefined
      ? this.db.prepare("SELECT * FROM v2_character_candidates WHERE story_world_id = ? ORDER BY created_at DESC, candidate_id").all(storyWorldId)
      : this.db.prepare("SELECT * FROM v2_character_candidates WHERE story_world_id = ? AND status = ? ORDER BY created_at DESC, candidate_id").all(storyWorldId, status);
    return rows.map(mapCharacterCandidate);
  }

  public async reviewCharacterCandidate(input: { readonly storyWorldId: V2StoryWorldId; readonly candidateId: string; readonly status: V2CharacterCandidateStatus; readonly reviewer: string; readonly reason?: string }): Promise<V2CharacterCandidateDto> {
    const result = this.db.prepare("UPDATE v2_character_candidates SET status = ?, reviewed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), reviewer = ?, review_reason = ? WHERE story_world_id = ? AND candidate_id = ? AND status = 'pending'")
      .run(input.status, input.reviewer, input.reason ?? null, input.storyWorldId, input.candidateId);
    if (result.changes !== 1) throw new V2DomainError("INVALID_INPUT", "Character candidate is missing or already reviewed");
    this.db.prepare("INSERT INTO v2_character_candidate_review_audits (story_world_id, candidate_id, status, reviewer, reason, reviewed_at) VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))")
      .run(input.storyWorldId, input.candidateId, input.status, input.reviewer, input.reason ?? null);
    return (await this.getCharacterCandidate(input.storyWorldId, input.candidateId))!;
  }

  public async updateFact(input: V2CanonFact): Promise<V2CanonFact> {
    const result = this.db.prepare("UPDATE v2_facts SET text = ?, visibility = ? WHERE story_world_id = ? AND fact_id = ?").run(input.text, input.visibility, input.storyWorldId, input.factId);
    if (result.changes !== 1) throw new Error("V2 fact update did not find a row");
    return input;
  }

  public async updateRule(input: V2CanonRule): Promise<V2CanonRule> {
    const result = this.db.prepare("UPDATE v2_rules SET text = ?, severity = ? WHERE story_world_id = ? AND rule_id = ?").run(input.text, input.severity, input.storyWorldId, input.ruleId);
    if (result.changes !== 1) throw new Error("V2 rule update did not find a row");
    return input;
  }

  public async updateTimelineEvent(input: V2CanonTimelineEvent): Promise<V2CanonTimelineEvent> {
    const result = this.db.prepare("UPDATE v2_timeline_events SET local_date = ?, title = ?, summary = ? WHERE story_world_id = ? AND timeline_event_id = ?").run(input.localDate, input.title, input.summary ?? null, input.storyWorldId, input.timelineEventId);
    if (result.changes !== 1) throw new Error("V2 timeline event update did not find a row");
    return input;
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

function normalizeTraceSources(value: unknown): readonly { readonly path: string; readonly sourceId?: string; readonly reason: string; readonly tokens: number }[] {
  if (Array.isArray(value)) return value as readonly { readonly path: string; readonly sourceId?: string; readonly reason: string; readonly tokens: number }[];
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([path, item]) => ({ path, reason: "legacy_trace", tokens: 1, ...(typeof item === "string" ? { sourceId: item } : {}) }));
  return [];
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
  public async updateArc(input: V2GraphArc): Promise<V2GraphArc> {
    const result = this.db.prepare("UPDATE v2_arcs SET title = ?, summary = ? WHERE story_world_id = ? AND arc_id = ?").run(input.title, input.summary ?? null, input.storyWorldId, input.arcId);
    if (result.changes !== 1) throw new Error("V2 arc update did not find a row");
    return (await this.getArc({ storyWorldId: input.storyWorldId as V2StoryWorldId, arcId: input.arcId as V2ArcId }))!;
  }

  public async updateScene(input: V2GraphScene): Promise<V2GraphScene> {
    const result = this.db.prepare("UPDATE v2_scenes SET arc_id = ?, title = ?, body = ?, is_entry = ? WHERE story_world_id = ? AND scene_id = ?").run(input.arcId ?? null, input.title, input.body ?? null, input.isEntry ? 1 : 0, input.storyWorldId, input.sceneId);
    if (result.changes !== 1) throw new Error("V2 scene update did not find a row");
    return (await this.getScene({ storyWorldId: input.storyWorldId as V2StoryWorldId, sceneId: input.sceneId as V2SceneId }))!;
  }

  public async updateChoice(input: V2GraphChoice): Promise<V2GraphChoice> {
    const result = this.db.prepare("UPDATE v2_choices SET source_scene_id = ?, target_scene_id = ?, label = ?, gates_json = ?, consequences_json = ? WHERE story_world_id = ? AND choice_id = ?").run(input.sourceSceneId, input.targetSceneId ?? null, input.label, JSON.stringify(input.gates), JSON.stringify(input.consequences), input.storyWorldId, input.choiceId);
    if (result.changes !== 1) throw new Error("V2 choice update did not find a row");
    return (await this.getChoice({ storyWorldId: input.storyWorldId as V2StoryWorldId, choiceId: input.choiceId as V2ChoiceId }))!;
  }

  public async updateStateVariable(input: V2TypedStateVariable): Promise<V2TypedStateVariable> {
    const result = this.db.prepare("UPDATE v2_state_variables SET default_json = ? WHERE story_world_id = ? AND key = ?").run(JSON.stringify(input.defaultValue), input.storyWorldId, input.key);
    if (result.changes !== 1) throw new Error("V2 state variable update did not find a row");
    return (await this.getStateVariable({ storyWorldId: input.storyWorldId as V2StoryWorldId, key: input.key }))!;
  }
}

export class V2SqliteCandidateReviewRepository implements V2CandidateReviewRepository {

  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async getSceneCandidate(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly candidateId: V2CandidateId;
  }): Promise<V2CoreSceneCandidate | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_scene_candidates WHERE story_world_id = ? AND candidate_id = ?")
      .get(input.storyWorldId, input.candidateId);
    return row === undefined ? undefined : mapSceneCandidate(row);
  }

  public async listSceneCandidates(storyWorldId: V2StoryWorldId): Promise<readonly V2CoreSceneCandidate[]> {
    return this.db.prepare("SELECT * FROM v2_scene_candidates WHERE story_world_id = ? ORDER BY created_at, candidate_id")
      .all(storyWorldId)
      .map(mapSceneCandidate);
  }

  public async createSceneCandidate(input: V2CoreSceneCandidate): Promise<V2CoreSceneCandidate> {
    this.db.prepare(`
      INSERT INTO v2_scene_candidates (
        candidate_id,
        story_world_id,
        base_canon_revision,
        status,
        payload_json,
        provenance_json
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      input.candidateId,
      input.storyWorldId,
      input.baseCanonRevision,
      input.status,
      JSON.stringify(input.payload),
      JSON.stringify(input.provenance),
    );
    const created = await this.getSceneCandidate({
      storyWorldId: input.storyWorldId as V2StoryWorldId,
      candidateId: input.candidateId as V2CandidateId,
    });
    if (!created) throw new Error("V2 scene candidate insert did not return a row");
    return created;
  }

  public async updateSceneCandidateReview(input: {
    readonly candidate: V2CoreSceneCandidate;
    readonly reviewedAt: string;
  }): Promise<V2CoreSceneCandidate> {
    const result = this.db.prepare(`
      UPDATE v2_scene_candidates
      SET status = ?,
          reviewed_at = ?,
          reviewer = ?,
          review_reason = ?
      WHERE story_world_id = ? AND candidate_id = ?
    `).run(
      input.candidate.status,
      input.reviewedAt,
      input.candidate.reviewer ?? null,
      input.candidate.reviewReason ?? null,
      input.candidate.storyWorldId,
      input.candidate.candidateId,
    );
    if (result.changes !== 1) throw new Error("V2 scene candidate review update did not affect one row");
    const updated = await this.getSceneCandidate({
      storyWorldId: input.candidate.storyWorldId as V2StoryWorldId,
      candidateId: input.candidate.candidateId as V2CandidateId,
    });
    if (!updated) throw new Error("V2 scene candidate disappeared after review update");
    return updated;
  }

  public async createAudit(input: V2CandidateReviewAuditRecord): Promise<V2CandidateReviewAuditRecord> {
    const result = this.db.prepare(`
      INSERT INTO v2_candidate_review_audits (
        candidate_id,
        story_world_id,
        from_status,
        to_status,
        action,
        reviewer,
        reason,
        resulting_revision
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.candidateId,
      input.storyWorldId,
      input.fromStatus,
      input.toStatus,
      input.action,
      input.reviewer,
      input.reason ?? null,
      input.resultingRevision,
    );
    const auditId = Number(result.lastInsertRowid);
    const row = this.db.prepare("SELECT * FROM v2_candidate_review_audits WHERE audit_id = ?").get(auditId);
    if (row === undefined) throw new Error("V2 candidate review audit insert did not return a row");
    return mapCandidateReviewAudit(row);
  }

  public async listAudits(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly candidateId: V2CandidateId;
  }): Promise<readonly V2CandidateReviewAuditRecord[]> {
    return this.db.prepare(`
      SELECT * FROM v2_candidate_review_audits
      WHERE story_world_id = ? AND candidate_id = ?
      ORDER BY created_at, audit_id
    `).all(input.storyWorldId, input.candidateId).map(mapCandidateReviewAudit);
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
    ...(record.persona_text === null ? {} : { personaText: requireString(record.persona_text, "persona_text") }),
    profile: mapCharacterProfile(record),
    ...(record.home_location_id === null ? {} : { homeLocationId: requireString(record.home_location_id, "home_location_id") as V2LocationId }),
    createdAt: requireString(record.created_at, "created_at"),
  };
}

function mapCharacterProfile(record: Record<string, unknown>): V2CanonCharacterProfile {
  const legacy = record.persona_text === null ? undefined : requireString(record.persona_text, "persona_text");
  const aliases = parseCharacterJsonArray(record.aliases_json);
  const tags = parseCharacterJsonArray(record.tags_json);
  const personaRecord = parseJsonRecord(record.persona_json);
  return {
    aliases,
    tags,
    ...(record.identity === null || record.identity === undefined ? {} : { identity: requireString(record.identity, "identity") }),
    persona: {
      traits: parseCharacterJsonArray(personaRecord.traits),
      behaviorPatterns: parseCharacterJsonArray(personaRecord.behaviorPatterns),
      values: parseCharacterJsonArray(personaRecord.values),
      taboos: parseCharacterJsonArray(personaRecord.taboos),
      ...(typeof personaRecord.speechStyle === "string" ? { speechStyle: personaRecord.speechStyle } : {}),
      ...(typeof personaRecord.backgroundStory === "string" ? { backgroundStory: personaRecord.backgroundStory } : {}),
      ...(typeof personaRecord.advancedPrompt === "string" ? { advancedPrompt: personaRecord.advancedPrompt } : legacy === undefined ? {} : { advancedPrompt: legacy }),
    },
  };
}

function parseCharacterJsonArray(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string") return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; }
}

function mapCharacterRelationship(row: unknown): V2CanonCharacterRelationship {
  const record = requireRecord(row);
  return {
    relationshipId: requireString(record.relationship_id, "relationship_id"),
    storyWorldId: requireString(record.story_world_id, "story_world_id"),
    fromCharacterId: requireString(record.from_character_id, "from_character_id"),
    toCharacterId: requireString(record.to_character_id, "to_character_id"),
    type: requireString(record.type, "type") as V2CanonCharacterRelationship["type"],
    ...(record.custom_label === null ? {} : { customLabel: requireString(record.custom_label, "custom_label") }),
    ...(record.description === null ? {} : { description: requireString(record.description, "description") }),
    strength: Number(record.strength),
    visibility: requireString(record.visibility, "visibility") as V2CanonCharacterRelationship["visibility"],
    ...(record.archived_at === null ? {} : { archivedAt: requireString(record.archived_at, "archived_at") }),
  };
}

function mapCharacterStateDefinition(row: unknown): V2CanonCharacterStateDefinition {
  const record = requireRecord(row);
  const valueType = requireString(record.value_type, "value_type") as V2CanonCharacterStateDefinition["valueType"];
  const defaultValue = JSON.parse(requireString(record.default_json, "default_json")) as unknown;
  if (typeof defaultValue !== valueType) throw new Error("Character state default type mismatch");
  return {
    stateDefinitionId: requireString(record.state_definition_id, "state_definition_id"),
    storyWorldId: requireString(record.story_world_id, "story_world_id"),
    characterId: requireString(record.character_id, "character_id"),
    key: requireString(record.key, "key"),
    valueType,
    defaultValue: defaultValue as string | number | boolean,
    constraints: parseCharacterScalarRecord(record.constraints_json),
    ...(record.archived_at === null ? {} : { archivedAt: requireString(record.archived_at, "archived_at") }),
  };
}

function parseCharacterScalarRecord(value: unknown): Readonly<Record<string, string | number | boolean>> {
  const parsed = parseJsonRecord(value);
  const entries = Object.entries(parsed).filter(([, item]) => typeof item === "string" || typeof item === "number" || typeof item === "boolean");
  return Object.fromEntries(entries) as Readonly<Record<string, string | number | boolean>>;
}

function mapCharacterVisualVariant(row: unknown, db: DatabaseSync): V2CanonCharacterVisualVariant {
  const record = requireRecord(row);
  return {
    visualVariantId: requireString(record.visual_variant_id, "visual_variant_id"),
    storyWorldId: requireString(record.story_world_id, "story_world_id"),
    characterId: requireString(record.character_id, "character_id"),
    name: requireString(record.name, "name"),
    appearance: parseJsonRecord(record.appearance_json) as Readonly<Record<string, string>>,
    loras: parseJsonArray<{ readonly name: string; readonly weight: number }>(record.loras_json, "loras_json"),
    triggerWords: parseJsonArray<string>(record.trigger_words_json, "trigger_words_json"),
    ...(record.negative_prompt === null ? {} : { negativePrompt: requireString(record.negative_prompt, "negative_prompt") }),
    ...(record.workflow_preset === null ? {} : { workflowPreset: requireString(record.workflow_preset, "workflow_preset") }),
    isDefault: Number(record.is_default) === 1,
    referenceAssetIds: db.prepare("SELECT asset_id FROM v2_character_reference_assets WHERE visual_variant_id = ? ORDER BY asset_id").all(requireString(record.visual_variant_id, "visual_variant_id")).map((item) => requireString((item as Record<string, unknown>).asset_id, "asset_id")),
    ...(record.archived_at === null ? {} : { archivedAt: requireString(record.archived_at, "archived_at") }),
  };
}

function mapCharacterCandidate(row: unknown): V2CharacterCandidateDto {
  const record = requireRecord(row);
  return {
    candidateId: requireString(record.candidate_id, "candidate_id") as V2CharacterCandidateDto["candidateId"],
    storyWorldId: requireString(record.story_world_id, "story_world_id") as V2CharacterCandidateDto["storyWorldId"],
    kind: requireString(record.kind, "kind") as V2CharacterCandidateDto["kind"],
    targetScope: requireString(record.target_scope, "target_scope"),
    baseRevision: Number(record.base_revision) as V2CharacterCandidateDto["baseRevision"],
    status: requireString(record.status, "status") as V2CharacterCandidateDto["status"],
    payload: parseJsonValue(record.payload_json, "payload_json"),
    provenance: parseJsonValue(record.provenance_json, "provenance_json"),
    ...(record.context_hash === null ? {} : { contextHash: requireString(record.context_hash, "context_hash") }),
    createdAt: requireString(record.created_at, "created_at"),
    ...(record.reviewed_at === null ? {} : { reviewedAt: requireString(record.reviewed_at, "reviewed_at") }),
    ...(record.reviewer === null ? {} : { reviewer: requireString(record.reviewer, "reviewer") }),
    ...(record.review_reason === null ? {} : { reviewReason: requireString(record.review_reason, "review_reason") }),
  };
}

function mapCharacterEventDefinition(row: unknown): V2CanonCharacterEventDefinition {
  const record = requireRecord(row);
  return {
    eventDefinitionId: requireString(record.event_definition_id, "event_definition_id"),
    storyWorldId: requireString(record.story_world_id, "story_world_id"),
    name: requireString(record.name, "name"),
    ...(record.description === null ? {} : { description: requireString(record.description, "description") }),
    participantCharacterIds: parseJsonArray<string>(record.participant_ids_json, "participant_ids_json"),
    initialState: parseCharacterScalarRecord(record.initial_state_json),
    ...(record.archived_at === null ? {} : { archivedAt: requireString(record.archived_at, "archived_at") }),
  };
}

function parseJsonValue(value: unknown, field: string): unknown {
  return JSON.parse(requireString(value, field)) as unknown;
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

function mapSceneCandidate(row: unknown): V2CoreSceneCandidate {
  const record = requireRecord(row);
  return {
    candidateId: requireString(record.candidate_id, "candidate_id") as V2CandidateId,
    kind: "scene",
    storyWorldId: requireString(record.story_world_id, "story_world_id") as V2StoryWorldId,
    baseCanonRevision: requireNumber(record.base_canon_revision, "base_canon_revision") as V2Revision,
    status: requireString(record.status, "status") as V2CandidateStatus,
    payload: parseJsonObject<V2CoreSceneCandidatePayload>(record.payload_json, "payload_json"),
    provenance: parseJsonObject<V2CoreCandidateProvenance>(record.provenance_json, "provenance_json"),
    createdAt: requireString(record.created_at, "created_at"),
    ...(record.reviewed_at === null ? {} : { reviewedAt: requireString(record.reviewed_at, "reviewed_at") }),
    ...(record.reviewer === null ? {} : { reviewer: requireString(record.reviewer, "reviewer") }),
    ...(record.review_reason === null ? {} : { reviewReason: requireString(record.review_reason, "review_reason") }),
  };
}

function mapCandidateReviewAudit(row: unknown): V2CandidateReviewAuditRecord {
  const record = requireRecord(row);
  return {
    auditId: requireNumber(record.audit_id, "audit_id"),
    candidateId: requireString(record.candidate_id, "candidate_id") as V2CandidateId,
    storyWorldId: requireString(record.story_world_id, "story_world_id") as V2StoryWorldId,
    fromStatus: requireString(record.from_status, "from_status") as V2CandidateStatus,
    toStatus: requireString(record.to_status, "to_status") as V2CandidateStatus,
    action: requireString(record.action, "action") as V2ReviewAction,
    reviewer: requireString(record.reviewer, "reviewer"),
    ...(record.reason === null ? {} : { reason: requireString(record.reason, "reason") }),
    resultingRevision: requireNumber(record.resulting_revision, "resulting_revision") as V2Revision,
    createdAt: requireString(record.created_at, "created_at"),
  };
}

function parseJsonArray<T>(value: unknown, field: string): readonly T[] {
  const parsed = JSON.parse(requireString(value, field));
  if (!Array.isArray(parsed)) throw new Error(`Expected ${field} to be a JSON array`);
  return parsed as readonly T[];
}

function parseJsonObject<T>(value: unknown, field: string): T {
  const parsed = JSON.parse(requireString(value, field));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Expected ${field} to be a JSON object`);
  }
  return parsed as T;
}

function hashV2SqliteCandidatePayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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
