import type {
  V2AppearanceSettingsDto,
  V2CapabilityToggleRequest,
  V2DiscoverModelsRequest,
  V2ExternalConnectionCheckDto,
  V2ImageServiceSettingsDto,
  V2JobDetailDto,
  V2JobListDto,
  V2JobOverviewDto,
  V2JobQuery,
  V2MemoryDiagnosticsDto,
  V2MemoryOverviewDto,
  V2ModelBindingDto,
  V2RetryJobResponse,
  V2ModelCallLogDto,
  V2ModelCallLogPage,
  V2ModelCallLogQuery,
  V2ModelProfileDto,
  V2PlatformCapabilities,
  V2RuntimeCapability,
  V2SaveAppearanceSettingsRequest,
  V2SaveImageServiceSettingsRequest,
  V2SaveModelProfileRequest,
  V2SetModelBindingRequest,
} from "@living-network/contracts/v2";
export interface V2RuntimeHealth {
  readonly ok?: boolean;
  readonly version?: string;
}

export interface V2RuntimeReady {
  readonly ok?: boolean;
  readonly version?: string;
  readonly storage?: string;
}


export interface V2PlatformClientOptions {
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
}

export class V2PlatformClientError extends Error {
  public readonly code: string;
  public readonly status: number;

  public constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "V2PlatformClientError";
    this.code = code;
    this.status = status;
  }
}

interface ErrorBody {
  readonly error?: { readonly code?: unknown; readonly message?: unknown };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const payload = (await response.json()) as T | ErrorBody;
  if (!response.ok) {
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : undefined;
    throw new V2PlatformClientError(
      typeof error?.code === "string" ? error.code : "INTERNAL_ERROR",
      typeof error?.message === "string" ? error.message : `请求失败（HTTP ${response.status}）`,
      response.status,
    );
  }
  return payload as T;
}

function request(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

export function createV2PlatformClient(options: V2PlatformClientOptions): V2PlatformClient {
  const fetcher = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const get = async <T>(path: string): Promise<T> => readJson<T>(await fetcher(`${baseUrl}/api/v2/platform${path}`, request("GET")));
  const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => readJson<T>(await fetcher(`${baseUrl}/api/v2/platform${path}`, request(method, body)));

  return {
    async listModelProfiles(): Promise<readonly V2ModelProfileDto[]> {
      return (await get<{ readonly profiles: readonly V2ModelProfileDto[] }>("/model-profiles")).profiles;
    },
    async saveModelProfile(input: V2SaveModelProfileRequest): Promise<V2ModelProfileDto> {
      const result = await send<{ readonly profile: V2ModelProfileDto }>(
        input.id === undefined ? "POST" : "PUT",
        input.id === undefined ? "/model-profiles" : `/model-profiles/${encodeURIComponent(input.id)}`,
        input,
      );
      return result.profile;
    },
    async deleteModelProfile(id: string): Promise<void> {
      await send<void>("DELETE", `/model-profiles/${encodeURIComponent(id)}`);
    },
    async discoverModels(input: V2DiscoverModelsRequest): Promise<readonly string[]> {
      return (await send<{ readonly models: readonly string[] }>("POST", "/model-profiles/discover-models", input)).models;
    },
    async testModelProfile(id: string): Promise<Readonly<Record<string, unknown>>> {
      return send<Readonly<Record<string, unknown>>>("POST", `/model-profiles/${encodeURIComponent(id)}/test`);
    },
    async listModelBindings(): Promise<readonly V2ModelBindingDto[]> {
      return (await get<{ readonly bindings: readonly V2ModelBindingDto[] }>("/model-bindings")).bindings;
    },
    async setModelBinding(capability: string, input: V2SetModelBindingRequest): Promise<V2ModelBindingDto> {
      return (await send<{ readonly binding: V2ModelBindingDto }>("PUT", `/model-bindings/${encodeURIComponent(capability)}`, input)).binding;
    },
    async getImageServiceSettings(): Promise<V2ImageServiceSettingsDto> {
      return (await get<{ readonly settings: V2ImageServiceSettingsDto }>("/image-service")).settings;
    },
    async saveImageServiceSettings(input: V2SaveImageServiceSettingsRequest): Promise<V2ImageServiceSettingsDto> {
      return (await send<{ readonly settings: V2ImageServiceSettingsDto }>("PUT", "/image-service", input)).settings;
    },
    async testImageServiceConnection(): Promise<V2ExternalConnectionCheckDto> {
      return (await send<{ readonly check: V2ExternalConnectionCheckDto }>("POST", "/image-service/test")).check;
    },
    async getAppearanceSettings(): Promise<V2AppearanceSettingsDto> {
      return (await get<{ readonly settings: V2AppearanceSettingsDto }>("/appearance")).settings;
    },
    async saveAppearanceSettings(input: V2SaveAppearanceSettingsRequest): Promise<V2AppearanceSettingsDto> {
      return (await send<{ readonly settings: V2AppearanceSettingsDto }>("PUT", "/appearance", input)).settings;
    },
    async getCapabilities(): Promise<V2PlatformCapabilities> {
      return get<V2PlatformCapabilities>("/capabilities");
    },
    async updateCapability(capability: V2RuntimeCapability, input: V2CapabilityToggleRequest): Promise<V2PlatformCapabilities> {
      return send<V2PlatformCapabilities>("PATCH", `/capabilities/${encodeURIComponent(capability)}`, input);
    },
    async queryModelCallLogs(query: V2ModelCallLogQuery = {}): Promise<V2ModelCallLogPage> {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) params.set(key, String(value));
      }
      return get<V2ModelCallLogPage>(`/model-call-logs${params.size === 0 ? "" : `?${params.toString()}`}`);
    },
    async getModelCallLog(id: string): Promise<V2ModelCallLogDto> {
      return (await get<{ readonly log: V2ModelCallLogDto }>(`/model-call-logs/${encodeURIComponent(id)}`)).log;
    },
    async deleteModelCallLogs(before: string): Promise<number> {
      return (await send<{ readonly deleted: number }>("DELETE", `/model-call-logs?before=${encodeURIComponent(before)}`)).deleted;
    },
    async getHealth(): Promise<V2RuntimeHealth> {
      return readJson<V2RuntimeHealth>(await fetcher(`${baseUrl}/api/v2/health`, request("GET")));
    },
    async getReady(): Promise<V2RuntimeReady> {
      return readJson<V2RuntimeReady>(await fetcher(`${baseUrl}/api/v2/ready`, request("GET")));
    },
    async getMemoryOverview(): Promise<V2MemoryOverviewDto> {
      return readJson<V2MemoryOverviewDto>(await fetcher(`${baseUrl}/api/v2/memory/overview`, request("GET")));
    },
    async getMemoryDiagnostics(): Promise<V2MemoryDiagnosticsDto> {
      return readJson<V2MemoryDiagnosticsDto>(await fetcher(`${baseUrl}/api/v2/memory/diagnostics`, request("GET")));
    },
    async listJobs(query: V2JobQuery = {}): Promise<V2JobListDto> {
      const params = new URLSearchParams();
      if (query.status !== undefined) params.set("status", query.status);
      if (query.type !== undefined) params.set("type", query.type);
      if (query.limit !== undefined) params.set("limit", String(query.limit));
      if (query.cursor !== undefined) params.set("cursor", query.cursor);
      return readJson<V2JobListDto>(await fetcher(`${baseUrl}/api/v2/jobs${params.size === 0 ? "" : `?${params.toString()}`}`, request("GET")));
    },
    async getJobOverview(): Promise<V2JobOverviewDto> {
      return readJson<V2JobOverviewDto>(await fetcher(`${baseUrl}/api/v2/jobs/overview`, request("GET")));
    },
    async getJob(jobId: string): Promise<V2JobDetailDto> {
      return readJson<V2JobDetailDto>(await fetcher(`${baseUrl}/api/v2/jobs/${encodeURIComponent(jobId)}`, request("GET")));
    },
    async retryJob(jobId: string): Promise<V2RetryJobResponse> {
      return readJson<V2RetryJobResponse>(await fetcher(`${baseUrl}/api/v2/jobs/${encodeURIComponent(jobId)}/retry`, request("POST")));
    },
  };
}

