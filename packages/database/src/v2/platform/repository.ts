import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import type {
  V2AppearanceSettingsDto,
  V2ImageServiceSettingsDto,
  V2ModelBindingDto,
  V2ModelCallLogDto,
  V2ModelCallLogPage,
  V2ModelCallLogQuery,
  V2ModelCapability,
  V2ModelLogMessage,
  V2ModelProtocol,
  V2SaveAppearanceSettingsRequest,
  V2SaveImageServiceSettingsRequest,
  V2StoredModelProfile,
} from "@living-network/contracts/v2";
import type { V2PlatformRepository } from "@living-network/ports/v2";
import { withV2SqliteAsyncTransaction } from "./connection.ts";

type ProfileRow = {
  profile_id: string;
  name: string;
  protocol: string;
  base_url: string;
  model: string;
  timeout_ms: number;
  max_tokens: number;
  temperature: number;
  encrypted_api_key: string | null;
  encryption_iv: string | null;
  created_at: string;
  updated_at: string;
};

type BindingRow = {
  capability: string;
  profile_id: string;
  profile_name: string;
  updated_at: string;
};

type LogRow = {
  log_id: string;
  status: string;
  capability: string;
  profile_id: string | null;
  profile_name: string | null;
  protocol: string | null;
  model: string | null;
  correlation_id: string | null;
  job_id: string | null;
  story_world_id: string | null;
  provider_response_id: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  finish_reason: string | null;
  request_messages_json: string | null;
  response_text: string | null;
  request_truncated: number;
  response_truncated: number;
  error_code: string | null;
  error_status: number | null;
  error_retryable: number | null;
  error_message: string | null;
};

interface LogCursor {
  readonly startedAt: string;
  readonly id: string;
}

function now(): string {
  return new Date().toISOString();
}

function encodeCursor(cursor: LogCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): LogCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof parsed.startedAt !== "string" || typeof parsed.id !== "string") throw new Error("invalid cursor");
    return { startedAt: parsed.startedAt, id: parsed.id };
  } catch {
    throw new TypeError("Invalid model call log cursor");
  }
}

function mapProfile(row: ProfileRow): V2StoredModelProfile {
  return {
    id: row.profile_id,
    name: row.name,
    protocol: row.protocol as V2ModelProtocol,
    baseUrl: row.base_url,
    model: row.model,
    timeoutMs: row.timeout_ms,
    maxTokens: row.max_tokens,
    temperature: row.temperature,
    ...(row.encrypted_api_key === null ? {} : { encryptedApiKey: row.encrypted_api_key }),
    ...(row.encryption_iv === null ? {} : { encryptionIv: row.encryption_iv }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseMessages(value: string | null): readonly V2ModelLogMessage[] | undefined {
  if (value === null) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed.filter((item): item is V2ModelLogMessage => {
      if (typeof item !== "object" || item === null) return false;
      const record = item as Record<string, unknown>;
      return (record.role === "system" || record.role === "user" || record.role === "assistant") && typeof record.content === "string";
    });
  } catch {
    return undefined;
  }
}

function mapLog(row: LogRow): V2ModelCallLogDto {
  const requestMessages = parseMessages(row.request_messages_json);
  return {
    id: row.log_id,
    status: row.status as V2ModelCallLogDto["status"],
    capability: row.capability,
    ...(row.profile_id === null ? {} : { profileId: row.profile_id }),
    ...(row.profile_name === null ? {} : { profileName: row.profile_name }),
    ...(row.protocol === null ? {} : { protocol: row.protocol as V2ModelProtocol }),
    ...(row.model === null ? {} : { model: row.model }),
    ...(row.correlation_id === null ? {} : { correlationId: row.correlation_id }),
    ...(row.job_id === null ? {} : { jobId: row.job_id }),
    ...(row.story_world_id === null ? {} : { storyWorldId: row.story_world_id }),
    ...(row.provider_response_id === null ? {} : { providerResponseId: row.provider_response_id }),
    startedAt: row.started_at,
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at }),
    ...(row.duration_ms === null ? {} : { durationMs: row.duration_ms }),
    ...(row.prompt_tokens === null ? {} : { promptTokens: row.prompt_tokens }),
    ...(row.completion_tokens === null ? {} : { completionTokens: row.completion_tokens }),
    ...(row.total_tokens === null ? {} : { totalTokens: row.total_tokens }),
    ...(row.finish_reason === null ? {} : { finishReason: row.finish_reason }),
    ...(requestMessages === undefined ? {} : { requestMessages }),
    ...(row.response_text === null ? {} : { responseText: row.response_text }),
    requestTruncated: row.request_truncated === 1,
    responseTruncated: row.response_truncated === 1,
    ...(row.error_code === null ? {} : { errorCode: row.error_code }),
    ...(row.error_status === null ? {} : { errorStatus: row.error_status }),
    ...(row.error_retryable === null ? {} : { errorRetryable: row.error_retryable === 1 }),
    ...(row.error_message === null ? {} : { errorMessage: row.error_message }),
  };
}

