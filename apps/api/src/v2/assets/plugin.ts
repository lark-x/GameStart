import { createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { FastifyPluginAsync } from "fastify";
import type {
  V2AssetId,
  V2CreateManualAssetApiResponse,
  V2IsoDateTime,
  V2StoryWorldId,
} from "@living-network/contracts/v2";
import type { V2AssetReviewRepository } from "@living-network/ports/v2";

const MAX_BYTES = 25 * 1024 * 1024;
const allowedTypes = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
] as const);

interface MultipartFile {
  readonly filename: string;
  readonly contentType: string;
  readonly data: Buffer;
}

function boundaryFrom(contentType: string | undefined): string {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? "");
  const boundary = (match?.[1] ?? match?.[2])?.trim();
  if (!boundary) throw new TypeError("multipart boundary is required");
  return boundary;
}

function parseMultipart(body: Buffer, contentType: string | undefined): { readonly fields: Readonly<Record<string, string>>; readonly file: MultipartFile } {
  const delimiter = Buffer.from(`--${boundaryFrom(contentType)}`);
  const fields: Record<string, string> = {};
  let file: MultipartFile | undefined;
  let cursor = body.indexOf(delimiter);
  while (cursor >= 0) {
    cursor += delimiter.length;
    if (body.subarray(cursor, cursor + 2).equals(Buffer.from("--"))) break;
    if (body.subarray(cursor, cursor + 2).equals(Buffer.from("\r\n"))) cursor += 2;
    const next = body.indexOf(delimiter, cursor);
    if (next < 0) break;
    const part = body.subarray(cursor, Math.max(cursor, next - 2));
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd < 0) throw new TypeError("invalid multipart part");
    const headers = part.subarray(0, headerEnd).toString("utf8");
    const data = part.subarray(headerEnd + 4);
    const disposition = /content-disposition:\s*form-data;([^\r\n]+)/i.exec(headers)?.[1] ?? "";
    const name = /name="([^"]+)"/i.exec(disposition)?.[1];
    if (!name) throw new TypeError("multipart field name is required");
    const filename = /filename="([^"]*)"/i.exec(disposition)?.[1];
    if (filename !== undefined) {
      const partType = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim().toLowerCase() ?? "application/octet-stream";
      file = { filename: path.basename(filename), contentType: partType, data };
    } else {
      fields[name] = data.toString("utf8").trim();
    }
    cursor = next;
  }
  if (!file) throw new TypeError("file is required");
  return { fields, file };
}

function detectedMime(data: Buffer): string | undefined {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (data.length >= 6 && ["GIF87a", "GIF89a"].includes(data.subarray(0, 6).toString("ascii"))) return "image/gif";
  return undefined;
}

async function exists(target: string): Promise<boolean> {
  try { return (await stat(target)).isFile(); } catch { return false; }
}

export function createV2AssetsPlugin(options: { readonly repository: V2AssetReviewRepository; readonly mediaRoot: string; readonly now?: () => Date }): FastifyPluginAsync {
  const now = options.now ?? (() => new Date());
  return async (app) => {
    app.addContentTypeParser(/^multipart\/form-data/i, { parseAs: "buffer", bodyLimit: MAX_BYTES + 1024 * 1024 }, (_request, body, done) => done(null, body));
    app.post("/manual", async (request, reply) => {
      try {
        if (!Buffer.isBuffer(request.body)) throw new TypeError("multipart body is required");
        const { fields, file } = parseMultipart(request.body, request.headers["content-type"]);
        const storyWorldId = fields.storyWorldId?.trim();
        const title = fields.title?.trim() || path.parse(file.filename).name;
        if (!storyWorldId) throw new TypeError("storyWorldId is required");
        if (!title) throw new TypeError("title is required");
        if (file.data.byteLength === 0) throw new TypeError("file must not be empty");
        if (file.data.byteLength > MAX_BYTES) return reply.code(413).send({ error: { code: "ASSET_TOO_LARGE", message: "素材不能超过 25 MB" } });
        const mimeType = detectedMime(file.data);
        if (!mimeType || mimeType !== file.contentType || !allowedTypes.has(mimeType as never)) {
          return reply.code(422).send({ error: { code: "INVALID_ASSET_MEDIA", message: "仅支持内容与 MIME 一致的 PNG、JPEG、WebP 或 GIF" } });
        }
        const expectedExtension = allowedTypes.get(mimeType as never)!;
        const inputExtension = path.extname(file.filename).toLowerCase();
        if (!(mimeType === "image/jpeg" ? [".jpg", ".jpeg"].includes(inputExtension) : inputExtension === expectedExtension)) {
          return reply.code(422).send({ error: { code: "INVALID_ASSET_EXTENSION", message: "文件扩展名与图片内容不一致" } });
        }
        const hash = createHash("sha256").update(file.data).digest("hex");
        const filename = `${hash}${expectedExtension}`;
        const directory = path.resolve(options.mediaRoot, "v2", "assets");
        const target = path.resolve(directory, filename);
        await mkdir(directory, { recursive: true });
        if (!await exists(target)) await writeFile(target, file.data, { flag: "wx" });
        const assetId = `asset:manual:${createHash("sha256").update(`${storyWorldId}:${hash}`).digest("hex").slice(0, 24)}` as V2AssetId;
        const asset = await options.repository.createManualAsset({
          assetId,
          storyWorldId: storyWorldId as V2StoryWorldId,
          title,
          mediaRef: `media://local/v2/assets/${filename}`,
          contentHash: `sha256:${hash}`,
          originalFilename: file.filename,
          mimeType,
          byteSize: file.data.byteLength,
          createdAt: now().toISOString() as V2IsoDateTime,
        });
        return reply.code(201).send({ asset } satisfies V2CreateManualAssetApiResponse);
      } catch (error) {
        const message = error instanceof Error ? error.message : "manual asset upload failed";
        return reply.code(error instanceof TypeError ? 422 : 500).send({ error: { code: error instanceof TypeError ? "INVALID_REQUEST" : "INTERNAL_ERROR", message } });
      }
    });
  };
}