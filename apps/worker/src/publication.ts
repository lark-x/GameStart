import {
  createMoment,
  ImageJobStatus,
  MomentDraftStatus,
  transitionMomentDraft,
  type Character,
  type ImageJob,
  type Moment,
  type MomentDraft,
} from "../../../packages/domain/src/index.ts";
import type {
  CharacterRepository,
  DomainRepositories,
  ImageJobRepository,
  MomentDraftRepository,
  MomentRepository,
} from "../../../packages/database/src/index.ts";

export type MomentPublicationRepositories = DomainRepositories & {
  readonly characters: CharacterRepository;
  readonly momentDrafts: MomentDraftRepository;
  readonly moments: MomentRepository;
  readonly imageJobs?: ImageJobRepository;
};

export interface PublishMomentInput {
  id: string;
  draftId: string;
  publishedAt: string;
  audienceCharacterIds?: readonly string[];
  manualReviewApproved?: boolean;
}

function requireRepositories(repositories: DomainRepositories): MomentPublicationRepositories {
  if (!repositories.momentDrafts || !repositories.moments) {
    throw new TypeError("Moment publication repositories are not configured");
  }
  return repositories as MomentPublicationRepositories;
}

async function resolveAudience(
  repository: CharacterRepository,
  ids: readonly string[],
): Promise<readonly Character[]> {
  const characters: Character[] = [];
  for (const id of ids) {
    const character = await repository.getById(id);
    if (!character) throw new TypeError(`Unknown moment audience character: ${id}`);
    characters.push(character);
  }
  return characters;
}

async function resolveImage(
  draft: MomentDraft,
  repository: ImageJobRepository | undefined,
): Promise<ImageJob | undefined> {
  if (draft.imageJobId === undefined) return undefined;
  if (!repository) throw new TypeError("Image job repository is required to publish an image draft");
  const imageJob = await repository.getById(draft.imageJobId);
  if (!imageJob) throw new TypeError(`Image job not found: ${draft.imageJobId}`);
  if (imageJob.status !== ImageJobStatus.SUCCEEDED || imageJob.mediaRef === undefined) {
    throw new TypeError("Moment image job must be SUCCEEDED before publication");
  }
  return imageJob;
}

export class MomentPublicationCoordinator {
  private readonly repositories: MomentPublicationRepositories;
  private readonly manualReviewBeforePublish: boolean;

  public constructor(
    repositories: DomainRepositories,
    options: { manualReviewBeforePublish?: boolean } = {},
  ) {
    this.repositories = requireRepositories(repositories);
    this.manualReviewBeforePublish = options.manualReviewBeforePublish ?? false;
  }

  public async publish(input: PublishMomentInput): Promise<Moment> {
    const existing = await this.repositories.moments.getById(input.id);
    if (existing) return existing;

    const draft = await this.repositories.momentDrafts.getById(input.draftId);
    if (!draft) throw new TypeError(`Moment draft not found: ${input.draftId}`);
    if (draft.status !== MomentDraftStatus.READY) {
      throw new TypeError("Only READY moment drafts can be published");
    }
    if (this.manualReviewBeforePublish && input.manualReviewApproved !== true) {
      throw new TypeError("Moment publication requires manual review approval");
    }
    const audience = await resolveAudience(
      this.repositories.characters,
      input.audienceCharacterIds ?? [],
    );
    const imageJob = await resolveImage(draft, this.repositories.imageJobs);
    const moment = createMoment({
      id: input.id,
      draft,
      publishedAt: input.publishedAt,
      audienceCharacters: audience,
      ...(imageJob?.mediaRef === undefined ? {} : { imageMediaRef: imageJob.mediaRef }),
    });
    await this.repositories.moments.save(moment);
    await this.repositories.momentDrafts.save(
      transitionMomentDraft(draft, MomentDraftStatus.PUBLISHED, input.publishedAt),
    );
    return moment;
  }
}

export function createMomentPublicationCoordinator(
  repositories: DomainRepositories,
  options?: { manualReviewBeforePublish?: boolean },
): MomentPublicationCoordinator {
  return new MomentPublicationCoordinator(repositories, options);
}
