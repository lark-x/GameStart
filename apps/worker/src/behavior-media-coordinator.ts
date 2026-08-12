import {
  ActionKind,
  attachMomentImageJob,
  compileImageWorkflow,
  completeImageJob,
  createBehaviorAction,
  createImageJob,
  createMomentDraft,
  failImageJob,
  ImageJobStatus,
  MomentDraftStatus,
  MomentVisibility,
  submitImageJob,
  retryImageJob,
  transitionMomentDraft,
  type BehaviorAction,
  type ImageJob,
  type JsonObject,
  type MomentDraft,
} from "@living-network/domain";
import { assertIsoTimestamp } from "@living-network/domain";
import type {
  BehaviorActionRepository,
  DomainRepositories,
  EventExecutionRepository,
  ImageJobRepository,
  MomentDraftRepository,
} from "@living-network/ports";
import type { ComfyUiClient, ComfyUiProgressClient, ComfyUiProgressEvent } from "./comfyui-types.ts";
import type { ImageWorkflowResolver } from "./workflow-resolver.ts";
import { ComfyUiError } from "./comfyui-client.ts";

export type BehaviorMediaCoordinatorRepositories = DomainRepositories & {
  readonly eventExecutions: EventExecutionRepository;
  readonly behaviorActions: BehaviorActionRepository;
  readonly momentDrafts: MomentDraftRepository;
  readonly imageJobs: ImageJobRepository;
};

export interface PlanBehaviorActionInput {
  id: string;
  executionId: string;
  actorCharacterId: string;
  kind: ActionKind;
  payload: JsonObject;
  priority?: number;
  momentVisibility?: MomentVisibility;
}

export type BehaviorMediaCoordinatorClock = () => Date;

function requireRepositories(repositories: DomainRepositories): BehaviorMediaCoordinatorRepositories {
  if (
    !repositories.eventExecutions ||
    !repositories.behaviorActions ||
    !repositories.momentDrafts ||
    !repositories.imageJobs
  ) {
    throw new TypeError("Behavior/media repositories are not configured");
  }
  return repositories as BehaviorMediaCoordinatorRepositories;
}

function nowIso(clock: BehaviorMediaCoordinatorClock): string {
  const value = clock().toISOString();
  assertIsoTimestamp(value, "behaviorMedia.clock");
  return value;
}

function imageRequested(action: BehaviorAction): boolean {
  return action.kind === ActionKind.REQUEST_IMAGE ||
    (action.kind === ActionKind.CREATE_MOMENT && action.payload.imagePrompt !== undefined);
}

export class BehaviorMediaCoordinator {
  private readonly repositories: BehaviorMediaCoordinatorRepositories;
  private readonly comfyUi: ComfyUiClient;
  private readonly clock: BehaviorMediaCoordinatorClock;
  private readonly workflowResolver: ImageWorkflowResolver | undefined;

  public constructor(
    repositories: DomainRepositories,
    comfyUi: ComfyUiClient,
    clock: BehaviorMediaCoordinatorClock = () => new Date(),
    workflowResolver?: ImageWorkflowResolver,
  ) {
    this.repositories = requireRepositories(repositories);
    this.comfyUi = comfyUi;
    this.clock = clock;
    this.workflowResolver = workflowResolver;
  }

