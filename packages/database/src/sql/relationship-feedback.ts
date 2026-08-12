import type { RelationshipChangeCandidate, RelationshipEvent } from "@living-network/domain";
import { RelationshipChangeCandidateStatus, createRelationshipChangeCandidate } from "@living-network/domain";
import type { RelationshipChangeCandidateRepository, RelationshipEventRepository } from "@living-network/ports";
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

function mapRelationshipChangeCandidateRow(row: SqlRow): RelationshipChangeCandidate {
  const candidate: RelationshipChangeCandidate = {
    id: requiredString(row.id, "relationship_change_candidates.id"),
    storyWorldId: requiredString(row.story_world_id, "relationship_change_candidates.story_world_id"),
    edgeId: requiredString(row.edge_id, "relationship_change_candidates.edge_id"),
    sourceType: requiredString(row.source_type, "relationship_change_candidates.source_type"),
    deltaAffinity: requiredNumber(row.delta_affinity, "relationship_change_candidates.delta_affinity"),
    deltaTrust: requiredNumber(row.delta_trust, "relationship_change_candidates.delta_trust"),
    deltaConflict: requiredNumber(row.delta_conflict, "relationship_change_candidates.delta_conflict"),
    deltaDependency: requiredNumber(row.delta_dependency, "relationship_change_candidates.delta_dependency"),
    status: requiredString(row.status, "relationship_change_candidates.status") as RelationshipChangeCandidate["status"],
    createdAt: requiredTimestamp(row.created_at, "relationship_change_candidates.created_at"),
  };
  const sourceRef = optionalString(row.source_ref, "relationship_change_candidates.source_ref");
  if (sourceRef !== undefined) (candidate as { sourceRef?: string }).sourceRef = sourceRef;
  const reason = optionalString(row.reason, "relationship_change_candidates.reason");
  if (reason !== undefined) (candidate as { reason?: string }).reason = reason;
  const ruleVersion = optionalString(row.rule_version, "relationship_change_candidates.rule_version");
  if (ruleVersion !== undefined) (candidate as { ruleVersion?: string }).ruleVersion = ruleVersion;
  const idempotencyKey = optionalString(row.idempotency_key, "relationship_change_candidates.idempotency_key");
  if (idempotencyKey !== undefined) (candidate as { idempotencyKey?: string }).idempotencyKey = idempotencyKey;
  const reviewedAt = optionalString(row.reviewed_at, "relationship_change_candidates.reviewed_at");
  if (reviewedAt !== undefined) (candidate as { reviewedAt?: string }).reviewedAt = reviewedAt;
  return candidate;
}

function mapRelationshipEventRow(row: SqlRow): RelationshipEvent {
  const event: RelationshipEvent = {
    id: requiredString(row.id, "relationship_events.id"),
    storyWorldId: requiredString(row.story_world_id, "relationship_events.story_world_id"),
    edgeId: requiredString(row.edge_id, "relationship_events.edge_id"),
    sourceType: requiredString(row.source_type, "relationship_events.source_type"),
    beforeAffinity: requiredNumber(row.before_affinity, "relationship_events.before_affinity"),
    beforeTrust: requiredNumber(row.before_trust, "relationship_events.before_trust"),
    beforeConflict: requiredNumber(row.before_conflict, "relationship_events.before_conflict"),
    beforeDependency: requiredNumber(row.before_dependency, "relationship_events.before_dependency"),
    deltaAffinity: requiredNumber(row.delta_affinity, "relationship_events.delta_affinity"),
    deltaTrust: requiredNumber(row.delta_trust, "relationship_events.delta_trust"),
    deltaConflict: requiredNumber(row.delta_conflict, "relationship_events.delta_conflict"),
    deltaDependency: requiredNumber(row.delta_dependency, "relationship_events.delta_dependency"),
    afterAffinity: requiredNumber(row.after_affinity, "relationship_events.after_affinity"),
    afterTrust: requiredNumber(row.after_trust, "relationship_events.after_trust"),
    afterConflict: requiredNumber(row.after_conflict, "relationship_events.after_conflict"),
    afterDependency: requiredNumber(row.after_dependency, "relationship_events.after_dependency"),
    createdAt: requiredTimestamp(row.created_at, "relationship_events.created_at"),
  };
  const sourceRef = optionalString(row.source_ref, "relationship_events.source_ref");
  if (sourceRef !== undefined) (event as { sourceRef?: string }).sourceRef = sourceRef;
  const reason = optionalString(row.reason, "relationship_events.reason");
  if (reason !== undefined) (event as { reason?: string }).reason = reason;
  const ruleVersion = optionalString(row.rule_version, "relationship_events.rule_version");
  if (ruleVersion !== undefined) (event as { ruleVersion?: string }).ruleVersion = ruleVersion;
  const reviewedBy = optionalString(row.reviewed_by, "relationship_events.reviewed_by");
  if (reviewedBy !== undefined) (event as { reviewedBy?: string }).reviewedBy = reviewedBy;
  const idempotencyKey = optionalString(row.idempotency_key, "relationship_events.idempotency_key");
  if (idempotencyKey !== undefined) (event as { idempotencyKey?: string }).idempotencyKey = idempotencyKey;
  return event;
}

