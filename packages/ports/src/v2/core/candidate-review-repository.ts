import type {
  V2CandidateId,
  V2CandidateStatus,
  V2IdempotencyKey,
  V2Revision,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
import type {
  V2CoreSceneCandidate,
  V2ReviewAction,
} from "@living-network/domain/v2";

import type { V2CanonRepository } from "./canon-repository.ts";
import type { V2GraphStateRepository } from "./graph-state-repository.ts";
import type { V2NarrativeReferenceRepository } from "../narrative/reference-repository.ts";
import type { V2SceneDocumentRepository } from "../narrative/scene-document-repository.ts";
import type { V2NarrativeHierarchyRepository } from "../narrative/hierarchy-repository.ts";
import type { V2CanonLoreRepository } from "../narrative/lore-repository.ts";

export interface V2CandidateReviewAuditRecord {
  readonly auditId?: number;
  readonly candidateId: V2CandidateId;
  readonly storyWorldId: V2StoryWorldId;
  readonly fromStatus: V2CandidateStatus;
  readonly toStatus: V2CandidateStatus;
  readonly action: V2ReviewAction;
  readonly reviewer: string;
  readonly reason?: string;
  readonly resultingRevision: V2Revision;
  readonly createdAt?: string;
}

export interface V2CandidateReviewRepository {
  getSceneCandidate(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly candidateId: V2CandidateId;
  }): Promise<V2CoreSceneCandidate | undefined>;
  listSceneCandidates(storyWorldId: V2StoryWorldId): Promise<readonly V2CoreSceneCandidate[]>;
  createSceneCandidate(input: V2CoreSceneCandidate): Promise<V2CoreSceneCandidate>;
  updateSceneCandidateReview(input: {
    readonly candidate: V2CoreSceneCandidate;
    readonly reviewedAt: string;
  }): Promise<V2CoreSceneCandidate>;
  createAudit(input: V2CandidateReviewAuditRecord): Promise<V2CandidateReviewAuditRecord>;
  listAudits(input: {
    readonly storyWorldId: V2StoryWorldId;
    readonly candidateId: V2CandidateId;
  }): Promise<readonly V2CandidateReviewAuditRecord[]>;
}

export interface V2CandidateReviewUnitOfWork {
  withCandidateReviewTransaction<T>(
    fn: (repositories: {
      readonly canon: V2CanonRepository;
      readonly graphState: V2GraphStateRepository;
      readonly candidateReview: V2CandidateReviewRepository;
      readonly references?: V2NarrativeReferenceRepository;
      readonly sceneDocument?: V2SceneDocumentRepository;
      readonly hierarchy?: V2NarrativeHierarchyRepository;
      readonly lore?: V2CanonLoreRepository;
    }) => Promise<T>,
  ): Promise<T>;
}
