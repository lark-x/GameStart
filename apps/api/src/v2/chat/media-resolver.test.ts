import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { open } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { ChatContentPart, ChatMessage } from "@living-network/ai/v2";
import type { PreparedPrompt } from "@living-network/ai/prompt-engine";

import { createV2ChatMediaResolver, V2_CHAT_MEDIA_MAX_BYTES, V2_CHAT_MEDIA_PREFIX } from "./media-resolver.ts";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l2e3VwAAAABJRU5ErkJggg==",
  "base64",
);

function sha256Hex(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function promptWithImages(images: PreparedPrompt["messageImages"]): PreparedPrompt {
  const messages: readonly ChatMessage[] = [
    { role: "system", content: "[Platform Rules]" },
    { role: "user", content: "看看这张图 [图片 × 1]" },
  ];
  return {
    templateId: "chat-reply-v1",
    templateVersion: "1.0.0",
    messages,
    ...(images === undefined ? {} : { messageImages: images }),
    estimatedTokens: 100,
    contextHash: "hash",
    sources: [],
    budget: {
      contextWindow: 128000,
      totalBudget: 128000,
      outputReserve: 512,
      safetyReserve: 256,
      inputBudget: 127232,
      usedTokens: 100,
      personaTokens: 0,
      worldTokens: 0,
      canonTokens: 0,
      memoryTokens: 0,
      summaryTokens: 0,
      recentMessageTokens: 0,
      currentInputTokens: 100,
    },
  };
}

test("V2 chat media resolver turns prompt images into base64 image parts", async () => {
  const mediaRoot = mkdtempSync(path.join(tmpdir(), "v2-chat-resolver-"));
  try {
    const filename = `${sha256Hex(ONE_PIXEL_PNG)}.png`;
    mkdirSync(path.join(mediaRoot, "v2", "chat"), { recursive: true });
    writeFileSync(path.join(mediaRoot, "v2", "chat", filename), ONE_PIXEL_PNG);
    const resolver = createV2ChatMediaResolver();
    const prompt = promptWithImages([
      {
        messageIndex: 1,
        images: [{ mediaId: "media:chat:1", mediaRef: `${V2_CHAT_MEDIA_PREFIX}${filename}`, mimeType: "image/png" }],
      },
    ]);
    const messages = await resolver.resolveMessageImages({ prompt, mediaRoot });
    const content = messages[1]!.content;
    assert.ok(Array.isArray(content));
    const parts = content as readonly ChatContentPart[];
    const image = parts.find((part) => part.type === "image");
    assert.ok(image);
    assert.equal(image.type === "image" ? image.mediaType : undefined, "image/png");
    assert.deepEqual(image.type === "image" ? Buffer.from(image.dataBase64, "base64") : undefined, ONE_PIXEL_PNG);
    assert.ok(parts.some((part) => part.type === "text" && part.text.includes("看看这张图")));
  } finally {
    rmSync(mediaRoot, { recursive: true, force: true });
  }
});

test("V2 chat media resolver rejects invalid refs, MIME mismatches, and unsupported media", async () => {
  const mediaRoot = mkdtempSync(path.join(tmpdir(), "v2-chat-resolver-"));
  try {
    const resolver = createV2ChatMediaResolver();

    const invalidPrefix = promptWithImages([
      { messageIndex: 1, images: [{ mediaId: "media:chat:1", mediaRef: "media://other/chat/abc.png", mimeType: "image/png" }] },
    ]);
    await assert.rejects(
      () => resolver.resolveMessageImages({ prompt: invalidPrefix, mediaRoot }),
      (error: { code?: string }) => error.code === "INVALID_MEDIA_REF",
    );

    const traversal = promptWithImages([
      { messageIndex: 1, images: [{ mediaId: "media:chat:1", mediaRef: `${V2_CHAT_MEDIA_PREFIX}../../etc/passwd`, mimeType: "image/png" }] },
    ]);
    await assert.rejects(
      () => resolver.resolveMessageImages({ prompt: traversal, mediaRoot }),
      (error: { code?: string }) => error.code === "INVALID_MEDIA_REF",
    );

    const wrongHash = promptWithImages([
      { messageIndex: 1, images: [{ mediaId: "media:chat:1", mediaRef: `${V2_CHAT_MEDIA_PREFIX}not-a-hash.png`, mimeType: "image/png" }] },
    ]);
    await assert.rejects(
      () => resolver.resolveMessageImages({ prompt: wrongHash, mediaRoot }),
      (error: { code?: string }) => error.code === "INVALID_MEDIA_REF",
    );

    const unsupportedMime = promptWithImages([
      { messageIndex: 1, images: [{ mediaId: "media:chat:1", mediaRef: `${V2_CHAT_MEDIA_PREFIX}${"a".repeat(64)}.png`, mimeType: "application/pdf" }] },
    ]);
    await assert.rejects(
      () => resolver.resolveMessageImages({ prompt: unsupportedMime, mediaRoot }),
      (error: { code?: string }) => error.code === "UNSUPPORTED_MEDIA",
    );
  } finally {
    rmSync(mediaRoot, { recursive: true, force: true });
  }
});

test("V2 chat media resolver reports missing files and MIME/extension mismatches", async () => {
  const mediaRoot = mkdtempSync(path.join(tmpdir(), "v2-chat-resolver-"));
  try {
    const resolver = createV2ChatMediaResolver();

    const missing = promptWithImages([
      { messageIndex: 1, images: [{ mediaId: "media:chat:1", mediaRef: `${V2_CHAT_MEDIA_PREFIX}${"a".repeat(64)}.png`, mimeType: "image/png" }] },
    ]);
    await assert.rejects(
      () => resolver.resolveMessageImages({ prompt: missing, mediaRoot }),
      (error: { code?: string }) => error.code === "MEDIA_NOT_FOUND",
    );

    const filename = `${sha256Hex(ONE_PIXEL_PNG)}.jpg`;
    mkdirSync(path.join(mediaRoot, "v2", "chat"), { recursive: true });
    writeFileSync(path.join(mediaRoot, "v2", "chat", filename), ONE_PIXEL_PNG);
    const mismatched = promptWithImages([
      { messageIndex: 1, images: [{ mediaId: "media:chat:1", mediaRef: `${V2_CHAT_MEDIA_PREFIX}${filename}`, mimeType: "image/png" }] },
    ]);
    await assert.rejects(
      () => resolver.resolveMessageImages({ prompt: mismatched, mediaRoot }),
      (error: { code?: string }) => error.code === "UNSUPPORTED_MEDIA",
    );

    await assert.rejects(
      () => resolver.resolveMessageImages({
        prompt: promptWithImages([
          { messageIndex: 1, images: [{ mediaId: "media:chat:1", mediaRef: `${V2_CHAT_MEDIA_PREFIX}${filename}`, mimeType: "image/jpeg" }] },
        ]),
        mediaRoot: "",
      }),
      (error: { code?: string }) => error.code === "MEDIA_NOT_FOUND",
    );
  } finally {
    rmSync(mediaRoot, { recursive: true, force: true });
  }
});

test("V2 chat media resolver rejects oversized media files", async () => {
  const mediaRoot = mkdtempSync(path.join(tmpdir(), "v2-chat-resolver-"));
  try {
    const filename = `${sha256Hex(ONE_PIXEL_PNG)}.png`;
    const target = path.join(mediaRoot, "v2", "chat", filename);
    mkdirSync(path.dirname(target), { recursive: true });
    const handle = await open(target, "w");
    await handle.truncate(V2_CHAT_MEDIA_MAX_BYTES + 1);
    await handle.close();

    const resolver = createV2ChatMediaResolver();
    await assert.rejects(
      () => resolver.resolveMessageImages({
        prompt: promptWithImages([
          { messageIndex: 1, images: [{ mediaId: "media:chat:1", mediaRef: `${V2_CHAT_MEDIA_PREFIX}${filename}`, mimeType: "image/png" }] },
        ]),
        mediaRoot,
      }),
      (error: { code?: string }) => error.code === "MEDIA_TOO_LARGE",
    );
  } finally {
    rmSync(mediaRoot, { recursive: true, force: true });
  }
});

test("V2 chat media resolver supports PNG, JPEG, WebP, and GIF files", async () => {
  const mediaRoot = mkdtempSync(path.join(tmpdir(), "v2-chat-resolver-"));
  try {
    const resolver = createV2ChatMediaResolver();
    const cases: readonly { readonly data: Buffer; readonly extension: string; readonly mimeType: string }[] = [
      { data: ONE_PIXEL_PNG, extension: "png", mimeType: "image/png" },
      { data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]), extension: "jpg", mimeType: "image/jpeg" },
      { data: Buffer.from("RIFF\x00\x00\x00\x00WEBPVP8 ", "binary"), extension: "webp", mimeType: "image/webp" },
      { data: Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;"), extension: "gif", mimeType: "image/gif" },
    ];
    for (const item of cases) {
      const filename = `${sha256Hex(item.data)}.${item.extension}`;
      mkdirSync(path.join(mediaRoot, "v2", "chat"), { recursive: true });
      writeFileSync(path.join(mediaRoot, "v2", "chat", filename), item.data);
      const prompt = promptWithImages([
        { messageIndex: 1, images: [{ mediaId: "media:chat:1", mediaRef: `${V2_CHAT_MEDIA_PREFIX}${filename}`, mimeType: item.mimeType }] },
      ]);
      const messages = await resolver.resolveMessageImages({ prompt, mediaRoot });
      const parts = messages[1]!.content;
      assert.ok(Array.isArray(parts));
      const image = (parts as readonly ChatContentPart[]).find((part) => part.type === "image");
      assert.ok(image);
      assert.equal(image.type === "image" ? image.mediaType : undefined, item.mimeType);
      assert.deepEqual(image.type === "image" ? Buffer.from(image.dataBase64, "base64") : undefined, item.data);
    }
  } finally {
    rmSync(mediaRoot, { recursive: true, force: true });
  }
});
