export const InteractionLogLevel = { DEBUG: "DEBUG", INFO: "INFO", WARN: "WARN", ERROR: "ERROR" } as const;
export type InteractionLogLevel = (typeof InteractionLogLevel)[keyof typeof InteractionLogLevel];
export const InteractionLogSource = { API: "API", AI: "AI", WORKER: "WORKER", SYSTEM: "SYSTEM", DATABASE: "DATABASE", PROVIDER: "PROVIDER" } as const;
export type InteractionLogSource = (typeof InteractionLogSource)[keyof typeof InteractionLogSource];
export const InteractionLogCategory = { HTTP: "HTTP", CHAT: "CHAT", LLM: "LLM", DISPATCH: "DISPATCH", QUEUE: "QUEUE", EVENT_OUTPUT: "EVENT_OUTPUT", IMAGE: "IMAGE", WORKER_LIFECYCLE: "WORKER_LIFECYCLE", SYSTEM: "SYSTEM", DATABASE: "DATABASE", AUTH: "AUTH", PROVIDER: "PROVIDER" } as const;
export type InteractionLogCategory = (typeof InteractionLogCategory)[keyof typeof InteractionLogCategory];
export interface InteractionLogDto { id: string; createdAt: string; level: InteractionLogLevel; source: InteractionLogSource; category: InteractionLogCategory; action: string; outcome: string; durationMs?: number; requestId?: string; correlationId?: string; worldId?: string; actorId?: string; conversationId?: string; entityType?: string; entityId?: string; message?: string; details?: Record<string, unknown>; }
export interface InteractionLogQuery { cursor?: string; limit?: number; level?: InteractionLogLevel; source?: InteractionLogSource; category?: InteractionLogCategory; action?: string; outcome?: string; requestId?: string; correlationId?: string; worldId?: string; actorId?: string; conversationId?: string; entityType?: string; entityId?: string; query?: string; createdAfter?: string; createdBefore?: string; }
export interface InteractionLogPageDto { items: InteractionLogDto[]; nextCursor?: string; }
export interface ProviderConnectionTestResultDto { success: boolean; ok: boolean; profileId?: string; protocol?: string; model?: string; latencyMs?: number; preview?: string; error?: { code?: string; message: string; retryable?: boolean; status?: number }; correlationId?: string; }
export interface ChatTraceContext { requestId?: string; correlationId: string; worldId?: string; actorId?: string; conversationId?: string; }

