import type {
  V2AppearanceSettingsDto,
  V2ImageServiceSettingsDto,
  V2ModelBindingDto,
  V2ModelCallLogDto,
  V2ModelCallLogPage,
  V2ModelCallLogQuery,
  V2ModelProfileDto,
  V2PlatformCapabilities,
  V2SaveAppearanceSettingsRequest,
  V2SaveImageServiceSettingsRequest,
  V2SaveModelProfileRequest,
  V2SetModelBindingRequest,
} from "@living-network/contracts/v2";

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
    async getAppearanceSettings(): Promise<V2AppearanceSettingsDto> {
      return (await get<{ readonly settings: V2AppearanceSettingsDto }>("/appearance")).settings;
    },
    async saveAppearanceSettings(input: V2SaveAppearanceSettingsRequest): Promise<V2AppearanceSettingsDto> {
      return (await send<{ readonly settings: V2AppearanceSettingsDto }>("PUT", "/appearance", input)).settings;
    },
    async getCapabilities(): Promise<V2PlatformCapabilities> {
      return get<V2PlatformCapabilities>("/capabilities");
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
  };
}

export interface V2PlatformClient {
  listModelProfiles(): Promise<readonly V2ModelProfileDto[]>;
  saveModelProfile(input: V2SaveModelProfileRequest): Promise<V2ModelProfileDto>;
  deleteModelProfile(id: string): Promise<void>;
  testModelProfile(id: string): Promise<Readonly<Record<string, unknown>>>;
  listModelBindings(): Promise<readonly V2ModelBindingDto[]>;
  setModelBinding(capability: string, input: V2SetModelBindingRequest): Promise<V2ModelBindingDto>;
  getImageServiceSettings(): Promise<V2ImageServiceSettingsDto>;
  saveImageServiceSettings(input: V2SaveImageServiceSettingsRequest): Promise<V2ImageServiceSettingsDto>;
  getAppearanceSettings(): Promise<V2AppearanceSettingsDto>;
  saveAppearanceSettings(input: V2SaveAppearanceSettingsRequest): Promise<V2AppearanceSettingsDto>;
  getCapabilities(): Promise<V2PlatformCapabilities>;
  queryModelCallLogs(query?: V2ModelCallLogQuery): Promise<V2ModelCallLogPage>;
  getModelCallLog(id: string): Promise<V2ModelCallLogDto>;
  deleteModelCallLogs(before: string): Promise<number>;
}
