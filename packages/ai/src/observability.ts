import type { ProviderErrorCode } from "./provider.ts";
import type { ChatTraceContext } from "../../contracts/src/interaction-log.ts";
import { previewMessage, redactSensitive } from "../../database/src/interaction-log.ts";
export type { ChatTraceContext } from "../../contracts/src/interaction-log.ts";
export type ChatObservationName = "resolution" | "request_started" | "first_token" | "completed" | "error";
export interface ChatObservation { name: ChatObservationName; trace?: ChatTraceContext; profileId?: string; profileName?: string; protocol?: string; model?: string; durationMs?: number; error?: { code?: ProviderErrorCode | string; status?: number; retryable?: boolean; message?: string }; preview?: string; outcome?: string; }
export type ChatObservationHook = (observation: ChatObservation) => void | Promise<void>;
export async function emitObservation(hook: ChatObservationHook | undefined, observation: ChatObservation): Promise<void> {
  if (!hook) return;
  try { await hook(sanitizeObservation(observation)); } catch {}
}
function redactText(value: string): string { return value.replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]"); }

function sanitizeObservation(value: ChatObservation): ChatObservation {
  const safe = redactSensitive(value) as ChatObservation;
  const result = { ...safe };
  if (value.preview !== undefined) {
    const preview = previewMessage(typeof value.preview === "string" ? redactText(value.preview) : value.preview);
    if (preview !== undefined) result.preview = preview;
  }
  if (value.error?.message !== undefined) {
    const message = previewMessage(redactText(value.error.message));
    if (message !== undefined) result.error = { ...result.error, message };
  }
  return result;
}