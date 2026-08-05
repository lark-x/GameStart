import type {
  OutboxEvent,
  OutboxEventRepository,
} from "../../../packages/database/src/index.ts";
import type { TaskQueue } from "./queue.ts";

export interface OutboxQueueTask extends Record<string, unknown> {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: OutboxEvent["payload"];
}

export interface OutboxPublisherResult {
  readonly published: readonly string[];
  readonly failed: readonly string[];
}

export class OutboxPublisher {
  private readonly outbox: OutboxEventRepository;
  private readonly queue: TaskQueue<OutboxQueueTask>;
  private readonly clock: () => Date;

  public constructor(
    outbox: OutboxEventRepository,
    queue: TaskQueue<OutboxQueueTask>,
    clock: () => Date = () => new Date(),
  ) {
    this.outbox = outbox;
    this.queue = queue;
    this.clock = clock;
  }

  public async publishBatch(limit = 100): Promise<OutboxPublisherResult> {
    const events = await this.outbox.listUnpublished(limit);
    const published: string[] = [];
    const failed: string[] = [];
    for (const event of events) {
      try {
        await this.queue.enqueue(event.id, {
          eventId: event.id,
          eventType: event.eventType,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          payload: event.payload,
        });
        await this.outbox.markPublished(event.id, this.clock().toISOString());
        published.push(event.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "outbox publish failed";
        await this.outbox.markFailed(event.id, message);
        failed.push(event.id);
      }
    }
    return { published, failed };
  }
}