const CANDIDATE_SELECT = `
  SELECT id, story_world_id, edge_id, source_type, source_ref,
         delta_affinity, delta_trust, delta_conflict, delta_dependency,
         reason, rule_version, status, idempotency_key, created_at, reviewed_at
  FROM relationship_change_candidates`;

const EVENT_SELECT = `
  SELECT id, story_world_id, edge_id, source_type, source_ref,
         before_affinity, before_trust, before_conflict, before_dependency,
         delta_affinity, delta_trust, delta_conflict, delta_dependency,
         after_affinity, after_trust, after_conflict, after_dependency,
         reason, rule_version, reviewed_by, idempotency_key, created_at
  FROM relationship_events`;

export function createRelationshipFeedbackRepositories(client: SqlClient): {
  relationshipChangeCandidates: RelationshipChangeCandidateRepository;
  relationshipEvents: RelationshipEventRepository;
} {
  const relationshipChangeCandidates: RelationshipChangeCandidateRepository = {
    getById: async (id) => {
      const result = await client.query(`${CANDIDATE_SELECT} WHERE id = $1`, [id]);
      const row = result.rows[0];
      return row ? mapRelationshipChangeCandidateRow(row) : undefined;
    },
    listByStoryWorld: async (storyWorldId, status) => {
      const query = status
        ? `${CANDIDATE_SELECT} WHERE story_world_id = $1 AND status = $2 ORDER BY created_at DESC`
        : `${CANDIDATE_SELECT} WHERE story_world_id = $1 ORDER BY created_at DESC`;
      const params = status ? [storyWorldId, status] : [storyWorldId];
      const result = await client.query(query, params);
      return result.rows.map(mapRelationshipChangeCandidateRow);
    },
    save: async (candidate) => {
      await client.query(
        `INSERT INTO relationship_change_candidates (
           id, story_world_id, edge_id, source_type, source_ref,
           delta_affinity, delta_trust, delta_conflict, delta_dependency,
           reason, rule_version, status, idempotency_key, created_at, reviewed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           reviewed_at = EXCLUDED.reviewed_at`,
        [
          candidate.id,
          candidate.storyWorldId,
          candidate.edgeId,
          candidate.sourceType,
          candidate.sourceRef ?? null,
          candidate.deltaAffinity,
          candidate.deltaTrust,
          candidate.deltaConflict,
          candidate.deltaDependency,
          candidate.reason ?? null,
          candidate.ruleVersion ?? null,
          candidate.status,
          candidate.idempotencyKey ?? null,
          candidate.createdAt,
          candidate.reviewedAt ?? null,
        ],
      );
    },
  };

  const relationshipEvents: RelationshipEventRepository = {
    getById: async (id) => {
      const result = await client.query(`${EVENT_SELECT} WHERE id = $1`, [id]);
      const row = result.rows[0];
      return row ? mapRelationshipEventRow(row) : undefined;
    },
    listByEdge: async (edgeId) => {
      const result = await client.query(`${EVENT_SELECT} WHERE edge_id = $1 ORDER BY created_at DESC`, [edgeId]);
      return result.rows.map(mapRelationshipEventRow);
    },
    save: async (event) => {
      await client.query(
        `INSERT INTO relationship_events (
           id, story_world_id, edge_id, source_type, source_ref,
           before_affinity, before_trust, before_conflict, before_dependency,
           delta_affinity, delta_trust, delta_conflict, delta_dependency,
           after_affinity, after_trust, after_conflict, after_dependency,
           reason, rule_version, reviewed_by, idempotency_key, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
         ON CONFLICT (id) DO UPDATE SET
           reviewed_by = EXCLUDED.reviewed_by`,
        [
          event.id,
          event.storyWorldId,
          event.edgeId,
          event.sourceType,
          event.sourceRef ?? null,
          event.beforeAffinity,
          event.beforeTrust,
          event.beforeConflict,
          event.beforeDependency,
          event.deltaAffinity,
          event.deltaTrust,
          event.deltaConflict,
          event.deltaDependency,
          event.afterAffinity,
          event.afterTrust,
          event.afterConflict,
          event.afterDependency,
          event.reason ?? null,
          event.ruleVersion ?? null,
          event.reviewedBy ?? null,
          event.idempotencyKey ?? null,
          event.createdAt,
        ],
      );
    },
  };

  return { relationshipChangeCandidates, relationshipEvents };
}
