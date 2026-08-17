import type { DatabaseSync } from "node:sqlite";

import { SecretCipher } from "@living-network/ai";
import {
  createV2ChatProvider,
  ProviderError,
  type ChatCompletionRequest,
  type ChatCompletionResult,
  type ChatDelta,
  type ChatProvider,
} from "@living-network/ai/v2";

import {
  applyV2Migrations,
  openV2SqliteConnection,
  V2SqliteAssetGenerationRepository,
  V2SqliteCanonUnitOfWork,
  V2SqliteCanonSnapshotReader,
  V2SqliteCandidateReviewUnitOfWork,
  V2SqliteChatUnitOfWork,
  V2SqliteGenerationJobRepository,
  V2SqliteGraphStateUnitOfWork,
  V2SqlitePlatformRepository,
  V2SqliteReleaseRuntimeUnitOfWork,
} from "@living-network/database/v2";
import type { V2CapabilitiesResponse, V2ModelCapability } from "@living-network/contracts/v2";

import { createV2AssetsPlugin } from "../assets/index.ts";
import { createV2ChatPlugin } from "../chat/index.ts";
import { createV2ChatUseCases } from "../chat/use-cases.ts";
import { createV2GenerationPlugin } from "../generation/index.ts";
import { createV2CoreUseCases } from "../core/use-cases.ts";
import { createV2FastifyApp } from "./app.ts";
import { createV2PlatformPlugin, getV2PlatformCapabilities } from "./plugin.ts";

export interface V2ApiRuntime {
  readonly app: ReturnType<typeof createV2FastifyApp>;
  readonly db: DatabaseSync;
  close(): Promise<void>;
}

export interface V2ApiRuntimeChatEnvironment {
  readonly protocol: "openai-compatible" | "anthropic";
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
}

class V2ResolvingChatProvider implements ChatProvider {
  private readonly repository: V2SqlitePlatformRepository;
  private readonly secretCipher: SecretCipher | undefined;
  private readonly environment: V2ApiRuntimeChatEnvironment | undefined;

  public constructor(options: {
    readonly repository: V2SqlitePlatformRepository;
    readonly secretCipher?: SecretCipher;
    readonly environment?: V2ApiRuntimeChatEnvironment;
  }) {
    this.repository = options.repository;
    this.secretCipher = options.secretCipher;
    this.environment = options.environment;
  }

  private async resolve(): Promise<ChatProvider> {
    const binding = await this.repository.getModelBinding("chat" as V2ModelCapability)
      ?? await this.repository.getModelBinding("scene_generation");
    if (binding?.profileId !== undefined) {
      const profile = await this.repository.getModelProfile(binding.profileId);
      if (profile !== undefined) {
        let apiKey: string | undefined;
        if (profile.encryptedApiKey !== undefined && profile.encryptionIv !== undefined) {
          if (this.secretCipher === undefined) {
            throw new ProviderError("CONFIGURATION", "V2 chat model API key cannot be decrypted");
          }
          apiKey = this.secretCipher.decrypt({ ciphertext: profile.encryptedApiKey, iv: profile.encryptionIv });
        }
        return createV2ChatProvider({
          protocol: profile.protocol,
          baseUrl: profile.baseUrl,
          ...(apiKey === undefined ? {} : { apiKey }),
          model: profile.model,
          timeoutMs: profile.timeoutMs,
        });
      }
    }
    if (this.environment?.baseUrl !== undefined && this.environment.model !== undefined) {
      return createV2ChatProvider({
        protocol: this.environment.protocol,
        baseUrl: this.environment.baseUrl,
        ...(this.environment.apiKey === undefined ? {} : { apiKey: this.environment.apiKey }),
        model: this.environment.model,
        ...(this.environment.timeoutMs === undefined ? {} : { timeoutMs: this.environment.timeoutMs }),
      });
    }
    throw new ProviderError("CONFIGURATION", "V2 chat model is not configured");
  }

