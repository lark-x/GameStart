import type {
  DispatchRequestRepository,
  WorkerHeartbeat,
} from "@living-network/ports";
import type { TaskQueue } from "./queue.ts";
import type { WorkerOccurrenceTask } from "./runtime.ts";
import { bestEffortLog, type WorkerLogger } from "./interaction-log.ts";

export interface DispatchPump {
  runOnce(): Promise<number>;
  heartbeat(status?: WorkerHeartbeat["status"]): Promise<void>;
}

export function createDispatchPump(
  repository: DispatchRequestRepository,
  occurrenceQueue: TaskQueue<WorkerOccurrenceTask>,
  options: {
    readonly workerId: string;
    readonly batchSize?: number;
    readonly now?: () => string;
    readonly logger?: WorkerLogger | undefined;
  },
): DispatchPump {
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async runOnce() {
      let dispatched = 0;
      const requests = await repository.listPending(options.batchSize ?? 100);
      await bestEffortLog(options.logger, { level: "DEBUG", event: "execution.dispatch", phase: "scan", outcome: "SUCCESS", correlationId: "dispatch-scan:" + options.workerId, workerId: options.workerId, context: { count: requests.length } });
      for (const request of requests) {
        try {
          const payload = request.payload as Partial<WorkerOccurrenceTask>;
          if (
            typeof payload.occurrenceId !== "string" ||
            payload.execution === null ||
            typeof payload.execution !== "object"
          ) {
            throw new TypeError("Dispatch payload must be a WorkerOccurrenceTask");
          }
          await occurrenceQueue.enqueue(request.id, { ...(payload as WorkerOccurrenceTask), correlationId: request.id });
          await repository.markEnqueued(request.id, now());
          dispatched += 1;
          await bestEffortLog(options.logger, { event: "execution.dispatch", phase: "enqueue", outcome: "SUCCESS", correlationId: request.id, dispatchRequestId: request.id, occurrenceId: request.occurrenceId, worldId: request.storyWorldId });
        } catch (error) {
          await repository.recordFailure(
            request.id,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
      await repository.heartbeat({
        workerId: options.workerId,
        status: "RUNNING",
        heartbeatAt: now(),
        metadata: { dispatched },
      });
      await bestEffortLog(options.logger, { level: "DEBUG", event: "worker.heartbeat", outcome: "RUNNING", correlationId: "worker:" + options.workerId });
      return dispatched;
    },

    async heartbeat(status = "RUNNING") {
      await repository.heartbeat({
        workerId: options.workerId,
        status,
        heartbeatAt: now(),
        metadata: {},
      });
    },
  };
}