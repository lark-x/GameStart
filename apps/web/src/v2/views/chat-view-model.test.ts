import assert from "node:assert/strict";
import test from "node:test";

import type { V2ChatFeaturesDto } from "@living-network/contracts/v2";

import {
  buildStickerSendPayload,
  isChatModelConfigured,
  shouldLoadStickerLibrary,
} from "./chat-view-model.ts";

function features(partial: Partial<V2ChatFeaturesDto> = {}): V2ChatFeaturesDto {
  return {
    modelConfigured: false,
    text: false,
    emoji: false,
    imageUpload: false,
    imageUnderstanding: false,
    stickers: false,
    streaming: false,
    storyAnalyze: false,
    ...partial,
  };
}

test("chat features state never fails open", () => {
  // Features not loaded yet: must not assume the model is configured.
  assert.equal(isChatModelConfigured("idle", null), false);
  assert.equal(isChatModelConfigured("loading", null), false);
  assert.equal(isChatModelConfigured("error", null), false);
  // Even with a stale features payload, an error state must block sending.
  assert.equal(isChatModelConfigured("error", features({ modelConfigured: true })), false);
  // Only ready + configured enables the composer.
  assert.equal(isChatModelConfigured("ready", features({ modelConfigured: true })), true);
  assert.equal(isChatModelConfigured("ready", features({ modelConfigured: false })), false);
});

test("sticker library loads on first open only", () => {
  assert.equal(shouldLoadStickerLibrary(false, false), false);
  assert.equal(shouldLoadStickerLibrary(true, false), true);
  assert.equal(shouldLoadStickerLibrary(false, true), false);
  assert.equal(shouldLoadStickerLibrary(true, true), false);
});

test("sticker send preserves the composer draft", () => {
  const payload = buildStickerSendPayload("media:sticker");
  assert.equal(payload.text, "");
  assert.deepEqual(payload.attachmentIds, ["media:sticker"]);
  assert.equal(payload.clearComposer, false);
});
