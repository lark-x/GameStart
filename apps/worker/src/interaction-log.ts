import { InteractionLogCategory, InteractionLogLevel, InteractionLogSource } from "@living-network/contracts";
import { previewMessage, redactSensitive, type InteractionLogInput, type InteractionLogRepository } from "@living-network/database";
export type WorkerLogger = InteractionLogRepository;
export interface WorkerLogEvent { readonly action?: string; readonly event?: string; readonly phase?: string; readonly outcome?: string; readonly correlationId: string; readonly category?: InteractionLogInput["category"]; readonly level?: InteractionLogInput["level"]; readonly entityType?: string; readonly entityId?: string; readonly occurrenceId?: string; readonly worldId?: string; readonly jobId?: string; readonly requestId?: string; readonly message?: unknown; readonly details?: unknown; readonly [key: string]: unknown; }
function logDetails(event: WorkerLogEvent): Record<string, unknown> {
  const sanitized = redactSensitive(event.details);
  return {
    ...(event.occurrenceId === undefined ? {} : { occurrenceId: event.occurrenceId }),
    ...(event.jobId === undefined ? {} : { jobId: event.jobId }),
    ...(sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
      ? sanitized as Record<string, unknown>
      : event.details === undefined ? {} : { context: sanitized }),
  };
}
export async function bestEffortLog(logger: WorkerLogger | undefined, event: WorkerLogEvent): Promise<void> {
  if (!logger) return;
  try {
    const input = { level: event.level ?? InteractionLogLevel.INFO, source: InteractionLogSource.WORKER, category: event.category ?? InteractionLogCategory.SYSTEM, action: event.action ?? [event.event, event.phase].filter(Boolean).join("."), outcome: event.outcome ?? "UNKNOWN", correlationId: event.correlationId, ...(event.requestId === undefined ? {} : { requestId: event.requestId }), ...(event.worldId === undefined ? {} : { worldId: event.worldId }), ...(event.entityType === undefined ? {} : { entityType: event.entityType }), ...(event.entityId === undefined && event.occurrenceId === undefined && event.jobId === undefined ? {} : { entityId: event.entityId ?? event.occurrenceId ?? event.jobId }), ...(previewMessage(redactSensitive(event.message)) === undefined ? {} : { message: previewMessage(redactSensitive(event.message)) }), details: logDetails(event) };
    await logger.append(input as InteractionLogInput);
  } catch {}
}
export function workerCorrelation(entityType: string, entityId: string, occurrenceId?: string): string { return "worker:" + entityType + ":" + entityId + (occurrenceId === undefined ? "" : ":occurrence:" + occurrenceId); }
