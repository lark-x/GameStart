import {
  ImageJobStatus,
  type ComfyUiSettings,
  type ImageJob,
} from "../../../packages/domain/src/index.ts";
import type { DomainRepositories } from "../../../packages/database/src/index.ts";
import {
  BehaviorMediaCoordinator,
  ComfyUiError,
  ComfyUiHttpClient,
  createRepositoryImageWorkflowResolver,
  type ComfyUiProgressClient,
} from "./media.ts";
import { LocalMediaStore, StoringComfyUiClient } from "./media-storage.ts";
import { bestEffortLog, type WorkerLogger } from "./interaction-log.ts";

export interface ImageJobPumpOptions {
  readonly fallbackSettings: Pick<ComfyUiSettings, "baseUrl" | "timeoutMs">;
  readonly mediaRoot: string;
  readonly batchSize?: number;
  readonly logger?: WorkerLogger | undefined;
  readonly createClient?: (settings: Pick<ComfyUiSettings, "baseUrl" | "timeoutMs">) => ComfyUiProgressClient;
}

export interface ImageJobPumpResult {
  readonly queued: number;
  readonly submitted: number;
  readonly completed: number;
  readonly failed: number;
  readonly deferred: number;
  readonly skipped: boolean;
}

type RequiredImageRepositories = DomainRepositories & {
  readonly imageJobs: NonNullable<DomainRepositories["imageJobs"]>;
  readonly comfyUiSettings: NonNullable<DomainRepositories["comfyUiSettings"]>;
};

function requireRepositories(repositories: DomainRepositories): RequiredImageRepositories {
  if (!repositories.imageJobs || !repositories.comfyUiSettings) {
    throw new TypeError("Image jobs and ComfyUI settings repositories are required");
  }
  return repositories as RequiredImageRepositories;
}

function failureReason(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 2048) : "Image generation failed";
}

function isRetryable(error: unknown): boolean {
  return error instanceof ComfyUiError && error.retryable;
}

/**
 * Drains persisted image jobs. Submitted jobs are included so an orderly worker
 * restart reconnects to ComfyUI instead of stranding work in SUBMITTED state.
 */
export class ImageJobPump {
  private readonly repositories: RequiredImageRepositories;
  private readonly options: Required<Pick<ImageJobPumpOptions, "batchSize">> & ImageJobPumpOptions;
  private running = false;

  public constructor(repositories: DomainRepositories, options: ImageJobPumpOptions) {
    if (!Number.isSafeInteger(options.batchSize ?? 20) || (options.batchSize ?? 20) < 1 || (options.batchSize ?? 20) > 100) {
      throw new RangeError("image job batchSize must be between 1 and 100");
    }
    this.repositories = requireRepositories(repositories);
    this.options = { ...options, batchSize: options.batchSize ?? 20 };
  }

  public async runOnce(): Promise<ImageJobPumpResult> {
    if (this.running) {
      return { queued: 0, submitted: 0, completed: 0, failed: 0, deferred: 0, skipped: true };
    }
    this.running = true;
    await bestEffortLog(this.options.logger, { action: "image.scan", outcome: "STARTED", correlationId: "worker:image_pump:scan", entityType: "image_pump" });
    try {
      const persisted = await this.repositories.comfyUiSettings.get();
      const settings = persisted ?? this.options.fallbackSettings;
      const client = this.createClient(settings);
      const coordinator = new BehaviorMediaCoordinator(
        this.repositories,
        client,
        () => new Date(),
        createRepositoryImageWorkflowResolver(this.repositories),
      );
      const queued = await this.repositories.imageJobs.listQueued(this.options.batchSize);
      const watching = await this.repositories.imageJobs.listSubmitted(this.options.batchSize);
      let submitted = 0;
      let completed = 0;
      let failed = 0;
      let deferred = 0;
      const submittedIds = new Set(watching.map((job) => job.id));

      for (const job of queued) {
        try {
          const current = await coordinator.submitImageJob(job.id);
          if (current.status === ImageJobStatus.SUBMITTED) {
            submitted += 1;
            await bestEffortLog(this.options.logger, { action: "image.submit", outcome: "SUCCESS", correlationId: "worker:image_job:" + current.id, entityType: "image_job", entityId: current.id, jobId: current.id });
            submittedIds.add(current.id);
          }
        } catch (error) {
          if (isRetryable(error)) {
            deferred += 1;
            await bestEffortLog(this.options.logger, { action: "image.submit", outcome: "DEFERRED", correlationId: "worker:image_job:" + job.id, entityType: "image_job", entityId: job.id, jobId: job.id, message: error });
          } else {
            await coordinator.failImageJob(job.id, failureReason(error));
            failed += 1;
            await bestEffortLog(this.options.logger, { action: "image.submit", outcome: "FAILED", correlationId: "worker:image_job:" + job.id, entityType: "image_job", entityId: job.id, jobId: job.id, message: error });
          }
        }
      }

      for (const jobId of submittedIds) {
        const before = await this.repositories.imageJobs.getById(jobId);
        if (!before || before.status !== ImageJobStatus.SUBMITTED) continue;
        try {
          for await (const _event of coordinator.watchImageJobProgress(jobId, {
            timeoutMs: settings.timeoutMs,
          })) {
            // The coordinator performs terminal persistence while streaming.
          }
          const after = await this.repositories.imageJobs.getById(jobId);
          if (after?.status === ImageJobStatus.SUCCEEDED) { completed += 1; await bestEffortLog(this.options.logger, { action: "image.progress", outcome: "COMPLETED", correlationId: "worker:image_job:" + jobId, entityType: "image_job", entityId: jobId, jobId }); }
          if (after?.status === ImageJobStatus.FAILED) { failed += 1; await bestEffortLog(this.options.logger, { action: "image.progress", outcome: "FAILED", correlationId: "worker:image_job:" + jobId, entityType: "image_job", entityId: jobId, jobId }); }
        } catch (error) {
          if (isRetryable(error)) {
            deferred += 1;
            await bestEffortLog(this.options.logger, { action: "image.progress", outcome: "DEFERRED", correlationId: "worker:image_job:" + jobId, entityType: "image_job", entityId: jobId, jobId, message: error });
          } else {
            const current = await this.repositories.imageJobs.getById(jobId);
            if (current?.status === ImageJobStatus.SUBMITTED) {
              await coordinator.failImageJob(jobId, failureReason(error));
              failed += 1;
              await bestEffortLog(this.options.logger, { action: "image.progress", outcome: "FAILED", correlationId: "worker:image_job:" + jobId, entityType: "image_job", entityId: jobId, jobId, message: error });
            }
          }
        }
      }
      return { queued: queued.length, submitted, completed, failed, deferred, skipped: false };
    } finally {
      this.running = false;
    }
  }

  private createClient(settings: Pick<ComfyUiSettings, "baseUrl" | "timeoutMs">): ComfyUiProgressClient {
    if (this.options.createClient) return this.options.createClient(settings);
    const inner = new ComfyUiHttpClient(settings);
    return new StoringComfyUiClient(inner, new LocalMediaStore(this.options.mediaRoot)) as ComfyUiProgressClient;
  }
}

export function createImageJobPump(
  repositories: DomainRepositories,
  options: ImageJobPumpOptions,
): ImageJobPump {
  return new ImageJobPump(repositories, options);
}
