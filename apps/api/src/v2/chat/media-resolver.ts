import { readFile } from "node:fs/promises";
import path from "node:path";

import type { PreparedPrompt, ChatImageContext } from "@living-network/ai/prompt-engine";
import type { ChatContentPart, ChatMessage } from "@living-network/ai/v2";
import type { V2ResolvedChatModel } from "./plugin.ts";

export interface ResolvedChatImage {
  readonly mediaType: string;
  readonly dataBase64: string;
}

export interface V2ChatMediaResolver {
  resolve(media: ChatImageContext): Promise<ResolvedChatImage>;
}

export class V2LocalChatMediaResolver implements V2ChatMediaResolver {
  private readonly mediaRoot: string;

  public constructor(mediaRoot: string) {
    this.mediaRoot = mediaRoot;
  }

  public async resolve(media: ChatImageContext): Promise<ResolvedChatImage> {
    const filename = resolveChatMediaFilename(media.mediaRef);
    const root = path.resolve(this.mediaRoot, "v2", "chat");
    const target = path.resolve(root, filename);
    if (!target.startsWith(root + path.sep)) {
      throw new Error("INVALID_MEDIA_REF");
    }
    const data = await readFile(target);
    return {
      mediaType: media.mimeType,
      dataBase64: data.toString("base64"),
    };
  }
}

function resolveChatMediaFilename(mediaRef: string): string {
  const prefix = "media://local/v2/chat/";
  if (!mediaRef.startsWith(prefix)) throw new Error("INVALID_MEDIA_REF");
  const filename = mediaRef.slice(prefix.length);
  if (!/^[a-f0-9]{64}\.(?:png|jpg|jpeg|webp|gif)$/i.test(filename)) {
    throw new Error("INVALID_MEDIA_REF");
  }
  return filename;
}

export async function resolvePromptImages(
  prompt: PreparedPrompt,
  resolver: V2ChatMediaResolver,
): Promise<readonly ChatMessage[]> {
  const messageImages = prompt.messageImages ?? [];
  if (messageImages.length === 0) return prompt.messages;
  const messages = [...prompt.messages];
  for (const entry of messageImages) {
    const message = messages[entry.messageIndex];
    if (message === undefined) continue;
    const resolved: ChatContentPart[] = [];
    const text = typeof message.content === "string" ? message.content : message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
    if (text.trim().length > 0) resolved.push({ type: "text", text });
    for (const image of entry.images) {
      const resolvedImage = await resolver.resolve(image);
      resolved.push({
        type: "image",
        mediaType: resolvedImage.mediaType,
        dataBase64: resolvedImage.dataBase64,
      });
    }
    messages[entry.messageIndex] = { role: message.role, content: resolved };
  }
  return messages;
}

export function assertModelSupportsImages(model: V2ResolvedChatModel, prompt: PreparedPrompt): void {
  const hasImages = (prompt.messageImages ?? []).some((entry) => entry.images.length > 0);
  if (hasImages && !model.inputModalities.includes("image")) {
    throw new Error("VISION_NOT_SUPPORTED");
  }
}