function getLogOrThrow(db: DatabaseSync, id: string): V2ModelCallLogDto {
  const row = db.prepare("SELECT * FROM v2_model_call_logs WHERE log_id = ?").get(id) as LogRow | undefined;
  if (row === undefined) throw new Error(`V2 model call log not found: ${id}`);
  return mapLog(row);
}

export class V2SqlitePlatformRepository implements V2PlatformRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async listModelProfiles(): Promise<readonly V2StoredModelProfile[]> {
    return (this.db.prepare("SELECT * FROM v2_model_profiles ORDER BY name ASC, profile_id ASC").all() as ProfileRow[]).map(mapProfile);
  }

  public async getModelProfile(id: string): Promise<V2StoredModelProfile | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_model_profiles WHERE profile_id = ?").get(id) as ProfileRow | undefined;
    return row === undefined ? undefined : mapProfile(row);
  }

  public async saveModelProfile(profile: V2StoredModelProfile): Promise<V2StoredModelProfile> {
    this.db.prepare(`
      INSERT INTO v2_model_profiles (
        profile_id, name, protocol, base_url, model, timeout_ms, max_tokens, temperature,
        encrypted_api_key, encryption_iv, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(profile_id) DO UPDATE SET
        name = excluded.name,
        protocol = excluded.protocol,
        base_url = excluded.base_url,
        model = excluded.model,
        timeout_ms = excluded.timeout_ms,
        max_tokens = excluded.max_tokens,
        temperature = excluded.temperature,
        encrypted_api_key = excluded.encrypted_api_key,
        encryption_iv = excluded.encryption_iv,
        updated_at = excluded.updated_at
    `).run(
      profile.id,
      profile.name,
      profile.protocol,
      profile.baseUrl,
      profile.model,
      profile.timeoutMs,
      profile.maxTokens,
      profile.temperature,
      profile.encryptedApiKey ?? null,
      profile.encryptionIv ?? null,
      profile.createdAt,
      profile.updatedAt,
    );
    const saved = await this.getModelProfile(profile.id);
    if (saved === undefined) throw new Error("Saved V2 model profile could not be read back");
    return saved;
  }

  public async deleteModelProfile(id: string): Promise<void> {
    this.db.prepare("DELETE FROM v2_model_profiles WHERE profile_id = ?").run(id);
  }

  public async listModelBindings(): Promise<readonly V2ModelBindingDto[]> {
    const rows = this.db.prepare(`
      SELECT b.capability, b.profile_id, p.name AS profile_name, b.updated_at
      FROM v2_model_bindings b
      JOIN v2_model_profiles p ON p.profile_id = b.profile_id
      ORDER BY b.capability ASC
    `).all() as BindingRow[];
    return rows.map((row) => ({ capability: row.capability as V2ModelCapability, profileId: row.profile_id, profileName: row.profile_name, updatedAt: row.updated_at }));
  }

  public async getModelBinding(capability: V2ModelCapability): Promise<V2ModelBindingDto | undefined> {
    const row = this.db.prepare(`
      SELECT b.capability, b.profile_id, p.name AS profile_name, b.updated_at
      FROM v2_model_bindings b
      JOIN v2_model_profiles p ON p.profile_id = b.profile_id
      WHERE b.capability = ?
    `).get(capability) as BindingRow | undefined;
    return row === undefined ? undefined : { capability: row.capability as V2ModelCapability, profileId: row.profile_id, profileName: row.profile_name, updatedAt: row.updated_at };
  }

  public async setModelBinding(input: { readonly capability: V2ModelCapability; readonly profileId: string }): Promise<V2ModelBindingDto> {
    return withV2SqliteAsyncTransaction(this.db, async () => {
      const profile = this.db.prepare("SELECT profile_id FROM v2_model_profiles WHERE profile_id = ?").get(input.profileId);
      if (profile === undefined) throw new Error(`V2 model profile not found: ${input.profileId}`);
      const updatedAt = now();
      this.db.prepare(`
        INSERT INTO v2_model_bindings (capability, profile_id, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(capability) DO UPDATE SET profile_id = excluded.profile_id, updated_at = excluded.updated_at
      `).run(input.capability, input.profileId, updatedAt);
      const binding = await this.getModelBinding(input.capability);
      if (binding === undefined) throw new Error("V2 model binding could not be read back");
      return binding;
    });
  }

  public async clearModelBinding(capability: V2ModelCapability): Promise<void> {
    this.db.prepare("DELETE FROM v2_model_bindings WHERE capability = ?").run(capability);
  }

  public async getImageServiceSettings(): Promise<V2ImageServiceSettingsDto> {
    const row = this.db.prepare("SELECT base_url, timeout_ms, default_workflow_version FROM v2_image_service_settings WHERE singleton_id = 1").get() as { base_url: string; timeout_ms: number; default_workflow_version: string | null } | undefined;
    if (row === undefined) return { baseUrl: "", timeoutMs: 30000 };
    return { baseUrl: row.base_url, timeoutMs: row.timeout_ms, ...(row.default_workflow_version === null ? {} : { defaultWorkflowVersion: row.default_workflow_version }) };
  }

  public async saveImageServiceSettings(input: V2SaveImageServiceSettingsRequest): Promise<V2ImageServiceSettingsDto> {
    const updatedAt = now();
    this.db.prepare(`
      INSERT INTO v2_image_service_settings (singleton_id, base_url, timeout_ms, default_workflow_version, updated_at)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(singleton_id) DO UPDATE SET base_url = excluded.base_url, timeout_ms = excluded.timeout_ms,
        default_workflow_version = excluded.default_workflow_version, updated_at = excluded.updated_at
    `).run(input.baseUrl, input.timeoutMs ?? 30000, input.defaultWorkflowVersion ?? null, updatedAt);
    return this.getImageServiceSettings();
  }

  public async getAppearanceSettings(): Promise<V2AppearanceSettingsDto> {
    const row = this.db.prepare("SELECT theme_id, updated_at FROM v2_appearance_settings WHERE singleton_id = 1").get() as { theme_id: string; updated_at: string } | undefined;
    return row === undefined ? { themeId: "dawn" } : { themeId: row.theme_id, updatedAt: row.updated_at };
  }

  public async saveAppearanceSettings(input: V2SaveAppearanceSettingsRequest): Promise<V2AppearanceSettingsDto> {
    const updatedAt = now();
    this.db.prepare(`
      INSERT INTO v2_appearance_settings (singleton_id, theme_id, updated_at)
      VALUES (1, ?, ?)
      ON CONFLICT(singleton_id) DO UPDATE SET theme_id = excluded.theme_id, updated_at = excluded.updated_at
    `).run(input.themeId, updatedAt);
    return this.getAppearanceSettings();
  }

  public async startModelCall(input: { readonly log: V2ModelCallLogDto }): Promise<V2ModelCallLogDto> {
    const log = input.log;
    this.db.prepare(`
      INSERT INTO v2_model_call_logs (
        log_id, status, capability, profile_id, profile_name, protocol, model, correlation_id, job_id,
        story_world_id, provider_response_id, started_at, completed_at, duration_ms, prompt_tokens,
        completion_tokens, total_tokens, finish_reason, request_messages_json, response_text,
        request_truncated, response_truncated, error_code, error_status, error_retryable, error_message
      ) VALUES (?, 'running', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, NULL, ?, 0, NULL, NULL, NULL, NULL)
    `).run(
      log.id,
      log.capability,
      log.profileId ?? null,
      log.profileName ?? null,
      log.protocol ?? null,
      log.model ?? null,
      log.correlationId ?? null,
      log.jobId ?? null,
      log.storyWorldId ?? null,
      log.providerResponseId ?? null,
      log.startedAt,
      log.requestMessages === undefined ? null : JSON.stringify(log.requestMessages),
      log.requestTruncated ? 1 : 0,
    );
    return getLogOrThrow(this.db, log.id);
  }

  public async completeModelCall(input: {
    readonly id: string;
    readonly completedAt: string;
    readonly durationMs: number;
    readonly providerResponseId?: string;
    readonly model?: string;
    readonly promptTokens?: number;
    readonly completionTokens?: number;
    readonly totalTokens?: number;
    readonly finishReason?: string;
    readonly responseText?: string;
    readonly responseTruncated?: boolean;
  }): Promise<V2ModelCallLogDto> {
    this.db.prepare(`
      UPDATE v2_model_call_logs
      SET status = 'success', completed_at = ?, duration_ms = ?, provider_response_id = COALESCE(?, provider_response_id),
        model = COALESCE(?, model), prompt_tokens = ?, completion_tokens = ?, total_tokens = ?, finish_reason = ?,
        response_text = ?, response_truncated = ?, error_code = NULL, error_status = NULL,
        error_retryable = NULL, error_message = NULL
      WHERE log_id = ?
    `).run(input.completedAt, input.durationMs, input.providerResponseId ?? null, input.model ?? null, input.promptTokens ?? null, input.completionTokens ?? null, input.totalTokens ?? null, input.finishReason ?? null, input.responseText ?? null, input.responseTruncated ? 1 : 0, input.id);
    return getLogOrThrow(this.db, input.id);
  }

  public async failModelCall(input: {
    readonly id: string;
    readonly completedAt: string;
    readonly durationMs: number;
    readonly errorCode?: string;
    readonly errorStatus?: number;
    readonly errorRetryable?: boolean;
    readonly errorMessage?: string;
  }): Promise<V2ModelCallLogDto> {
    this.db.prepare(`
      UPDATE v2_model_call_logs
      SET status = 'error', completed_at = ?, duration_ms = ?, error_code = ?, error_status = ?,
        error_retryable = ?, error_message = ?
      WHERE log_id = ?
    `).run(input.completedAt, input.durationMs, input.errorCode ?? null, input.errorStatus ?? null, input.errorRetryable === undefined ? null : input.errorRetryable ? 1 : 0, input.errorMessage ?? null, input.id);
    return getLogOrThrow(this.db, input.id);
  }

  public async getModelCallLog(id: string): Promise<V2ModelCallLogDto | undefined> {
    const row = this.db.prepare("SELECT * FROM v2_model_call_logs WHERE log_id = ?").get(id) as LogRow | undefined;
    return row === undefined ? undefined : mapLog(row);
  }

  public async queryModelCallLogs(query: V2ModelCallLogQuery = {}): Promise<V2ModelCallLogPage> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const values: SQLInputValue[] = [];
    const conditions: string[] = [];
    const add = (sql: string, value: SQLInputValue): void => {
      values.push(value);
      conditions.push(sql);
    };
    if (query.status !== undefined) add("status = ?", query.status);
    if (query.capability !== undefined) add("capability = ?", query.capability);
    if (query.profileId !== undefined) add("profile_id = ?", query.profileId);
    if (query.model !== undefined) add("model = ?", query.model);
    if (query.correlationId !== undefined) add("correlation_id = ?", query.correlationId);
    if (query.jobId !== undefined) add("job_id = ?", query.jobId);
    if (query.storyWorldId !== undefined) add("story_world_id = ?", query.storyWorldId);
    if (query.query !== undefined && query.query.trim().length > 0) {
      const value = `%${query.query.trim()}%`;
      values.push(value);
      conditions.push("(model LIKE ? OR profile_name LIKE ? OR correlation_id LIKE ? OR error_message LIKE ?)");
      values.push(value, value, value);
    }
    if (query.createdAfter !== undefined) add("started_at > ?", query.createdAfter);
    if (query.createdBefore !== undefined) add("started_at < ?", query.createdBefore);
    if (query.cursor !== undefined) {
      const cursor = decodeCursor(query.cursor);
      values.push(cursor.startedAt, cursor.id);
      conditions.push("(started_at, log_id) < (?, ?)");
    }
    values.push(limit + 1);
    const rows = this.db.prepare(`
      SELECT * FROM v2_model_call_logs
      ${conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`}
      ORDER BY started_at DESC, log_id DESC
      LIMIT ?
    `).all(...values) as LogRow[];
    const hasMore = rows.length > limit;
    const visible = rows.slice(0, limit).map(mapLog);
    return { items: visible, ...(hasMore && visible.length > 0 ? { nextCursor: encodeCursor({ startedAt: visible[visible.length - 1]!.startedAt, id: visible[visible.length - 1]!.id }) } : {}) };
  }

  public async deleteModelCallLogsBefore(cutoff: string): Promise<number> {
    const result = this.db.prepare("DELETE FROM v2_model_call_logs WHERE started_at < ?").run(cutoff);
    return Number(result.changes);
  }

  public async markInterruptedModelCalls(cutoff: string, completedAt: string): Promise<number> {
    const result = this.db.prepare(`
      UPDATE v2_model_call_logs
      SET status = 'interrupted', completed_at = ?,
        duration_ms = CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER),
        error_code = 'INTERRUPTED', error_message = 'Model call was interrupted before completion'
      WHERE status = 'running' AND started_at < ?
    `).run(completedAt, completedAt, cutoff);
    return Number(result.changes);
  }
}

export function createV2ModelCallLog(input: {
  readonly capability: string;
  readonly startedAt: string;
  readonly profileId?: string;
  readonly profileName?: string;
  readonly protocol?: V2ModelProtocol;
  readonly model?: string;
  readonly correlationId?: string;
  readonly jobId?: string;
  readonly storyWorldId?: string;
  readonly requestMessages?: readonly V2ModelLogMessage[];
  readonly requestTruncated?: boolean;
}): V2ModelCallLogDto {
  return {
    id: `model-call:${randomUUID()}`,
    status: "running",
    capability: input.capability,
    ...(input.profileId === undefined ? {} : { profileId: input.profileId }),
    ...(input.profileName === undefined ? {} : { profileName: input.profileName }),
    ...(input.protocol === undefined ? {} : { protocol: input.protocol }),
    ...(input.model === undefined ? {} : { model: input.model }),
    ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
    ...(input.jobId === undefined ? {} : { jobId: input.jobId }),
    ...(input.storyWorldId === undefined ? {} : { storyWorldId: input.storyWorldId }),
    startedAt: input.startedAt,
    ...(input.requestMessages === undefined ? {} : { requestMessages: input.requestMessages }),
    requestTruncated: input.requestTruncated ?? false,
    responseTruncated: false,
  };
}