  public async planAction(input: PlanBehaviorActionInput): Promise<BehaviorAction> {
    const existing = await this.repositories.behaviorActions.getById(input.id);
    if (existing) return existing;
    const execution = await this.repositories.eventExecutions.getById(input.executionId);
    if (!execution) throw new TypeError(`Unknown event execution: ${input.executionId}`);
    const createdAt = nowIso(this.clock);
    const actionInput = {
      id: input.id,
      execution,
      actorCharacterId: input.actorCharacterId,
      kind: input.kind,
      payload: input.payload,
      createdAt,
    };
    const action = createBehaviorAction(
      input.priority === undefined ? actionInput : { ...actionInput, priority: input.priority },
    );
    await this.repositories.behaviorActions.save(action);

    let draft: MomentDraft | undefined;
    if (action.kind === ActionKind.CREATE_MOMENT) {
      draft = await this.repositories.momentDrafts.getByActionId(action.id);
      if (!draft) {
        draft = createMomentDraft({
          id: `moment:${action.id}`,
          action,
          visibility: input.momentVisibility ?? MomentVisibility.PUBLIC,
          createdAt,
        });
        await this.repositories.momentDrafts.save(draft);
      }
    }

    if (imageRequested(action)) {
      let job = await this.repositories.imageJobs.getByActionId(action.id);
      if (!job) {
        const imageInput = {
          id: `image:${action.id}`,
          action,
          createdAt,
        };
        job = createImageJob(
          draft === undefined ? imageInput : { ...imageInput, momentDraftId: draft.id },
        );
        await this.repositories.imageJobs.save(job);
        if (draft && draft.imageJobId === undefined) {
          draft = attachMomentImageJob(draft, job.id, createdAt);
          await this.repositories.momentDrafts.save(draft);
        }
      }
    }
    return action;
  }

  public async submitImageJob(jobId: string): Promise<ImageJob> {
    const job = await this.repositories.imageJobs.getById(jobId);
    if (!job) throw new TypeError(`Unknown image job: ${jobId}`);
    if (job.status !== ImageJobStatus.QUEUED) return job;
    const workflow = this.workflowResolver === undefined
      ? undefined
      : await this.workflowResolver.resolve(job);
    const result = await this.comfyUi.submit({
      jobId: job.id,
      workflowVersion: job.workflowVersion,
      prompt: job.prompt,
      ...(workflow === undefined ? {} : { workflow }),
      ...(job.negativePrompt === undefined ? {} : { negativePrompt: job.negativePrompt }),
      ...(job.seed === undefined ? {} : { seed: job.seed }),
    });
    const submitted = submitImageJob(job, result.externalJobId, nowIso(this.clock));
    await this.repositories.imageJobs.save(submitted);
    return submitted;
  }

  public async completeImageJob(jobId: string): Promise<ImageJob> {
    const job = await this.repositories.imageJobs.getById(jobId);
    if (!job) throw new TypeError(`Unknown image job: ${jobId}`);
    if (job.status === ImageJobStatus.SUCCEEDED) return job;
    if (job.status !== ImageJobStatus.SUBMITTED || job.externalJobId === undefined) {
      throw new Error(`image job ${job.id} is not submitted`);
    }
    const result = await this.comfyUi.getResult(job.externalJobId);
    const completed = completeImageJob(job, result.mediaRef, nowIso(this.clock));
    await this.repositories.imageJobs.save(completed);
    if (job.momentDraftId !== undefined) {
      const draft = await this.repositories.momentDrafts.getById(job.momentDraftId);
      if (draft && draft.status === MomentDraftStatus.DRAFT) {
        await this.repositories.momentDrafts.save(
          transitionMomentDraft(draft, MomentDraftStatus.READY, completed.updatedAt),
        );
      }
    }
    return completed;
  }

