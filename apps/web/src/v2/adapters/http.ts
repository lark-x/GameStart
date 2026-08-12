import type {
  V2CreateSceneGenerationJobRequest,
  V2CreateSceneGenerationJobResponse,
  V2ErrorEnvelope,
  V2HealthResponse,
} from "@living-network/contracts";

import { createV2MockAdapter } from "./mock.ts";
import { V2AdapterError, type V2WorkspaceAdapter, type V2WorkspaceSnapshot } from "./types.ts";

export interface V2HttpAdapterOptions {
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
}

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | V2ErrorEnvelope;
  if (!response.ok && payload && typeof payload === "object" && "error" in payload) {
    throw new V2AdapterError(payload.error);
  }
  if (!response.ok) {
    throw new V2AdapterError({
      code: "INTERNAL_ERROR",
      message: `Request failed with HTTP ${response.status}`,
    });
  }
  return payload as T;
}

export function createV2HttpAdapter(options: V2HttpAdapterOptions): V2WorkspaceAdapter {
  const fetcher = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  return {
    mode: "http",
    async getSnapshot(): Promise<V2WorkspaceSnapshot> {
      const health = await parseJson<V2HealthResponse>(
        await fetcher(`${baseUrl}/api/v2/health`, { headers: { Accept: "application/json" } }),
      );

      // Proposal until Slice A backend endpoints exist: keep shell data sourced from typed fixtures.
      return {
        ...(await createV2MockAdapter().getSnapshot()),
        health,
      };
    },
    async createSceneGenerationJob(
      request: V2CreateSceneGenerationJobRequest,
    ): Promise<V2CreateSceneGenerationJobResponse> {
      return parseJson<V2CreateSceneGenerationJobResponse>(
        await fetcher(`${baseUrl}/api/v2/generation/scene-jobs`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        }),
      );
    },
  };
}
