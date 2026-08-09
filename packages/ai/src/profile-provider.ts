import { LlmProviderProtocol, type LlmProviderProfile } from "../../domain/src/index.ts";
import { AnthropicProvider } from "./anthropic.ts";
import { OpenAICompatibleProvider, type ChatProvider, type FetchImplementation } from "./provider.ts";

/** Builds a provider from a persisted profile after its secret has been decrypted. */
export function createProviderFromProfile(
  profile: LlmProviderProfile,
  apiKey: string | undefined,
  fetchImpl?: FetchImplementation,
  options: { observationHook?: import("./observability.ts").ChatObservationHook } = {},
): ChatProvider {
  if (profile.protocol === LlmProviderProtocol.OPENAI_COMPATIBLE) {
    return new OpenAICompatibleProvider({
      baseUrl: profile.baseUrl,
      ...(apiKey === undefined ? {} : { apiKey }),
      model: profile.model,
      timeoutMs: profile.timeoutMs,
      ...(options.observationHook === undefined ? {} : { observationHook: options.observationHook }),
      profileContext: { profileId: profile.id, profileName: profile.name, protocol: profile.protocol },
    }, fetchImpl);
  }
  if (apiKey === undefined || apiKey.trim().length === 0) {
    throw new TypeError("Anthropic provider profile requires an API key");
  }
  return new AnthropicProvider({
    baseUrl: profile.baseUrl,
    apiKey,
    model: profile.model,
    timeoutMs: profile.timeoutMs,
      ...(options.observationHook === undefined ? {} : { observationHook: options.observationHook }),
      profileContext: { profileId: profile.id, profileName: profile.name, protocol: profile.protocol },
  }, fetchImpl);
}
