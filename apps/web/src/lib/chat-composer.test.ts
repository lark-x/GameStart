import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPOSER_IMAGE_LIMIT,
  buildComposerMessageDrafts,
  createComposerImageAttachment,
  imageSizeLabel,
  validateComposerImage,
} from "./chat-composer.ts";

test("validates composer image type, size, and labels", () => {
  assert.equal(validateComposerImage({ name: "photo.png", type: "image/png", size: 2048 }), undefined);
  assert.match(validateComposerImage({ name: "notes.txt", type: "text/plain", size: 2048 }) ?? "", /PNG/);
  assert.match(validateComposerImage({ name: "huge.png", type: "image/png", size: 13 * 1024 * 1024 }) ?? "", /12MB/);
  assert.equal(imageSizeLabel(1024), "1 KB");
  assert.equal(imageSizeLabel(1536 * 1024), "1.5 MB");
});

test("creates composer image attachments without mutating file metadata", () => {
  const attachment = createComposerImageAttachment(
    { name: "one.webp", type: "image/webp", size: 4096 },
    "blob:preview",
    "image-1",
  );
  assert.equal(attachment.id, "image-1");
  assert.equal(attachment.previewUrl, "blob:preview");
  assert.equal(attachment.file.name, "one.webp");
  assert.equal(attachment.sizeLabel, "4 KB");
  assert.equal(attachment.status, "ready");
  assert.equal(COMPOSER_IMAGE_LIMIT, 9);
});

test("builds compatible message drafts and puts text only on the first image", () => {
  assert.deepEqual(buildComposerMessageDrafts({ batchId: "batch", text: " hello ", mediaRefs: [] }), [
    { id: "batch", idempotencyKey: "batch", kind: "TEXT", text: "hello" },
  ]);
  assert.deepEqual(buildComposerMessageDrafts({ batchId: "batch", text: "caption", mediaRefs: ["media://one", "media://two"] }), [
    { id: "batch:image:1", idempotencyKey: "batch:image:1", kind: "IMAGE", mediaRef: "media://one", text: "caption", suppressAutoReply: true },
    { id: "batch:image:2", idempotencyKey: "batch:image:2", kind: "IMAGE", mediaRef: "media://two" },
  ]);
  assert.deepEqual(buildComposerMessageDrafts({ batchId: "batch", text: "   ", mediaRefs: [] }), []);
});
