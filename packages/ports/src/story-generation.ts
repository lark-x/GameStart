import type {
  WorldContextPolicy,
  StoryGenerationJob,
  StoryGenerationCandidate,
} from "@living-network/domain";

export interface WorldContextPolicyRepository {
  getByWorldId(storyWorldId: string): Promise<WorldContextPolicy | undefined>;
  save(policy: WorldContextPolicy): Promise<void>;
}

export interface StoryGenerationJobRepository {
  getById(id: string): Promise<StoryGenerationJob | undefined>;
  getByIdempotencyKey(storyWorldId: string, idempotencyKey: string): Promise<StoryGenerationJob | undefined>;
  listByNode(storyNodeId: string): Promise<readonly StoryGenerationJob[]>;
  save(job: StoryGenerationJob): Promise<void>;
}

export interface StoryGenerationCandidateRepository {
  getById(id: string): Promise<StoryGenerationCandidate | undefined>;
  listByNode(storyNodeId: string): Promise<readonly StoryGenerationCandidate[]>;
  listByWorld(storyWorldId: string): Promise<readonly StoryGenerationCandidate[]>;
  save(candidate: StoryGenerationCandidate): Promise<void>;
}