  public async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    return (await this.resolve()).complete(request);
  }

  public async *stream(request: ChatCompletionRequest): AsyncIterable<ChatDelta> {
    const provider = await this.resolve();
    yield* provider.stream(request);
  }
}

export function createV2ApiRuntime(options: {
  readonly sqlitePath: string;
  readonly mediaRoot?: string;
  readonly capabilities?: V2CapabilitiesResponse;
  readonly integrationSecretKey?: string;
  readonly environmentSceneConfigured?: boolean;
  readonly environmentAssetConfigured?: boolean;
  readonly chatProvider?: ChatProvider;
  readonly chatEnvironment?: V2ApiRuntimeChatEnvironment;
}): V2ApiRuntime {
  const db = openV2SqliteConnection({ path: options.sqlitePath });
  applyV2Migrations(db);
  const platformRepository = new V2SqlitePlatformRepository(db);
  const secretCipher = options.integrationSecretKey === undefined ? undefined : new SecretCipher(options.integrationSecretKey);
  const platformDependencies = {
    repository: platformRepository,
    ...(secretCipher === undefined ? {} : { secretCipher }),
    sceneGenerationEnabled: options.capabilities?.sceneGeneration.enabled ?? false,
    assetGenerationEnabled: options.capabilities?.assetGeneration.enabled ?? false,
    environmentSceneConfigured: options.environmentSceneConfigured ?? false,
    environmentAssetConfigured: options.environmentAssetConfigured ?? false,
  };
  const jobs = new V2SqliteGenerationJobRepository(db);
  const assets = new V2SqliteAssetGenerationRepository(db);
  const coreUseCases = createV2CoreUseCases(
    new V2SqliteCanonUnitOfWork(db),
    new V2SqliteGraphStateUnitOfWork(db),
    new V2SqliteCandidateReviewUnitOfWork(db),
    new V2SqliteReleaseRuntimeUnitOfWork(db),
  );
  const chatUseCases = createV2ChatUseCases(new V2SqliteChatUnitOfWork(db));
  const chatProvider = options.chatProvider ?? new V2ResolvingChatProvider({
    repository: platformRepository,
    ...(secretCipher === undefined ? {} : { secretCipher }),
    ...(options.chatEnvironment === undefined ? {} : { environment: options.chatEnvironment }),
  });
  const app = createV2FastifyApp({
    coreOptions: { useCases: coreUseCases },
    chatPlugin: createV2ChatPlugin({
      useCases: chatUseCases,
      provider: chatProvider,
      ...(options.mediaRoot === undefined ? {} : { mediaRoot: options.mediaRoot }),
    }),
    ...(options.mediaRoot === undefined ? {} : { mediaRoot: options.mediaRoot }),
    ...(options.mediaRoot === undefined ? {} : { assetsPlugin: createV2AssetsPlugin({ repository: assets, mediaRoot: options.mediaRoot }) }),
    ...(options.mediaRoot === undefined ? {} : { mediaRoot: options.mediaRoot }),
    ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
    capabilitiesProvider: () => getV2PlatformCapabilities(platformDependencies),
    platformPlugin: createV2PlatformPlugin(platformDependencies),
    ready: () => {
      db.prepare("SELECT 1").get();
      return true;
    },
    generationPlugin: createV2GenerationPlugin({
      canonSnapshots: new V2SqliteCanonSnapshotReader(db),
      jobs,
      assetJobs: assets,
      assetCandidates: assets,
      assetReviews: assets,
      capabilities: {
        sceneGenerationEnabled: options.capabilities?.sceneGeneration.enabled ?? false,
        assetGenerationEnabled: options.capabilities?.assetGeneration.enabled ?? false,
      },
      capabilitiesProvider: () => getV2PlatformCapabilities(platformDependencies),
    }),
  });
  return {
    app,
    db,
    async close() {
      await app.close();
      db.close();
    },
  };
}
