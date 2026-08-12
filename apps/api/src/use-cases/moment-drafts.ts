import type { MomentDraft, MomentDraftStatus, Moment } from "@living-network/domain";
import { MomentDraftStatus as DraftStatus, transitionMomentDraft, createMoment } from "@living-network/domain";
import type { ApiStore } from "../context.ts";

export async function listMomentDrafts(
  store: ApiStore,
  storyWorldId: string,
): Promise<readonly MomentDraft[]> {
  const drafts = store.momentDrafts ? await store.momentDrafts.listByStoryWorld(storyWorldId) : [];
  return drafts;
}

export async function reviewMomentDraft(
  store: ApiStore,
  draftId: string,
  action: "approve" | "reject",
): Promise<{ draft: MomentDraft; moment?: Moment }> {
  if (!store.momentDrafts) throw new Error("MomentDraftRepository not available");
  if (!store.moments) throw new Error("MomentRepository not available");
  
  const draft = await store.momentDrafts.getById(draftId);
  if (!draft) throw new Error(`Moment draft ${draftId} not found`);
  
  if (action === "reject") {
    const rejected = transitionMomentDraft(draft, DraftStatus.REJECTED, new Date().toISOString());
    await store.momentDrafts.save(rejected);
    return { draft: rejected };
  }
  
  // Approve: check if image is required and ready
  if (draft.imageJobId && store.imageJobs) {
    const imageJob = await store.imageJobs.getById(draft.imageJobId);
    if (!imageJob) throw new Error(`Image job ${draft.imageJobId} not found`);
    if (imageJob.status !== "SUCCEEDED") {
      throw new Error(`Image job ${draft.imageJobId} is not ready (status: ${imageJob.status})`);
    }
  }
  
  // Transition to READY then PUBLISHED
  const ready = transitionMomentDraft(draft, DraftStatus.READY, new Date().toISOString());
  const published = transitionMomentDraft(ready, DraftStatus.PUBLISHED, new Date().toISOString());
  await store.momentDrafts.save(published);
  
  // Create the moment
  const moment = createMoment({
    id: `moment-${draft.id}`,
    draft: published,
    publishedAt: new Date().toISOString(),
  });
  await store.moments.save(moment);
  
  return { draft: published, moment };
}

export async function retryImageJob(
  store: ApiStore,
  imageJobId: string,
): Promise<{ jobId: string; attempt: number }> {
  if (!store.imageJobs) throw new Error("ImageJobRepository not available");
  
  const job = await store.imageJobs.getById(imageJobId);
  if (!job) throw new Error(`Image job ${imageJobId} not found`);
  if (job.status !== "FAILED") {
    throw new Error(`Image job ${imageJobId} is not in FAILED status (current: ${job.status})`);
  }
  
  // Create a new attempt
  const newAttempt = job.attempt + 1;
  const { failureReason: _, ...jobWithoutFailure } = job;
  const updatedJob = {
    ...jobWithoutFailure,
    attempt: newAttempt,
    status: "QUEUED" as const,
    updatedAt: new Date().toISOString(),
  };
  await store.imageJobs.save(updatedJob);
  
  return { jobId: imageJobId, attempt: newAttempt };
}
