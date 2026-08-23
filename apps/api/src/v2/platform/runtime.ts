import type { DatabaseSync } from "node:sqlite";

import { SecretCipher } from "@living-network/ai";
import {
  createV2ChatProvider,
  ProviderError,
  type ChatProvider,
} from "@living-network/ai/v2";

import {
  applyV2Migrations,
  openV2SqliteConnection,
  V2SqliteAssetGenerationRepository,
  V2SqliteCanonRepository,
  V2SqliteCanonUnitOfWork,
  V2SqliteCanonSnapshotReader,
  V2SqliteCandidateReviewUnitOfWork,
  V2SqliteChatMaintenanceJobRepository,
  V2SqliteChatUnitOfWork,
  V2SqliteGenerationJobRepository,
  V2SqliteMemoryRepository,
  V2SqliteFactRepository,
  V2SqliteGraphStateUnitOfWork,
  V2SqlitePlatformRepository,
  V2SqliteReleaseRuntimeUnitOfWork,
  V2CompanionRepository,
} from "@living-network/database/v2";
import type { V2CapabilitiesResponse } from "@living-network/contracts/v2";

import { createV2AssetsPlugin } from "../assets/index.ts";
import { createV2ChatPlugin, createV2JobsPlugin, type V2ResolvedChatModel } from "../chat/index.ts";
import { createV2ChatUseCases } from "../chat/use-cases.ts";
import { createV2CompanionPlugin } from "../companion/plugin.ts";
import { V2CompanionUseCases } from "../companion/use-cases.ts";
import { createV2ApiMemoryRuntime } from "../memory-runtime/index.ts";
import { createV2MemoryPlugin } from "../memory-runtime/plugin.ts";
import { createV2GenerationPlugin } from "../generation/index.ts";
import { createV2CoreUseCases } from "../core/use-cases.ts";
import { v2NarrativePlugin } from "../narrative/index.ts";
import { SqliteNarrativeUnitOfWork } from "@living-network/database/v2";
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

class V2ResolvingChatModelResolver {
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

  public async resolve(): Promise<V2ResolvedChatModel> {
    const binding = await this.repository.getModelBinding("chat")
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
        return {
          provider: createV2ChatProvider({
            protocol: profile.protocol,
            baseUrl: profile.baseUrl,
            ...(apiKey === undefined ? {} : { apiKey }),
            model: profile.model,
            timeoutMs: profile.timeoutMs,
          }),
          model: profile.model,
          profileId: profile.id,
          profileName: profile.name,
          temperature: profile.temperature,
          maxTokens: profile.maxTokens,
          ...(profile.contextWindow === undefined ? {} : { contextWindow: profile.contextWindow }),
          inputModalities: (profile.inputModalities as readonly ("text" | "image")[]) ?? ["text"],
        };
      }
    }
    if (this.environment?.baseUrl !== undefined && this.environment.model !== undefined) {
      return {
        provider: createV2ChatProvider({
          protocol: this.environment.protocol,
          baseUrl: this.environment.baseUrl,
          ...(this.environment.apiKey === undefined ? {} : { apiKey: this.environment.apiKey }),
          model: this.environment.model,
          ...(this.environment.timeoutMs === undefined ? {} : { timeoutMs: this.environment.timeoutMs }),
        }),
        model: this.environment.model,
        temperature: 0.8,
        maxTokens: 1024,
        contextWindow: 128000,
        inputModalities: ["text"],
      };
    }
    throw new ProviderError("CONFIGURATION", "V2 chat model is not configured");
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
  readonly chatInputModalities?: readonly ("text" | "image")[];
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
  const memoryRuntime = createV2ApiMemoryRuntime(db);
  const maintenanceJobRepository = new V2SqliteChatMaintenanceJobRepository(db);
  const memoryPlugin = createV2MemoryPlugin({
    memoryRepository: new V2SqliteMemoryRepository(db),
    maintenanceJobRepository,
    memoryRuntime,
    factRepository: new V2SqliteFactRepository(db),
  });
  const jobsPlugin = createV2JobsPlugin({ maintenanceJobRepository });
  const chatUseCases = createV2ChatUseCases(new V2SqliteChatUnitOfWork(db), {
    memoryRuntime,
  });
  const resolver = options.chatProvider === undefined
    ? new V2ResolvingChatModelResolver({
        repository: platformRepository,
        ...(secretCipher === undefined ? {} : { secretCipher }),
        ...(options.chatEnvironment === undefined ? {} : { environment: options.chatEnvironment }),
      })
    : undefined;
  const resolveModel: () => Promise<V2ResolvedChatModel> = resolver === undefined
    ? async () => ({
        provider: options.chatProvider!,
        model: "test-model",
        temperature: 0.8,
        maxTokens: 1024,
        contextWindow: 128000,
        inputModalities: options.chatInputModalities ?? ["text"],
      })
    : () => resolver.resolve();
  const companionRepo = new V2CompanionRepository(db);
  const companionUseCases = new V2CompanionUseCases({
    companionRepo,
    canonRepo: new V2SqliteCanonRepository(db),
  });
  const app = createV2FastifyApp({
    coreOptions: { useCases: coreUseCases },
    companionPlugin: createV2CompanionPlugin({ useCases: companionUseCases }),
    narrativePlugin: v2NarrativePlugin,
    narrativeOptions: { narrativeUnitOfWork: new SqliteNarrativeUnitOfWork(db) },
    chatPlugin: createV2ChatPlugin({
      useCases: chatUseCases,
      resolveModel,
      ...(options.mediaRoot === undefined ? {} : { mediaRoot: options.mediaRoot }),
    }),
    ...(options.mediaRoot === undefined ? {} : { mediaRoot: options.mediaRoot }),
    ...(options.mediaRoot === undefined ? {} : { assetsPlugin: createV2AssetsPlugin({ repository: assets, mediaRoot: options.mediaRoot }) }),
    ...(options.mediaRoot === undefined ? {} : { mediaRoot: options.mediaRoot }),
    ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
    capabilitiesProvider: () => getV2PlatformCapabilities(platformDependencies),
    memoryPlugin,
    jobsPlugin,
    platformPlugin: createV2PlatformPlugin(platformDependencies),
    ready: () => {
      db.prepare("SELECT 1").get();
      return true;
    },
    generationPlugin: createV2GenerationPlugin({
      canonSnapshots: new V2SqliteCanonSnapshotReader(db),
      characterVisuals: new V2SqliteCanonRepository(db),
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
