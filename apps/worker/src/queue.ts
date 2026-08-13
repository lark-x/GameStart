import { Queue, Worker, type JobsOptions, type WorkerOptions } from "bullmq";
import { bestEffortLog, type WorkerLogger } from "./interaction-log.ts";

export interface RedisQueueConfig {
  readonly url: string;
  readonly prefix?: string;
}

export interface QueueTaskOptions {
  readonly attempts?: number;
  readonly backoffDelayMs?: number;
  readonly delayMs?: number;
}

export interface TaskQueue<Data extends object> {
  enqueue(taskId: string, data: Data, options?: QueueTaskOptions): Promise<void>;
  close(): Promise<void>;
}

export function parseRedisConnection(url: string): { url: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TypeError("Redis URL must be valid");
  }
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new TypeError("Redis URL must use redis: or rediss:");
  }
  return { url: parsed.toString() };
}

function defaultJobOptions(options: QueueTaskOptions = {}): JobsOptions {
  const attempts = options.attempts ?? 3;
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 20) {
    throw new RangeError("queue attempts must be an integer between 1 and 20");
  }
  return {
    attempts,
    backoff: { type: "exponential", delay: options.backoffDelayMs ?? 1000 },
    ...(options.delayMs === undefined ? {} : { delay: options.delayMs }),
    removeOnComplete: 1000,
    removeOnFail: 5000,
  };
}

export class BullMqTaskQueue<Data extends object> implements TaskQueue<Data> {
  private readonly queue: Queue<Data, unknown, string, Data, unknown, string>;

  public constructor(name: string, config: RedisQueueConfig) {
    if (name.trim().length === 0) throw new TypeError("queue name must not be empty");
    const connection = parseRedisConnection(config.url);
    this.queue = new Queue<Data, unknown, string, Data, unknown, string>(name, {
      connection,
      ...(config.prefix === undefined ? {} : { prefix: config.prefix }),
      defaultJobOptions: defaultJobOptions(),
    });
  }

  public async enqueue(taskId: string, data: Data, options: QueueTaskOptions = {}): Promise<void> {
    if (taskId.trim().length === 0) throw new TypeError("queue taskId must not be empty");
    const jobOptions = defaultJobOptions(options);
    await this.queue.add("run", data, { ...jobOptions, jobId: taskId });
  }

  public async close(): Promise<void> {
    await this.queue.close();
  }
}

export interface BullMqTaskWorkerOptions {
  readonly concurrency?: number;
  readonly prefix?: string;
  readonly logger?: WorkerLogger | undefined;
}

export class BullMqTaskWorker<
  Data extends object,
  Result = void,
> {
  private readonly worker: Worker<Data, Result, string>;

  public constructor(
    name: string,
    config: RedisQueueConfig,
    processor: (data: Data) => Promise<Result>,
    options: BullMqTaskWorkerOptions = {},
  ) {
    const concurrency = options.concurrency ?? 1;
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 100) {
      throw new RangeError("worker concurrency must be an integer between 1 and 100");
    }
    const connection = parseRedisConnection(config.url);
    const workerOptions: WorkerOptions = {
      connection,
      concurrency,
      ...(config.prefix === undefined ? {} : { prefix: config.prefix }),
      ...(options.prefix === undefined ? {} : { prefix: options.prefix }),
    };
    this.worker = new Worker<Data, Result, string>(
      name,
      async (job) => {
        const jobId = job.id;
        const entityId = jobId ?? job.name;
        const taskCorrelationId = typeof job.data === "object" && job.data !== null &&
          "correlationId" in job.data && typeof job.data.correlationId === "string"
          ? job.data.correlationId
          : undefined;
        const correlationId = taskCorrelationId ?? `worker:job:${entityId}`;
        const identity = { entityType: "job", entityId, ...(jobId === undefined ? {} : { jobId }) };
        await bestEffortLog(options.logger, { action: "queue.job", outcome: "RECEIVED", correlationId, ...identity });
        try {
          const result = await processor(job.data);
          await bestEffortLog(options.logger, { action: "queue.job", outcome: "COMPLETED", correlationId, ...identity });
          return result;
        } catch (error) {
          await bestEffortLog(options.logger, { action: "queue.job", outcome: "FAILED", correlationId, ...identity, message: error });
          throw error;
        }
      },
      workerOptions,
    );
  }

  public async close(): Promise<void> {
    await this.worker.close();
  }
}
