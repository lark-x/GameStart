import type { FastifyPluginAsync } from "fastify";

export const v2GenerationPlugin: FastifyPluginAsync = async () => {
  // Gate 0 freezes the module hook. AI-2 owns generation routes after bootstrap approval.
};
