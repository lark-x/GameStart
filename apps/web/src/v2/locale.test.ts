import assert from "node:assert/strict";
import test from "node:test";

import { setV2Locale, t, v2LegacyMessages, v2Messages } from "./locale.ts";

test("every V2 message includes English and Simplified Chinese", () => {
  for (const [key, message] of Object.entries(v2Messages)) {
    assert.ok(message.en.trim(), `${key} is missing English`);
    assert.ok(message["zh-CN"].trim(), `${key} is missing Simplified Chinese`);
  }
});

test("every V2 legacy migration message includes English and Simplified Chinese", () => {
  for (const [key, message] of Object.entries(v2LegacyMessages)) {
    assert.ok(message.en.trim(), `${key} is missing English`);
    assert.ok(message["zh-CN"].trim(), `${key} is missing Simplified Chinese`);
  }
});

test("V2 messages change with the selected locale", () => {
  setV2Locale("en");
  assert.equal(t("action.refresh"), "Refresh Snapshot");
  setV2Locale("zh-CN");
  assert.equal(t("action.refresh"), "刷新快照");
  setV2Locale("en");
});