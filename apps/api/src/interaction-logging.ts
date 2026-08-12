import type { InteractionLogDto, InteractionLogQuery } from "@living-network/contracts";
import { previewMessage, type InteractionLogInput, type InteractionLogRepository } from "@living-network/ports";
import type { ChatContent, ChatObservationHook } from "@living-network/ai";

export type LogSubscriber = (log: InteractionLogDto) => void;

export interface InteractionLoggingOptions {
  readonly repository: InteractionLogRepository;
  readonly clock?: () => Date;
  readonly cleanupIntervalMs?: number;
  readonly cleanupEnabled?: boolean;
}

/** API-owned lifecycle wrapper: logging never rejects business work. */
export class InteractionLogging {
  private readonly repository: InteractionLogRepository;
  private readonly clock: () => Date;
  private readonly subscribers = new Set<LogSubscriber>();
  private readonly timer: ReturnType<typeof setInterval> | undefined;

  public constructor(options: InteractionLoggingOptions) {
    this.repository = options.repository;
    this.clock = options.clock ?? (() => new Date());
    if (options.cleanupEnabled !== false) {
      const interval = options.cleanupIntervalMs ?? 60 * 60 * 1000;
      this.timer = setInterval(() => void this.cleanup(), interval);
      if (typeof this.timer === "object" && "unref" in this.timer) this.timer.unref();
    }
  }

  public async append(input: InteractionLogInput): Promise<InteractionLogDto | undefined> {
    try {
      const log = await this.repository.append(input);
      for (const subscriber of this.subscribers) {
        try { subscriber(log); } catch { /* subscriber isolation */ }
      }
      return log;
    } catch { return undefined; }
  }

  public query(query?: InteractionLogQuery): Promise<{ items: InteractionLogDto[]; nextCursor?: string }> {
    return this.repository.query(query);
  }

  public subscribe(subscriber: LogSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  public async cleanup(): Promise<number> {
    const cutoff = new Date(this.clock().getTime() - 7 * 24 * 60 * 60 * 1000);
    try { return await this.repository.deleteOlderThan(cutoff); } catch { return 0; }
  }

  public stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.subscribers.clear();
  }
}
/** Maps provider lifecycle observations into the same best-effort log stream used by the API. */
export function createChatObservationLogHook(logging: Pick<InteractionLogging, "append">): ChatObservationHook {
  return async (observation) => {
    if (
      observation.name === "request_started" ||
      observation.name === "first_token" ||
      (observation.name === "resolution" && observation.outcome === "resolved")
    ) return;
    const failed = observation.name === "error" || observation.outcome === "error" || observation.outcome === "missing";
    const cancelled = observation.outcome === "cancelled";
    const trace = observation.trace;
    const redactBearer = (value: string): string => value.replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]");
    const base64ByteLength = (value: string): number => {
      const compact = value.replace(/\s/g, "");
      const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
      return Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
    };
    const contentPreview = (content: ChatContent): string => {
      if (typeof content === "string") return previewMessage(redactBearer(content)) ?? "";
      return previewMessage(content.map((part) => part.type === "text"
        ? redactBearer(part.text)
        : `[image:${part.mediaType};${base64ByteLength(part.dataBase64)} bytes]`).join("\n")) ?? "";
    };
    const message = observation.error?.message ?? observation.preview;
    const safeMessage = message === undefined ? undefined : previewMessage(redactBearer(message));
    const safeError = observation.error === undefined
      ? undefined
      : { ...observation.error, ...(observation.error.message === undefined ? {} : { message: redactBearer(observation.error.message) }) };
    await logging.append({
      level: failed ? "ERROR" : cancelled ? "WARN" : "INFO",
      source: "PROVIDER",
      category: "LLM",
      action: "provider." + observation.name,
      outcome: failed ? "FAILURE" : (observation.outcome?.toUpperCase() ?? "SUCCESS"),
      ...(observation.durationMs === undefined ? {} : { durationMs: observation.durationMs }),
      ...(trace?.requestId === undefined ? {} : { requestId: trace.requestId }),
      ...(trace?.correlationId === undefined ? {} : { correlationId: trace.correlationId }),
      ...(trace?.worldId === undefined ? {} : { worldId: trace.worldId }),
      ...(trace?.actorId === undefined ? {} : { actorId: trace.actorId }),
      ...(trace?.conversationId === undefined ? {} : { conversationId: trace.conversationId }),
      entityType: "llm-provider-profile",
      ...(observation.profileId === undefined ? {} : { entityId: observation.profileId }),
      ...(safeMessage === undefined ? {} : { message: safeMessage }),
      details: {
        ...(observation.profileName === undefined ? {} : { profileName: observation.profileName }),
        ...(observation.protocol === undefined ? {} : { protocol: observation.protocol }),
        ...(observation.model === undefined ? {} : { model: observation.model }),
        ...(observation.requestMessages === undefined ? {} : {
          requestMessages: observation.requestMessages.slice(-20).map((item) => ({
            role: item.role,
            content: contentPreview(item.content),
          })),
        }),
        ...(observation.preview === undefined ? {} : { response: previewMessage(redactBearer(observation.preview)) ?? "" }),
        ...(safeError === undefined ? {} : { error: safeError }),
      },
    });
  };
}
