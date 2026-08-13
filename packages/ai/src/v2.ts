import { AnthropicProvider } from "./anthropic.ts";
import { OpenAICompatibleProvider, ProviderError, type ChatProvider } from "./provider.ts";

export * from "./provider.ts";
export * from "./anthropic.ts";
export * from "./observability.ts";
export * from "./v2-scene-generation.ts";

export interface V2ChatProviderConfig {
  readonly protocol: "openai-compatible" | "anthropic";
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly model: string;
  readonly timeoutMs?: number;
}

export function createV2ChatProvider(config: V2ChatProviderConfig): ChatProvider {
  if (config.protocol === "anthropic") {
    if (config.apiKey === undefined) throw new ProviderError("CONFIGURATION", "Anthropic API key is required");
    return new AnthropicProvider({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
    });
  }
  return new OpenAICompatibleProvider({
    baseUrl: config.baseUrl,
    ...(config.apiKey === undefined ? {} : { apiKey: config.apiKey }),
    model: config.model,
    ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
  });
}
