import type { FastifyPluginAsync } from "fastify";

export const v2CorePlugin: FastifyPluginAsync = async () => {
  // Gate 0 freezes the module hook. AI-1 owns core routes after bootstrap approval.
};
