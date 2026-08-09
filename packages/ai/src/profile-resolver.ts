import type { LlmProviderProfileRepository } from "../../database/src/repositories.ts";
import { type ChatCompletionRequest, type ChatCompletionResult, type ChatDelta, type ChatProvider } from "./provider.ts";
import { createProviderFromProfile } from "./profile-provider.ts";
import { SecretCipher } from "./secrets.ts";

/** Resolves the active database profile at the start of every completion. */
export class ActiveProfileChatProvider implements ChatProvider {
  private readonly profiles: LlmProviderProfileRepository;
  private readonly cipher: SecretCipher | undefined;
  private readonly fallback: ChatProvider | undefined;

  public constructor(
    profiles: LlmProviderProfileRepository,
    cipher: SecretCipher | undefined,
    fallback: ChatProvider | undefined,
  ) {
    this.profiles = profiles;
    this.cipher = cipher;
    this.fallback = fallback;
  }

  private async resolve(): Promise<ChatProvider> {
    const profile = await this.profiles.getActive();
    if (!profile) {
      if (this.fallback) return this.fallback;
      throw new TypeError("No active LLM provider profile is configured");
    }
    let apiKey: string | undefined;
    if (profile.encryptedApiKey !== undefined || profile.encryptionIv !== undefined) {
      if (!profile.encryptedApiKey || !profile.encryptionIv || !this.cipher) {
        throw new TypeError("Active LLM provider profile key cannot be decrypted");
      }
      apiKey = this.cipher.decrypt({ ciphertext: profile.encryptedApiKey, iv: profile.encryptionIv });
    }
    return createProviderFromProfile(profile, apiKey);
  }

  public async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    return (await this.resolve()).complete(request);
  }

  public async *stream(request: ChatCompletionRequest): AsyncGenerator<ChatDelta> {
    yield* (await this.resolve()).stream(request);
  }
}