export interface V2PlatformClient {
  listModelProfiles(): Promise<readonly V2ModelProfileDto[]>;
  saveModelProfile(input: V2SaveModelProfileRequest): Promise<V2ModelProfileDto>;
  deleteModelProfile(id: string): Promise<void>;
  discoverModels(input: V2DiscoverModelsRequest): Promise<readonly string[]>;
  testModelProfile(id: string): Promise<Readonly<Record<string, unknown>>>;
  listModelBindings(): Promise<readonly V2ModelBindingDto[]>;
  setModelBinding(capability: string, input: V2SetModelBindingRequest): Promise<V2ModelBindingDto>;
  getImageServiceSettings(): Promise<V2ImageServiceSettingsDto>;
  saveImageServiceSettings(input: V2SaveImageServiceSettingsRequest): Promise<V2ImageServiceSettingsDto>;
  testImageServiceConnection(): Promise<V2ExternalConnectionCheckDto>;
  getAppearanceSettings(): Promise<V2AppearanceSettingsDto>;
  saveAppearanceSettings(input: V2SaveAppearanceSettingsRequest): Promise<V2AppearanceSettingsDto>;
  getCapabilities(): Promise<V2PlatformCapabilities>;
  updateCapability(capability: V2RuntimeCapability, input: V2CapabilityToggleRequest): Promise<V2PlatformCapabilities>;
  queryModelCallLogs(query?: V2ModelCallLogQuery): Promise<V2ModelCallLogPage>;
  getModelCallLog(id: string): Promise<V2ModelCallLogDto>;
  deleteModelCallLogs(before: string): Promise<number>;
  getHealth(): Promise<V2RuntimeHealth>;
  getReady(): Promise<V2RuntimeReady>;
  getMemoryOverview(): Promise<V2MemoryOverviewDto>;
  getMemoryDiagnostics(): Promise<V2MemoryDiagnosticsDto>;
  listJobs(query?: V2JobQuery): Promise<V2JobListDto>;
  getJobOverview(): Promise<V2JobOverviewDto>;
  getJob(jobId: string): Promise<V2JobDetailDto>;
  retryJob(jobId: string): Promise<V2RetryJobResponse>;
}
