import { createV2PlatformClient, V2PlatformClientError } from "../adapters/platform.ts";

export function v2PlatformClient() {
  const env = (import.meta as ImportMeta & { readonly env?: Record<string, string | undefined> }).env ?? {};
  const baseUrl = env.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3003" : window.location.origin);
  return createV2PlatformClient({ baseUrl });
}

export function platformErrorMessage(error: unknown, fallback = "平台请求失败"): string {
  if (error instanceof V2PlatformClientError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : fallback;
}
