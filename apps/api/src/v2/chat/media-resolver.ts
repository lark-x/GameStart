import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { ChatImagePart, ChatMessage } from "@living-network/ai/v2";
import type { PreparedPrompt } from "@living-network/ai/prompt-engine";

import { V2HttpError } from "../core/errors.ts";

export const V2_CHAT_MEDIA_PREFIX = "media://local/v2/chat/";
export const V2_CHAT_MEDIA_MAX_BYTES = 12 * 1024 * 1024;

const MEDIA_EXTENSION_BY_TYPE = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
]);

function chatFilenameFromRef(mediaRef: string): string | undefined {
  if (!mediaRef.startsWith(V2_CHAT_MEDIA_PREFIX)) return undefined;
  const filename = mediaRef.slice(V2_CHAT_MEDIA_PREFIX.length);
  return /^[a-f0-9]{64}\.(?:png|jpg|jpeg|webp|gif)$/.test(filename) ? filename : undefined;
}

function extensionForMime(mimeType: string): string | undefined {
  return MEDIA_EXTENSION_BY_TYPE.get(mimeType);
}

function assertInsideRoot(root: string, target: string): void {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new V2HttpError(422, "INVALID_MEDIA_REF", "Chat media ref escapes the configured media root");
  }
}

export interface V2ChatMediaResolver {
  resolveMessageImages(input: {
    readonly prompt: PreparedPrompt;
    readonly mediaRoot: string;
  }): Promise<readonly ChatMessage[]>;
}

export function createV2ChatMediaResolver(): V2ChatMediaResolver {
  return {
    async resolveMessageImages({ prompt, mediaRoot }) {
      if (prompt.messageImages === undefined || prompt.messageImages.length === 0) {
        return prompt.messages;
      }
      if (mediaRoot.trim().length === 0) {
        throw new V2HttpError(404, "MEDIA_NOT_FOUND", "Chat media root is not configured");
      }
      const root = path.resolve(mediaRoot, "v2", "chat");
      const resolved = new Map<number, readonly ChatImagePart[]>();

      for (const { messageIndex, images } of prompt.messageImages) {
        const parts: ChatImagePart[] = [];
        for (const image of images) {
          const extension = extensionForMime(image.mimeType);
          if (extension === undefined) {
            throw new V2HttpError(422, "UNSUPPORTED_MEDIA", `Unsupported chat media MIME type: ${image.mimeType}`);
          }
          const filename = chatFilenameFromRef(image.mediaRef);
          if (filename === undefined) {
            throw new V2HttpError(422, "INVALID_MEDIA_REF", "Invalid V2 chat media ref");
          }
          if (path.extname(filename).toLowerCase() !== extension) {
            throw new V2HttpError(422, "UNSUPPORTED_MEDIA", "Chat media MIME type does not match the stored file extension");
          }
          const target = path.resolve(root, filename);
          assertInsideRoot(root, target);
          let info;
          try {
            info = await stat(target);
          } catch {
            throw new V2HttpError(404, "MEDIA_NOT_FOUND", "V2 chat media file not found");
          }
          if (!info.isFile()) {
            throw new V2HttpError(404, "MEDIA_NOT_FOUND", "V2 chat media file not found");
          }
          if (info.size > V2_CHAT_MEDIA_MAX_BYTES) {
            throw new V2HttpError(413, "MEDIA_TOO_LARGE", "Chat media exceeds the 12 MB size limit");
          }
          const dataBase64 = (await readFile(target)).toString("base64");
          parts.push({ type: "image", mediaType: image.mimeType, dataBase64 });
        }
        resolved.set(messageIndex, parts);
      }

      return prompt.messages.map((message, index) => {
        const imageParts = resolved.get(index);
        if (imageParts === undefined) return message;
        if (typeof message.content !== "string") return message;
        const text = message.content.trim();
        const content: ChatMessage["content"] = [
          ...(text.length === 0 ? [] : [{ type: "text" as const, text }]),
          ...imageParts,
        ];
        return { role: message.role, content };
      });
    },
  };
}
