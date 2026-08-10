import type { ApiStore } from "../context.ts";
import { ApiError } from "../helpers.ts";
import { toImageJobDto, toImageAssetDto } from "../mappers.ts";
import { requireImageJobStore, requireImageAssetStore } from "../store-helpers.ts";
import type {
  ImageJobDto,
  ImageAssetDto,
} from "../../../../packages/contracts/src/index.ts";

export async function getImageJob(store: ApiStore, jobId: string): Promise<ImageJobDto> {
  const jobStore = requireImageJobStore(store);
  const job = await jobStore.imageJobs.getById(jobId);
  if (!job) throw new ApiError(404, "NOT_FOUND", "Image job not found");
  return toImageJobDto(job);
}

export async function listImageAssets(
  store: ApiStore,
  storyWorldId: string,
  actor?: string,
  requireTrustedActor = false,
): Promise<ImageAssetDto[]> {
  if (requireTrustedActor && actor !== undefined) {
    const character = await store.characters.getById(actor);
    if (!character || character.storyWorldId !== storyWorldId) {
      throw new ApiError(403, "FORBIDDEN", "Trusted actor cannot view this story-world album");
    }
  }
  const assetStore = requireImageAssetStore(store);
  if (!(await store.storyWorlds.getById(storyWorldId))) throw new ApiError(404, "NOT_FOUND", "Story world not found");
  const jobs = await assetStore.imageJobs.listSucceededByStoryWorld(storyWorldId);
  return Promise.all(jobs.map(async (job) => {
    const action = await assetStore.behaviorActions.getById(job.actionId);
    if (!action) throw new ApiError(500, "INTERNAL_ERROR", "Image asset action is missing");
    return toImageAssetDto(job, action);
  }));
}
