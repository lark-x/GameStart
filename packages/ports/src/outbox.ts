import type { JsonObject } from "@living-network/domain";

export interface OutboxEvent {
  readonly id: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: JsonObject;
  readonly idempotencyKey: string;
  readonly createdAt: string;
  readonly publishedAt?: string;
  readonly attempts: number;
  readonly lastError?: string;
}

export interface OutboxEventInput {
  readonly id: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: JsonObject;
  readonly idempotencyKey: string;
  readonly createdAt: string;
}

export interface OutboxEventWriteResult {
  readonly event: OutboxEvent;
  readonly inserted: boolean;
}

export interface OutboxEventRepository {
  append(input: OutboxEventInput): Promise<OutboxEventWriteResult>;
  listUnpublished(limit: number): Promise<readonly OutboxEvent[]>;
  markPublished(id: string, publishedAt: string): Promise<OutboxEvent>;
  markFailed(id: string, error: string): Promise<OutboxEvent>;
}
