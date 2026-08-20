import type {
  V2AppearanceSettingsDto,
  V2CapabilitySettingDto,
  V2ExternalConnectionCheckDto,
  V2ExternalServiceKind,
  V2ImageServiceSettingsDto,
  V2ModelBindingDto,
  V2ModelCallLogDto,
  V2ModelCallLogPage,
  V2ModelCallLogQuery,
  V2ModelCapability,
  V2ModelProfileDto,
  V2RuntimeCapability,
  V2SaveAppearanceSettingsRequest,
  V2SaveImageServiceSettingsRequest,
  V2StoredModelProfile,
} from "@living-network/contracts/v2";

export interface V2ModelProfileRepository {
  listModelProfiles(): Promise<readonly V2StoredModelProfile[]>;
  getModelProfile(id: string): Promise<V2StoredModelProfile | undefined>;
  saveModelProfile(profile: V2StoredModelProfile): Promise<V2StoredModelProfile>;
  deleteModelProfile(id: string): Promise<void>;
}

export interface V2ModelBindingRepository {
  listModelBindings(): Promise<readonly V2ModelBindingDto[]>;
  getModelBinding(capability: V2ModelCapability): Promise<V2ModelBindingDto | undefined>;
  setModelBinding(input: { readonly capability: V2ModelCapability; readonly profileId?: string }): Promise<V2ModelBindingDto | undefined>;
  clearModelBinding(capability: V2ModelCapability): Promise<void>;
}

export interface V2CapabilitySettingsRepository {
  getCapabilitySetting(capability: V2RuntimeCapability): Promise<V2CapabilitySettingDto | undefined>;
  setCapabilitySetting(input: { readonly capability: V2RuntimeCapability; readonly enabled: boolean }): Promise<V2CapabilitySettingDto>;
}

export interface V2PlatformSettingsRepository {
  getImageServiceSettings(): Promise<V2ImageServiceSettingsDto>;
  saveImageServiceSettings(input: V2SaveImageServiceSettingsRequest): Promise<V2ImageServiceSettingsDto>;
  getAppearanceSettings(): Promise<V2AppearanceSettingsDto>;
  saveAppearanceSettings(input: V2SaveAppearanceSettingsRequest): Promise<V2AppearanceSettingsDto>;
  getExternalConnectionCheck(service: V2ExternalServiceKind): Promise<V2ExternalConnectionCheckDto | undefined>;
  saveExternalConnectionCheck(check: V2ExternalConnectionCheckDto): Promise<V2ExternalConnectionCheckDto>;
}

export interface V2ModelCallLogRepository {
  startModelCall(input: {
    readonly log: V2ModelCallLogDto;
  }): Promise<V2ModelCallLogDto>;
  completeModelCall(input: {
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
  }): Promise<V2ModelCallLogDto>;
  failModelCall(input: {
    readonly id: string;
    readonly completedAt: string;
    readonly durationMs: number;
    readonly errorCode?: string;
    readonly errorStatus?: number;
    readonly errorRetryable?: boolean;
    readonly errorMessage?: string;
  }): Promise<V2ModelCallLogDto>;
  getModelCallLog(id: string): Promise<V2ModelCallLogDto | undefined>;
  queryModelCallLogs(query?: V2ModelCallLogQuery): Promise<V2ModelCallLogPage>;
  deleteModelCallLogsBefore(cutoff: string): Promise<number>;
  markInterruptedModelCalls(cutoff: string, completedAt: string): Promise<number>;
}

export interface V2PlatformRepository extends
  V2ModelProfileRepository,
  V2ModelBindingRepository,
  V2CapabilitySettingsRepository,
  V2PlatformSettingsRepository,
  V2ModelCallLogRepository {}

export type V2ModelProfilePublic = V2ModelProfileDto;
