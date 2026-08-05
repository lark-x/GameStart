import assert from "node:assert/strict";
import test from "node:test";

import { parseRedisConnection } from "./queue.ts";

test("queue validates Redis URL schemes without accepting arbitrary endpoints", () => {
  assert.deepEqual(parseRedisConnection("redis://127.0.0.1:6379"), {
    url: "redis://127.0.0.1:6379",
  });
  assert.deepEqual(parseRedisConnection("rediss://cache.example/0"), {
    url: "rediss://cache.example/0",
  });
  assert.throws(() => parseRedisConnection("http://cache.example"), /redis/);
});
