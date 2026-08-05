import assert from "node:assert/strict";
import test from "node:test";

import { parseSseBlock } from "./api.js";

test("parses chat delta, error, and DONE SSE blocks", () => {
  assert.deepEqual(parseSseBlock('data: {"content":"hello"}'), {
    event: "message",
    done: false,
    data: { content: "hello" },
  });
  assert.deepEqual(parseSseBlock('event: error\ndata: {"code":"HTTP_ERROR","message":"offline"}'), {
    event: "error",
    done: false,
    data: { code: "HTTP_ERROR", message: "offline" },
  });
  assert.deepEqual(parseSseBlock("data: [DONE]"), { event: "message", done: true });
});

test("turns invalid SSE JSON into a bounded client error", () => {
  assert.deepEqual(parseSseBlock("data: not-json"), {
    event: "error",
    done: false,
    data: { code: "INVALID_SSE", message: "Invalid SSE payload" },
  });
});
