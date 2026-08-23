import Fastify, { type FastifyInstance, type FastifyPluginAsync } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import type { V2CapabilitiesResponse, V2ReadyResponse } from "@living-network/contracts/v2";

import { v2CorePlugin } from "../core/index.ts";
import { v2GenerationPlugin } from "../generation/index.ts";

export interface CreateV2FastifyAppOptions {
  readonly assetsPlugin?: FastifyPluginAsync;
  readonly assetsOptions?: Record<string, unknown>;
  readonly corePlugin?: FastifyPluginAsync;
  readonly coreOptions?: Record<string, unknown>;
  readonly generationPlugin?: FastifyPluginAsync;
  readonly generationOptions?: Record<string, unknown>;
  readonly ready?: () => boolean | Promise<boolean>;
  readonly capabilities?: V2CapabilitiesResponse;
  readonly capabilitiesProvider?: () => V2CapabilitiesResponse | Promise<V2CapabilitiesResponse>;
  readonly platformPlugin?: FastifyPluginAsync;
  readonly platformOptions?: Record<string, unknown>;
  readonly memoryPlugin?: FastifyPluginAsync;
  readonly memoryOptions?: Record<string, unknown>;
  readonly jobsPlugin?: FastifyPluginAsync;
  readonly jobsOptions?: Record<string, unknown>;
  readonly chatPlugin?: FastifyPluginAsync;
  readonly chatOptions?: Record<string, unknown>;
  readonly companionPlugin?: FastifyPluginAsync;
  readonly companionOptions?: Record<string, unknown>;
  readonly narrativePlugin?: FastifyPluginAsync<any>;
  readonly narrativeOptions?: Record<string, unknown>;
  readonly mediaRoot?: string;
}

function mediaContentType(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/gif";
}

function safeAssetFilename(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-f0-9]{64}\.(?:png|jpg|jpeg|webp|gif)$/.test(value)
    ? value
    : undefined;
}

export function createV2FastifyApp(options: CreateV2FastifyAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  void app.register(async (v2) => {
    v2.get("/health", async () => ({ ok: true, version: "v2" as const }));
    v2.get("/ready", async (_request, reply) => {
      const ready = await (options.ready?.() ?? true);
      if (!ready) {
        return reply.code(503).send({
          ok: false,
          version: "v2",
          storage: "sqlite",
          error: { code: "NOT_READY", message: "V2 storage is not ready" },
        });
      }
      return { ok: true, version: "v2", storage: "sqlite" } satisfies V2ReadyResponse;
    });
    v2.get("/capabilities", async () => options.capabilitiesProvider?.() ?? options.capabilities ?? {
      sceneGeneration: { enabled: false },
      assetGeneration: { enabled: false },
    });
    v2.get("/media/assets/:filename", async (request, reply) => {
      const filename = safeAssetFilename((request.params as { filename?: unknown }).filename);
      if (filename === undefined) {
        return reply.code(422).send({
          error: { code: "INVALID_MEDIA_REF", message: "Invalid V2 asset filename" },
        });
      }
      if (options.mediaRoot === undefined) {
        return reply.code(404).send({ error: { code: "NOT_FOUND", message: "V2 asset media is not configured" } });
      }
      const root = path.resolve(options.mediaRoot, "v2", "assets");
      const target = path.resolve(root, filename);
      try {
        const file = await stat(target);
        if (!file.isFile()) throw new Error("not a file");
      } catch {
        return reply.code(404).send({ error: { code: "NOT_FOUND", message: "V2 asset not found" } });
      }
      return reply
        .header("Content-Type", mediaContentType(filename))
        .header("Cache-Control", "public, max-age=31536000, immutable")
        .send(createReadStream(target));
    });
    if (options.assetsPlugin !== undefined) {
      await v2.register(options.assetsPlugin, { prefix: "/assets", ...(options.assetsOptions ?? {}) });
    }
    await v2.register(options.corePlugin ?? v2CorePlugin, { prefix: "/core", ...(options.coreOptions ?? {}) });
    await v2.register(options.generationPlugin ?? v2GenerationPlugin, {
      prefix: "/generation",
      ...(options.generationOptions ?? {}),
    });
    if (options.memoryPlugin !== undefined) {
      await v2.register(options.memoryPlugin, { prefix: "/memory", ...(options.memoryOptions ?? {}) });
    }
    if (options.jobsPlugin !== undefined) {
      await v2.register(options.jobsPlugin, { prefix: "/jobs", ...(options.jobsOptions ?? {}) });
    }
    if (options.platformPlugin !== undefined) {
      await v2.register(options.platformPlugin, { prefix: "/platform", ...(options.platformOptions ?? {}) });
    }
    if (options.chatPlugin !== undefined) {
      await v2.register(options.chatPlugin, options.chatOptions ?? {});
    }
    if (options.companionPlugin !== undefined) {
      await v2.register(options.companionPlugin, options.companionOptions ?? {});
    }
    if (options.narrativePlugin !== undefined) {
      await v2.register(options.narrativePlugin, options.narrativeOptions ?? {});
    }
  }, { prefix: "/api/v2" });
  return app;
}
