import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

export interface StoredMedia {
  readonly mediaRef: string;
  readonly contentType: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface MediaStore {
  put(bytes: Uint8Array, contentType: string, suggestedName?: string): Promise<StoredMedia>;
  get(mediaRef: string): Promise<{ readonly bytes: Uint8Array; readonly contentType: string }>;
}

function safeExtension(contentType: string, suggestedName: string | undefined): string {
  const extension = suggestedName === undefined ? "" : basename(suggestedName).split(".").pop() ?? "";
  if (/^[a-z0-9]{1,8}$/i.test(extension)) return extension.toLowerCase();
  const known: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return known[contentType] ?? "bin";
}

export class LocalMediaStore implements MediaStore {
  private readonly root: string;

  public constructor(root: string) {
    this.root = root;
  }

  public async put(
    bytes: Uint8Array,
    contentType: string,
    suggestedName?: string,
  ): Promise<StoredMedia> {
    if (bytes.byteLength === 0) throw new TypeError("media bytes must not be empty");
    if (!/^[-\w.+]+\/[-\w.+]+$/.test(contentType)) throw new TypeError("media contentType is invalid");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const extension = safeExtension(contentType, suggestedName);
    const relative = `${sha256}.${extension}`;
    const path = join(this.root, relative);
    await mkdir(this.root, { recursive: true });
    try {
      await writeFile(path, bytes, { flag: "wx" });
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
    }
    return {
      mediaRef: `media://local/${relative}`,
      contentType,
      byteLength: bytes.byteLength,
      sha256,
    };
  }

  public async get(mediaRef: string): Promise<{ readonly bytes: Uint8Array; readonly contentType: string }> {
    const prefix = "media://local/";
    if (!mediaRef.startsWith(prefix)) throw new TypeError("unsupported local media reference");
    const relative = mediaRef.slice(prefix.length);
    if (!/^[a-f0-9]{64}\.[a-z0-9]{1,8}$/.test(relative)) throw new TypeError("invalid local media reference");
    const bytes = await readFile(join(this.root, relative));
    const extension = relative.split(".").pop();
    const contentType = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
    return { bytes, contentType };
  }
}

export interface MediaFetch {
  (input: string, init?: RequestInit): Promise<Response>;
}

/** Downloads a ComfyUI result once and replaces the external URL with local storage. */
export class StoringComfyUiClient {
  private readonly inner: {
    submit: (...args: any[]) => Promise<any>;
    getResult: (...args: any[]) => Promise<{ externalJobId: string; mediaRef: string }>;
  };
  private readonly store: MediaStore;
  private readonly fetchImpl: MediaFetch;

  public constructor(
    inner: {
      submit: (...args: any[]) => Promise<any>;
      getResult: (...args: any[]) => Promise<{ externalJobId: string; mediaRef: string }>;
    },
    store: MediaStore,
    fetchImpl: MediaFetch = globalThis.fetch,
  ) {
    this.inner = inner;
    this.store = store;
    this.fetchImpl = fetchImpl;
  }

  public submit(...args: any[]): Promise<any> {
    return this.inner.submit(...args);
  }

  public async getResult(externalJobId: string): Promise<{ externalJobId: string; mediaRef: string }> {
    const result = await this.inner.getResult(externalJobId);
    const response = await this.fetchImpl(result.mediaRef, { headers: { accept: "image/*" } });
    if (!response.ok) throw new Error(`media download failed with HTTP ${response.status}`);
    const contentType = response.headers.get("content-type")?.split(";", 1)[0] ?? "";
    if (!contentType.startsWith("image/")) throw new Error("ComfyUI result is not an image");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const stored = await this.store.put(bytes, contentType, result.mediaRef);
    return { externalJobId: result.externalJobId, mediaRef: stored.mediaRef };
  }
}
