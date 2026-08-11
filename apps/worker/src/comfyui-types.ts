import type { JsonObject } from "../../../packages/domain/src/index.ts";

export interface ComfyUiSubmitRequest {
  jobId: string;
  workflowVersion: string;
  prompt: string;
  workflow?: JsonObject;
  negativePrompt?: string;
  seed?: number;
}

export interface ComfyUiSubmitResult {
  externalJobId: string;
}

export interface ComfyUiResult {
  externalJobId: string;
  mediaRef: string;
}

export type ComfyUiProgressKind = "progress" | "executing" | "completed" | "error";

export interface ComfyUiProgressEvent {
  externalJobId: string;
  kind: ComfyUiProgressKind;
  nodeId?: string;
  value?: number;
  max?: number;
  message?: string;
}

export interface ComfyUiWebSocket {
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: (() => void) | null;
  close(): void;
}

export type ComfyUiWebSocketFactory = (url: string) => ComfyUiWebSocket;

export interface ComfyUiClient {
  submit(request: ComfyUiSubmitRequest): Promise<ComfyUiSubmitResult>;
  getResult(externalJobId: string): Promise<ComfyUiResult>;
}

export interface ComfyUiProgressClient extends ComfyUiClient {
  watchProgress(
    externalJobId: string,
    options?: { timeoutMs?: number },
  ): AsyncGenerator<ComfyUiProgressEvent>;
}
