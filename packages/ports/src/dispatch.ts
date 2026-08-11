export type DispatchRequestStatus = "PENDING" | "ENQUEUED";

export interface ExecutionDispatchRequest<
  Payload extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: string;
  readonly batchId: string;
  readonly candidateId: string;
  readonly action: string;
  readonly idempotencyKey: string;
  readonly storyWorldId: string;
  readonly occurrenceId: string;
  readonly payload: Payload;
  readonly status: DispatchRequestStatus;
  readonly attempts: number;
  readonly requestedAt: string;
  readonly enqueuedAt?: string;
  readonly lastError?: string;
}

export interface WorkerHeartbeat {
  readonly workerId: string;
  readonly status: "RUNNING" | "STOPPED";
  readonly heartbeatAt: string;
  readonly metadata: Record<string, unknown>;
}

export interface DispatchRequestRepository<
  Payload extends Record<string, unknown> = Record<string, unknown>,
> {
  getById(id: string): Promise<ExecutionDispatchRequest<Payload> | undefined>;
  listByBatch(batchId: string): Promise<readonly ExecutionDispatchRequest<Payload>[]>;
  listPending(limit: number): Promise<readonly ExecutionDispatchRequest<Payload>[]>;
  save(request: ExecutionDispatchRequest<Payload>): Promise<ExecutionDispatchRequest<Payload>>;
  markEnqueued(id: string, at: string): Promise<void>;
  recordFailure(id: string, error: string): Promise<void>;
  heartbeat(value: WorkerHeartbeat): Promise<void>;
  getHeartbeat(workerId: string): Promise<WorkerHeartbeat | undefined>;
}
