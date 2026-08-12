import Fastify, { type FastifyInstance, type FastifyPluginAsync } from "fastify";

import { v2CorePlugin } from "../core/index.ts";
import { v2GenerationPlugin } from "../generation/index.ts";

export interface CreateV2FastifyAppOptions {
  readonly corePlugin?: FastifyPluginAsync;
  readonly generationPlugin?: FastifyPluginAsync;
}

export function createV2FastifyApp(options: CreateV2FastifyAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  void app.register(async (v2) => {
    v2.get("/health", async () => ({ ok: true, version: "v2" as const }));
    await v2.register(options.corePlugin ?? v2CorePlugin, { prefix: "/core" });
    await v2.register(options.generationPlugin ?? v2GenerationPlugin, { prefix: "/generation" });
  }, { prefix: "/api/v2" });
  return app;
}
