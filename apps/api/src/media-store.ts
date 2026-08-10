import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

export interface StoredMedia {
  readonly mediaRef: string;
  readonly contentType: string;
  readonly byteLength: number;
  readonly sha256: string;
}

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function extension(contentType: string): string {
  return contentType === "image/jpeg" ? "jpg" : contentType.slice("image/".length);
}

export class ApiMediaStore {
  private readonly root: string;

  public constructor(root: string) {
    this.root = root;
  }

  public async put(bytes: Uint8Array, contentType: string): Promise<StoredMedia> {
    if (!allowedTypes.has(contentType)) throw new TypeError("Unsupported image content type");
    if (bytes.byteLength === 0) throw new TypeError("Image body must not be empty");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const relative = `${sha256}.${extension(contentType)}`;
    await mkdir(this.root, { recursive: true });
    try {
      await writeFile(join(this.root, relative), bytes, { flag: "wx" });
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
    }
    return { mediaRef: `media://local/${relative}`, contentType, byteLength: bytes.byteLength, sha256 };
  }

  public async get(mediaRef: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const prefix = "media://local/";
    if (!mediaRef.startsWith(prefix)) throw new TypeError("Unsupported media reference");
    const relative = mediaRef.slice(prefix.length);
    if (!/^[a-f0-9]{64}\.(?:jpg|png|webp|gif)$/.test(relative) || basename(relative) !== relative) {
      throw new TypeError("Invalid media reference");
    }
    const bytes = new Uint8Array(await readFile(join(this.root, relative)));
    const suffix = relative.slice(relative.lastIndexOf(".") + 1);
    return { bytes, contentType: suffix === "jpg" ? "image/jpeg" : `image/${suffix}` };
  }
}
