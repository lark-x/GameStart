import { createHash } from "node:crypto";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { V2JobId } from "@living-network/contracts";
import type {
  V2AssetMediaStorePort,
  V2StoreGeneratedAssetMediaInput,
  V2StoredAssetMediaResult,
} from "@living-network/ports";

export type V2AssetMediaFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type V2AssetMediaStoreErrorCode =
  | "CONFIGURATION"
  | "INVALID_SOURCE"
  | "HTTP_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "OVERSIZED_MEDIA"
  | "WRITE_FAILED";

export class V2AssetMediaStoreError extends Error {
  public readonly code: V2AssetMediaStoreErrorCode;
  public readonly retryable: boolean;
  public readonly status?: number;

  public constructor(
    code: V2AssetMediaStoreErrorCode,
    message: string,
    options: { readonly retryable?: boolean; readonly status?: number } = {},
  ) {
    super(message);
    this.name = "V2AssetMediaStoreError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    if (options.status !== undefined) this.status = options.status;
  }
}

export interface V2LocalAssetMediaStoreOptions {
  readonly mediaRoot: string;
  readonly fetchImpl?: V2AssetMediaFetch;
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
}

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

function parseSourceUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new V2AssetMediaStoreError("INVALID_SOURCE", "asset source media ref must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new V2AssetMediaStoreError("INVALID_SOURCE", "asset source media ref must use http or https");
  }
  return parsed;
}

function contentType(response: Response): string | undefined {
  const value = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  return value === undefined || value.length === 0 ? undefined : value;
}

function extensionFor(type: string | undefined, sourceUrl: URL): string {
  if (type === "image/png") return ".png";
  if (type === "image/jpeg") return ".jpg";
  if (type === "image/webp") return ".webp";
  if (type === "image/gif") return ".gif";
  const ext = path.extname(sourceUrl.pathname).toLowerCase();
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp" || ext === ".gif") {
    return ext === ".jpeg" ? ".jpg" : ext;
  }
  throw new V2AssetMediaStoreError("INVALID_RESPONSE", "asset media response must be an image");
}

function assertInsideRoot(root: string, target: string): void {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new V2AssetMediaStoreError("CONFIGURATION", "asset media path escapes media root");
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function positiveInteger(value: number | undefined, fallback: number, field: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new V2AssetMediaStoreError("CONFIGURATION", `${field} must be a positive integer`);
  }
  return resolved;
}

function tempFileName(jobId: V2JobId, hash: string): string {
  const safeJobId = String(jobId).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "asset-job";
  return `.${safeJobId}.${hash}.${process.pid}.${Date.now()}.tmp`;
}

export class V2LocalAssetMediaStore implements V2AssetMediaStorePort {
  private readonly mediaRoot: string;
  private readonly fetchImpl: V2AssetMediaFetch;
  private readonly maxBytes: number;
  private readonly timeoutMs: number;

  public constructor(options: V2LocalAssetMediaStoreOptions) {
    const root = options.mediaRoot.trim();
    if (root.length === 0) throw new V2AssetMediaStoreError("CONFIGURATION", "mediaRoot is required");
    this.mediaRoot = path.resolve(root);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (this.fetchImpl === undefined) throw new V2AssetMediaStoreError("CONFIGURATION", "fetch is not available");
    this.maxBytes = positiveInteger(options.maxBytes, DEFAULT_MAX_BYTES, "maxBytes");
    this.timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, "timeoutMs");
  }

  public async storeGeneratedAsset(input: V2StoreGeneratedAssetMediaInput): Promise<V2StoredAssetMediaResult> {
    const sourceUrl = parseSourceUrl(input.sourceMediaRef);
    const response = await this.fetchWithTimeout(sourceUrl);
    const type = contentType(response);
    if (type !== undefined && !type.startsWith("image/")) {
      throw new V2AssetMediaStoreError("INVALID_RESPONSE", "asset media response must be an image");
    }
    const length = response.headers.get("content-length");
    if (length !== null && Number(length) > this.maxBytes) {
      throw new V2AssetMediaStoreError("OVERSIZED_MEDIA", "asset media response exceeds maxBytes");
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > this.maxBytes) {
      throw new V2AssetMediaStoreError("OVERSIZED_MEDIA", "asset media response exceeds maxBytes");
    }
    const hash = createHash("sha256").update(buffer).digest("hex");
    const contentHash = `sha256:${hash}`;
    const extension = extensionFor(type, sourceUrl);
    const relativePath = path.join("v2", "assets", `${hash}${extension}`);
    const finalPath = path.resolve(this.mediaRoot, relativePath);
    assertInsideRoot(this.mediaRoot, finalPath);
    await mkdir(path.dirname(finalPath), { recursive: true });
    if (!(await exists(finalPath))) {
      const tempPath = path.join(path.dirname(finalPath), tempFileName(input.jobId, hash));
      try {
        await writeFile(tempPath, buffer, { flag: "wx" });
        await rename(tempPath, finalPath);
      } catch (error) {
        await unlink(tempPath).catch(() => undefined);
        if (!(await exists(finalPath))) {
          throw new V2AssetMediaStoreError(
            "WRITE_FAILED",
            error instanceof Error ? error.message : "asset media write failed",
            { retryable: true },
          );
        }
      }
    }
    return {
      mediaRef: `media://local/${relativePath.split(path.sep).join("/")}`,
      contentHash,
      byteLength: buffer.byteLength,
      ...(type === undefined ? {} : { contentType: type }),
    };
  }

  private async fetchWithTimeout(sourceUrl: URL): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(sourceUrl, {
        method: "GET",
        headers: { accept: "image/*" },
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new V2AssetMediaStoreError("TIMEOUT", "asset media fetch timed out", { retryable: true });
      }
      throw new V2AssetMediaStoreError("NETWORK_ERROR", "asset media fetch failed", { retryable: true });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new V2AssetMediaStoreError("HTTP_ERROR", "asset media fetch returned an error", {
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
        status: response.status,
      });
    }
    return response;
  }
}
