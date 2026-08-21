import type {
  V2ReleaseId,
  V2RunId,
  V2SaveId,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
import type {
  V2ReleaseManifest,
  V2RuntimeRun,
} from "@living-network/domain/v2";

import type { V2CanonRepository } from "./canon-repository.ts";
import type { V2CandidateReviewRepository } from "./candidate-review-repository.ts";
import type { V2GraphStateRepository } from "./graph-state-repository.ts";

export interface V2RuntimeSaveRecord {
  readonly saveId: V2SaveId;
  readonly runId: V2RunId;
  readonly releaseId: V2ReleaseId;
  readonly releaseVersion: string;
  readonly currentSceneId: string;
  readonly stateValues: Record<string, string | number | boolean>;
  readonly choiceHistory: readonly string[];
  readonly characterState?: Record<string, Record<string, string | number | boolean>>;
  readonly relationshipRuntime?: Record<string, number>;
  readonly eventInstances?: readonly { readonly eventInstanceId: string; readonly eventDefinitionId: string; readonly state: Record<string, string | number | boolean> }[];
  readonly label?: string;
  readonly createdAt?: string;
}

export interface V2ReleaseRuntimeRepository {
  getRelease(releaseId: V2ReleaseId): Promise<V2ReleaseManifest | undefined>;
  listReleases(storyWorldId: V2StoryWorldId): Promise<readonly V2ReleaseManifest[]>;
  createRelease(input: V2ReleaseManifest): Promise<V2ReleaseManifest>;

  getRun(runId: V2RunId): Promise<V2RuntimeRun | undefined>;
  createRun(input: V2RuntimeRun): Promise<V2RuntimeRun>;
  updateRun(input: V2RuntimeRun): Promise<V2RuntimeRun>;

  getSave(saveId: V2SaveId): Promise<V2RuntimeSaveRecord | undefined>;
  listSavesByStoryWorld(storyWorldId: V2StoryWorldId, limit: number): Promise<readonly V2RuntimeSaveRecord[]>;
  createSave(input: V2RuntimeSaveRecord): Promise<V2RuntimeSaveRecord>;
}

export interface V2ReleaseRuntimeUnitOfWork {
  withReleaseRuntimeTransaction<T>(
    fn: (repositories: {
      readonly canon: V2CanonRepository;
      readonly graphState: V2GraphStateRepository;
      readonly candidateReview: V2CandidateReviewRepository;
      readonly releaseRuntime: V2ReleaseRuntimeRepository;
    }) => Promise<T>,
  ): Promise<T>;
}
