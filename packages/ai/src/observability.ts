import type { ChatContent, ChatMessage, ProviderErrorCode } from "./provider.ts";
import type { ChatTraceContext } from "../../contracts/src/interaction-log.ts";
import { previewMessage, redactSensitive } from "../../database/src/interaction-log.ts";
export type { ChatTraceContext } from "../../contracts/src/interaction-log.ts";
export type ChatObservationName = "resolution" | "request_started" | "first_token" | "completed" | "error";
export interface ChatObservation { name: ChatObservationName; trace?: ChatTraceContext; profileId?: string; profileName?: string; protocol?: string; model?: string; durationMs?: number; error?: { code?: ProviderErrorCode | string; status?: number; retryable?: boolean; message?: string }; requestMessages?: readonly ChatMessage[]; preview?: string; outcome?: string; }
export type ChatObservationHook = (observation: ChatObservation) => void | Promise<void>;
export async function emitObservation(hook: ChatObservationHook | undefined, observation: ChatObservation): Promise<void> {
  if (!hook) return;
  try { await hook(sanitizeObservation(observation)); } catch {}
}
function redactText(value: string): string { return value.replace(/Bearer\s+[^\s]+/gi, "Bearer [REDACTED]"); }
function base64ByteLength(value: string): number { const compact = value.replace(/\s/g, ""); const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0; return Math.max(0, Math.floor((compact.length * 3) / 4) - padding); }
function contentPreview(content: ChatContent): string {
  if (typeof content === "string") return previewMessage(redactText(content)) ?? "";
  const rendered = content.map((part) => part.type === "text" ? redactText(part.text) : `[image:${part.mediaType};${base64ByteLength(part.dataBase64)} bytes]`).join("\n");
  return previewMessage(rendered) ?? "";
}
function sanitizeObservation(value: ChatObservation): ChatObservation {
  const safe = redactSensitive(value) as ChatObservation;
  const result = { ...safe };
  if (value.requestMessages !== undefined) {
    result.requestMessages = value.requestMessages.slice(-20).map((message) => ({
      role: message.role,
      content: contentPreview(message.content),
    }));
  }
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