  /** Streams ComfyUI progress and synchronizes terminal events with the image job state. */
  public async *watchImageJobProgress(
    jobId: string,
    options: {
      timeoutMs?: number;
      maxCompletionAttempts?: number;
      completionDelayMs?: number;
    } = {},
  ): AsyncGenerator<ComfyUiProgressEvent> {
    const job = await this.repositories.imageJobs.getById(jobId);
    if (!job) throw new TypeError(`Unknown image job: ${jobId}`);
    if (job.status !== ImageJobStatus.SUBMITTED || job.externalJobId === undefined) {
      throw new Error(`image job ${job.id} is not submitted`);
    }
    const progressClient = this.comfyUi as Partial<ComfyUiProgressClient>;
    const watchProgress = progressClient.watchProgress;
    if (typeof watchProgress !== "function") {
      throw new TypeError("ComfyUI client does not support progress watching");
    }
    const externalJobId = job.externalJobId;
    const progressOptions: { timeoutMs?: number } = {};
    if (options.timeoutMs !== undefined) progressOptions.timeoutMs = options.timeoutMs;
    const completionOptions: { maxAttempts?: number; delayMs?: number } = {};
    if (options.maxCompletionAttempts !== undefined) {
      completionOptions.maxAttempts = options.maxCompletionAttempts;
    }
    if (options.completionDelayMs !== undefined) completionOptions.delayMs = options.completionDelayMs;

    for await (const event of watchProgress.call(
      this.comfyUi,
      externalJobId,
      progressOptions,
    )) {
      if (event.kind === "error") {
        const current = await this.repositories.imageJobs.getById(jobId);
        if (current?.status === ImageJobStatus.SUBMITTED) {
          await this.failImageJob(jobId, event.message ?? "ComfyUI execution failed");
        }
      } else if (event.kind === "completed") {
        await this.completeImageJobWithRetry(jobId, completionOptions);
      }
      yield event;
      if (event.kind === "error" || event.kind === "completed") break;
    }
  }

  /** Polls a ComfyUI result with bounded retry for NOT_READY/retryable failures. */
  public async completeImageJobWithRetry(
    jobId: string,
    options: { maxAttempts?: number; delayMs?: number } = {},
  ): Promise<ImageJob> {
    const maxAttempts = options.maxAttempts ?? 5;
    const delayMs = options.delayMs ?? 1000;
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
      throw new RangeError("image completion maxAttempts must be between 1 and 20");
    }
    if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 60_000) {
      throw new RangeError("image completion delayMs must be between 0 and 60000");
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await this.completeImageJob(jobId);
      } catch (error) {
        lastError = error;
        const retryable = error instanceof ComfyUiError ? error.retryable : false;
        if (!retryable || attempt === maxAttempts - 1) throw error;
        if (delayMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("image completion failed");
  }

  public async failImageJob(jobId: string, reason: string): Promise<ImageJob> {
    const job = await this.repositories.imageJobs.getById(jobId);
    if (!job) throw new TypeError(`Unknown image job: ${jobId}`);
    const failed = failImageJob(job, reason, nowIso(this.clock));
    await this.repositories.imageJobs.save(failed);
    if (job.momentDraftId !== undefined) {
      const draft = await this.repositories.momentDrafts.getById(job.momentDraftId);
      if (draft && draft.status === MomentDraftStatus.DRAFT) {
        await this.repositories.momentDrafts.save(
          transitionMomentDraft(draft, MomentDraftStatus.REJECTED, failed.updatedAt),
        );
      }
    }
    return failed;
  }

  public async retryImageJob(jobId: string, maxAttempts = 3): Promise<ImageJob> {
    const job = await this.repositories.imageJobs.getById(jobId);
    if (!job) throw new TypeError(`Unknown image job: ${jobId}`);
    const retry = retryImageJob(job, nowIso(this.clock), maxAttempts);
    await this.repositories.imageJobs.save(retry);
    if (job.momentDraftId !== undefined) {
      const draft = await this.repositories.momentDrafts.getById(job.momentDraftId);
      if (draft && draft.status === MomentDraftStatus.REJECTED) {
        await this.repositories.momentDrafts.save({
          ...draft,
          status: MomentDraftStatus.DRAFT,
          updatedAt: retry.updatedAt,
        });
      }
    }
    return retry;
  }
}

export function createBehaviorMediaCoordinator(
  repositories: DomainRepositories,
  comfyUi: ComfyUiClient,
  clock?: BehaviorMediaCoordinatorClock,
  workflowResolver?: ImageWorkflowResolver,
): BehaviorMediaCoordinator {
  return new BehaviorMediaCoordinator(repositories, comfyUi, clock, workflowResolver);
}
