import type { LlmProviderProfileRepository } from "@living-network/database";
import { type ChatCompletionRequest, type ChatCompletionResult, type ChatDelta, type ChatProvider, ProviderError } from "./provider.ts";
import { createProviderFromProfile } from "./profile-provider.ts";
import { SecretCipher } from "./secrets.ts";
import { emitObservation, type ChatObservationHook } from "./observability.ts";

export class ActiveProfileChatProvider implements ChatProvider {
  private readonly profiles: LlmProviderProfileRepository;
  private readonly cipher: SecretCipher | undefined;
  private readonly fallback: ChatProvider | undefined;
  private readonly observationHook: ChatObservationHook | undefined;
  public constructor(profiles: LlmProviderProfileRepository, cipher: SecretCipher | undefined, fallback: ChatProvider | undefined, observationHook?: ChatObservationHook) {
    this.profiles = profiles; this.cipher = cipher; this.fallback = fallback; this.observationHook = observationHook;
  }
  private async resolve(request: ChatCompletionRequest): Promise<ChatProvider> {
    const profile = await this.profiles.getActive();
    if (!profile) {
      await emitObservation(this.observationHook, { name: "resolution", ...(request.trace ? { trace: request.trace } : {}), requestMessages: request.messages, outcome: this.fallback ? "fallback" : "missing" });
      if (this.fallback) return this.fallback;
      throw new TypeError("No active LLM provider profile is configured");
    }
    const context = { profileId: profile.id, profileName: profile.name, protocol: profile.protocol, model: profile.model };
    try {
      let apiKey: string | undefined;
      if (profile.encryptedApiKey !== undefined || profile.encryptionIv !== undefined) {
        if (!profile.encryptedApiKey || !profile.encryptionIv || !this.cipher) throw new TypeError("Active LLM provider profile key cannot be decrypted");
        apiKey = this.cipher.decrypt({ ciphertext: profile.encryptedApiKey, iv: profile.encryptionIv });
      }
      const options = this.observationHook === undefined ? {} : { observationHook: this.observationHook };
      const provider = createProviderFromProfile(profile, apiKey, undefined, options);
      await emitObservation(this.observationHook, { name: "resolution", ...(request.trace ? { trace: request.trace } : {}), requestMessages: request.messages, ...context, outcome: "resolved" });
      return provider;
    } catch (error) {
      await emitObservation(this.observationHook, { name: "resolution", ...(request.trace ? { trace: request.trace } : {}), requestMessages: request.messages, ...context, outcome: "error", error: errorInfo(error) });
      throw error;
    }
  }
  public async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> { return (await this.resolve(request)).complete(request); }
  public async *stream(request: ChatCompletionRequest): AsyncGenerator<ChatDelta> { yield* (await this.resolve(request)).stream(request); }
}
function errorInfo(error: unknown): { code?: string; retryable?: boolean; message?: string } {
  if (error instanceof ProviderError) return { code: error.code, retryable: error.retryable, message: error.message };
  return { code: "CONFIGURATION", retryable: false, message: error instanceof Error ? error.message : "Provider resolution failed" };
}
