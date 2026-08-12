import type { V2IsoDateTime, V2JobId } from "./primitives.ts";

export type V2JobStatus =
  | "queued"
  | "claimed"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface V2JobRef {
  readonly jobId: V2JobId;
  readonly status: V2JobStatus;
  readonly createdAt: V2IsoDateTime;
  readonly updatedAt: V2IsoDateTime;
}
