import type { ApiInteractionLog } from "../types";

export const USEFUL_LOG_ACTIONS = [
  "provider.completed",
  "provider.error",
  "provider.test",
  "message.save",
  "auto_reply.completed",
  "auto_reply.failed",
  "image.submit",
  "image.progress",
] as const;

export function isUsefulInteractionLog(item: ApiInteractionLog) {
  if (item.level === "ERROR" || item.level === "WARN") return true;
  if (item.category === "LLM") {
    return ["provider.completed", "provider.error", "provider.test"].includes(item.action);
  }
  if (item.category === "CHAT") {
    return ["message.save", "auto_reply.completed", "auto_reply.failed"].includes(item.action);
  }
  if (item.category === "IMAGE") {
    return ["image.submit", "image.progress"].includes(item.action) && item.outcome !== "STARTED";
  }
  return false;
}

export function focusedLogQueries(base: Record<string, string | number>) {
  const queries: Array<Record<string, string | number>> = USEFUL_LOG_ACTIONS.map((action) => ({
    ...base,
    action,
  }));
  if (!base.level) {
    queries.push({ ...base, level: "ERROR" });
    queries.push({ ...base, level: "WARN" });
  }
  return queries;
}
