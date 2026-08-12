import type { RelationshipChangeCandidate, RelationshipEvent } from "@living-network/domain";

export interface RelationshipChangeCandidateRepository {
  getById(id: string): Promise<RelationshipChangeCandidate | undefined>;
  listByStoryWorld(storyWorldId: string, status?: string): Promise<readonly RelationshipChangeCandidate[]>;
  save(candidate: RelationshipChangeCandidate): Promise<void>;
}

export interface RelationshipEventRepository {
  getById(id: string): Promise<RelationshipEvent | undefined>;
  listByEdge(edgeId: string): Promise<readonly RelationshipEvent[]>;
  save(event: RelationshipEvent): Promise<void>;
}
