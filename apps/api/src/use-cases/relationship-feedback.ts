import type { RelationshipChangeCandidate, RelationshipEvent } from "@living-network/domain";
import { RelationshipChangeCandidateStatus } from "@living-network/domain";
import type { ApiStore } from "../context.ts";

export async function listRelationshipChangeCandidates(
  store: ApiStore,
  storyWorldId: string,
  status?: string,
): Promise<readonly RelationshipChangeCandidate[]> {
  if (!store.relationshipChangeCandidates) return [];
  return store.relationshipChangeCandidates.listByStoryWorld(storyWorldId, status);
}

export async function reviewRelationshipChangeCandidate(
  store: ApiStore,
  candidateId: string,
  action: "approve" | "reject",
  reviewedBy?: string,
): Promise<{ candidate: RelationshipChangeCandidate; event?: RelationshipEvent }> {
  if (!store.relationshipChangeCandidates) throw new Error("RelationshipChangeCandidateRepository not available");
  if (!store.relationshipEdges) throw new Error("RelationshipEdgeRepository not available");
  if (!store.relationshipEvents) throw new Error("RelationshipEventRepository not available");

  const candidate = await store.relationshipChangeCandidates.getById(candidateId);
  if (!candidate) throw new Error(`Relationship change candidate ${candidateId} not found`);
  if (candidate.status !== RelationshipChangeCandidateStatus.PENDING) {
    throw new Error(`Candidate ${candidateId} is not pending (status: ${candidate.status})`);
  }

  if (action === "reject") {
    const rejected = { ...candidate, status: "REJECTED" as RelationshipChangeCandidateStatus, reviewedAt: new Date().toISOString() };
    await store.relationshipChangeCandidates.save(rejected);
    return { candidate: rejected };
  }

  // Approve: get the edge and apply changes
  const edge = await store.relationshipEdges.getById(candidate.edgeId);
  if (!edge) throw new Error(`Relationship edge ${candidate.edgeId} not found`);

  const before = { affinity: edge.initialState.affinity, trust: edge.initialState.trust, conflict: edge.initialState.conflict, dependency: edge.initialState.dependency };
  const after = {
    affinity: before.affinity + candidate.deltaAffinity,
    trust: before.trust + candidate.deltaTrust,
    conflict: before.conflict + candidate.deltaConflict,
    dependency: before.dependency + candidate.deltaDependency,
  };

  // Update the edge
  const updatedEdge = { ...edge, initialState: after };
  await store.relationshipEdges.save(updatedEdge);

  // Create relationship event
  const event: RelationshipEvent = {
    id: `event-${candidate.id}`,
    storyWorldId: candidate.storyWorldId,
    edgeId: candidate.edgeId,
    sourceType: candidate.sourceType,
    beforeAffinity: before.affinity,
    beforeTrust: before.trust,
    beforeConflict: before.conflict,
    beforeDependency: before.dependency,
    deltaAffinity: candidate.deltaAffinity,
    deltaTrust: candidate.deltaTrust,
    deltaConflict: candidate.deltaConflict,
    deltaDependency: candidate.deltaDependency,
    afterAffinity: after.affinity,
    afterTrust: after.trust,
    afterConflict: after.conflict,
    afterDependency: after.dependency,
    createdAt: new Date().toISOString(),
    ...(candidate.sourceRef !== undefined ? { sourceRef: candidate.sourceRef } : {}),
    ...(candidate.reason !== undefined ? { reason: candidate.reason } : {}),
    ...(candidate.ruleVersion !== undefined ? { ruleVersion: candidate.ruleVersion } : {}),
    ...(reviewedBy !== undefined ? { reviewedBy } : {}),
    ...(candidate.idempotencyKey !== undefined ? { idempotencyKey: candidate.idempotencyKey } : {}),
  };
  await store.relationshipEvents.save(event);

  // Update candidate status
  const approved = { ...candidate, status: "APPROVED" as RelationshipChangeCandidateStatus, reviewedAt: new Date().toISOString() };
  await store.relationshipChangeCandidates.save(approved);

  return { candidate: approved, event };
}

export async function listRelationshipEvents(
  store: ApiStore,
  edgeId: string,
): Promise<readonly RelationshipEvent[]> {
  if (!store.relationshipEvents) return [];
  return store.relationshipEvents.listByEdge(edgeId);
}
