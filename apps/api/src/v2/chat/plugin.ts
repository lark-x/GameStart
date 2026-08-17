import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ChatDelta, ChatProvider } from "@living-network/ai/v2";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type {
  V2ChatMediaDto,
  V2ConversationId,
  V2MediaId,
  V2MessageId,
} from "@living-network/contracts/v2";

import { V2HttpError, toV2HttpError } from "../core/errors.ts";
import {
  parseCreateInstantStoryRequest,
  parseGenerateChatReplyRequest,
  parseSendChatMessageRequest,
} from "./parsers.ts";
import type { V2ChatUseCases } from "./use-cases.ts";

const MAX_MEDIA_BYTES = 12 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Map([
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

export interface V2ChatPluginDependencies {
  readonly useCases: V2ChatUseCases;
  readonly provider: ChatProvider;
  readonly mediaRoot?: string;
  readonly now?: () => Date;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function routeId(value: unknown, field: string): string {
  if (!isRecord(value)) throw new V2HttpError(400, "BAD_REQUEST", "route params must be an object");
  const raw = value[field];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new V2HttpError(400, "BAD_REQUEST", `${field} must be a non-empty string`);
  }
  return raw.trim();
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

async function fileExists(target: string): Promise<boolean> {
  try { return (await stat(target)).isFile(); } catch { return false; }
}

function mediaContentType(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/gif";
}

function safeChatFilename(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-f0-9]{64}\.(?:png|jpg|jpeg|webp|gif)$/.test(value)
    ? value
    : undefined;
}

function sseHeaders(reply: FastifyReply): void {
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
}

function sseWrite(reply: FastifyReply, event: unknown): void {
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

function toErrorCode(error: unknown): string {
  if (error instanceof V2HttpError) return error.code;
  if (error instanceof Error && error.name === "ProviderError") {
    const code = (error as { code?: string }).code;
    if (code === "CONFIGURATION") return "MODEL_NOT_CONFIGURED";
    if (code === "TIMEOUT") return "PROVIDER_TIMEOUT";
    return "PROVIDER_ERROR";
  }
  return "INTERNAL_ERROR";
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createV2ChatPlugin(dependencies: V2ChatPluginDependencies): FastifyPluginAsync {
  const now = dependencies.now ?? (() => new Date());
  return async (app) => {
    app.setErrorHandler((error, _request, reply) => {
      const httpError = toV2HttpError(error);
      void reply.status(httpError.statusCode).send({ error: { code: httpError.code, message: httpError.message } });
    });

    app.post("/instant-stories", async (request, reply) => {
      const result = await dependencies.useCases.createInstantStory(parseCreateInstantStoryRequest(request.body));
      return reply.status(201).send(result);
    });

    app.get("/chat/conversations", async () => dependencies.useCases.listConversations());
    app.get("/chat/conversations/:conversationId", async (request) => {
      const conversationId = routeId(request.params, "conversationId") as V2ConversationId;
      return dependencies.useCases.getConversation(conversationId);
    });
    app.get("/chat/conversations/:conversationId/messages", async (request) => {
      const conversationId = routeId(request.params, "conversationId") as V2ConversationId;
      return dependencies.useCases.listMessages(conversationId);
    });
    app.post("/chat/conversations/:conversationId/messages", async (request, reply) => {
      const conversationId = routeId(request.params, "conversationId") as V2ConversationId;
      const result = await dependencies.useCases.sendMessage(conversationId, parseSendChatMessageRequest(request.body));
      return reply.status(201).send(result);
    });

    app.post("/chat/conversations/:conversationId/replies", async (request, reply) => {
      const conversationId = routeId(request.params, "conversationId") as V2ConversationId;
      const input = parseGenerateChatReplyRequest(request.body);
      const prepared = await dependencies.useCases.prepareReply(conversationId, input);
      if (prepared.existingMessage !== undefined) {
        sseHeaders(reply);
        sseWrite(reply, { type: "message", message: prepared.existingMessage });
        sseWrite(reply, { type: "done", messageId: prepared.assistantMessageId });
        return reply.raw.end();
      }
      if (prepared.prompt === undefined) {
        throw new V2HttpError(500, "INTERNAL_ERROR", "Prompt was not prepared for reply");
      }
      sseHeaders(reply);
      const controller = new AbortController();
      const onClose = (): void => controller.abort();
      request.raw.on("close", onClose);
      let content = "";
      try {
        const deltas: AsyncIterable<ChatDelta> = dependencies.provider.stream({
          messages: prepared.prompt.messages,
          temperature: 0.8,
          maxTokens: 1024,
          trace: { correlationId: `v2:chat:${randomUUID()}` },
          signal: controller.signal,
        });
        for await (const delta of deltas) {
          if (delta.content !== undefined) {
            content += delta.content;
            sseWrite(reply, { type: "delta", content: delta.content });
          }
          if (delta.finishReason !== undefined) {
            sseWrite(reply, { type: "finish", reason: delta.finishReason });
          }
        }
        const message = await dependencies.useCases.saveReply({
          conversationId,
          messageId: prepared.assistantMessageId,
          idempotencyKey: prepared.idempotencyKey,
          text: content,
          status: "completed",
        });
        sseWrite(reply, { type: "message", message });
        sseWrite(reply, { type: "done", messageId: prepared.assistantMessageId });
        return reply.raw.end();
      } catch (error) {
        if (content.trim().length > 0) {
          await dependencies.useCases.saveReply({
            conversationId,
            messageId: prepared.assistantMessageId,
            idempotencyKey: prepared.idempotencyKey,
            text: content,
            status: "interrupted",
          }).catch(() => undefined);
        }
        sseWrite(reply, { type: "error", code: toErrorCode(error), errorMessage: toErrorMessage(error) });
        sseWrite(reply, { type: "done", messageId: prepared.assistantMessageId, error: true });
        return reply.raw.end();
      } finally {
        request.raw.off("close", onClose);
      }
    });

    if (dependencies.mediaRoot !== undefined) {
      app.addContentTypeParser(/^multipart\/form-data/i, { parseAs: "buffer", bodyLimit: MAX_MEDIA_BYTES + 1024 * 1024 }, (_request, body, done) => done(null, body));
      app.post("/chat/media", async (request, reply) => {
        try {
          if (!Buffer.isBuffer(request.body)) throw new TypeError("multipart body is required");
          const { file } = parseMultipart(request.body, request.headers["content-type"]);
          if (file.data.byteLength === 0) throw new TypeError("file must not be empty");
          if (file.data.byteLength > MAX_MEDIA_BYTES) {
            return reply.code(413).send({ error: { code: "MEDIA_TOO_LARGE", message: "聊天图片不能超过 12 MB" } });
          }
          const mimeType = detectedMime(file.data);
          if (!mimeType || mimeType !== file.contentType || !ALLOWED_MEDIA_TYPES.has(mimeType as never)) {
            return reply.code(422).send({ error: { code: "UNSUPPORTED_MEDIA", message: "仅支持内容与 MIME 一致的 PNG、JPEG、WebP 或 GIF" } });
          }
          const hash = createHash("sha256").update(file.data).digest("hex");
          const extension = ALLOWED_MEDIA_TYPES.get(mimeType as never)!;
          const filename = `${hash}${extension}`;
          const directory = path.resolve(dependencies.mediaRoot!, "v2", "chat");
          const target = path.resolve(directory, filename);
          await mkdir(directory, { recursive: true });
          if (!await fileExists(target)) await writeFile(target, file.data, { flag: "wx" });
          const media: V2ChatMediaDto = await dependencies.useCases.createMedia({
            mediaId: `media:chat:${hash.slice(0, 24)}` as V2MediaId,
            contentHash: hash,
            mediaRef: `media://local/v2/chat/${filename}`,
            mimeType,
            byteSize: file.data.byteLength,
            createdAt: now().toISOString(),
          });
          return reply.code(201).send({ media });
        } catch (error) {
          const message = error instanceof Error ? error.message : "chat media upload failed";
          return reply.code(error instanceof TypeError ? 422 : 500).send({ error: { code: error instanceof TypeError ? "UNSUPPORTED_MEDIA" : "INTERNAL_ERROR", message } });
        }
      });
      app.get("/chat/media/:filename", async (request, reply) => {
        const filename = safeChatFilename((request.params as { filename?: unknown }).filename);
        if (filename === undefined) {
          return reply.code(422).send({ error: { code: "INVALID_MEDIA_REF", message: "Invalid V2 chat media filename" } });
        }
        const root = path.resolve(dependencies.mediaRoot!, "v2", "chat");
        const target = path.resolve(root, filename);
        try {
          const info = await stat(target);
          if (!info.isFile()) throw new Error("not a file");
        } catch {
          return reply.code(404).send({ error: { code: "NOT_FOUND", message: "V2 chat media not found" } });
        }
        return reply
          .header("Content-Type", mediaContentType(filename))
          .header("Cache-Control", "public, max-age=31536000, immutable")
          .send(createReadStreamSafe(target));
      });
    }
  };
}

function createReadStreamSafe(target: string): ReturnType<typeof createReadStream> {
  return createReadStream(target);
}
