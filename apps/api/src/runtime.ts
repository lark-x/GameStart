import type { Server } from "node:http";

import {
  loadAppConfig,
  type AppConfig,
  type EnvironmentInput,
} from "../../../packages/config/src/index.ts";
import type { DomainRepositories } from "../../../packages/database/src/index.ts";
import { createProviderFromConfig, type ChatProvider } from "../../../packages/ai/src/index.ts";
import type { SecretCipher } from "../../../packages/ai/src/index.ts";
import { ApiApplication } from "./app.ts";
import { createApiServer } from "./server.ts";
import type { ConversationOrchestratorOptions } from "./conversation-orchestrator.ts";
import type { InteractionLogRepository } from "../../../packages/database/src/interaction-log.ts";
import type { InteractionLogging } from "./interaction-logging.ts";

export interface ApiListenOptions {
  host: string;
  port: number;
}

export interface ApiRuntime {
  readonly config: AppConfig;
  readonly application: ApiApplication;
  readonly server: Server;
}

export function getApiListenOptions(config: AppConfig): ApiListenOptions {
  return { host: config.api.host, port: config.api.port };
}

export function createApiRuntime(
  config: AppConfig,
  repositories: DomainRepositories,
  provider?: ChatProvider,
  conversationOptions?: ConversationOrchestratorOptions,
  securityOptions?: { requireTrustedActor?: boolean },
  operationalOptions?: { readiness?: () => Promise<void>; secretCipher?: SecretCipher; creatorDispatchEnabled?: boolean; creatorClock?: () => Date; interactionLogs?: InteractionLogRepository; interactionLogging?: InteractionLogging; loggingCleanupEnabled?: boolean; loggingCleanupIntervalMs?: number; mediaRoot?: string },
): ApiRuntime {
  const application = new ApiApplication(
    repositories,
    provider,
    conversationOptions,
    securityOptions ?? { requireTrustedActor: config.environment === "production" },
    operationalOptions,
  );
  return {
    config,
    application,
    server: createApiServer(application, { corsOrigins: config.api.corsOrigins }),
  };
}

export function createApiRuntimeFromEnvironment(
  env: EnvironmentInput,
  repositories: DomainRepositories,
  provider?: ChatProvider,
  conversationOptions?: ConversationOrchestratorOptions,
  securityOptions?: { requireTrustedActor?: boolean },
  operationalOptions?: { readiness?: () => Promise<void>; secretCipher?: SecretCipher; creatorDispatchEnabled?: boolean; creatorClock?: () => Date; interactionLogs?: InteractionLogRepository; interactionLogging?: InteractionLogging; loggingCleanupEnabled?: boolean; loggingCleanupIntervalMs?: number; mediaRoot?: string },
): ApiRuntime {
  const config = loadAppConfig(env);
  const resolvedProvider = provider ?? createProviderFromConfig({ ...config.llm });
  return createApiRuntime(config, repositories, resolvedProvider, conversationOptions, securityOptions, operationalOptions);
}

export function listenApiRuntime(runtime: ApiRuntime): Promise<Server> {
  const options = getApiListenOptions(runtime.config);
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      runtime.server.off("error", onError);
      runtime.server.off("listening", onListening);
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onListening = (): void => {
      cleanup();
      resolve(runtime.server);
    };
    runtime.server.once("error", onError);
    runtime.server.once("listening", onListening);
    runtime.server.listen(options.port, options.host);
  });
}

export function closeApiRuntime(runtime: ApiRuntime): Promise<void> {
  runtime.application.stop();
  if (!runtime.server.listening) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    runtime.server.close((error) => (error ? reject(error) : resolve()));
  });
}
