import type { RelationshipChangeCandidate, RelationshipEvent } from "@living-network/domain";
import { RelationshipChangeCandidateStatus } from "@living-network/domain";
import type { RelationshipChangeCandidateRepository, RelationshipEventRepository } from "@living-network/ports";

function copyCandidate(candidate: RelationshipChangeCandidate): RelationshipChangeCandidate {
  return { ...candidate };
}

function copyEvent(event: RelationshipEvent): RelationshipEvent {
  return { ...event };
}

export function createRelationshipChangeCandidateRepo(
  map: Map<string, RelationshipChangeCandidate>,
): RelationshipChangeCandidateRepository {
  return {
    getById: async (id) => {
      const candidate = map.get(id);
      return candidate ? copyCandidate(candidate) : undefined;
    },
    listByStoryWorld: async (storyWorldId, status) => {
      return [...map.values()]
        .filter((candidate) => candidate.storyWorldId === storyWorldId && (!status || candidate.status === status))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(copyCandidate);
    },
    save: async (candidate) => {
      map.set(candidate.id, copyCandidate(candidate));
    },
  };
}

export function createRelationshipEventRepo(
  map: Map<string, RelationshipEvent>,
): RelationshipEventRepository {
  return {
    getById: async (id) => {
      const event = map.get(id);
      return event ? copyEvent(event) : undefined;
    },
    listByEdge: async (edgeId) => {
      return [...map.values()]
        .filter((event) => event.edgeId === edgeId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(copyEvent);
    },
    save: async (event) => {
      map.set(event.id, copyEvent(event));
    },
  };
}
