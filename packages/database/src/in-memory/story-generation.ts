import type {
  WorldContextPolicy,
  StoryGenerationJob,
  StoryGenerationCandidate,
  StoryChoice,
} from "@living-network/domain";
import type {
  WorldContextPolicyRepository,
  StoryGenerationJobRepository,
  StoryGenerationCandidateRepository,
} from "../repositories.ts";

export function createWorldContextPolicyRepo(
  map: Map<string, WorldContextPolicy>,
): WorldContextPolicyRepository {
  return {
    getByWorldId: async (storyWorldId) => {
      for (const policy of map.values()) {
        if (policy.storyWorldId === storyWorldId) return { ...policy };
      }
      return undefined;
    },
    save: async (policy) => {
      map.set(policy.id, { ...policy });
    },
  };
}

export function createStoryGenerationJobRepo(
  map: Map<string, StoryGenerationJob>,
): StoryGenerationJobRepository {
  return {
    getById: async (id) => {
      const job = map.get(id);
      return job ? { ...job } : undefined;
    },
    getByIdempotencyKey: async (storyWorldId, idempotencyKey) => {
      for (const job of map.values()) {
        if (job.storyWorldId === storyWorldId && job.idempotencyKey === idempotencyKey) return { ...job };
      }
      return undefined;
    },
    listByNode: async (storyNodeId) => {
      return [...map.values()]
        .filter((j) => j.storyNodeId === storyNodeId)
        .map((j) => ({ ...j }));
    },
    save: async (job) => {
      map.set(job.id, { ...job });
    },
  };
}

export function createStoryGenerationCandidateRepo(
  map: Map<string, StoryGenerationCandidate>,
): StoryGenerationCandidateRepository {
  return {
    getById: async (id) => {
      const c = map.get(id);
      return c ? { ...c, choices: [...c.choices] } : undefined;
    },
    listByNode: async (storyNodeId) => {
      return [...map.values()]
        .filter((c) => c.storyNodeId === storyNodeId)
        .map((c) => ({ ...c, choices: [...c.choices] }));
    },
    listByWorld: async (storyWorldId) => {
      return [...map.values()]
        .filter((c) => c.storyWorldId === storyWorldId)
        .map((c) => ({ ...c, choices: [...c.choices] }));
    },
    save: async (candidate) => {
      map.set(candidate.id, { ...candidate, choices: [...candidate.choices] });
    },
  };
}
