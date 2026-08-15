import type { V2PlatformRepository } from "@living-network/ports/v2";
import { ComfyUiError, ComfyUiHttpClient } from "../comfyui-client.ts";
import type {
  ComfyUiClient,
  ComfyUiProgressClient,
  ComfyUiProgressEvent,
  ComfyUiResult,
  ComfyUiSubmitRequest,
  ComfyUiSubmitResult,
} from "../comfyui-types.ts";

export interface V2AssetServiceFallback {
  readonly baseUrl?: string;
  readonly timeoutMs: number;
}

export interface V2DynamicComfyUiClientOptions {
  readonly repository: V2PlatformRepository;
  readonly fallback: V2AssetServiceFallback;
}

export class V2DynamicComfyUiClient implements ComfyUiClient {
  private readonly repository: V2PlatformRepository;
  private readonly fallback: V2AssetServiceFallback;

  public constructor(options: V2DynamicComfyUiClientOptions) {
    this.repository = options.repository;
    this.fallback = options.fallback;
  }

  public async submit(request: ComfyUiSubmitRequest): Promise<ComfyUiSubmitResult> {
    return (await this.client()).submit(request);
  }

  public async getResult(externalJobId: string): Promise<ComfyUiResult> {
    return (await this.client()).getResult(externalJobId);
  }

  public async *watchProgress(
    externalJobId: string,
    options?: { timeoutMs?: number },
  ): AsyncGenerator<ComfyUiProgressEvent> {
    const client = await this.client();
    if (!("watchProgress" in client) || typeof client.watchProgress !== "function") {
      throw new ComfyUiError("CONFIGURATION", "ComfyUI progress is not available");
    }
    yield* client.watchProgress(externalJobId, options);
  }

  private async client(): Promise<ComfyUiHttpClient & ComfyUiProgressClient> {
    const settings = await this.repository.getImageServiceSettings();
    const baseUrl = settings.baseUrl.trim().length > 0 ? settings.baseUrl : this.fallback.baseUrl;
    if (baseUrl === undefined || baseUrl.trim().length === 0) {
      throw new ComfyUiError("CONFIGURATION", "No ComfyUI image service is configured");
    }
    return new ComfyUiHttpClient({
      baseUrl,
      timeoutMs: settings.timeoutMs > 0 ? settings.timeoutMs : this.fallback.timeoutMs,
    });
  }
}
